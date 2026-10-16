# LangGraph.js StateGraph 状态图入门详解

> 前置条件：了解 LangChain 基础概念（Model、Prompt、Chain），对 LLM 应用开发有基本认识。
>
> 目标：掌握 LangGraph 的核心构建块 `StateGraph`，理解状态图的完整生命周期（定义状态 → 添加节点 → 添加边 → 编译 → 执行），理解 `createReactAgent`（预构建黑盒）与 `StateGraph`（自定义图）的区别。
>
> 🆕 本文档与 [`LangGraphStage1StateGraph.vue`](../../pages/langgraph/LangGraphStage1StateGraph.vue) 组件配套，所有代码均可在浏览器中运行。

---

## 目录

1. [StateGraph 概述 — 什么是状态图](#1-stategraph-概述--什么是状态图)
2. [StateGraph 完整生命周期](#2-stategraph-完整生命周期)
3. [Annotation.Root — 定义状态](#3-annotationroot--定义状态)
4. [addNode — 添加节点](#4-addnode--添加节点)
5. [addEdge 与 START/END — 添加边](#5-addedge-与-startend--添加边)
6. [compile — 编译图](#6-compile--编译图)
7. [invoke vs stream — 执行图](#7-invoke-vs-stream--执行图)
8. [图可视化 — getGraphAsync + drawMermaid](#8-图可视化--getgraphasync--drawmermaid)
9. [JS/Python API 差异速查](#9-jspython-api-差异速查)
10. [常见问题与最佳实践](#10-常见问题与最佳实践)

---

## 1. StateGraph 概述 — 什么是状态图

### 1.1 概念

**StateGraph** 是 LangGraph 的核心构建块，它将 LLM 应用建模为一个**状态图（State Machine）**：

- **状态（State）**：图执行过程中所有节点共享的数据
- **节点（Node）**：执行具体任务的函数（如调用 LLM、处理数据）
- **边（Edge）**：节点之间的连接，决定执行顺序
- **入口（START）**：图的起点
- **出口（END）**：图的终点

```
START → nodeA（文本处理） → nodeB（文本追加） → END
```

### 1.2 为什么需要 StateGraph

在 LangGraph 出现之前，构建 LLM 应用主要使用 **Chain（链式调用）**：

```
Chain 模式：prompt → model → parser（线性，难以循环和分支）
```

Chain 的局限性：
- ❌ 难以实现**循环**（如 Agent 的 ReAct 循环）
- ❌ 难以实现**条件分支**（根据 LLM 输出选择不同路径）
- ❌ 难以实现**人机协同**（暂停等待人工审批）
- ❌ 难以实现**并行**（同时处理多个任务）

StateGraph 解决了这些问题：
- ✅ 循环：`addEdge('tools', 'agent')` 轻松实现 ReAct 循环
- ✅ 条件分支：`addConditionalEdges` 动态路由
- ✅ 人机协同：`interrupt()` 暂停/恢复
- ✅ 并行：`Send` 扇出多个实例

### 1.3 createReactAgent vs StateGraph

LangGraph 提供两种构建方式：

| 对比维度 | createReactAgent | StateGraph |
|---------|-----------------|-----------|
| 类型 | 预构建图（黑盒） | 自定义图（白盒） |
| 构建方式 | 一行代码 | 手动定义节点和边 |
| 灵活性 | 固定的 ReAct 模式 | 任意拓扑结构 |
| 学习成本 | 低 | 中 |
| 适用场景 | 快速原型、标准 Agent | 复杂工作流、需要精细控制 |

```js
// createReactAgent — 一行代码创建标准 ReAct Agent
import { createReactAgent } from '@langchain/langgraph/prebuilt'
const agent = createReactAgent({ llm, tools })

// StateGraph — 手动构建自定义图（打开黑盒）
const graph = new StateGraph(stateDefinition)
  .addNode('nodeA', nodeA)
  .addNode('nodeB', nodeB)
  .addEdge(START, 'nodeA')
  .addEdge('nodeA', 'nodeB')
  .addEdge('nodeB', END)
```

**学习建议**：先学 `StateGraph`（理解底层机制），再用 `createReactAgent`（提高效率）。

---

## 2. StateGraph 完整生命周期

### 2.1 五个步骤

来自 [`LangGraphStage1StateGraph.vue`](src/pages/langgraph/LangGraphStage1StateGraph.vue:206) 的完整流程：

```
1. 定义状态    → Annotation.Root({...})
2. 定义节点    → const nodeA = (state) => ({...})
3. 构建图      → new StateGraph(state).addNode().addEdge()
4. 编译图      → graph.compile()
5. 执行图      → app.invoke() / app.stream()
```

### 2.2 完整代码

```js
import { StateGraph, Annotation, START, END } from '@langchain/langgraph'

// 1. 定义状态
const stateDefinition = Annotation.Root({
  text: Annotation(),
  step: Annotation()
})

// 2. 定义节点函数
const nodeA = (state) => ({
  text: `[A处理] ${state.text}`,
  step: 'A'
})

const nodeB = (state) => ({
  text: `${state.text} → [B追加]`,
  step: 'B'
})

// 3. 构建图（链式调用）
const graph = new StateGraph(stateDefinition)
  .addNode('nodeA', nodeA)
  .addNode('nodeB', nodeB)
  .addEdge(START, 'nodeA')   // 入口边
  .addEdge('nodeA', 'nodeB')
  .addEdge('nodeB', END)     // 出口边

// 4. 编译图
const app = graph.compile()

// 5. 执行图
const result = await app.invoke({ text: 'Hello LangGraph' })
console.log(result)
// { text: '[A处理] Hello LangGraph → [B追加]', step: 'B' }
```

### 2.3 执行流程详解

```
输入: { text: 'Hello LangGraph', step: undefined }

SuperStep 1 — nodeA 执行:
  读取 state.text = 'Hello LangGraph'
  返回 { text: '[A处理] Hello LangGraph', step: 'A' }
  Reducer 合并（LastValue 覆盖）:
  状态变为 { text: '[A处理] Hello LangGraph', step: 'A' }

SuperStep 2 — nodeB 执行:
  读取 state.text = '[A处理] Hello LangGraph'
  返回 { text: '[A处理] Hello LangGraph → [B追加]', step: 'B' }
  Reducer 合并（LastValue 覆盖）:
  状态变为 { text: '[A处理] Hello LangGraph → [B追加]', step: 'B' }

到达 END，返回最终状态:
  { text: '[A处理] Hello LangGraph → [B追加]', step: 'B' }
```

---

## 3. Annotation.Root — 定义状态

### 3.1 基本语法

```js
const stateDefinition = Annotation.Root({
  text: Annotation(),      // 无参数 → 默认 LastValue reducer
  step: Annotation()
})
```

### 3.2 Annotation() 的两种形式

```js
// 形式一：无参数 — 使用默认 LastValue reducer（覆盖式合并）
text: Annotation()

// 形式二：带参数 — 自定义 reducer 和 default
messages: Annotation({
  reducer: (left, right) => left.concat(right),
  default: () => []
})
```

### 3.3 状态字段说明

Stage1 示例中的两个字段：

| 字段 | 类型 | Reducer | 用途 |
|------|------|---------|------|
| `text` | `string` | LastValue（默认） | 存储处理中的文本 |
| `step` | `string` | LastValue（默认） | 记录当前执行到的节点 |

**注意**：Stage1 使用最简单的 LastValue reducer（新值覆盖旧值）。更复杂的 reducer（concat/add）详见 [LangGraph.js 状态定义 Annotation 详解](./LangGraph.js状态定义Annotation详解.md)。

### 3.4 状态的读写规则

```js
// 节点函数中：
const nodeA = (state) => {
  // 读：state 是完整状态（包含所有字段）
  console.log(state.text)   // 当前文本
  console.log(state.step)   // 当前步骤

  // 写：返回 Partial<State>（只返回需要更新的字段）
  return {
    text: '新文本',   // 更新 text
    step: 'A'         // 更新 step
  }
}
```

**关键规则**：
- **读**：节点函数的 `state` 参数是**完整状态**
- **写**：返回值是**部分更新**（Partial），只包含需要更新的字段
- **合并**：返回值通过 Reducer 与当前状态合并

---

## 4. addNode — 添加节点

### 4.1 基本语法

```js
graph.addNode(name, func)
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 节点名称，图中唯一标识 |
| `func` | `(state) => Partial<State>` | 节点函数，接收完整状态，返回部分更新 |

### 4.2 节点函数签名

```ts
// 同步节点
type SyncNode = (state: State) => Partial<State>

// 异步节点（推荐，可调用 LLM）
type AsyncNode = (state: State) => Promise<Partial<State>>
```

### 4.3 节点函数示例

来自 [`LangGraphStage1StateGraph.vue`](src/pages/langgraph/LangGraphStage1StateGraph.vue:230)：

```js
// 同步节点 — 纯文本处理
const nodeA = (state) => {
  const result = {
    text: `[A处理] ${state.text}`,   // 读取 state.text，加工后返回
    step: 'A'
  }
  return result
}

// 异步节点 — 调用 LLM（后续阶段会用到）
const llmNode = async (state) => {
  const response = await llm.invoke([new HumanMessage(state.text)])
  return { text: response.content }
}
```

### 4.4 节点命名规范

| 规范 | 示例 | 说明 |
|------|------|------|
| 使用小驼峰 | `nodeA`、`classifyIntent` | JS 惯例 |
| 语义化命名 | `summarizer`、`aggregator` | 表达节点职责 |
| 避免保留字 | ❌ `START`、`END`、`__start__` | 系统保留 |

---

## 5. addEdge 与 START/END — 添加边

### 5.1 基本语法

```js
graph.addEdge(from, to)
```

| 参数 | 类型 | 说明 |
|------|------|------|
| `from` | `string \| START` | 边的起点（节点名或 START） |
| `to` | `string \| END` | 边的终点（节点名或 END） |

### 5.2 START 和 END 常量

```js
import { START, END } from '@langchain/langgraph'

// START — 图的入口（虚拟节点）
graph.addEdge(START, 'nodeA')   // 入口边：从 START 到 nodeA

// END — 图的出口（虚拟节点）
graph.addEdge('nodeB', END)     // 出口边：从 nodeB 到 END
```

**说明**：
- `START` 和 `END` 是特殊常量，不是真实节点
- `START` 表示图的**唯一入口**（可以有多个入口边，但通常只有一个）
- `END` 表示图的**出口**（可以有多个节点指向 END）
- 没有 START 边的图无法编译；没有 END 边的图会无限执行（直到 recursion_limit）

### 5.3 普通边 vs 条件边

```js
// 普通边（固定路由）— Stage1 使用
graph.addEdge('nodeA', 'nodeB')  // nodeA 完成后必定执行 nodeB

// 条件边（动态路由）— Stage3 学习
graph.addConditionalEdges('nodeA', routerFn, {
  pathA: 'nodeB',
  pathB: 'nodeC'
})
```

| 边类型 | 方法 | 路由方式 | 适用场景 |
|--------|------|---------|---------|
| 普通边 | `addEdge` | 固定（编译时确定） | 线性流程 |
| 条件边 | `addConditionalEdges` | 动态（运行时决定） | 分支、循环 |

### 5.4 边的方向规则

```
合法的边：
  START → nodeA        ✅ 入口边
  nodeA → nodeB        ✅ 节点间边
  nodeB → END          ✅ 出口边
  nodeA → nodeA        ✅ 自环（循环）

非法的边：
  END → nodeA          ❌ END 不能作为起点
  nodeA → START        ❌ START 不能作为终点
```

---

## 6. compile — 编译图

### 6.1 基本语法

```js
const app = graph.compile()
```

`compile()` 将 `StateGraph`（构建器）转换为 `CompiledStateGraph`（可执行应用）。

### 6.2 compile 的完整参数

```js
const app = graph.compile({
  checkpointer,        // 检查点存储（MemorySaver 等）
  interruptBefore,     // 在指定节点前暂停（人机协同）
  interruptAfter,      // 在指定节点后暂停
  name                 // 图名称（用于 LangSmith 追踪）
})
```

| 参数 | 类型 | 说明 | 详见 |
|------|------|------|------|
| `checkpointer` | `BaseCheckpointSaver` | 状态持久化 | [Checkpoint 详解](./LangGraph.js检查点Checkpoint详解.md) |
| `interruptBefore` | `string[]` | 节点执行前暂停 | [Interrupt 详解](./LangGraph.js人机协同Interrupt详解.md) |
| `interruptAfter` | `string[]` | 节点执行后暂停 | [Interrupt 详解](./LangGraph.js人机协同Interrupt详解.md) |
| `name` | `string` | 图名称 | LangSmith 追踪 |

### 6.3 编译时验证

`compile()` 会验证图的结构完整性：

- ✅ 必须有入口边（`START → xxx`）
- ✅ 所有节点必须可达（从 START 出发能到达）
- ✅ 所有边引用的节点必须已注册（`addNode`）

```js
// 缺少入口边 → 编译报错
const graph = new StateGraph(state)
  .addNode('nodeA', nodeA)
  .addEdge('nodeA', END)
graph.compile()  // ❌ Error: 没有入口

// 引用未注册节点 → 编译报错
const graph = new StateGraph(state)
  .addNode('nodeA', nodeA)
  .addEdge(START, 'nodeB')  // ❌ nodeB 未注册
  .addEdge('nodeB', END)
```

### 6.4 StateGraph vs CompiledStateGraph

| 对比 | StateGraph（构建器） | CompiledStateGraph（应用） |
|------|---------------------|--------------------------|
| 用途 | 定义图结构 | 执行图 |
| 可变 | ✅ 可继续 addNode/addEdge | ❌ 不可修改 |
| 可执行 | ❌ 不能 invoke | ✅ invoke/stream |
| 可视化 | ❌ | ✅ getGraphAsync |

---

## 7. invoke vs stream — 执行图

### 7.1 invoke — 一次性执行

来自 [`LangGraphStage1StateGraph.vue`](src/pages/langgraph/LangGraphStage1StateGraph.vue:289)：

```js
const result = await app.invoke({ text: 'Hello LangGraph' })
// result: { text: '[A处理] Hello LangGraph → [B追加]', step: 'B' }
```

**特点**：
- 等待图**完全执行完毕**，返回**最终状态**
- 适合：批量处理、不需要中间过程的场景

### 7.2 stream — 流式执行

来自 [`LangGraphStage1StateGraph.vue`](src/pages/langgraph/LangGraphStage1StateGraph.vue:277)：

```js
const stream = await app.stream({ text: 'Hello LangGraph' })

for await (const chunk of stream) {
  // chunk 是每个 superstep 的状态更新
  console.log(chunk)
  // 第 1 次: { nodeA: { text: '[A处理] Hello LangGraph', step: 'A' } }
  // 第 2 次: { nodeB: { text: '[A处理] Hello LangGraph → [B追加]', step: 'B' } }
}
```

**特点**：
- 每个节点执行完成后**立即返回**该节点的更新
- 适合：UI 实时展示、需要中间过程的场景

### 7.3 streamMode 选项

```js
const stream = await app.stream(input, {
  streamMode: 'values'  // 默认
})
```

| streamMode | 返回内容 | 说明 |
|-----------|---------|------|
| `'values'` | 完整状态 | 每个 superstep 后的完整状态 |
| `'updates'` | 状态更新 | 每个节点返回的部分更新 |
| `'messages'` | LLM 消息 | LLM 的 token 级流式输出 |
| `'custom'` | 自定义数据 | 节点内通过 `getWriter()` 发送 |
| `'debug'` | 调试信息 | 包含任务、状态等完整调试信息 |

### 7.4 对比总结

| 维度 | invoke | stream |
|------|--------|--------|
| 返回方式 | 一次性返回最终状态 | 逐步返回每个节点的更新 |
| 等待时间 | 等待全部完成 | 每个节点完成即可获取 |
| 返回类型 | `Promise<State>` | `AsyncIterable<Chunk>` |
| 适用场景 | 批处理、API 调用 | UI 展示、实时反馈 |

---

## 8. 图可视化 — getGraphAsync + drawMermaid

### 8.1 基本用法

来自 [`LangGraphStage1StateGraph.vue`](src/pages/langgraph/LangGraphStage1StateGraph.vue:294)：

```js
// 1. 获取 DrawableGraph 对象
const graphObj = await app.getGraphAsync()

// 2. 生成 Mermaid 格式的图结构代码
const mermaidCode = graphObj.drawMermaid({
  withStyles: true,     // 包含样式
  curveStyle: 'basis'   // 曲线风格
})

// mermaidCode 示例：
// %%{init: {'flowchart': {'curve': 'basis'}}}%%
// graph TD
//   __start__([<p>__start__</p>]):::startEnd
//   nodeA([<p>nodeA</p>]):::node
//   nodeB([<p>nodeB</p>]):::node
//   __end__([<p>__end__</p>]):::startEnd
//   __start__ --> nodeA
//   nodeA --> nodeB
//   nodeB --> __end__
```

### 8.2 在前端渲染 Mermaid

```js
import mermaid from 'mermaid'

// 初始化 Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose'
})

// 渲染 Mermaid 代码为 SVG
const { svg } = await mermaid.render('graph-id', mermaidCode)
container.innerHTML = svg
```

### 8.3 可视化的价值

| 价值 | 说明 |
|------|------|
| 理解图结构 | 直观看到节点和边的拓扑关系 |
| 调试 | 验证图结构是否符合预期 |
| 文档 | 自动生成图结构文档 |
| LangSmith 对比 | 与 LangSmith 追踪中的图对比 |

---

## 9. JS/Python API 差异速查

### 9.1 完整对比

**JavaScript**：

```js
import { StateGraph, Annotation, START, END } from '@langchain/langgraph'

// 1. 定义状态 — Annotation.Root
const stateDefinition = Annotation.Root({
  text: Annotation(),
  step: Annotation()
})

// 2. 构建图 — 驼峰命名
const graph = new StateGraph(stateDefinition)
  .addNode('nodeA', nodeA)
  .addNode('nodeB', nodeB)
  .addEdge(START, 'nodeA')
  .addEdge('nodeA', 'nodeB')
  .addEdge('nodeB', END)

// 3. 编译
const app = graph.compile()

// 4. 执行
const result = await app.invoke({ text: '输入' })
```

**Python**：

```python
from langgraph.graph import StateGraph, START, END
from typing import TypedDict

# 1. 定义状态 — TypedDict 类
class State(TypedDict):
    text: str
    step: str

# 2. 构建图 — 蛇形命名
graph = StateGraph(State)
graph.add_node('node_a', node_a)
graph.add_node('node_b', node_b)
graph.add_edge(START, 'node_a')
graph.add_edge('node_a', 'node_b')
graph.add_edge('node_b', END)

# 3. 编译
app = graph.compile()

# 4. 执行
result = app.invoke({'text': '输入'})
```

### 9.2 关键差异汇总

| 特性 | JavaScript | Python |
|------|-----------|--------|
| 状态定义 | `Annotation.Root({...})` | `class State(TypedDict)` |
| 添加节点 | `addNode(name, fn)` | `add_node(name, fn)` |
| 添加边 | `addEdge(from, to)` | `add_edge(from, to)` |
| 命名风格 | 驼峰（camelCase） | 蛇形（snake_case） |
| 节点返回值 | `Partial<State>` 对象 | `dict` |
| 状态访问 | `state.text` | `state['text']` |
| 执行方法 | `await app.invoke()` | `app.invoke()` |
| 图可视化 | `getGraphAsync()` | `get_graph()` |

---

## 10. 常见问题与最佳实践

### 10.1 节点函数必须返回对象吗？

**是的**，节点函数必须返回一个对象（可以是空对象）：

```js
// ✅ 正确 — 返回部分更新
const nodeA = (state) => ({ text: 'new' })

// ✅ 正确 — 返回空对象（不更新任何字段）
const passThrough = (state) => ({})

// ❌ 错误 — 返回 undefined
const badNode = (state) => {
  console.log('do something')
  // 没有 return → undefined → 报错
}
```

### 10.2 节点可以只更新部分字段吗？

**可以**，返回值是 Partial<State>，只返回需要更新的字段：

```js
const stateDefinition = Annotation.Root({
  text: Annotation(),
  step: Annotation(),
  count: Annotation()
})

// 只更新 text，step 和 count 保持不变
const nodeA = (state) => ({ text: 'new text' })
```

### 10.3 图必须有 END 边吗？

**建议有**。没有 END 边的图会一直执行，直到触发 `recursion_limit`（默认 JS: 25）：

```js
// 无限循环图（会触发 recursion_limit 报错）
graph
  .addNode('loop', loopNode)
  .addEdge(START, 'loop')
  .addEdge('loop', 'loop')  // 自环，没有 END

// 正确：条件边 + END（如 ReAct 循环）
graph
  .addConditionalEdges('agent', toolsCondition)  // 有工具调用 → tools，否则 → END
```

### 10.4 addNode 和 addEdge 的顺序重要吗？

**节点必须先注册**，边才能引用：

```js
// ✅ 正确 — 先 addNode 再 addEdge
graph
  .addNode('nodeA', nodeA)
  .addNode('nodeB', nodeB)
  .addEdge(START, 'nodeA')
  .addEdge('nodeA', 'nodeB')

// ❌ 错误 — addEdge 引用未注册的节点
graph
  .addEdge(START, 'nodeA')  // nodeA 还未注册
  .addNode('nodeA', nodeA)
```

### 10.5 invoke 的输入必须是完整状态吗？

**不需要**，输入是 Partial<State>，只提供初始字段：

```js
// 状态定义有 text 和 step 两个字段
// 输入只提供 text，step 使用默认值（undefined）
const result = await app.invoke({ text: 'Hello' })
```

### 10.6 如何调试图的执行？

**方法一：stream 模式**

```js
const stream = await app.stream(input, { streamMode: 'updates' })
for await (const chunk of stream) {
  console.log('节点更新:', chunk)  // 每个节点的返回值
}
```

**方法二：节点内 console.log**

```js
const nodeA = (state) => {
  console.log('nodeA 输入:', state)
  const result = { text: 'new' }
  console.log('nodeA 输出:', result)
  return result
}
```

**方法三：图可视化**

```js
const graphObj = await app.getGraphAsync()
console.log(graphObj.drawMermaid())  // 打印图结构
```

### 10.7 最佳实践清单

| 实践 | 说明 |
|------|------|
| ✅ 节点函数保持纯粹 | 只依赖输入 state，返回更新，避免副作用 |
| ✅ 使用语义化节点名 | `summarizer` 优于 `node1` |
| ✅ 先设计图结构再写代码 | 画出节点和边，再实现节点函数 |
| ✅ 使用 stream 调试 | 实时查看每个节点的输入输出 |
| ✅ 用 drawMermaid 验证结构 | 确保图结构符合预期 |
| ❌ 避免节点间隐式依赖 | 节点应只通过 state 通信 |
| ❌ 避免在节点中修改全局变量 | 破坏图的可追溯性 |
| ❌ 避免过大的节点 | 一个节点做一件事，便于调试和复用 |

---

## 总结

本文档涵盖了 LangGraph.js 中 `StateGraph` 状态图入门的完整知识体系：

| 章节 | 核心内容 |
|------|---------|
| StateGraph 概述 | 状态图概念、Chain 的局限性、createReactAgent vs StateGraph |
| 完整生命周期 | 五个步骤：定义状态 → 添加节点 → 添加边 → 编译 → 执行 |
| Annotation.Root | 状态定义语法、Annotation() 两种形式、读写规则 |
| addNode | 节点函数签名、同步/异步节点、命名规范 |
| addEdge 与 START/END | 边的类型、方向规则、普通边 vs 条件边 |
| compile | 编译参数（checkpointer/interrupt）、编译时验证 |
| invoke vs stream | 两种执行模式、streamMode 五种选项 |
| 图可视化 | getGraphAsync + drawMermaid + Mermaid 渲染 |
| JS/Python 差异 | Annotation vs TypedDict、驼峰 vs 蛇形 |
| FAQ | 7 个常见问题和最佳实践清单 |

下一步建议学习：[LangGraph.js 状态定义 Annotation 详解](./LangGraph.js状态定义Annotation详解.md)，深入理解 Reducer 机制和 `MessagesAnnotation`。
