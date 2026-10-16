# LangGraph.js Send 并行执行详解

> 前置条件：已完成 [LangGraph.js 深入学习路线](./LangGraph.js深入学习路线.md) 的阶段二（Annotation 状态定义）和阶段三（条件边路由），理解 `Annotation.Root`、Reducer 和 `addConditionalEdges` 的基本用法。
>
> 目标：深入掌握 LangGraph 的 `Send` API，理解 Map-Reduce 并行工作流模式，学会使用条件边返回 `Send[]` 触发扇出（fan-out）并行执行，并通过 Reducer 自动合并并行结果。
>
> 🆕 本文档与 [`LangGraphStage6Send.vue`](../../pages/langgraph/LangGraphStage6Send.vue) 组件配套，所有代码均可在浏览器中运行（内网大模型）。

---

## 目录

1. [Send 概述 — 什么是并行执行](#1-send-概述--什么是并行执行)
2. [Send 构造函数深入](#2-send-构造函数深入)
3. [Map-Reduce 工作流模式](#3-map-reduce-工作流模式)
4. [条件边返回 Send[] — 触发扇出](#4-条件边返回-send--触发扇出)
5. [Reducer 在并行场景下的作用](#5-reducer-在并行场景下的作用)
6. [SuperStep 与并行执行机制](#6-superstep-与并行执行机制)
7. [完整实战：文档并行摘要](#7-完整实战文档并行摘要)
8. [Send vs 普通条件边 深度对比](#8-send-vs-普通条件边-深度对比)
9. [JS/Python API 差异速查](#9-jspython-api-差异速查)
10. [常见问题与最佳实践](#10-常见问题与最佳实践)

---

## 1. Send 概述 — 什么是并行执行

### 1.1 概念

在 LangGraph 中，**Send** 是实现并行执行的核心 API。当条件边的路由函数返回 `Send[]` 数组（而非单个节点名字符串）时，图引擎会为每个 `Send` 创建一个目标节点的**并行实例**，所有实例在同一个 SuperStep 中独立执行，完成后通过 Reducer 自动合并结果。

```
普通条件边：dispatcher → 路由函数返回 'nodeA' → 执行 nodeA（串行）
Send 并行： dispatcher → 路由函数返回 [Send('worker', args1), Send('worker', args2), ...]
                      → 同时执行 worker × N（并行）
                      → Reducer 合并结果
```

### 1.2 为什么需要 Send

考虑一个场景：需要对 100 个文档分别生成摘要，然后汇总。

- **串行方式**：逐个处理 100 个文档，总耗时 = 100 × 单次耗时
- **Send 并行方式**：100 个文档同时处理，总耗时 ≈ 单次耗时（理想情况）

Send 让 LangGraph 天然支持 **Map-Reduce** 模式：Map（并行处理）→ Reduce（汇总合并）。

### 1.3 Send 的核心要素

| 要素 | 说明 |
|------|------|
| `new Send(node, args)` | 创建一个并行任务，指定目标节点和输入参数 |
| 条件边返回 `Send[]` | 触发扇出（fan-out），创建多个并行实例 |
| `args` 参数 | 每个 Send 实例的独立输入，会合并到该实例的状态中 |
| Reducer | 自动合并多个并行实例的输出到共享状态 |
| SuperStep | 所有并行实例完成后才进入下一个 SuperStep |

---

## 2. Send 构造函数深入

### 2.1 基本语法

```js
import { Send } from '@langchain/langgraph'

new Send(nodeName, args)
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `nodeName` | `string` | 是 | 目标节点名称，必须是图中已注册的节点 |
| `args` | `object` | 是 | 传递给目标节点的输入参数，会合并到该实例的状态中 |

### 2.2 args 如何传递给节点

`Send` 的 `args` 参数会**合并**到目标节点的状态中。节点函数可以通过 `state.xxx` 访问这些参数：

```js
// 创建 Send，传递 docIndex 和 content
new Send('summarizer', { docIndex: 0, content: '文档内容...' })

// 目标节点中访问
const summarizer = (state) => {
  console.log(state.docIndex)  // 0
  console.log(state.content)   // '文档内容...'
  // 也可以访问共享状态字段
  console.log(state.summaries) // 当前已合并的摘要列表
}
```

### 2.3 args 与共享状态的关系

```
共享状态（所有实例可见）：
  documents: ['doc1', 'doc2', 'doc3']
  summaries: []           ← Reducer 合并区域
  finalSummary: ''

Send 实例 1 的状态：
  documents: ['doc1', 'doc2', 'doc3']  ← 共享
  summaries: []                         ← 共享
  finalSummary: ''                      ← 共享
  docIndex: 0, content: 'doc1'         ← args 注入（实例独有）

Send 实例 2 的状态：
  documents: ['doc1', 'doc2', 'doc3']  ← 共享
  summaries: []                         ← 共享
  finalSummary: ''                      ← 共享
  docIndex: 1, content: 'doc2'         ← args 注入（实例独有）
```

**关键点**：
- `args` 中的字段会被注入到该实例的状态中
- 共享状态字段（如 `documents`、`summaries`）所有实例都能访问
- 每个实例返回的更新通过 Reducer 合并到共享状态

---

## 3. Map-Reduce 工作流模式

### 3.1 模式结构

Map-Reduce 是 Send 最经典的应用模式，包含三个阶段：

```
         ┌─────────────┐
         │  dispatcher  │  ← 分发节点（可选，记录日志等）
         └──────┬──────┘
                │
    ┌───────────┼───────────┐
    │  条件边路由函数返回 Send[]  │
    └───────────┼───────────┘
                │
    ┌───────────┼───────────┐
    ▼           ▼           ▼
┌───────┐  ┌───────┐  ┌───────┐
│worker │  │worker │  │worker │  ← Map 阶段（并行处理）
│实例 1 │  │实例 2 │  │实例 N │
└───┬───┘  └───┬───┘  └───┬───┘
    │           │           │
    └───────────┼───────────┘
                │  Reducer 自动合并
                ▼
         ┌─────────────┐
         │  aggregator  │  ← Reduce 阶段（汇总合并）
         └─────────────┘
```

### 3.2 三阶段职责

| 阶段 | 节点 | 职责 | 返回值 |
|------|------|------|--------|
| **分发** | `dispatcher` | 记录日志、准备数据 | `{}`（或状态更新） |
| **路由** | 条件边路由函数 | 为每个任务创建 `Send` | `Send[]` 数组 |
| **Map** | `worker`（并行实例） | 独立处理每个任务 | 部分状态更新 |
| **Reduce** | `aggregator` | 汇总所有并行结果 | 最终结果 |

### 3.3 图构建代码

```js
const graph = new StateGraph(ParallelState)
  .addNode('dispatcher', dispatcher)
  .addNode('summarizer', summarizer)      // ← 并行节点只需注册一次
  .addNode('aggregator', aggregator)
  .addEdge(START, 'dispatcher')
  .addConditionalEdges('dispatcher', dispatchRouter)  // ← 返回 Send[] 触发并行
  .addEdge('summarizer', 'aggregator')                // ← 所有并行实例完成后进入
  .addEdge('aggregator', END)
```

**注意**：并行节点（如 `summarizer`）只需 `addNode` 一次，图引擎会自动创建 N 个实例。

---

## 4. 条件边返回 Send[] — 触发扇出

### 4.1 路由函数签名

```ts
type RouterFn = (state: State) => string | string[] | Send[]
```

| 返回值类型 | 行为 |
|-----------|------|
| `'nodeName'`（字符串） | 普通条件路由，跳转到单个节点 |
| `['nodeA', 'nodeB']`（字符串数组） | 跳转到多个节点（顺序执行） |
| `[Send(...), Send(...)]`（Send 数组） | **触发扇出**，创建多个并行实例 |

### 4.2 路由函数示例

来自 [`LangGraphStage6Send.vue`](src/pages/langgraph/LangGraphStage6Send.vue:366)：

```js
const dispatchRouter = (state) => {
  // 为每个文档创建一个并行任务
  return state.documents.map((doc, i) =>
    new Send('summarizer', { docIndex: i, content: doc })
  )
}
// 返回 [Send('summarizer', {docIndex:0,...}), Send('summarizer', {docIndex:1,...}), ...]
```

### 4.3 动态并行度

Send 的数量是**动态**的，由输入数据决定：

```js
// 3 个文档 → 3 个并行实例
const result1 = await app.invoke({ documents: ['doc1', 'doc2', 'doc3'] })

// 10 个文档 → 10 个并行实例
const result2 = await app.invoke({ documents: [...10个文档] })
```

### 4.4 条件边路由函数 vs 节点函数

**重要区分**：条件边路由函数和节点函数是**两个不同的函数**：

```js
// 节点函数 — 在节点内执行，返回状态更新
const dispatcher = (state) => {
  console.log('dispatcher 节点执行')
  return {}  // 返回状态更新
}

// 条件边路由函数 — 在边层面执行，返回路由目标
const dispatchRouter = (state) => {
  return state.documents.map((doc, i) =>
    new Send('summarizer', { docIndex: i, content: doc })
  )
}

// 图构建
graph
  .addNode('dispatcher', dispatcher)           // 节点函数
  .addConditionalEdges('dispatcher', dispatchRouter)  // 条件边路由函数
```

---

## 5. Reducer 在并行场景下的作用

### 5.1 为什么并行需要 Reducer

多个并行实例同时返回状态更新，Reducer 决定如何合并这些更新：

```
实例 1 返回: { summaries: ['摘要1'] }
实例 2 返回: { summaries: ['摘要2'] }    → Reducer 合并 → { summaries: ['摘要1', '摘要2', '摘要3'] }
实例 3 返回: { summaries: ['摘要3'] }
```

### 5.2 并行场景的 Reducer 设计

来自 [`LangGraphStage6Send.vue`](src/pages/langgraph/LangGraphStage6Send.vue:317)：

```js
const ParallelState = Annotation.Root({
  // 文档列表 — 覆盖式（分发时设置一次）
  documents: Annotation({
    reducer: (_, right) => right,   // LastValue
    default: () => []
  }),

  // 并行摘要 — 追加式（多个实例的输出自动合并）
  summaries: Annotation({
    reducer: (left, right) => left.concat(right),  // concat
    default: () => []
  }),

  // 最终摘要 — 覆盖式（汇总节点设置一次）
  finalSummary: Annotation({
    reducer: (_, right) => right,   // LastValue
    default: () => ''
  })
})
```

### 5.3 Reducer 选择指南（并行场景）

| 字段用途 | 推荐 Reducer | 原因 |
|---------|-------------|------|
| 并行结果收集 | `concat` | 每个实例追加自己的结果 |
| 并行计数累加 | `add` | 每个实例累加自己的计数 |
| 输入数据 | `LastValue` | 只需设置一次 |
| 最终输出 | `LastValue` | 汇总节点覆盖设置 |

### 5.4 Reducer 合并时序

```
SuperStep 1: dispatcher 执行
  状态: { documents: [...], summaries: [], finalSummary: '' }

SuperStep 2: summarizer × 3 并行执行
  实例1 返回: { summaries: ['摘要1'] }
  实例2 返回: { summaries: ['摘要2'] }  → Reducer concat 合并
  实例3 返回: { summaries: ['摘要3'] }
  合并后: { documents: [...], summaries: ['摘要1', '摘要2', '摘要3'], finalSummary: '' }

SuperStep 3: aggregator 执行
  读取 state.summaries → ['摘要1', '摘要2', '摘要3']
  返回: { finalSummary: '汇总结果' }
  最终: { documents: [...], summaries: ['摘要1', '摘要2', '摘要3'], finalSummary: '汇总结果' }
```

---

## 6. SuperStep 与并行执行机制

### 6.1 SuperStep 概念

SuperStep 是 LangGraph 的执行单元。图引擎按 SuperStep 推进执行：

- 每个 SuperStep 中，所有可执行的节点**同时**执行
- 当前 SuperStep 的所有节点完成后，才进入下一个 SuperStep
- Send 创建的并行实例都在**同一个 SuperStep** 中执行

### 6.2 并行执行时序图

```
时间 →

SuperStep 1:  [dispatcher]
SuperStep 2:  [summarizer#0] [summarizer#1] [summarizer#2]  ← 并行
SuperStep 3:  [aggregator]
```

### 6.3 关键保证

| 保证 | 说明 |
|------|------|
| **并行独立性** | 每个 Send 实例独立执行，互不干扰 |
| **SuperStep 边界** | 所有并行实例完成后才进入下一节点 |
| **Reducer 合并** | 并行结果在 SuperStep 结束时统一合并 |
| **确定性** | 相同输入产生相同输出（Reducer 必须是确定性的） |

### 6.4 与 recursion_limit 的关系

每个 SuperStep 消耗一次递归计数。并行实例在同一个 SuperStep 中，所以 N 个并行实例只消耗 1 次计数：

```js
// 3 个文档并行 → 3 个 SuperStep（dispatcher + summarizer×3并行 + aggregator）
// 消耗 3 次递归计数，而非 5 次
```

---

## 7. 完整实战：文档并行摘要

### 7.1 场景描述

对多个文档并行生成摘要，然后汇总为最终摘要。这是 Map-Reduce 模式的经典应用。

### 7.2 完整代码

来自 [`LangGraphStage6Send.vue`](src/pages/langgraph/LangGraphStage6Send.vue:304) 和 [`langgraphSamples.js`](src/composables/langgraphSamples.js:788)：

```js
import { StateGraph, Annotation, START, END, Send } from '@langchain/langgraph'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'

// 1. 定义状态
const ParallelState = Annotation.Root({
  documents: Annotation({
    reducer: (_, right) => right,
    default: () => []
  }),
  summaries: Annotation({
    reducer: (left, right) => left.concat(right),  // ← 关键：追加式合并并行结果
    default: () => []
  }),
  finalSummary: Annotation({
    reducer: (_, right) => right,
    default: () => ''
  })
})

const llm = new ChatOpenAI({ model: 'EB-DeepSeek-V4-Pro' })

// 2. 分发节点
const dispatcher = (state) => {
  return {}  // 不做实际分发，由条件边路由函数处理
}

// 3. 条件边路由函数 — 返回 Send[] 触发并行
const dispatchRouter = (state) => {
  return state.documents.map((doc, i) =>
    new Send('summarizer', { docIndex: i, content: doc })
  )
}

// 4. 并行摘要节点（每个文档一个实例）
const summarizer = async (state) => {
  const response = await llm.invoke([
    new HumanMessage(`请用一句话摘要以下内容：\n${state.content}`)
  ])
  return { summaries: [`[文档${state.docIndex + 1}] ${response.content}`] }
}

// 5. 汇总节点
const aggregator = async (state) => {
  const response = await llm.invoke([
    new HumanMessage(`请将以下摘要合并为一段连贯的总结：\n${state.summaries.join('\n')}`)
  ])
  return { finalSummary: response.content }
}

// 6. 构建图
const graph = new StateGraph(ParallelState)
  .addNode('dispatcher', dispatcher)
  .addNode('summarizer', summarizer)
  .addNode('aggregator', aggregator)
  .addEdge(START, 'dispatcher')
  .addConditionalEdges('dispatcher', dispatchRouter)  // ← 返回 Send[] 触发并行
  .addEdge('summarizer', 'aggregator')                // ← 所有并行实例完成后进入
  .addEdge('aggregator', END)

const app = graph.compile()

// 7. 执行
const result = await app.invoke({
  documents: [
    'LangGraph 是一个用于构建状态图工作流的框架...',
    'Send 允许在条件边中动态创建并行任务...',
    'Reducer 负责合并多个并行节点实例的输出...'
  ]
})

console.log(result.summaries)     // ['[文档1] ...', '[文档2] ...', '[文档3] ...']
console.log(result.finalSummary)  // '汇总后的最终摘要'
```

### 7.3 执行流程详解

```
输入: { documents: ['doc1', 'doc2', 'doc3'] }

SuperStep 1 — dispatcher:
  dispatcher 节点执行，返回 {}
  条件边路由函数 dispatchRouter 执行
  返回: [Send('summarizer', {docIndex:0, content:'doc1'}),
          Send('summarizer', {docIndex:1, content:'doc2'}),
          Send('summarizer', {docIndex:2, content:'doc3'})]

SuperStep 2 — summarizer × 3 并行:
  summarizer#0: state.content='doc1' → LLM → 返回 { summaries: ['[文档1] 摘要1'] }
  summarizer#1: state.content='doc2' → LLM → 返回 { summaries: ['[文档2] 摘要2'] }
  summarizer#2: state.content='doc3' → LLM → 返回 { summaries: ['[文档3] 摘要3'] }
  Reducer concat 合并: summaries = ['[文档1] 摘要1', '[文档2] 摘要2', '[文档3] 摘要3']

SuperStep 3 — aggregator:
  aggregator: state.summaries = ['[文档1] 摘要1', '[文档2] 摘要2', '[文档3] 摘要3']
  → LLM → 返回 { finalSummary: '综合摘要...' }

最终状态:
  {
    documents: ['doc1', 'doc2', 'doc3'],
    summaries: ['[文档1] 摘要1', '[文档2] 摘要2', '[文档3] 摘要3'],
    finalSummary: '综合摘要...'
  }
```

---

## 8. Send vs 普通条件边 深度对比

### 8.1 对比表

| 维度 | 普通条件边 | Send 并行 |
|------|-----------|----------|
| 路由函数返回值 | `'nodeName'` 字符串 | `Send[]` 数组 |
| 目标节点实例数 | 1 个 | N 个（动态） |
| 执行方式 | 串行（一个接一个） | 并行（同时执行） |
| 状态传递 | 共享完整状态 | args 注入 + 共享状态 |
| 结果合并 | 不需要（只有一个实例） | Reducer 自动合并 |
| SuperStep | 每个节点一个 SuperStep | 所有并行实例共享一个 SuperStep |
| 适用场景 | 条件分支、路由选择 | Map-Reduce、批量处理 |

### 8.2 决策树

```
需要同时处理多个独立任务？
├── 否 → 使用普通条件边（addConditionalEdges 返回字符串）
└── 是 → 继续判断
    ├── 任务数量固定？ → 可以硬编码多个节点 + 普通边
    └── 任务数量动态？ → 使用 Send 并行
        ├── 需要汇总结果？ → Map-Reduce 模式（dispatcher → Send[] → aggregator）
        └── 不需要汇总？ → 扇出模式（dispatcher → Send[] → END）
```

### 8.3 何时不用 Send

- **任务数量固定且少**（如 2-3 个）：直接定义多个节点 + 普通边更简单
- **任务之间有依赖**：必须串行执行，不能用 Send
- **不需要并行**：普通条件边足够

---

## 9. JS/Python API 差异速查

### 9.1 Send 创建对比

**JavaScript**：

```js
import { Send } from '@langchain/langgraph'

new Send('summarizer', { docIndex: 0, content: 'doc1' })
//  ↑ 必须使用 new 关键字
```

**Python**：

```python
from langgraph.types import Send

Send('summarizer', {'doc_index': 0, 'content': 'doc1'})
# ↑ 直接实例化，不需要 new
```

### 9.2 状态定义对比

**JavaScript**：

```js
const ParallelState = Annotation.Root({
  summaries: Annotation({
    reducer: (left, right) => left.concat(right),
    default: () => []
  })
})
```

**Python**：

```python
from typing import TypedDict, Annotated
import operator

class ParallelState(TypedDict):
    summaries: Annotated[list[str], operator.add]  # operator.add 等价于 concat
```

### 9.3 关键差异汇总

| 特性 | JavaScript | Python |
|------|-----------|--------|
| Send 创建 | `new Send(node, args)` | `Send(node, args)` |
| 条件边方法 | `addConditionalEdges` | `add_conditional_edges` |
| 路由函数返回 | `Send[]` | `list[Send]` |
| 状态定义 | `Annotation.Root({...})` | `TypedDict` + `Annotated` |
| concat Reducer | `(left, right) => left.concat(right)` | `operator.add` |
| 字段命名 | camelCase（`finalSummary`） | snake_case（`final_summary`） |

---

## 10. 常见问题与最佳实践

### 10.1 Send 的 args 和状态字段同名会怎样？

`args` 中的字段会**覆盖**共享状态中的同名字段（在该实例中）：

```js
// 状态定义有 documents 字段
// Send args 也有 documents
new Send('worker', { documents: ['override'] })

// 该实例中 state.documents → ['override']（args 优先）
// 其他实例中 state.documents → 原始值（不受影响）
```

**建议**：避免 `args` 字段与共享状态字段同名，使用不同的命名（如 `docIndex`、`content`）。

### 10.2 并行实例数量有上限吗？

没有硬性上限，但受以下因素限制：
- **系统资源**（内存、CPU）
- **LLM 并发限制**（API rate limit）
- **`recursion_limit`**（默认 JS: 25，Python: 10000）

### 10.3 并行实例执行顺序

并行实例的**执行顺序不保证**，但 Reducer 合并是**确定性的**（只要 Reducer 是纯函数）。如果需要保持顺序，在 `args` 中传递索引：

```js
state.documents.map((doc, i) =>
  new Send('summarizer', { docIndex: i, content: doc })  // 传递索引
)

// 节点中
return { summaries: [`[文档${state.docIndex + 1}] ${summary}`] }  // 使用索引标记
```

### 10.4 并行实例中可以使用 checkpointer 吗？

可以。每个并行实例都可以读写检查点，但需要注意：
- 所有实例共享同一个 `thread_id`
- 检查点保存的是**整个共享状态**，而非单个实例的状态
- 并行实例的中间状态不会单独保存

### 10.5 如何在并行实例中使用 Stream？

使用 `stream` 模式时，并行实例的输出会在同一个 chunk 中返回：

```js
const stream = await app.stream({ documents: [...] })

for await (const chunk of stream) {
  // chunk 可能包含多个并行实例的输出
  console.log(chunk)
}
```

### 10.6 并行 + Interrupt 可以结合吗？

可以，但有限制：
- 并行实例中调用 `interrupt()` 会暂停**整个图**
- 恢复后，所有并行实例会**重新执行**（而非从断点继续）
- 建议在并行实例中避免使用 `interrupt()`

### 10.7 最佳实践清单

| 实践 | 说明 |
|------|------|
| ✅ 使用 `concat` Reducer 收集并行结果 | 确保所有实例的输出不丢失 |
| ✅ 在 `args` 中传递索引 | 便于追踪和排序并行结果 |
| ✅ 节点函数保持无状态 | 避免并行实例间的副作用 |
| ✅ 控制并行度 | 根据 API rate limit 调整文档数量 |
| ✅ 使用 `stream` 监控进度 | 实时查看每个并行实例的执行状态 |
| ❌ 避免 args 与状态字段同名 | 防止意外覆盖 |
| ❌ 避免并行实例间共享可变对象 | 可能导致竞态条件 |
| ❌ 避免在并行实例中使用 interrupt | 恢复后会重新执行所有实例 |

---

## 总结

本文档涵盖了 LangGraph.js 中 `Send` 并行执行的完整知识体系：

| 章节 | 核心内容 |
|------|---------|
| Send 概述 | 并行执行概念、为什么需要 Send、核心要素 |
| Send 构造函数 | `new Send(node, args)` API、args 传递机制 |
| Map-Reduce 模式 | 三阶段结构（分发→Map→Reduce）、图构建代码 |
| 条件边返回 Send[] | 路由函数签名、动态并行度、节点函数 vs 路由函数 |
| Reducer 并行作用 | concat 追加合并、合并时序、Reducer 选择指南 |
| SuperStep 机制 | 执行时序、并行独立性、recursion_limit 关系 |
| 完整实战 | 文档并行摘要完整代码和执行流程详解 |
| Send vs 条件边 | 深度对比表、决策树、何时不用 Send |
| JS/Python 差异 | Send 创建、状态定义、命名规范对比 |
| FAQ | 7 个常见问题和最佳实践清单 |

下一步建议学习：[LangGraph.js 短期记忆 Memory 详解](./LangGraph.js短期记忆Memory详解.md)，掌握 `MemorySaver` 检查点机制和对话历史管理。
