# LangGraph.js 状态定义 Annotation 详解

> 前置条件：已完成 [LangGraph.js 深入学习路线](./LangGraph.js深入学习路线.md) 的阶段一（StateGraph 基础），理解 `StateGraph` 的基本概念和图的构建流程。
>
> 目标：深入掌握 LangGraph 的 `Annotation` API，理解三种 Reducer 类型（concat/add/LastValue）的工作原理，学会使用 `MessagesAnnotation` 和 `messagesStateReducer` 处理消息状态。
>
> 🆕 本文档与 [`LangGraphStage2Annotation.vue`](../../pages/langgraph/LangGraphStage2Annotation.vue) 组件配套，所有代码均可在浏览器中运行（内网大模型）。

---

## 目录

1. [Annotation 概述 — 什么是状态定义](#1-annotation-概述--什么是状态定义)
2. [Annotation.Root — 定义图状态](#2-annotationroot--定义图状态)
3. [三种 Reducer 类型深入](#3-三种-reducer-类型深入)
4. [Annotation\<T\>() — 自定义 Reducer](#4-annotationt--自定义-reducer)
5. [MessagesAnnotation — 预构建消息状态](#5-messagesannotation--预构建消息状态)
6. [messagesStateReducer — 官方消息 Reducer](#6-messagesstatereducer--官方消息-reducer)
7. [类型推断 — State / Update / Node](#7-类型推断--state--update--node)
8. [invoke vs stream 执行模式](#8-invoke-vs-stream-执行模式)
9. [JS/Python API 差异速查](#9-jspython-api-差异速查)
10. [常见问题与最佳实践](#10-常见问题与最佳实践)

---

## 1. Annotation 概述 — 什么是状态定义

### 1.1 概念

在 LangGraph 中，**状态（State）** 是图执行过程中所有节点共享的数据结构。每个节点读取当前状态，执行计算，然后返回**状态更新（Update）**。LangGraph 使用 **Reducer** 函数来决定如何将更新合并到当前状态中。

`Annotation` 是 LangGraph.js 提供的状态定义 API，它让你可以：

- 定义状态的**结构**（有哪些字段）
- 为每个字段指定 **Reducer**（如何合并更新）
- 为每个字段指定**默认值**
- 获得完整的 **TypeScript 类型推断**

### 1.2 为什么需要 Reducer

考虑一个简单的场景：两个节点都要向 `messages` 数组中添加消息。

```js
// 节点 A 返回
{ messages: [msgA] }

// 节点 B 返回
{ messages: [msgB] }
```

如果没有 Reducer，节点 B 的返回会**覆盖**节点 A 的消息。有了 `concat` Reducer，两个消息会被**合并**：

```js
// 最终状态
{ messages: [msgA, msgB] }  // concat 合并，而非覆盖
```

### 1.3 Reducer 签名

每个 Reducer 都是一个函数，接收两个参数：

```ts
type Reducer<T> = (left: T, right: T) => T
```

| 参数 | 含义 | 说明 |
|------|------|------|
| `left` | 当前状态中的值 | 图执行到当前节点时，状态中已有的值 |
| `right` | 节点返回的更新值 | 当前节点 `return` 的该字段的值 |
| **返回值** | 合并后的新值 | 将成为下一个节点看到的该字段的值 |

---

## 2. Annotation.Root — 定义图状态

### 2.1 基本语法

[`Annotation.Root()`](src/pages/langgraph/LangGraphStage2Annotation.vue:322) 用于定义图的完整状态结构：

```js
import { Annotation } from '@langchain/langgraph'

const State = Annotation.Root({
  field1: Annotation<Type>({
    reducer: (left, right) => /* 合并逻辑 */,
    default: () => /* 默认值 */
  }),
  field2: Annotation<Type>({
    default: () => /* 默认值 */  // 不指定 reducer 则使用 LastValue（覆盖）
  })
})
```

### 2.2 实战示例：三种 Reducer 并存

以下代码来自 [`LangGraphStage2Annotation.vue`](src/pages/langgraph/LangGraphStage2Annotation.vue:322)，展示了三种 Reducer 类型同时使用：

```js
const stateDefinition = Annotation.Root({
  // 1. concat Reducer — 数组追加
  messages: Annotation({
    reducer: (left, right) => left.concat(right),
    default: () => []
  }),

  // 2. add Reducer — 数值累加
  counter: Annotation({
    reducer: (left, right) => left + right,
    default: () => 0
  }),

  // 3. LastValue Reducer（默认）— 覆盖
  currentStep: Annotation({
    default: () => '未开始'
  })
})
```

### 2.3 状态字段说明

| 字段 | Reducer 类型 | 默认值 | 合并行为 |
|------|-------------|--------|---------|
| `messages` | `concat` | `[]` | 新消息追加到数组末尾 |
| `counter` | `add` | `0` | 新值与旧值相加 |
| `currentStep` | `LastValue`（默认） | `'未开始'` | 新值直接覆盖旧值 |

### 2.4 执行流程演示

图结构：`START → nodeA → nodeB → END`

```js
// nodeA 返回
{
  messages: [new AIMessage('来自 nodeA 的消息')],
  counter: 1,
  currentStep: 'nodeA'
}

// nodeB 返回
{
  messages: [new AIMessage('来自 nodeB 的消息')],
  counter: 2,
  currentStep: 'nodeB'
}
```

**最终状态**（经过两次 Reducer 合并）：

```js
{
  messages: [
    AIMessage('来自 nodeA 的消息'),   // concat 追加
    AIMessage('来自 nodeB 的消息')    // concat 追加
  ],
  counter: 3,                          // 0 + 1 + 2 = 3（add 累加）
  currentStep: 'nodeB'                 // 被 nodeB 覆盖（LastValue）
}
```

---

## 3. 三种 Reducer 类型深入

### 3.1 concat Reducer — 数组追加

**用途**：消息列表、日志记录、执行轨迹等需要**累积**的场景。

```js
messages: Annotation({
  reducer: (left, right) => left.concat(right),
  default: () => []
})
```

**工作原理**：

```
初始状态:  []
nodeA 返回: [msgA]     → left=[], right=[msgA]     → concat → [msgA]
nodeB 返回: [msgB]     → left=[msgA], right=[msgB]  → concat → [msgA, msgB]
nodeC 返回: [msgC]     → left=[msgA, msgB], right=[msgC] → concat → [msgA, msgB, msgC]
```

**关键特性**：
- 每次更新**追加**到数组末尾
- 不会丢失历史数据
- 适合 LLM 对话历史（消息列表）

**⚠️ 注意**：对于消息列表，推荐使用 [`messagesStateReducer`](#6-messagesstatereducer--官方消息-reducer) 而非手动 `concat`，因为它能正确处理 `RemoveMessage` 和消息 ID 去重。

### 3.2 add Reducer — 数值累加

**用途**：计数器、总分、统计值等需要**累加**的场景。

```js
counter: Annotation({
  reducer: (left, right) => left + right,
  default: () => 0
})
```

**工作原理**：

```
初始状态:  0
nodeA 返回: 1  → left=0, right=1  → add → 1
nodeB 返回: 2  → left=1, right=2  → add → 3
nodeC 返回: 5  → left=3, right=5  → add → 8
```

**关键特性**：
- 每次更新**累加**到当前值
- 节点不需要知道当前值是多少
- 适合投票计数、token 统计等

**扩展用法 — 自定义数值 Reducer**：

```js
// 取最大值
maxScore: Annotation({
  reducer: (left, right) => Math.max(left, right),
  default: () => 0
})

// 取最小值
minLatency: Annotation({
  reducer: (left, right) => Math.min(left, right),
  default: () => Infinity
})

// 布尔 OR（任一为 true 则保持 true）
hasError: Annotation({
  reducer: (left, right) => left || right,
  default: () => false
})
```

### 3.3 LastValue Reducer（默认）— 覆盖

**用途**：当前步骤、最终结果、配置项等只需要**最新值**的场景。

```js
currentStep: Annotation({
  default: () => '未开始'
})
// 不指定 reducer → 默认使用 LastValue（覆盖）
```

**工作原理**：

```
初始状态:     '未开始'
nodeA 返回:   'nodeA'    → 覆盖 → 'nodeA'
nodeB 返回:   'nodeB'    → 覆盖 → 'nodeB'
```

**关键特性**：
- 每次更新**覆盖**旧值
- 只保留最新的值
- 是**默认行为**（不指定 reducer 时）

**等价写法**：

```js
// 方式一：不指定 reducer（推荐）
currentStep: Annotation({
  default: () => '未开始'
})

// 方式二：显式指定 LastValue reducer
currentStep: Annotation({
  reducer: (left, right) => right,  // 直接返回 right
  default: () => '未开始'
})
```

### 3.4 Reducer 行为对比表

| 特性 | concat | add | LastValue |
|------|--------|-----|-----------|
| 适用类型 | 数组 | 数值 | 任意类型 |
| 合并方式 | 追加到末尾 | 相加 | 覆盖 |
| 历史数据 | 保留全部 | 保留累计值 | 只保留最新 |
| 典型场景 | 消息列表、日志 | 计数器、统计 | 步骤名、最终结果 |
| 默认值示例 | `() => []` | `() => 0` | `() => '初始值'` |

---

## 4. Annotation\<T\>() — 自定义 Reducer

### 4.1 完整 API

```ts
Annotation<T>({
  reducer: (left: T, right: T) => T,  // 合并函数
  default: () => T                      // 默认值工厂函数
})
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `reducer` | `(left: T, right: T) => T` | 否 | 状态合并函数，不指定则使用 LastValue |
| `default` | `() => T` | 是 | 默认值工厂函数（注意是函数，不是值本身） |

### 4.2 自定义 Reducer 示例

```js
// 示例 1：合并对象（浅合并）
const State = Annotation.Root({
  metadata: Annotation({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({})
  })
})

// 示例 2：Set 去重合并
const State = Annotation.Root({
  tags: Annotation({
    reducer: (left, right) => new Set([...left, ...right]),
    default: () => new Set()
  })
})

// 示例 3：条件覆盖（只在非空时覆盖）
const State = Annotation.Root({
  result: Annotation({
    reducer: (left, right) => right || left,
    default: () => null
  })
})
```

### 4.3 default 必须是函数

**❌ 错误写法**：

```js
// 错误！default 必须是函数，不能是值本身
messages: Annotation({
  reducer: (left, right) => left.concat(right),
  default: []  // ❌ 会导致所有实例共享同一个数组引用！
})
```

**✅ 正确写法**：

```js
messages: Annotation({
  reducer: (left, right) => left.concat(right),
  default: () => []  // ✅ 每次创建新实例时调用工厂函数
})
```

**原因**：`default` 使用工厂函数确保每个图执行实例获得**独立的**默认值，避免多个并发执行共享同一个对象引用。

---

## 5. MessagesAnnotation — 预构建消息状态

### 5.1 概述

[`MessagesAnnotation`](src/composables/langgraphSamples.js:74) 是 LangGraph 提供的**预构建消息状态**，专门用于处理 LLM 对话场景。它内部使用 [`messagesStateReducer`](#6-messagesstatereducer--官方消息-reducer) 作为消息字段的 Reducer。

```js
import { MessagesAnnotation } from '@langchain/langgraph'

// MessagesAnnotation 等价于：
const MessagesAnnotation = Annotation.Root({
  messages: Annotation({
    reducer: messagesStateReducer,
    default: () => []
  })
})
```

### 5.2 使用方式

```js
import { StateGraph, MessagesAnnotation } from '@langchain/langgraph'

const graph = new StateGraph(MessagesAnnotation)
  .addNode('agent', agentNode)
  .addEdge('__start__', 'agent')
  .addEdge('agent', '__end__')
  .compile()
```

### 5.3 MessagesAnnotation vs 手动定义

| 对比维度 | MessagesAnnotation | 手动 Annotation.Root |
|---------|-------------------|---------------------|
| 消息 Reducer | `messagesStateReducer`（官方） | 需手动指定 |
| RemoveMessage 支持 | ✅ 内置支持 | ❌ 手动 concat 不支持 |
| 消息 ID 去重 | ✅ 自动去重 | ❌ 需手动处理 |
| 额外字段 | ❌ 只有 messages | ✅ 可添加任意字段 |
| 适用场景 | 纯对话应用 | 需要额外状态字段的应用 |

### 5.4 何时使用 MessagesAnnotation

- ✅ 简单的聊天机器人
- ✅ 不需要额外状态字段的对话应用
- ❌ 需要计数器、步骤追踪等额外字段时 → 使用 `Annotation.Root`

---

## 6. messagesStateReducer — 官方消息 Reducer

### 6.1 概述

[`messagesStateReducer`](src/composables/langgraphSamples.js:74) 是 LangGraph 官方提供的消息列表专用 Reducer，比手动 `concat` 更强大。

```js
import { messagesStateReducer, Annotation } from '@langchain/langgraph'

const State = Annotation.Root({
  messages: Annotation({
    reducer: messagesStateReducer,
    default: () => []
  })
})
```

### 6.2 核心能力

#### 6.2.1 消息追加

与 `concat` 相同，新消息追加到列表末尾：

```js
// 当前状态
messages: [msg1, msg2]

// 节点返回
{ messages: [msg3] }

// 合并后
messages: [msg1, msg2, msg3]
```

#### 6.2.2 RemoveMessage 支持

`messagesStateReducer` 能识别 `RemoveMessage` 对象并删除指定消息：

```js
import { RemoveMessage } from '@langchain/langgraph'

// 当前状态
messages: [msg1, msg2, msg3]

// 节点返回（删除 msg2）
{ messages: [new RemoveMessage({ id: msg2.id })] }

// 合并后
messages: [msg1, msg3]  // msg2 被移除
```

#### 6.2.3 消息 ID 去重

当追加的消息 ID 已存在时，`messagesStateReducer` 会用新消息**替换**旧消息（而非重复添加）：

```js
// 当前状态
messages: [msg1(id='a'), msg2(id='b')]

// 节点返回（msg2 的更新版本，ID 相同）
{ messages: [msg2_updated(id='b')] }

// 合并后 — msg2 被替换，而非追加
messages: [msg1(id='a'), msg2_updated(id='b')]
```

### 6.3 messagesStateReducer vs 手动 concat

| 能力 | messagesStateReducer | 手动 concat |
|------|---------------------|------------|
| 消息追加 | ✅ | ✅ |
| RemoveMessage | ✅ | ❌ |
| ID 去重替换 | ✅ | ❌ |
| 性能优化 | ✅ 官方优化 | ❌ 朴素实现 |

**建议**：处理消息列表时，始终使用 `messagesStateReducer` 而非手动 `concat`。

---

## 7. 类型推断 — State / Update / Node

### 7.1 自动类型推断

`Annotation.Root` 会自动生成三个关联类型：

```ts
const State = Annotation.Root({
  messages: Annotation<string[]>({ ... }),
  counter: Annotation<number>({ ... })
})

// 自动推断的类型
type StateType = typeof State.State    // 完整状态类型
type UpdateType = typeof State.Update  // 节点可返回的更新类型
type NodeType = typeof State.Node      // 节点函数类型
```

### 7.2 State — 完整状态类型

```ts
// State.State 包含所有字段的完整类型
type MyState = typeof State.State
// { messages: string[], counter: number, currentStep: string }
```

用于读取完整状态（如节点函数的 `state` 参数）。

### 7.3 Update — 部分更新类型

```ts
// State.Update 所有字段都是可选的
type MyUpdate = typeof State.Update
// { messages?: string[], counter?: number, currentStep?: string }
```

节点可以只返回需要更新的字段，不需要返回全部字段。

### 7.4 Node — 节点函数类型

```ts
// State.Node 是节点函数的标准类型
type MyNode = typeof State.Node
// (state: MyState) => MyUpdate
```

### 7.5 实战中的类型使用

```js
// 节点函数 — state 参数自动推断为 State.State
const nodeA = (state) => {
  // state.messages  → string[]
  // state.counter   → number
  // state.currentStep → string

  return {
    messages: [new AIMessage('hello')],  // 只返回需要更新的字段
    counter: 1
    // currentStep 不返回 → 保持不变
  }
}
```

---

## 8. invoke vs stream 执行模式

### 8.1 invoke — 一次性执行

[`invoke`](src/pages/langgraph/LangGraphStage2Annotation.vue:322) 等待图完全执行完毕，返回最终状态：

```js
const result = await graph.invoke(
  { messages: [new HumanMessage('你好')] },
  { configurable: { thread_id: 'test-1' } }
)

console.log(result.messages)    // 所有消息（含 AI 回复）
console.log(result.counter)     // 最终计数
console.log(result.currentStep) // 最后执行的节点
```

**特点**：
- 阻塞等待，返回最终结果
- 适合：批量处理、需要完整结果的场景

### 8.2 stream — 流式执行

[`stream`](src/pages/langgraph/LangGraphStage2Annotation.vue:322) 在每个 SuperStep 完成后立即返回中间状态：

```js
const stream = await graph.stream(
  { messages: [new HumanMessage('你好')] },
  { configurable: { thread_id: 'test-1' } }
)

for await (const chunk of stream) {
  console.log('节点执行完成:', chunk)
  // chunk 包含该节点更新后的完整状态
}
```

**特点**：
- 逐步返回，可实时展示进度
- 适合：UI 实时更新、需要展示中间步骤的场景

### 8.3 对比

| 维度 | invoke | stream |
|------|--------|--------|
| 返回方式 | 一次性返回最终状态 | 逐步返回每个节点执行后的状态 |
| 等待时间 | 等待全部完成 | 每个节点完成即可获取 |
| 适用场景 | 批量处理、API 调用 | UI 展示、实时反馈 |
| 返回值 | 最终状态对象 | AsyncIterable<状态对象> |

---

## 9. JS/Python API 差异速查

### 9.1 状态定义对比

**JavaScript**：

```js
import { Annotation } from '@langchain/langgraph'

const State = Annotation.Root({
  messages: Annotation({
    reducer: (left, right) => left.concat(right),
    default: () => []
  }),
  counter: Annotation({
    reducer: (left, right) => left + right,
    default: () => 0
  })
})
```

**Python**：

```python
from typing import TypedDict, Annotated
import operator
from langgraph.graph import add_messages

class State(TypedDict):
    messages: Annotated[list, add_messages]  # 等价于 messagesStateReducer
    counter: Annotated[int, operator.add]     # 等价于 add reducer
```

### 9.2 关键差异

| 特性 | JavaScript | Python |
|------|-----------|--------|
| 状态定义 | `Annotation.Root({...})` | `TypedDict` + `Annotated` |
| Reducer 指定 | `Annotation({ reducer: fn })` | `Annotated[Type, reducer_fn]` |
| 默认值 | `default: () => value` | 在 `TypedDict` 中直接赋值 |
| 消息 Reducer | `messagesStateReducer` | `add_messages` |
| 预构建消息状态 | `MessagesAnnotation` | `MessagesState` |
| 类型系统 | TypeScript 泛型 | Python type hints |

### 9.3 Python 三种 Reducer 等价写法

```python
from typing import TypedDict, Annotated
import operator
from langgraph.graph import add_messages

class State(TypedDict):
    # concat — 使用 add_messages（推荐用于消息）
    messages: Annotated[list, add_messages]

    # add — 使用 operator.add
    counter: Annotated[int, operator.add]

    # LastValue — 不指定 reducer（默认行为）
    current_step: str  # 直接声明类型即可
```

---

## 10. 常见问题与最佳实践

### 10.1 如何选择 Reducer

```
你的字段是消息列表吗？
├── 是 → 使用 messagesStateReducer
└── 否 → 继续判断
    ├── 需要累积历史数据（数组）？ → concat
    ├── 需要累加数值？ → add
    └── 只需要最新值？ → LastValue（默认）
```

### 10.2 default 必须是函数

```js
// ❌ 错误 — 所有实例共享同一个数组
default: []

// ✅ 正确 — 每个实例获得独立数组
default: () => []
```

### 10.3 节点返回部分更新

节点**不需要**返回所有字段，只返回需要更新的字段即可：

```js
const myNode = (state) => {
  return {
    messages: [new AIMessage('hello')]  // 只更新 messages
    // counter 和 currentStep 保持不变
  }
}
```

### 10.4 消息列表使用 messagesStateReducer

```js
// ❌ 不推荐 — 手动 concat 不支持 RemoveMessage 和 ID 去重
messages: Annotation({
  reducer: (left, right) => left.concat(right),
  default: () => []
})

// ✅ 推荐 — 使用官方 Reducer
import { messagesStateReducer } from '@langchain/langgraph'

messages: Annotation({
  reducer: messagesStateReducer,
  default: () => []
})
```

### 10.5 何时扩展 MessagesAnnotation

当需要除 `messages` 之外的额外状态字段时，不要使用 `MessagesAnnotation`，而是手动定义：

```js
// ✅ 需要额外字段时 — 手动定义
const State = Annotation.Root({
  messages: Annotation({
    reducer: messagesStateReducer,
    default: () => []
  }),
  turnCount: Annotation({           // 额外字段
    reducer: (left, right) => left + right,
    default: () => 0
  }),
  finalAnswer: Annotation({         // 额外字段
    default: () => null
  })
})
```

### 10.6 Reducer 的纯函数原则

Reducer 必须是**纯函数** — 不能修改 `left` 或 `right` 参数：

```js
// ❌ 错误 — 修改了 left 参数
reducer: (left, right) => {
  left.push(...right)  // 副作用！
  return left
}

// ✅ 正确 — 返回新数组
reducer: (left, right) => left.concat(right)

// ✅ 正确 — 使用展开运算符
reducer: (left, right) => [...left, ...right]
```

### 10.7 状态字段命名规范

| 字段类型 | 命名建议 | 示例 |
|---------|---------|------|
| 消息列表 | `messages` | `messages: Annotation({...})` |
| 布尔标志 | `isXxx` / `hasXxx` | `isComplete`, `hasError` |
| 计数值 | `xxxCount` | `turnCount`, `tokenCount` |
| 当前状态 | `currentXxx` | `currentStep`, `currentIntent` |
| 最终结果 | `finalXxx` / `xxxResult` | `finalAnswer`, `searchResult` |

---

## 总结

本文档涵盖了 LangGraph.js 中 `Annotation` 状态定义的完整知识体系：

| 章节 | 核心内容 |
|------|---------|
| Annotation 概述 | 状态定义概念、Reducer 的作用和签名 |
| Annotation.Root | 定义图状态的完整 API |
| 三种 Reducer | concat（追加）、add（累加）、LastValue（覆盖） |
| Annotation\<T\>() | 自定义 Reducer 和 default 工厂函数 |
| MessagesAnnotation | 预构建消息状态，开箱即用 |
| messagesStateReducer | 官方消息 Reducer，支持 RemoveMessage 和 ID 去重 |
| 类型推断 | State / Update / Node 三种自动推断类型 |
| invoke vs stream | 两种执行模式的对比和选择 |
| JS/Python 差异 | Annotation vs TypedDict+Annotated |
| FAQ | 7 个常见问题和最佳实践 |

下一步建议学习：[LangGraph.js 条件边路由 Routing 详解](./LangGraph.js条件边路由Routing详解.md)，掌握 `addConditionalEdges` 和声明式路由。
