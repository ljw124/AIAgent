# LangGraph.js 深入学习路线（基于内网大模型实战）

> 前置条件：已完成 [LangChain.js 深入学习路线](../langchain/LangChain.js深入学习路线.md) 的全部 7 个阶段，能通过 `createReactAgent()` 构建 Agent 应用。
>
> 目标：从「会用 Agent」到「精通 LangGraph」，系统掌握状态图工作流引擎的核心能力，能独立构建复杂的多节点、多 Agent、人机协同的 LLM 应用。
>
> 🆕 **本版本新增**：每个阶段均提供 **LangGraph.js ↔ LangGraph Python** 的 API 对照和代码对比，方便同时掌握两个版本。

---

## 目录

1. [学习路线总览](#1-学习路线总览)
2. [阶段一：StateGraph 入门 — 构建第一个状态图](#2-阶段一stategraph-入门--构建第一个状态图)
3. [阶段二：Annotation 状态定义 — 深入理解状态管理](#3-阶段二annotation-状态定义--深入理解状态管理)
4. [阶段三：条件边与路由 — 动态流程控制](#4-阶段三条件边与路由--动态流程控制)
5. [阶段四：Command 命令式路由 — 节点内动态跳转](#5-阶段四command-命令式路由--节点内动态跳转)
6. [阶段五：Human-in-the-Loop — interrupt 人机协同](#6-阶段五human-in-the-loop--interrupt-人机协同)
7. [阶段六：Parallel & Map-Reduce — Send 并行执行](#7-阶段六parallel--map-reduce--send-并行执行)
8. [阶段七：Subgraph — 子图嵌套与复用](#8-阶段七subgraph--子图嵌套与复用)
9. [阶段八：Functional API — entrypoint & task 函数式工作流](#9-阶段八functional-api--entrypoint--task-函数式工作流)
10. [进阶主题](#10-进阶主题)
11. [🆕 Python 快速对照速查表](#11-python-快速对照速查表)

---

## 1. 学习路线总览

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                      LangGraph.js 深入学习路线（8 个阶段）                               │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  起点（LangChain 阶段六）                                                              │
│  ┌──────────────────┐                                                                │
│  │ createReactAgent │  你已经会用预构建的 Agent，但它是一个「黑盒」                        │
│  │ (预构建 Agent)    │  LangGraph 让你打开黑盒，自定义每一步的行为                          │
│  └────────┬─────────┘                                                                │
│           │                                                                          │
│           ▼                                                                          │
│  阶段一          阶段二          阶段三          阶段四                                 │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐                          │
│  │StateGraph│ → │Annotation│ → │ 条件边   │ → │ Command  │                          │
│  │ 基础图   │   │ 状态管理 │   │ 动态路由 │   │ 命令跳转 │                          │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘                          │
│                                                                                      │
│  阶段五          阶段六          阶段七          阶段八                                 │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐                          │
│  │interrupt │ → │  Send    │ → │ Subgraph │ → │Functional│                          │
│  │ 人机协同 │   │ 并行执行 │   │ 子图嵌套 │   │ 函数式API│                          │
│  └──────────┘   └──────────┘   └──────────┘   └──────────┘                          │
│                                                                                      │
│  每个阶段 = 概念讲解 + 可运行示例代码（Vue 组件） + JS/Python 对比 + 与官网文档对照         │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | Vue 2（Options API） | 项目现有技术栈 |
| LLM 调用 | `@langchain/openai` `ChatOpenAI` | 已安装 ✅ |
| 图引擎 | `@langchain/langgraph` v1.4.13 | 已安装 ✅ |
| 状态管理 | `Annotation` + `StateGraph` | LangGraph 核心 |
| Checkpoint | `MemorySaver` | 已安装 ✅ |
| Store | `InMemoryStore` | 已安装 ✅ |
| Schema | `zod` v4.4.3 | 已安装 ✅ |
| API 代理 | Vue CLI devServer proxy `/inner` | 已配置 ✅ |
| 模型 | `EB-DeepSeek-V4-Pro`（内网） | 已可用 ✅ |

### 🆕 Python 版环境（对比学习用）

| 层级 | 技术 | 安装命令 |
|------|------|----------|
| 核心包 | `langgraph` | `pip install langgraph` |
| LLM 调用 | `langchain-openai` | `pip install langchain-openai` |
| Checkpoint | `langgraph-checkpoint` | 随 `langgraph` 自动安装 |
| 状态类型 | `TypedDict` + `Annotated` | Python 标准库 `typing` |
| Schema | `pydantic` | `pip install pydantic` |

### 示例代码位置

所有示例代码放在 `src/pages/langgraph/` 目录下，以独立 Vue 组件形式存在。

```
src/pages/langgraph/
├── LangGraphStage1StateGraph.vue    ← 阶段一：StateGraph 基础图
├── LangGraphStage2Annotation.vue    ← 阶段二：Annotation 状态定义
├── LangGraphStage3Routing.vue       ← 阶段三：条件边与路由
├── LangGraphStage4Command.vue       ← 阶段四：Command 命令式路由
├── LangGraphStage5Interrupt.vue     ← 阶段五：Human-in-the-Loop
├── LangGraphStage6Parallel.vue      ← 阶段六：Send 并行执行
├── LangGraphStage7Subgraph.vue      ← 阶段七：子图嵌套
└── LangGraphStage8Functional.vue    ← 阶段八：Functional API
```

### 与 LangChain 阶段六的关系

你在 LangChain 阶段六中使用的 [`createReactAgent()`](node_modules/@langchain/langgraph/dist/prebuilt/react_agent_executor.d.ts) 本质上是 LangGraph 的一个**预构建图**。它的内部结构如下：

```
createReactAgent 内部 = StateGraph
  ├── agent 节点（调用 LLM，决定是否使用工具）
  ├── tools 节点（执行工具调用）
  └── 条件边（有 tool_calls → tools，无 tool_calls → END）
```

LangGraph 的学习就是让你从「使用预构建图」到「自己构建任意图」。

### 🆕 JS 与 Python 核心导入对比

在深入各阶段之前，先了解两个版本的核心导入差异：

```js
// LangGraph.js — 核心导入
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { Command } from '@langchain/langgraph';
import { MemorySaver, InMemoryStore } from '@langchain/langgraph';
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt';
import { interrupt } from '@langchain/langgraph';
import { entrypoint, task } from '@langchain/langgraph';
```

```python
# LangGraph Python — 核心导入
from langgraph.graph import StateGraph, START, END
from langgraph.graph import MessagesState, add_messages
from langgraph.types import Command, Send, interrupt
from langgraph.checkpoint.memory import MemorySaver
from langgraph.store.memory import InMemoryStore
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.func import entrypoint, task
```

---

## 2. 阶段一：StateGraph 入门 — 构建第一个状态图

### 2.1 概念

[`StateGraph`](node_modules/@langchain/langgraph/dist/graph/state.d.ts:128) 是 LangGraph 的核心抽象。它是一个**有向图**，其中：

- **节点（Node）**：执行具体逻辑的函数（如调用 LLM、执行工具、处理数据）
- **边（Edge）**：定义节点之间的流转方向
- **状态（State）**：在节点之间共享和传递的数据

```
┌─────────────────────────────────────────────────────┐
│                    StateGraph                        │
│                                                     │
│  ┌──────────┐    普通边     ┌──────────┐            │
│  │  START   │ ───────────→ │  node_a  │            │
│  └──────────┘              └────┬─────┘            │
│                                 │ 普通边             │
│                                 ▼                   │
│                            ┌──────────┐            │
│                            │  node_b  │            │
│                            └────┬─────┘            │
│                                 │ 普通边             │
│                                 ▼                   │
│                            ┌──────────┐            │
│                            │   END    │            │
│                            └──────────┘            │
└─────────────────────────────────────────────────────┘
```

### 2.2 核心 API

| API | 说明 |
|-----|------|
| [`StateGraph(channels)`](node_modules/@langchain/langgraph/dist/graph/state.d.ts:128) | 创建状态图，传入 channels 定义状态结构 |
| [`graph.addNode(name, fn)`](node_modules/@langchain/langgraph/dist/graph/state.d.ts) | 添加节点 |
| [`graph.addEdge(from, to)`](node_modules/@langchain/langgraph/dist/graph/graph.d.ts) | 添加普通边（固定路由） |
| [`graph.compile()`](node_modules/@langchain/langgraph/dist/graph/state.d.ts) | 编译图为可执行对象 |
| [`compiled.invoke(input)`](node_modules/@langchain/langgraph/dist/pregel/index.d.ts) | 执行图 |
| [`compiled.stream(input)`](node_modules/@langchain/langgraph/dist/pregel/index.d.ts) | 流式执行图 |
| [`START`](node_modules/@langchain/langgraph/dist/constants.d.ts:6) | 特殊节点名，表示图的入口 |
| [`END`](node_modules/@langchain/langgraph/dist/constants.d.ts:8) | 特殊节点名，表示图的出口 |

### 2.3 🆕 JS vs Python 对比

#### API 对照表

| 操作 | LangGraph.js | LangGraph Python |
|------|-------------|------------------|
| 创建图 | `new StateGraph(channels)` | `StateGraph(StateClass)` |
| 添加节点 | `graph.addNode('name', fn)` | `graph.add_node('name', fn)` |
| 添加普通边 | `graph.addEdge('a', 'b')` | `graph.add_edge('a', 'b')` |
| 设置入口 | `graph.addEdge(START, 'a')` | `graph.set_entry_point('a')` |
| 编译图 | `graph.compile()` | `graph.compile()` |
| 执行图 | `compiled.invoke(input)` | `compiled.invoke(input)` |
| 流式执行 | `compiled.stream(input)` | `compiled.stream(input)` |
| 入口常量 | `START` | `START` |
| 出口常量 | `END` | `END` |

> **关键差异**：JS 版用 `addEdge(START, 'node')` 设置入口，Python 版用 `set_entry_point('node')`。JS 版 `StateGraph` 构造函数接受 `channels` 对象，Python 版接受一个 `TypedDict` 类。

#### 代码对比：构建一个简单的两节点图

```js
// ============ LangGraph.js ============
import { StateGraph, START, END } from '@langchain/langgraph';

// 1. 定义状态 channels
const channels = {
  text: { reducer: (left, right) => right ?? left, default: () => '' },
  step: { reducer: (left, right) => right ?? left, default: () => '' },
};

// 2. 定义节点函数
const nodeA = (state) => {
  return { text: 'Hello from Node A', step: 'A' };
};

const nodeB = (state) => {
  return { text: state.text + ' → Node B', step: 'B' };
};

// 3. 构建图
const graph = new StateGraph(channels)
  .addNode('nodeA', nodeA)
  .addNode('nodeB', nodeB)
  .addEdge(START, 'nodeA')   // JS: 用 addEdge 设置入口
  .addEdge('nodeA', 'nodeB')
  .addEdge('nodeB', END);

// 4. 编译并执行
const app = graph.compile();
const result = await app.invoke({ text: 'start' });
// result: { text: 'Hello from Node A → Node B', step: 'B' }
```

```python
# ============ LangGraph Python ============
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

# 1. 定义状态（TypedDict 类）
class State(TypedDict):
    text: str
    step: str

# 2. 定义节点函数
def node_a(state: State) -> dict:
    return {'text': 'Hello from Node A', 'step': 'A'}

def node_b(state: State) -> dict:
    return {'text': state['text'] + ' → Node B', 'step': 'B'}

# 3. 构建图
graph = StateGraph(State)  # Python: 传入 TypedDict 类
graph.add_node('nodeA', node_a)
graph.add_node('nodeB', node_b)
graph.set_entry_point('nodeA')  # Python: 用 set_entry_point
graph.add_edge('nodeA', 'nodeB')
graph.add_edge('nodeB', END)

# 4. 编译并执行
app = graph.compile()
result = app.invoke({'text': 'start'})
# result: {'text': 'Hello from Node A → Node B', 'step': 'B'}
```

> **核心差异总结**：
> - JS 用 `channels` 对象（含 `reducer` + `default`）定义状态，Python 用 `TypedDict` 类
> - JS 用 `addEdge(START, ...)` 设置入口，Python 用 `set_entry_point(...)`
> - JS 节点函数返回 `Partial<State>`，Python 返回 `dict`
> - JS 方法名用驼峰（`addNode`），Python 用蛇形（`add_node`）

### 2.4 示例代码

→ [`LangGraphStage1StateGraph.vue`](../../pages/langgraph/LangGraphStage1StateGraph.vue)

**学习要点：**
- `StateGraph` 的基本结构：定义状态 → 添加节点 → 添加边 → 编译 → 执行
- `channels` 参数定义状态中的键及其 reducer
- `START` 和 `END` 是特殊节点名
- 节点函数接收 `state`，返回 `Partial<State>`（部分状态更新）
- 与 `createReactAgent` 的对比：预构建 vs 自定义

### 2.5 官网对照

| 官网章节 | JS 文档 | Python 文档 |
|----------|--------|-------------|
| Quick Start | [LangGraph.js Quick Start](https://langchain-ai.github.io/langgraphjs/) | [LangGraph Python Quick Start](https://langchain-ai.github.io/langgraph/) |
| StateGraph | [JS How-tos](https://langchain-ai.github.io/langgraphjs/how-tos/) | [Python How-tos](https://langchain-ai.github.io/langgraph/how-tos/) |

---

## 3. 阶段二：Annotation 状态定义 — 深入理解状态管理

### 3.1 概念

阶段一使用了简单的 `channels` 对象定义状态。LangGraph 提供了更强大的 [`Annotation`](node_modules/@langchain/langgraph/dist/graph/annotation.d.ts:27) API 来定义状态结构，支持：

- **类型安全**：TypeScript 泛型自动推导 State 和 Update 类型
- **Reducer**：自定义状态合并逻辑（如追加消息列表、累加计数器）
- **默认值**：为状态键设置初始值

```
Annotation.Root({
  messages: Annotation<BaseMessage[]>({     ← 带 reducer 的状态键
    reducer: (left, right) => left.concat(right),
    default: () => []
  }),
  counter: Annotation<number>,              ← 简单状态键（LastValue）
  agentName: Annotation<string>({           ← 带默认值的状态键
    default: () => 'AI助手'
  })
})
```

### 3.2 核心 API

| API | 说明 |
|-----|------|
| [`Annotation.Root(spec)`](node_modules/@langchain/langgraph/dist/graph/annotation.d.ts:35) | 创建状态定义根对象 |
| [`Annotation<Type>()`](node_modules/@langchain/langgraph/dist/graph/annotation.d.ts:29) | 简单状态键（LastValue：新值覆盖旧值） |
| [`Annotation<Type>({ reducer, default })`](node_modules/@langchain/langgraph/dist/graph/annotation.d.ts:28) | 带 reducer 的状态键 |
| [`MessagesAnnotation`](node_modules/@langchain/langgraph/dist/graph/messages_annotation.d.ts) | 预构建的消息列表状态（含 messagesReducer） |
| `StateAnnotation.State` | 推导出的完整状态类型 |
| `StateAnnotation.Update` | 推导出的更新类型（Partial） |

### 3.3 Reducer 类型

| Reducer | 行为 | 适用场景 |
|---------|------|----------|
| 默认（LastValue） | 新值覆盖旧值 | 单一值状态（如当前步骤名） |
| `messagesStateReducer` | 追加消息到列表 | 对话消息历史 |
| 自定义 `(left, right) => ...` | 自定义合并逻辑 | 累加计数器、合并对象等 |

### 3.4 🆕 JS vs Python 对比

#### API 对照表

| 操作 | LangGraph.js | LangGraph Python |
|------|-------------|------------------|
| 定义状态 | `Annotation.Root({...})` | `TypedDict` 类 + `Annotated` |
| 简单值（覆盖） | `Annotation<Type>()` | `key: Type`（默认覆盖） |
| 追加列表 | `Annotation<Type[]>({ reducer: (l,r) => l.concat(r) })` | `key: Annotated[list, operator.add]` |
| 消息列表 | `MessagesAnnotation`（预构建） | `MessagesState`（预构建） |
| 自定义 reducer | `{ reducer: (left, right) => ... }` | `Annotated[Type, custom_reducer]` |
| 默认值 | `{ default: () => value }` | 在 `TypedDict` 中无法直接设默认值，需在节点中处理 |
| 类型推导 | `StateAnnotation.State` / `.Update` | 直接用 `State` 类 |

> **关键差异**：JS 的 `Annotation` 系统是 LangGraph 特有的 DSL，Python 则复用 Python 标准库的 `TypedDict` + `Annotated`。JS 的 `Annotation` 内置了 `default` 支持，Python 需要在节点逻辑中处理默认值。

#### 代码对比：定义消息对话状态

```js
// ============ LangGraph.js ============
import { Annotation } from '@langchain/langgraph';
import { MessagesAnnotation } from '@langchain/langgraph';

// 方式一：使用预构建的 MessagesAnnotation（推荐）
// MessagesAnnotation 内部已包含 messages 字段 + messagesStateReducer

// 方式二：自定义 Annotation
const MyState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => left.concat(right),  // 追加消息
    default: () => [],
  }),
  counter: Annotation<number>({
    reducer: (left, right) => left + right,         // 累加计数器
    default: () => 0,
  }),
  currentStep: Annotation<string>(),                // 简单覆盖（LastValue）
});

// 使用类型
type State = typeof MyState.State;    // { messages: BaseMessage[], counter: number, currentStep: string }
type Update = typeof MyState.Update;  // Partial<State>
```

```python
# ============ LangGraph Python ============
from typing import TypedDict, Annotated
import operator
from langgraph.graph import MessagesState  # 预构建的消息状态

# 方式一：使用预构建的 MessagesState（推荐）
# MessagesState 内部已包含 messages 字段 + add_messages reducer

# 方式二：自定义 TypedDict
class MyState(TypedDict):
    messages: Annotated[list, operator.add]  # 追加消息（operator.add 等同于 list concatenation）
    counter: Annotated[int, operator.add]    # 累加计数器
    current_step: str                        # 简单覆盖（默认行为）

# Python 中直接使用 State 类作为类型
# 节点函数签名: def my_node(state: MyState) -> dict:
```

> **核心差异总结**：
> - JS 的 `Annotation` 是 LangGraph 特有的 API，Python 使用标准库 `TypedDict` + `Annotated`
> - JS 的 reducer 是函数 `(left, right) => ...`，Python 的 reducer 也是函数（如 `operator.add`）
> - JS 的 `Annotation` 支持 `default`，Python 的 `TypedDict` 不直接支持默认值
> - JS 有 `MessagesAnnotation`，Python 有 `MessagesState`，功能等价

### 3.5 示例代码

→ [`LangGraphStage2Annotation.vue`](../../pages/langgraph/LangGraphStage2Annotation.vue)

**学习要点：**
- `Annotation.Root()` 替代原始 `channels` 对象
- `Annotation<Type>()` vs `Annotation<Type>({ reducer })` 的区别
- `MessagesAnnotation` 预构建消息状态的便利性
- 自定义 reducer 实现计数器累加
- 类型推导：`StateAnnotation.State` 和 `StateAnnotation.Update`

### 3.6 官网对照

| 官网章节 | JS 文档 | Python 文档 |
|----------|--------|-------------|
| Annotation / State | [JS State How-tos](https://langchain-ai.github.io/langgraphjs/how-tos/#state) | [Python State How-tos](https://langchain-ai.github.io/langgraph/how-tos/#state) |
| MessagesState | [JS Messages](https://langchain-ai.github.io/langgraphjs/how-tos/#messages) | [Python Messages](https://langchain-ai.github.io/langgraph/how-tos/#messages) |

---

## 4. 阶段三：条件边与路由 — 动态流程控制

### 4.1 概念

阶段一和二使用的是**普通边**（`addEdge`），节点之间的流转是固定的。在实际应用中，我们需要根据状态动态决定下一步走向——这就是**条件边**（`addConditionalEdges`）。

```
                    ┌─────────────────┐
                    │    agent 节点    │
                    │  (LLM 决策)      │
                    └────────┬────────┘
                             │
                    条件边（判断状态）
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │  tools   │  │  answer  │  │   END    │
        │ 执行工具  │  │ 生成回答 │  │  结束    │
        └──────────┘  └──────────┘  └──────────┘
```

这就是 `createReactAgent` 内部的核心逻辑——条件边让图有了「决策能力」。

### 4.2 核心 API

| API | 说明 |
|-----|------|
| [`graph.addConditionalEdges(source, router)`](node_modules/@langchain/langgraph/dist/graph/graph.d.ts) | 添加条件边 |
| `router(state)` | 路由函数，接收状态，返回下一个节点名 |
| [`toolsCondition`](node_modules/@langchain/langgraph/dist/prebuilt/tool_node.d.ts) | 预构建路由：有 tool_calls → `'tools'`，否则 → `END` |
| [`ToolNode`](node_modules/@langchain/langgraph/dist/prebuilt/tool_node.d.ts) | 预构建工具执行节点 |

### 4.3 🆕 JS vs Python 对比

#### API 对照表

| 操作 | LangGraph.js | LangGraph Python |
|------|-------------|------------------|
| 添加条件边 | `graph.addConditionalEdges('src', router)` | `graph.add_conditional_edges('src', router)` |
| 路由函数 | `(state) => 'nodeName'` | `def router(state) -> str:` |
| 路由映射 | 直接返回节点名字符串 | 返回字符串，或 `{...}` 映射字典 |
| 预构建路由 | `toolsCondition` | `tools_condition` |
| 预构建工具节点 | `new ToolNode(tools)` | `ToolNode(tools)` |

> **关键差异**：JS 的 `addConditionalEdges` 路由函数直接返回目标节点名字符串；Python 版可以返回字符串，也可以配合路径映射字典 `{'action': 'action', 'end': END}` 使用。JS 的 `toolsCondition` 内部已处理映射。

#### 代码对比：手动实现 ReAct 循环

```js
// ============ LangGraph.js ============
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt';

const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
});

// 方式一：使用预构建的 toolsCondition（推荐）
const graph = new StateGraph(AgentState)
  .addNode('agent', callModel)           // LLM 决策节点
  .addNode('tools', new ToolNode(tools)) // 工具执行节点
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', toolsCondition)  // 自动判断：有 tool_calls → 'tools'，无 → END
  .addEdge('tools', 'agent');            // 工具执行后回到 agent

// 方式二：自定义路由函数
const graph2 = new StateGraph(AgentState)
  .addNode('agent', callModel)
  .addNode('tools', new ToolNode(tools))
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', (state) => {
    const lastMsg = state.messages[state.messages.length - 1];
    if (lastMsg.tool_calls?.length > 0) return 'tools';
    return END;  // JS 中直接返回 END 常量
  })
  .addEdge('tools', 'agent');
```

```python
# ============ LangGraph Python ============
from langgraph.graph import StateGraph, START, END
from langgraph.graph import MessagesState
from langgraph.prebuilt import ToolNode, tools_condition

# 方式一：使用预构建的 tools_condition（推荐）
graph = StateGraph(MessagesState)
graph.add_node('agent', call_model)           # LLM 决策节点
graph.add_node('tools', ToolNode(tools))      # 工具执行节点
graph.add_edge(START, 'agent')
graph.add_conditional_edges('agent', tools_condition)  # 自动判断
graph.add_edge('tools', 'agent')              # 工具执行后回到 agent

# 方式二：自定义路由函数
def custom_router(state: MessagesState) -> str:
    last_msg = state['messages'][-1]
    if hasattr(last_msg, 'tool_calls') and last_msg.tool_calls:
        return 'tools'
    return END  # Python 中也返回 END 常量

graph2 = StateGraph(MessagesState)
graph2.add_node('agent', call_model)
graph2.add_node('tools', ToolNode(tools))
graph2.add_edge(START, 'agent')
graph2.add_conditional_edges('agent', custom_router)
graph2.add_edge('tools', 'agent')
```

> **核心差异总结**：
> - JS 的 `toolsCondition`（驼峰），Python 的 `tools_condition`（蛇形）
> - JS 路由函数直接返回字符串，Python 也返回字符串（行为一致）
> - JS 用 `lastMsg.tool_calls?.length`，Python 用 `hasattr(last_msg, 'tool_calls')`
> - 两者都支持返回 `END` 常量来终止图

### 4.4 示例代码

→ [`LangGraphStage3Routing.vue`](../../pages/langgraph/LangGraphStage3Routing.vue)

**学习要点：**
- `addConditionalEdges` 的用法：source 节点 + router 函数
- router 函数签名：`(state: State) => string`（返回下一个节点名）
- `toolsCondition` 预构建路由的源码级理解
- 手动实现 ReAct 循环：agent → [有 tool_calls?] → tools → agent → [无] → END
- 与 `createReactAgent` 的对比：你现在能自己实现它了！

### 4.5 官网对照

| 官网章节 | JS 文档 | Python 文档 |
|----------|--------|-------------|
| Conditional Edges | [JS Branching](https://langchain-ai.github.io/langgraphjs/how-tos/#branching) | [Python Branching](https://langchain-ai.github.io/langgraph/how-tos/#branching) |
| ToolNode | [JS Tool Calling](https://langchain-ai.github.io/langgraphjs/how-tos/#tool-calling) | [Python Tool Calling](https://langchain-ai.github.io/langgraph/how-tos/#tool-calling) |

---

## 5. 阶段四：Command 命令式路由 — 节点内动态跳转

### 5.1 概念

阶段三的条件边是在**边层面**做路由决策。但有时我们需要在**节点内部**根据执行结果动态决定跳转目标——这就是 [`Command`](node_modules/@langchain/langgraph/dist/constants.d.ts:28)。

```
条件边（声明式）:               Command（命令式）:
router(state) → 节点名          节点内部 return new Command({ goto: 'xxx', update: {...} })
在边层面决策                    在节点内部决策
```

`Command` 可以同时做两件事：
1. **更新状态**（`update`）
2. **跳转到指定节点**（`goto`）

### 5.2 核心 API

| API | 说明 |
|-----|------|
| [`new Command({ goto, update, resume })`](node_modules/@langchain/langgraph/dist/constants.d.ts:28) | 创建命令对象 |
| `Command.goto` | 指定跳转目标节点名 |
| `Command.update` | 指定状态更新 |
| `Command.resume` | 恢复 interrupt 时使用（见阶段五） |

### 5.3 🆕 JS vs Python 对比

#### API 对照表

| 操作 | LangGraph.js | LangGraph Python |
|------|-------------|------------------|
| 创建命令 | `new Command({ goto, update })` | `Command(goto='...', update={...})` |
| 跳转目标 | `Command.goto` | `Command.goto` |
| 状态更新 | `Command.update` | `Command.update` |
| 恢复中断 | `Command.resume` | `Command.resume` |
| 节点返回 | `return new Command(...)` | `return Command(...)` |

> **关键差异**：JS 用 `new Command(...)` 构造函数，Python 用 `Command(...)` 直接实例化。功能完全一致。

#### 代码对比：节点内动态路由

```js
// ============ LangGraph.js ============
import { Command, END } from '@langchain/langgraph';

const analyzerNode = (state) => {
  const { text } = state;
  
  if (text.includes('紧急')) {
    // 紧急消息 → 跳转到优先处理节点，同时更新状态
    return new Command({
      goto: 'priorityHandler',
      update: { priority: 'high', handled: true },
    });
  } else if (text.includes('结束')) {
    // 结束消息 → 直接终止
    return new Command({
      goto: END,
      update: { handled: true },
    });
  }
  
  // 普通消息 → 正常流转（不返回 Command，走默认边）
  return { handled: false };
};
```

```python
# ============ LangGraph Python ============
from langgraph.types import Command
from langgraph.graph import END

def analyzer_node(state: dict) -> dict:
    text = state.get('text', '')
    
    if '紧急' in text:
        # 紧急消息 → 跳转到优先处理节点，同时更新状态
        return Command(
            goto='priorityHandler',
            update={'priority': 'high', 'handled': True}
        )
    elif '结束' in text:
        # 结束消息 → 直接终止
        return Command(
            goto=END,
            update={'handled': True}
        )
    
    # 普通消息 → 正常流转（不返回 Command，走默认边）
    return {'handled': False}
```

> **核心差异总结**：
> - JS: `new Command({ goto: '...', update: {...} })`，Python: `Command(goto='...', update={...})`
> - 两者都支持 `goto: END` 来终止图
> - 当节点不返回 `Command` 时，走默认的普通边（行为一致）

### 5.4 示例代码

→ [`LangGraphStage4Command.vue`](../../pages/langgraph/LangGraphStage4Command.vue)

**学习要点：**
- `Command` 与条件边的区别：声明式 vs 命令式
- 在节点内根据 LLM 返回内容动态决定下一步
- `Command` 同时更新状态和路由
- 适用场景：需要节点内部复杂决策逻辑时

### 5.5 官网对照

| 官网章节 | JS 文档 | Python 文档 |
|----------|--------|-------------|
| Command | [JS Command](https://langchain-ai.github.io/langgraphjs/how-tos/#command) | [Python Command](https://langchain-ai.github.io/langgraph/how-tos/#command) |
| Routing | [JS Routing Concepts](https://langchain-ai.github.io/langgraphjs/concepts/low_level/#routing) | [Python Routing Concepts](https://langchain-ai.github.io/langgraph/concepts/low_level/#routing) |

---

## 6. 阶段五：Human-in-the-Loop — interrupt 人机协同

### 6.1 概念

[`interrupt()`](node_modules/@langchain/langgraph/dist/interrupt.d.ts:45) 是 LangGraph 最强大的特性之一。它允许图在某个节点**暂停执行**，等待人工审批或输入后再继续。

```
┌──────────┐     ┌──────────────┐     ┌──────────┐     ┌──────────┐
│  agent   │ ──→ │  interrupt   │ ──→ │  人工审批  │ ──→ │   END    │
│  生成方案 │     │  暂停等审批   │     │ Command   │     │  执行方案 │
└──────────┘     └──────────────┘     └──────────┘     └──────────┘
                       │                    ▲
                       └── GraphInterrupt ──┘
                          (抛出中断异常)
```

**典型应用场景：**
- 🔐 **审批流程**：AI 生成方案 → 人工审批 → 继续执行
- ✏️ **人工修正**：AI 提取信息 → 人工确认/修改 → 继续处理
- 🛑 **安全审查**：AI 执行危险操作前 → 人工确认
- 🔄 **多轮交互**：AI 提问 → 人工回答 → AI 继续

### 6.2 核心 API

| API | 说明 |
|-----|------|
| [`interrupt(value)`](node_modules/@langchain/langgraph/dist/interrupt.d.ts:45) | 在节点中暂停执行，抛出 `GraphInterrupt` |
| [`new Command({ resume })`](node_modules/@langchain/langgraph/dist/constants.d.ts:28) | 恢复执行，传入 resume 值 |
| [`GraphInterrupt`](node_modules/@langchain/langgraph/dist/errors.d.ts) | 中断异常类型 |
| `checkpointer` | interrupt 需要 checkpointer 支持（如 `MemorySaver`） |

### 6.3 🆕 JS vs Python 对比

#### API 对照表

| 操作 | LangGraph.js | LangGraph Python |
|------|-------------|------------------|
| 中断执行 | `interrupt('提示信息')` | `interrupt('提示信息')` |
| 恢复执行 | `new Command({ resume: value })` | `Command(resume=value)` |
| Checkpointer | `new MemorySaver()` | `MemorySaver()` |
| 编译时注入 | `graph.compile({ checkpointer })` | `graph.compile(checkpointer=checkpointer)` |
| 线程 ID | `{ configurable: { thread_id } }` | `{'configurable': {'thread_id': thread_id}}` |

> **关键差异**：`interrupt()` 函数签名和行为在两个版本中几乎完全一致。差异主要在 `Command` 的构造方式（JS 用 `new`，Python 不用）和 `compile` 的参数传递方式。

#### 代码对比：人工审批工作流

```js
// ============ LangGraph.js ============
import { StateGraph, Annotation, START, END, Command, interrupt, MemorySaver } from '@langchain/langgraph';

const ApprovalState = Annotation.Root({
  plan: Annotation<string>(),
  approved: Annotation<boolean>(),
});

// 节点1：生成方案
const generatePlan = async (state) => {
  const plan = await llm.invoke('请生成一个执行方案...');
  return { plan: plan.content };
};

// 节点2：等待人工审批（interrupt）
const waitApproval = (state) => {
  // interrupt 抛出 GraphInterrupt，暂停执行
  // 返回值是 resume 传入的值
  const decision = interrupt({
    question: '请审批以下方案：',
    plan: state.plan,
  });
  // decision 是用户通过 Command({ resume }) 传入的值
  return { approved: decision.approved };
};

// 节点3：执行方案
const executePlan = (state) => {
  if (state.approved) {
    return { result: '方案已执行' };
  }
  return { result: '方案已拒绝' };
};

// 构建图
const graph = new StateGraph(ApprovalState)
  .addNode('generate', generatePlan)
  .addNode('approval', waitApproval)
  .addNode('execute', executePlan)
  .addEdge(START, 'generate')
  .addEdge('generate', 'approval')
  .addEdge('approval', 'execute')
  .addEdge('execute', END);

const checkpointer = new MemorySaver();
const app = graph.compile({ checkpointer });

// 第一次调用：执行到 interrupt 处暂停
const threadId = 'thread-1';
const stream = await app.stream(
  { plan: '' },
  { configurable: { thread_id: threadId } }
);
// 此时图暂停在 'approval' 节点

// 第二次调用：传入审批结果，恢复执行
const resumeResult = await app.stream(
  new Command({ resume: { approved: true } }),  // JS: new Command
  { configurable: { thread_id: threadId } }
);
```

```python
# ============ LangGraph Python ============
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import Command, interrupt
from langgraph.checkpoint.memory import MemorySaver

class ApprovalState(TypedDict):
    plan: str
    approved: bool

# 节点1：生成方案
def generate_plan(state: ApprovalState) -> dict:
    plan = llm.invoke('请生成一个执行方案...')
    return {'plan': plan.content}

# 节点2：等待人工审批（interrupt）
def wait_approval(state: ApprovalState) -> dict:
    # interrupt 抛出 GraphInterrupt，暂停执行
    # 返回值是 resume 传入的值
    decision = interrupt({
        'question': '请审批以下方案：',
        'plan': state['plan'],
    })
    # decision 是用户通过 Command(resume=...) 传入的值
    return {'approved': decision['approved']}

# 节点3：执行方案
def execute_plan(state: ApprovalState) -> dict:
    if state['approved']:
        return {'result': '方案已执行'}
    return {'result': '方案已拒绝'}

# 构建图
graph = StateGraph(ApprovalState)
graph.add_node('generate', generate_plan)
graph.add_node('approval', wait_approval)
graph.add_node('execute', execute_plan)
graph.add_edge(START, 'generate')
graph.add_edge('generate', 'approval')
graph.add_edge('approval', 'execute')
graph.add_edge('execute', END)

checkpointer = MemorySaver()
app = graph.compile(checkpointer=checkpointer)  # Python: 关键字参数

# 第一次调用：执行到 interrupt 处暂停
thread_id = 'thread-1'
stream = app.stream(
    {'plan': ''},
    {'configurable': {'thread_id': thread_id}}
)
# 此时图暂停在 'approval' 节点

# 第二次调用：传入审批结果，恢复执行
resume_result = app.stream(
    Command(resume={'approved': True}),  # Python: 直接 Command(...)
    {'configurable': {'thread_id': thread_id}}
)
```

> **核心差异总结**：
> - `interrupt()` 函数在两个版本中签名和行为完全一致
> - JS: `new Command({ resume: {...} })`，Python: `Command(resume={...})`
> - JS: `graph.compile({ checkpointer })`，Python: `graph.compile(checkpointer=checkpointer)`
> - 线程配置格式一致：`{ configurable: { thread_id: '...' } }`

### 6.4 示例代码

→ [`LangGraphStage5Interrupt.vue`](../../pages/langgraph/LangGraphStage5Interrupt.vue)

**学习要点：**
- `interrupt()` 的工作原理：抛出 `GraphInterrupt` 异常
- 必须配置 `checkpointer`（`MemorySaver`）才能使用 interrupt
- 使用 `Command({ resume })` 恢复执行
- `interrupt` 的返回值是 `resume` 传入的值
- 多个 `interrupt` 按顺序依次暂停和恢复
- 前端 UI 如何展示「等待审批」状态

### 6.5 官网对照

| 官网章节 | JS 文档 | Python 文档 |
|----------|--------|-------------|
| Human-in-the-Loop | [JS HITL Concepts](https://langchain-ai.github.io/langgraphjs/concepts/human_in_the_loop/) | [Python HITL Concepts](https://langchain-ai.github.io/langgraph/concepts/human_in_the_loop/) |
| Interrupt | [JS HITL How-tos](https://langchain-ai.github.io/langgraphjs/how-tos/#human-in-the-loop) | [Python HITL How-tos](https://langchain-ai.github.io/langgraph/how-tos/#human-in-the-loop) |

---

## 7. 阶段六：Parallel & Map-Reduce — Send 并行执行

### 7.1 概念

[`Send`](node_modules/@langchain/langgraph/dist/constants.d.ts:32) 允许图**动态创建并行任务**。当一个节点需要将任务分发给多个并行实例时，使用 `Send` 可以同时启动多个节点实例。

```
                          ┌─────────────────┐
                          │    supervisor    │
                          │   分发任务        │
                          └────────┬────────┘
                                   │
                    return [Send('worker', {task: 1}),
                            Send('worker', {task: 2}),
                            Send('worker', {task: 3})]
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
        ┌──────────┐        ┌──────────┐        ┌──────────┐
        │ worker   │        │ worker   │        │ worker   │
        │ task: 1  │        │ task: 2  │        │ task: 3  │
        └────┬─────┘        └────┬─────┘        └────┬─────┘
             │                   │                   │
             └───────────────────┼───────────────────┘
                                 ▼
                          ┌──────────┐
                          │   END    │
                          └──────────┘
```

**典型应用场景：**
- 📊 **批量处理**：对多个文档同时进行摘要
- 🔍 **并行检索**：同时查询多个知识库
- 🗳️ **多路投票**：多个 Agent 独立回答，投票选出最佳答案
- 📧 **批量通知**：同时向多个用户发送消息

### 7.2 核心 API

| API | 说明 |
|-----|------|
| [`new Send(node, args)`](node_modules/@langchain/langgraph/dist/constants.d.ts:32) | 创建并行任务，指定目标节点和参数 |
| `Send.node` | 目标节点名 |
| `Send.args` | 传递给节点的参数 |
| 条件边返回 `Send[]` | 触发多个并行节点实例 |

### 7.3 🆕 JS vs Python 对比

#### API 对照表

| 操作 | LangGraph.js | LangGraph Python |
|------|-------------|------------------|
| 创建并行任务 | `new Send('node', args)` | `Send('node', args)` |
| 返回多个任务 | 条件边返回 `Send[]` 数组 | 条件边返回 `list[Send]` |
| 并行节点 | 自动并行执行 | 自动并行执行（superstep 机制） |
| 结果合并 | reducer 自动合并 | reducer 自动合并 |

> **关键差异**：JS 用 `new Send(...)`，Python 用 `Send(...)`。并行执行机制完全一致，都基于 superstep。

#### 代码对比：Map-Reduce 并行摘要

```js
// ============ LangGraph.js ============
import { Send } from '@langchain/langgraph';

const ParallelState = Annotation.Root({
  documents: Annotation<string[]>({ reducer: (_, right) => right, default: () => [] }),
  summaries: Annotation<string[]>({
    reducer: (left, right) => left.concat(right),  // 合并并行结果
    default: () => [],
  }),
  finalSummary: Annotation<string>(),
});

// 分发节点：为每个文档创建一个 Send
const dispatcher = (state) => {
  return state.documents.map((doc, i) =>
    new Send('summarizer', { docIndex: i, content: doc })  // JS: new Send
  );
};

// 并行摘要节点（每个文档一个实例）
const summarizer = async (state) => {
  const summary = await llm.invoke(`请摘要：${state.content}`);
  return { summaries: [summary.content] };  // reducer 自动合并
};

// 汇总节点
const aggregator = async (state) => {
  const final = await llm.invoke(`合并以下摘要：${state.summaries.join('\n')}`);
  return { finalSummary: final.content };
};

const graph = new StateGraph(ParallelState)
  .addNode('dispatcher', dispatcher)
  .addNode('summarizer', summarizer)
  .addNode('aggregator', aggregator)
  .addEdge(START, 'dispatcher')
  .addConditionalEdges('dispatcher', dispatcher)  // 返回 Send[]
  .addEdge('summarizer', 'aggregator')
  .addEdge('aggregator', END);
```

```python
# ============ LangGraph Python ============
from typing import TypedDict, Annotated
import operator
from langgraph.graph import StateGraph, START, END
from langgraph.types import Send

class ParallelState(TypedDict):
    documents: list[str]
    summaries: Annotated[list[str], operator.add]  # 合并并行结果
    final_summary: str

# 分发节点：为每个文档创建一个 Send
def dispatcher(state: ParallelState) -> list[Send]:
    return [
        Send('summarizer', {'doc_index': i, 'content': doc})  # Python: Send(...)
        for i, doc in enumerate(state['documents'])
    ]

# 并行摘要节点（每个文档一个实例）
def summarizer(state: ParallelState) -> dict:
    summary = llm.invoke(f'请摘要：{state["content"]}')
    return {'summaries': [summary.content]}  # reducer 自动合并

# 汇总节点
def aggregator(state: ParallelState) -> dict:
    final = llm.invoke(f'合并以下摘要：{chr(10).join(state["summaries"])}')
    return {'final_summary': final.content}

graph = StateGraph(ParallelState)
graph.add_node('dispatcher', dispatcher)
graph.add_node('summarizer', summarizer)
graph.add_node('aggregator', aggregator)
graph.add_edge(START, 'dispatcher')
graph.add_conditional_edges('dispatcher', dispatcher)  # 返回 list[Send]
graph.add_edge('summarizer', 'aggregator')
graph.add_edge('aggregator', END)
```

> **核心差异总结**：
> - JS: `new Send('node', args)`，Python: `Send('node', args)`
> - JS 条件边返回 `Send[]`，Python 返回 `list[Send]`
> - 并行执行和结果合并机制完全一致
> - reducer 在并行场景下自动合并多个节点实例的输出

### 7.4 示例代码

→ [`LangGraphStage6Parallel.vue`](../../pages/langgraph/LangGraphStage6Parallel.vue)

**学习要点：**
- `Send` 的用法：在条件边中返回 `Send[]` 数组
- 并行节点共享同一个状态，各自返回部分更新
- reducer 在并行场景下的作用（合并多个节点的输出）
- Map-Reduce 模式：分发 → 并行处理 → 汇总
- 与顺序执行的性能对比

### 7.5 官网对照

| 官网章节 | JS 文档 | Python 文档 |
|----------|--------|-------------|
| Map-Reduce | [JS Map-Reduce](https://langchain-ai.github.io/langgraphjs/how-tos/#map-reduce) | [Python Map-Reduce](https://langchain-ai.github.io/langgraph/how-tos/#map-reduce) |
| Send | [JS Send Concepts](https://langchain-ai.github.io/langgraphjs/concepts/low_level/#send) | [Python Send Concepts](https://langchain-ai.github.io/langgraph/concepts/low_level/#send) |

---

## 8. 阶段七：Subgraph — 子图嵌套与复用

### 8.1 概念

[`Subgraph`](node_modules/@langchain/langgraph/dist/graph/graph.d.ts) 允许将一个已编译的图作为另一个图的节点使用。这实现了图的**模块化**和**复用**。

```
┌─────────────────────────────────────────────────────┐
│                   Parent Graph                       │
│                                                     │
│  ┌──────────┐     ┌──────────────────┐              │
│  │  START   │ ──→ │   Subgraph A     │              │
│  └──────────┘     │  ┌────────────┐  │              │
│                   │  │ 内部节点1   │  │              │
│                   │  │ 内部节点2   │  │              │
│                   │  └────────────┘  │              │
│                   └────────┬─────────┘              │
│                            │                        │
│                            ▼                        │
│                   ┌──────────────────┐              │
│                   │   Subgraph B     │              │
│                   │  ┌────────────┐  │              │
│                   │  │ 内部节点3   │  │              │
│                   │  │ 内部节点4   │  │              │
│                   │  └────────────┘  │              │
│                   └────────┬─────────┘              │
│                            │                        │
│                            ▼                        │
│                   ┌──────────────┐                  │
│                   │     END      │                  │
│                   └──────────────┘                  │
└─────────────────────────────────────────────────────┘
```

**典型应用场景：**
- 🏗️ **多 Agent 协作**：每个 Agent 是一个子图
- 🔧 **可复用组件**：将通用逻辑封装为子图
- 📋 **复杂工作流**：将大图拆分为多个小图，便于维护

### 8.2 核心 API

| API | 说明 |
|-----|------|
| [`graph.addNode(name, compiledSubgraph)`](node_modules/@langchain/langgraph/dist/graph/state.d.ts) | 将已编译的图作为节点添加 |
| 子图状态隔离 | 子图有独立的状态空间 |
| 状态映射 | 父图状态自动映射到子图输入 |

### 8.3 🆕 JS vs Python 对比

#### API 对照表

| 操作 | LangGraph.js | LangGraph Python |
|------|-------------|------------------|
| 添加子图 | `parentGraph.addNode('name', compiledSubgraph)` | `parent_graph.add_node('name', compiled_subgraph)` |
| 子图状态 | 独立状态空间，通过 input/output 映射 | 独立状态空间，通过 input/output 映射 |
| 编译子图 | `subgraph.compile()` | `subgraph.compile()` |

> **关键差异**：子图机制在两个版本中几乎完全一致。都是将已编译的图作为节点添加到父图中。

#### 代码对比：多 Agent 协作

```js
// ============ LangGraph.js ============
// 子图 A：数据分析 Agent
const DataAnalysisState = Annotation.Root({
  query: Annotation<string>(),
  analysis: Annotation<string>(),
});

const analysisGraph = new StateGraph(DataAnalysisState)
  .addNode('analyze', async (state) => {
    const result = await llm.invoke(`分析数据：${state.query}`);
    return { analysis: result.content };
  })
  .addEdge(START, 'analyze')
  .addEdge('analyze', END)
  .compile();  // 先编译子图

// 子图 B：报告生成 Agent
const ReportState = Annotation.Root({
  data: Annotation<string>(),
  report: Annotation<string>(),
});

const reportGraph = new StateGraph(ReportState)
  .addNode('generate', async (state) => {
    const report = await llm.invoke(`生成报告：${state.data}`);
    return { report: report.content };
  })
  .addEdge(START, 'generate')
  .addEdge('generate', END)
  .compile();  // 先编译子图

// 父图：编排多 Agent
const SupervisorState = Annotation.Root({
  task: Annotation<string>(),
  analysisResult: Annotation<string>(),
  reportResult: Annotation<string>(),
});

const supervisorGraph = new StateGraph(SupervisorState)
  .addNode('dataAnalysis', analysisGraph)   // 子图作为节点
  .addNode('reportGen', reportGraph)        // 子图作为节点
  .addEdge(START, 'dataAnalysis')
  .addEdge('dataAnalysis', 'reportGen')
  .addEdge('reportGen', END)
  .compile();
```

```python
# ============ LangGraph Python ============
# 子图 A：数据分析 Agent
class DataAnalysisState(TypedDict):
    query: str
    analysis: str

analysis_graph = StateGraph(DataAnalysisState)
analysis_graph.add_node('analyze', lambda state: {
    'analysis': llm.invoke(f'分析数据：{state["query"]}').content
})
analysis_graph.add_edge(START, 'analyze')
analysis_graph.add_edge('analyze', END)
compiled_analysis = analysis_graph.compile()  # 先编译子图

# 子图 B：报告生成 Agent
class ReportState(TypedDict):
    data: str
    report: str

report_graph = StateGraph(ReportState)
report_graph.add_node('generate', lambda state: {
    'report': llm.invoke(f'生成报告：{state["data"]}').content
})
report_graph.add_edge(START, 'generate')
report_graph.add_edge('generate', END)
compiled_report = report_graph.compile()  # 先编译子图

# 父图：编排多 Agent
class SupervisorState(TypedDict):
    task: str
    analysis_result: str
    report_result: str

supervisor_graph = StateGraph(SupervisorState)
supervisor_graph.add_node('dataAnalysis', compiled_analysis)  # 子图作为节点
supervisor_graph.add_node('reportGen', compiled_report)       # 子图作为节点
supervisor_graph.add_edge(START, 'dataAnalysis')
supervisor_graph.add_edge('dataAnalysis', 'reportGen')
supervisor_graph.add_edge('reportGen', END)
compiled_supervisor = supervisor_graph.compile()
```

> **核心差异总结**：
> - 子图机制在两个版本中几乎完全一致
> - 都是先 `compile()` 子图，再 `addNode('name', compiledSubgraph)` 添加到父图
> - 子图有独立的状态空间，父图通过状态键名匹配自动映射

### 8.4 示例代码

→ [`LangGraphStage7Subgraph.vue`](../../pages/langgraph/LangGraphStage7Subgraph.vue)

**学习要点：**
- 如何将已编译的图作为另一个图的节点
- 子图与父图的状态关系
- 多 Agent 协作的基本模式
- 子图的复用：同一个子图可以被多个父图使用

### 8.5 官网对照

| 官网章节 | JS 文档 | Python 文档 |
|----------|--------|-------------|
| Subgraph | [JS Subgraph](https://langchain-ai.github.io/langgraphjs/how-tos/#subgraph) | [Python Subgraph](https://langchain-ai.github.io/langgraph/how-tos/#subgraph) |
| Multi-Agent | [JS Multi-Agent](https://langchain-ai.github.io/langgraphjs/concepts/multi_agent/) | [Python Multi-Agent](https://langchain-ai.github.io/langgraph/concepts/multi_agent/) |

---

## 9. 阶段八：Functional API — entrypoint & task 函数式工作流

### 9.1 概念

LangGraph v1.x 引入了 **Functional API**（[`entrypoint`](node_modules/@langchain/langgraph/dist/func/index.d.ts) + [`task`](node_modules/@langchain/langgraph/dist/func/index.d.ts:37)），提供了一种更简洁的方式来定义工作流。与 `StateGraph` 的图构建模式不同，Functional API 更接近编写普通异步函数。

```
StateGraph 模式（声明式）:              Functional API（函数式）:
                                      const addOne = task('add', async (a) => a + 1);
graph.addNode('a', nodeA)             
graph.addNode('b', nodeB)             const workflow = entrypoint('main', async (nums) => {
graph.addEdge('a', 'b')                 const results = await Promise.all(
graph.compile()                           nums.map(n => addOne(n))
                                        );
                                        return results;
                                      });
```

**Functional API 的优势：**
- ✅ 更简洁：不需要手动构建图结构
- ✅ 更直观：像写普通 async 函数一样
- ✅ 自动并行：`task` 调用自动支持并行执行
- ✅ 类型安全：完整的 TypeScript 类型推导

### 9.2 核心 API

| API | 说明 |
|-----|------|
| [`entrypoint(name, fn)`](node_modules/@langchain/langgraph/dist/func/index.d.ts) | 定义工作流入口 |
| [`task(name, fn)`](node_modules/@langchain/langgraph/dist/func/index.d.ts:37) | 定义可并行执行的任务 |
| [`task(options, fn)`](node_modules/@langchain/langgraph/dist/func/index.d.ts) | 带重试/缓存配置的任务 |
| [`getPreviousState()`](node_modules/@langchain/langgraph/dist/func/index.d.ts) | 获取上一次执行的状态 |
| `entrypoint.invoke(input)` | 执行工作流 |
| `entrypoint.stream(input)` | 流式执行工作流 |

### 9.3 🆕 JS vs Python 对比

#### API 对照表

| 操作 | LangGraph.js | LangGraph Python |
|------|-------------|------------------|
| 定义入口 | `entrypoint('name', async (input) => {...})` | `@entrypoint()` 装饰器 或 `entrypoint()` |
| 定义任务 | `task('name', async (input) => {...})` | `@task()` 装饰器 或 `task()` |
| 调用任务 | `await taskName(input)` | `await task_name(input)` |
| 并行执行 | `Promise.all(tasks)` | `asyncio.gather(*tasks)` |
| 获取历史状态 | `getPreviousState()` | `get_previous_state()` |
| 执行入口 | `entrypoint.invoke(input)` | `entrypoint.invoke(input)` |
| 流式执行 | `entrypoint.stream(input)` | `entrypoint.stream(input)` |

> **关键差异**：Python 版支持装饰器语法 `@entrypoint()` / `@task()`，JS 版使用函数调用方式。Python 用 `asyncio.gather` 并行，JS 用 `Promise.all`。

#### 代码对比：函数式并行工作流

```js
// ============ LangGraph.js ============
import { entrypoint, task } from '@langchain/langgraph';

// 定义可复用的 task
const analyzeSentiment = task('analyzeSentiment', async (text) => {
  const result = await llm.invoke(`分析情感：${text}`);
  return { sentiment: result.content };
});

const extractKeywords = task('extractKeywords', async (text) => {
  const result = await llm.invoke(`提取关键词：${text}`);
  return { keywords: result.content };
});

const generateSummary = task('generateSummary', async (text) => {
  const result = await llm.invoke(`生成摘要：${text}`);
  return { summary: result.content };
});

// 定义工作流入口
const workflow = entrypoint('documentAnalysis', async (document) => {
  // 三个 task 自动并行执行
  const [sentiment, keywords, summary] = await Promise.all([
    analyzeSentiment(document),
    extractKeywords(document),
    generateSummary(document),
  ]);

  return {
    sentiment: sentiment.sentiment,
    keywords: keywords.keywords,
    summary: summary.summary,
  };
});

// 执行
const result = await workflow.invoke('这是一篇关于AI发展的文章...');
```

```python
# ============ LangGraph Python ============
import asyncio
from langgraph.func import entrypoint, task

# 定义可复用的 task
@task
async def analyze_sentiment(text: str) -> dict:
    result = await llm.ainvoke(f'分析情感：{text}')
    return {'sentiment': result.content}

@task
async def extract_keywords(text: str) -> dict:
    result = await llm.ainvoke(f'提取关键词：{text}')
    return {'keywords': result.content}

@task
async def generate_summary(text: str) -> dict:
    result = await llm.ainvoke(f'生成摘要：{text}')
    return {'summary': result.content}

# 定义工作流入口
@entrypoint()
async def document_analysis(document: str) -> dict:
    # 三个 task 自动并行执行
    sentiment, keywords, summary = await asyncio.gather(
        analyze_sentiment(document),
        extract_keywords(document),
        generate_summary(document),
    )

    return {
        'sentiment': sentiment['sentiment'],
        'keywords': keywords['keywords'],
        'summary': summary['summary'],
    }

# 执行
result = await document_analysis.ainvoke('这是一篇关于AI发展的文章...')
```

> **核心差异总结**：
> - JS: `task('name', fn)` 函数调用，Python: `@task` 装饰器（也支持函数调用方式）
> - JS: `entrypoint('name', fn)`，Python: `@entrypoint()` 装饰器
> - JS 并行用 `Promise.all([...])`，Python 用 `asyncio.gather(...)`
> - JS 执行用 `workflow.invoke()`，Python 用 `workflow.ainvoke()`（异步）或 `workflow.invoke()`（同步）

### 9.4 示例代码

→ [`LangGraphStage8Functional.vue`](../../pages/langgraph/LangGraphStage8Functional.vue)

**学习要点：**
- `entrypoint` 定义工作流入口，`task` 定义可并行任务
- `task` 调用返回 Promise，天然支持 `Promise.all` 并行
- 与 `StateGraph` 的对比：何时用 Functional API，何时用 StateGraph
- `task` 的 `retry` 和 `cachePolicy` 配置
- Functional API 也支持 `checkpointer` 和 `interrupt`

### 9.5 官网对照

| 官网章节 | JS 文档 | Python 文档 |
|----------|--------|-------------|
| Functional API | [JS Functional API Concepts](https://langchain-ai.github.io/langgraphjs/concepts/functional_api/) | [Python Functional API Concepts](https://langchain-ai.github.io/langgraph/concepts/functional_api/) |
| entrypoint & task | [JS Functional API How-tos](https://langchain-ai.github.io/langgraphjs/how-tos/#functional-api) | [Python Functional API How-tos](https://langchain-ai.github.io/langgraph/how-tos/#functional-api) |

---

## 10. 进阶主题

完成八个阶段后，可以进一步探索：

| 主题 | 说明 | JS API | Python API |
|------|------|--------|------------|
| **Checkpointer** | 持久化图状态 | [`BaseCheckpointSaver`](node_modules/@langchain/langgraph-checkpoint/dist/base.d.ts) | `langgraph.checkpoint.base.BaseCheckpointSaver` |
| **Store** | 长期记忆存储 | [`BaseStore`](node_modules/@langchain/langgraph-checkpoint/dist/store/base.d.ts)、[`InMemoryStore`](node_modules/@langchain/langgraph-checkpoint/dist/store/memory.d.ts) | `langgraph.store.base.BaseStore`、`InMemoryStore` |
| **Stream Mode** | 多种流式模式 | [`StreamMode`](node_modules/@langchain/langgraph/dist/pregel/types.d.ts) | `langgraph.types.StreamMode` |
| **RetryPolicy** | 节点级重试策略 | [`RetryPolicy`](node_modules/@langchain/langgraph/dist/pregel/utils/index.d.ts) | `langgraph.types.RetryPolicy` |
| **CachePolicy** | 节点级缓存策略 | [`CachePolicy`](node_modules/@langchain/langgraph/dist/pregel/utils/index.d.ts) | `langgraph.types.CachePolicy` |
| **NodeTimeout** | 节点超时控制 | [`TimeoutPolicy`](node_modules/@langchain/langgraph/dist/pregel/utils/timeout.d.ts) | `langgraph.types.TimeoutPolicy` |
| **ErrorHandler** | 节点级错误处理 | [`NodeErrorHandler`](node_modules/@langchain/langgraph/dist/graph/graph.d.ts:96) | `langgraph.types.NodeErrorHandler` |
| **writer** | 自定义流式输出 | [`writer`](node_modules/@langchain/langgraph/dist/writer.d.ts) | `langgraph.types.writer` / `get_stream_writer()` |
| **LangGraph Platform** | 部署到 LangGraph Cloud | [`remote`](node_modules/@langchain/langgraph/dist/remote.d.ts) | `langgraph.remote` |

---

## 11. 🆕 Python 快速对照速查表

> 以下速查表汇总了 LangGraph.js 与 LangGraph Python 在所有核心 API 上的对应关系，方便快速查阅。

### 11.1 包导入

| 功能 | LangGraph.js | LangGraph Python |
|------|-------------|------------------|
| 核心图 | `@langchain/langgraph` | `langgraph.graph` |
| 预构建组件 | `@langchain/langgraph/prebuilt` | `langgraph.prebuilt` |
| Checkpoint | `@langchain/langgraph` | `langgraph.checkpoint.memory` |
| Store | `@langchain/langgraph` | `langgraph.store.memory` |
| Functional API | `@langchain/langgraph` | `langgraph.func` |
| 类型定义 | `@langchain/langgraph` | `langgraph.types` |

### 11.2 图构建 API

| 操作 | LangGraph.js | LangGraph Python |
|------|-------------|------------------|
| 创建图 | `new StateGraph(channels)` | `StateGraph(StateClass)` |
| 添加节点 | `graph.addNode(name, fn)` | `graph.add_node(name, fn)` |
| 添加普通边 | `graph.addEdge(from, to)` | `graph.add_edge(from, to)` |
| 添加条件边 | `graph.addConditionalEdges(src, router)` | `graph.add_conditional_edges(src, router)` |
| 设置入口 | `graph.addEdge(START, 'node')` | `graph.set_entry_point('node')` |
| 编译图 | `graph.compile()` | `graph.compile()` |
| 执行图 | `app.invoke(input)` | `app.invoke(input)` |
| 流式执行 | `app.stream(input)` | `app.stream(input)` |

### 11.3 状态定义

| 操作 | LangGraph.js | LangGraph Python |
|------|-------------|------------------|
| 定义状态 | `Annotation.Root({...})` | `class State(TypedDict): ...` |
| 简单值 | `Annotation<Type>()` | `key: Type` |
| 追加列表 | `Annotation<Type[]>({ reducer: concat })` | `key: Annotated[list, operator.add]` |
| 消息状态 | `MessagesAnnotation` | `MessagesState` |
| 默认值 | `{ default: () => value }` | 在节点中处理 |

### 11.4 路由与控制

| 操作 | LangGraph.js | LangGraph Python |
|------|-------------|------------------|
| 命令式路由 | `new Command({ goto, update })` | `Command(goto=..., update=...)` |
| 中断执行 | `interrupt(value)` | `interrupt(value)` |
| 恢复执行 | `new Command({ resume: value })` | `Command(resume=value)` |
| 并行分发 | `new Send('node', args)` | `Send('node', args)` |
| 预构建路由 | `toolsCondition` | `tools_condition` |
| 预构建工具节点 | `new ToolNode(tools)` | `ToolNode(tools)` |

### 11.5 Functional API

| 操作 | LangGraph.js | LangGraph Python |
|------|-------------|------------------|
| 定义入口 | `entrypoint('name', fn)` | `@entrypoint()` 装饰器 |
| 定义任务 | `task('name', fn)` | `@task()` 装饰器 |
| 并行执行 | `Promise.all([...])` | `asyncio.gather(...)` |
| 获取历史状态 | `getPreviousState()` | `get_previous_state()` |

### 11.6 命名约定差异

| 方面 | LangGraph.js | LangGraph Python |
|------|-------------|------------------|
| 方法命名 | 驼峰式 `addNode`、`addEdge` | 蛇形式 `add_node`、`add_edge` |
| 构造函数 | `new ClassName()` | `ClassName()` |
| 异步模型 | `async/await` + `Promise` | `async/await` + `asyncio` |
| 类型系统 | TypeScript 泛型 | Python `TypedDict` + `Annotated` |
| 状态更新返回 | `Partial<State>` 对象 | `dict` 字典 |

### 11.7 关键心智模型差异

| 方面 | LangGraph.js | LangGraph Python |
|------|-------------|------------------|
| **状态定义哲学** | 使用 `Annotation` DSL，内置 reducer + default | 使用标准库 `TypedDict` + `Annotated`，更 Pythonic |
| **入口设置** | `addEdge(START, 'node')` — 把 START 当作特殊节点 | `set_entry_point('node')` — 显式设置入口方法 |
| **Command 构造** | `new Command({...})` — 构造函数模式 | `Command(...)` — 直接实例化 |
| **Functional API** | 函数调用式 `task('name', fn)` | 装饰器式 `@task()`（也支持函数调用） |
| **生态定位** | 前端/全栈 JS 生态，Node.js 服务端 | 数据科学/ML 生态，Python 服务端 |

---

## 参考资源

### LangGraph.js
- [LangGraph.js 官方文档](https://langchain-ai.github.io/langgraphjs/)
- [LangGraph.js API 参考](https://langchain-ai.github.io/langgraphjs/reference/)
- [LangGraph.js GitHub](https://github.com/langchain-ai/langgraphjs)
- [LangGraph.js 概念指南](https://langchain-ai.github.io/langgraphjs/concepts/)
- [LangGraph.js How-to Guides](https://langchain-ai.github.io/langgraphjs/how-tos/)

### LangGraph Python
- [LangGraph Python 官方文档](https://langchain-ai.github.io/langgraph/)
- [LangGraph Python API 参考](https://langchain-ai.github.io/langgraph/reference/)
- [LangGraph Python GitHub](https://github.com/langchain-ai/langgraph)
- [LangGraph Python 概念指南](https://langchain-ai.github.io/langgraph/concepts/)
- [LangGraph Python How-to Guides](https://langchain-ai.github.io/langgraph/how-tos/)

### 本项目相关文档
- [本项目 LangChain.js 深入学习路线](../langchain/LangChain.js深入学习路线.md)
- [本项目 LangChain.js 短期记忆 Memory 详解](../langchain/LangChain.js短期记忆Memory详解.md)
- [本项目 LangChain.js 长期记忆 Store 详解](../langchain/LangChain.js长期记忆Store详解.md)
- [本项目 LangChain 详细指南（含 Python 版）](../langchain/LangChain详细指南.md)