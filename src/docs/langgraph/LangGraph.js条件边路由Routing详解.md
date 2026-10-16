# LangGraph.js 条件边与路由（Routing）详解

> 前置条件：已完成 [LangGraph.js 深入学习路线](./LangGraph.js深入学习路线.md) 的阶段二（Annotation 状态定义），理解 `StateGraph` 和 `Annotation.Root` 的基本用法。
>
> 目标：掌握 LangGraph 的 `addConditionalEdges` API，理解条件边如何让图拥有「决策能力」，实现 ReAct 循环（LLM 决策 → 工具执行 → 循环）。
>
> 🆕 本文档与 [`LangGraphStage3Routing.vue`](../../pages/langgraph/LangGraphStage3Routing.vue) 组件配套，所有代码均可在浏览器中运行（内网大模型）。

---

## 目录

1. [条件边概述 — 什么是动态路由](#1-条件边概述--什么是动态路由)
2. [addConditionalEdges API 深入](#2-addconditionaledges-api-深入)
3. [路由函数（Router Function）详解](#3-路由函数router-function详解)
4. [toolsCondition — 预构建路由](#4-toolscondition--预构建路由)
5. [ToolNode — 工具执行节点](#5-toolnode--工具执行节点)
6. [ReAct 循环实战](#6-react-循环实战)
7. [recursion_limit — 递归限制](#7-recursion_limit--递归限制)
8. [条件边 vs 普通边 对比](#8-条件边-vs-普通边-对比)
9. [JS/Python API 差异速查](#9-jspython-api-差异速查)
10. [常见问题与最佳实践](#10-常见问题与最佳实践)

---

## 1. 条件边概述 — 什么是动态路由

### 1.1 概念

在 LangGraph 中，**边（Edge）** 定义了节点之间的执行顺序。有两种类型的边：

| 类型 | API | 路由方式 | 决策时机 |
|------|-----|---------|---------|
| **普通边** | [`addEdge(from, to)`](node_modules/@langchain/langgraph/dist/index.d.ts) | 固定路由，编译时确定 | 编译时 |
| **条件边** | [`addConditionalEdges(from, router)`](node_modules/@langchain/langgraph/dist/index.d.ts) | 动态路由，运行时根据状态决定 | 运行时（每次执行节点后） |

**条件边**让图拥有了「决策能力」——图不再只是线性执行，而是可以根据当前状态动态选择下一步走向。

### 1.2 核心 API 一览

```
┌──────────────────────────────────────────────────────────────────────┐
│                    LangGraph 条件边核心 API                             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────┐  ┌────────────────────────────┐    │
│  │  addConditionalEdges()       │  │  toolsCondition             │    │
│  │  添加条件边                   │  │  预构建的 ReAct 路由函数      │    │
│  │  (from, router, [pathMap])   │  │  自动检测 tool_calls         │    │
│  └─────────────────────────────┘  └────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────┐  ┌────────────────────────────┐    │
│  │  ToolNode                    │  │  bindTools()                 │    │
│  │  工具执行节点                 │  │  将工具绑定到 LLM             │    │
│  │  自动解析 tool_calls 并执行   │  │  LLM 可自主决定调用工具        │    │
│  └─────────────────────────────┘  └────────────────────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.3 ReAct 循环全景图

```
                    ┌──────────┐
                    │  START   │
                    └────┬─────┘
                         │  (普通边)
                    ┌────▼─────┐
                    │  agent   │  ← LLM 决策（bindTools 后 LLM 可返回 tool_calls）
                    └────┬─────┘
                         │  (条件边)
                    ┌────▼─────┐
                    │  router  │  ← 检查最后一条消息是否有 tool_calls
                    └─┬─────┬──┘
                      │     │
           有tool_calls│     │无tool_calls
                      │     │
              ┌───▼──┐ │ ┌──▼──┐
              │ tools│ │ │ END │
              └───┬──┘ │ └────┘
                  │    │
                  │    │ (普通边：循环回 agent)
                  │    │
              ┌───▼──┐ │
              │ agent │◄┘
              └──────┘
```

---

## 2. addConditionalEdges API 深入

### 2.1 导入路径

```js
import { StateGraph, START, END } from '@langchain/langgraph'
```

`addConditionalEdges` 是 [`StateGraph`](node_modules/@langchain/langgraph/dist/index.d.ts) 的方法，无需单独导入。

### 2.2 函数签名

```ts
// 完整签名
addConditionalEdges(
  source: string,                              // 源节点名
  router: (state: StateType) => string,        // 路由函数
  pathMap?: Record<string, string>             // 可选：路径映射
): StateGraph

// 简化签名（使用 END 常量）
addConditionalEdges(
  source: string,
  router: (state: StateType) => string | typeof END
): StateGraph
```

### 2.3 参数详解

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `source` | `string` | ✅ | 源节点名称，路由函数在此节点执行后调用 |
| `router` | `(state) => string \| typeof END` | ✅ | 路由函数，接收当前状态，返回目标节点名或 `END` |
| `pathMap` | `Record<string, string>` | ❌ | 路径映射表，将 router 返回值映射到实际节点名 |

### 2.4 pathMap 的作用

`pathMap` 允许路由函数返回**逻辑名称**，然后映射到**实际节点名**：

```js
// 不使用 pathMap：router 直接返回节点名
.addConditionalEdges('agent', (state) => {
  if (state.messages[state.messages.length - 1].tool_calls?.length > 0) {
    return 'tools'  // 直接返回节点名
  }
  return END
})

// 使用 pathMap：router 返回逻辑名，由 pathMap 映射
.addConditionalEdges('agent', (state) => {
  if (state.messages[state.messages.length - 1].tool_calls?.length > 0) {
    return 'call_tools'  // 逻辑名
  }
  return 'finish'
}, {
  call_tools: 'tools',   // 映射到实际节点
  finish: END            // 映射到 END
})
```

### 2.5 执行时机

```
┌──────────────────────────────────────────────────────────────┐
│  图执行流程                                                    │
│                                                              │
│  1. 执行源节点（如 agent）                                     │
│     │                                                        │
│     ▼                                                        │
│  2. 节点返回状态更新                                           │
│     │                                                        │
│     ▼                                                        │
│  3. 调用 router(state) — 传入更新后的状态                      │
│     │                                                        │
│     ▼                                                        │
│  4. 根据 router 返回值决定下一个节点                            │
│     │                                                        │
│     ├── 返回 'tools' → 执行 tools 节点                        │
│     └── 返回 END → 终止图执行                                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. 路由函数（Router Function）详解

### 3.1 函数签名

```ts
type RouterFunction = (state: StateType) => string | typeof END
```

路由函数接收**当前完整状态**，返回**目标节点名称**或 `END` 常量。

### 3.2 基本模式

```js
const router = (state) => {
  // 检查状态中的某个字段
  if (someCondition(state)) {
    return 'nodeA'   // 路由到节点 A
  }
  return 'nodeB'      // 路由到节点 B
}
```

### 3.3 常见路由模式

**模式一：基于消息内容路由（ReAct 核心）**

```js
const router = (state) => {
  const lastMsg = state.messages[state.messages.length - 1]

  // 检查 LLM 是否返回了 tool_calls
  if (lastMsg.tool_calls?.length > 0) {
    return 'tools'   // 有工具调用 → 执行工具
  }
  return END         // 无工具调用 → 结束
}
```

**模式二：基于状态字段路由**

```js
const router = (state) => {
  if (state.priority === 'high') return 'urgentHandler'
  if (state.priority === 'critical') return 'escalationHandler'
  return 'normalHandler'
}
```

**模式三：多分支路由**

```js
const router = (state) => {
  // 可以返回任意多个目标节点
  switch (state.intent) {
    case 'search': return 'searchNode'
    case 'calculate': return 'calcNode'
    case 'translate': return 'translateNode'
    default: return 'fallbackNode'
  }
}
```

### 3.4 路由函数的关键约束

| 约束 | 说明 |
|------|------|
| **必须返回有效目标** | 返回值必须是已注册的节点名或 `END`，否则报错 |
| **同步函数** | 路由函数必须是同步的（不能是 async） |
| **无副作用** | 路由函数只读取状态，不应修改状态 |
| **每次节点执行后调用** | 源节点每次执行完毕都会触发路由判断 |

---

## 4. toolsCondition — 预构建路由

### 4.1 导入路径

```js
import { toolsCondition } from '@langchain/langgraph/prebuilt'
```

### 4.2 是什么

[`toolsCondition`](node_modules/@langchain/langgraph/dist/prebuilt/index.d.ts) 是 LangGraph 官方提供的**预构建路由函数**，专门用于 ReAct 循环。它封装了最常见的路由逻辑：

```
检查最后一条 AIMessage 是否包含 tool_calls
  ├── 有 tool_calls → 返回 'tools'
  └── 无 tool_calls → 返回 END
```

### 4.3 内部实现等价于

```js
const toolsCondition = (state) => {
  const lastMsg = state.messages[state.messages.length - 1]
  if (lastMsg?.tool_calls?.length > 0) {
    return 'tools'
  }
  return END
}
```

### 4.4 使用方式

```js
import { toolsCondition } from '@langchain/langgraph/prebuilt'

const graph = new StateGraph(AgentState)
  .addNode('agent', callModel)
  .addNode('tools', new ToolNode(tools))
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', toolsCondition)  // ← 直接使用
  .addEdge('tools', 'agent')
```

### 4.5 toolsCondition vs 自定义 router

| 特性 | [`toolsCondition`](node_modules/@langchain/langgraph/dist/prebuilt/index.d.ts) | 自定义 router |
|------|---------------|--------------|
| 代码量 | 1 行 | 5-10 行 |
| 灵活性 | 仅支持 tools/END 二分 | 支持任意多分支 |
| 可读性 | ⭐⭐⭐ 语义明确 | ⭐⭐ 需阅读逻辑 |
| 适用场景 | 标准 ReAct 循环 | 复杂多分支路由 |
| 可扩展性 | 不可扩展 | 可添加日志、埋点等 |

---

## 5. ToolNode — 工具执行节点

### 5.1 导入路径

```js
import { ToolNode } from '@langchain/langgraph/prebuilt'
```

### 5.2 是什么

[`ToolNode`](node_modules/@langchain/langgraph/dist/prebuilt/index.d.ts) 是 LangGraph 官方提供的**预构建工具执行节点**。它自动：

1. 从状态中提取最后一条 `AIMessage` 的 `tool_calls`
2. 并行执行所有工具调用
3. 将工具返回结果包装为 `ToolMessage` 并添加到消息列表

### 5.3 构造函数

```ts
new ToolNode(
  tools: StructuredTool[],           // 工具列表
  options?: {
    name?: string,                   // 节点名称（默认 'tools'）
    tags?: string[],                 // 标签（用于追踪）
    handleToolErrors?: boolean       // 是否处理工具错误（默认 false）
  }
)
```

### 5.4 使用方式

```js
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

// 定义工具
const getWeather = tool(async ({ city }) => {
  return `${city}天气：晴，25°C`
}, {
  name: 'get_weather',
  description: '查询城市天气',
  schema: z.object({ city: z.string() })
})

const calculator = tool(async ({ expression }) => {
  return `计算结果: ${eval(expression)}`
}, {
  name: 'calculator',
  description: '执行数学计算',
  schema: z.object({ expression: z.string() })
})

// 创建 ToolNode
const tools = [getWeather, calculator]
const toolNode = new ToolNode(tools)

// 在图中使用
const graph = new StateGraph(AgentState)
  .addNode('tools', toolNode)  // ← ToolNode 作为节点
```

### 5.5 ToolNode 内部执行流程

```
┌──────────────────────────────────────────────────────────────┐
│  ToolNode 执行流程                                             │
│                                                              │
│  1. 从 state.messages 中提取最后一条 AIMessage                 │
│     │                                                        │
│     ▼                                                        │
│  2. 解析 AIMessage.tool_calls[]                               │
│     │  [{ name: 'get_weather', args: { city: '北京' } }]      │
│     ▼                                                        │
│  3. 并行执行所有工具调用                                        │
│     │  get_weather({ city: '北京' })                          │
│     ▼                                                        │
│  4. 将结果包装为 ToolMessage[]                                 │
│     │  [{ content: '北京天气：晴，25°C', tool_call_id: '...' }]│
│     ▼                                                        │
│  5. 返回 { messages: [toolMessages] }                        │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. ReAct 循环实战

### 6.1 场景描述

实现一个完整的 ReAct（Reasoning + Acting）循环：用户提问 → LLM 决策（是否需要工具）→ 执行工具 → LLM 整合结果 → 回答用户。

### 6.2 状态定义

```js
import { Annotation } from '@langchain/langgraph'

const AgentState = Annotation.Root({
  messages: Annotation({
    reducer: (left, right) => left.concat(right),  // 追加式
    default: () => []
  })
})
```

### 6.3 工具定义

```js
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

const getWeather = tool(async ({ city }) => {
  const weatherData = {
    '北京': { temp: 28, condition: '晴', humidity: '45%' },
    '上海': { temp: 32, condition: '多云', humidity: '65%' }
  }
  const data = weatherData[city] || { temp: 25, condition: '未知', humidity: '50%' }
  return `${city}天气：${data.condition}，温度 ${data.temp}°C，湿度 ${data.humidity}`
}, {
  name: 'get_weather',
  description: '查询指定城市的天气信息',
  schema: z.object({ city: z.string().describe('城市名称') })
})

const calculator = tool(async ({ expression }) => {
  const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '')
  return `计算结果: ${expression} = ${eval(sanitized)}`
}, {
  name: 'calculator',
  description: '执行数学计算',
  schema: z.object({ expression: z.string().describe('数学表达式') })
})
```

### 6.4 LLM 绑定工具

```js
import { ChatOpenAI } from '@langchain/openai'

const llm = new ChatOpenAI({
  model: 'EB-DeepSeek-V4-Pro',
  temperature: 0
})

// ⚡ bindTools 是关键：让 LLM 知道有哪些工具可用
const llmWithTools = llm.bindTools(tools)
```

### 6.5 节点函数

```js
// agent 节点：调用 LLM
const agentNode = async (state) => {
  const response = await llmWithTools.invoke(state.messages)
  // response 可能是：
  //   - 普通 AIMessage（content 有文本，无 tool_calls）
  //   - AIMessage with tool_calls（content 可能为空，tool_calls 有内容）
  return { messages: [response] }
}
```

### 6.6 图构建（两种方式）

**方式一：toolsCondition（推荐）**

```js
import { StateGraph, START, END } from '@langchain/langgraph'
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt'

const graph = new StateGraph(AgentState)
  .addNode('agent', agentNode)
  .addNode('tools', new ToolNode(tools))
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', toolsCondition)  // ← 预构建路由
  .addEdge('tools', 'agent')                     // ← 循环回 agent
```

**方式二：自定义 router**

```js
const graph = new StateGraph(AgentState)
  .addNode('agent', agentNode)
  .addNode('tools', new ToolNode(tools))
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', (state) => {
    const lastMsg = state.messages[state.messages.length - 1]
    if (lastMsg.tool_calls?.length > 0) return 'tools'
    return END
  })
  .addEdge('tools', 'agent')
```

### 6.7 编译并执行

```js
const app = graph.compile()

// 执行
const result = await app.invoke(
  { messages: [new HumanMessage('北京今天天气怎么样？计算 (123 + 456) * 789')] },
  { recursion_limit: 50 }  // ← 设置递归限制
)

// 提取最终回答
const lastMessage = result.messages[result.messages.length - 1]
console.log(lastMessage.content)
```

### 6.8 执行过程追踪

```
Step 1: START → agent
  agent: LLM 返回 tool_calls: [get_weather({ city: '北京' }), calculator({ expression: '(123+456)*789' })]

Step 2: router → tools
  tools: 并行执行 get_weather + calculator
  返回: ToolMessage("北京天气：晴，28°C"), ToolMessage("计算结果: 456831")

Step 3: tools → agent
  agent: LLM 整合工具结果，返回最终回答
  "北京今天天气晴朗，温度28°C。计算结果为456831。"

Step 4: router → END
  图执行完毕
```

---

## 7. recursion_limit — 递归限制

### 7.1 是什么

[`recursion_limit`](node_modules/@langchain/langgraph/dist/index.d.ts) 限制单次图运行的最大 **SuperStep**（超步）数量，防止 ReAct 循环无限执行。

### 7.2 默认值

| 平台 | 默认值 | 来源 |
|------|--------|------|
| LangGraph.js | **25** | `langchain_core.runnables.config` |
| LangGraph (Python) | **10000** | `langgraph.pregel` |

> ⚠️ JS 版默认值远小于 Python 版，容易触发 `GraphRecursionError: Recursion limit of 25 reached`。

### 7.3 使用方式

```js
// 方式一：invoke 时传入
const result = await app.invoke(initialState, { recursion_limit: 50 })

// 方式二：stream 时传入
const stream = await app.stream(initialState, { recursion_limit: 100 })
```

### 7.4 最佳实践

| 建议 | 说明 |
|------|------|
| **显式传入** | 不依赖默认值，避免版本差异 |
| **根据复杂度设置** | 简单 ReAct：50；复杂多工具：100-200 |
| **配合 RemainingSteps** | 在路由函数中主动判断剩余步数，优雅退出 |

---

## 8. 条件边 vs 普通边 对比

| 特性 | 普通边（[`addEdge`](node_modules/@langchain/langgraph/dist/index.d.ts)） | 条件边（[`addConditionalEdges`](node_modules/@langchain/langgraph/dist/index.d.ts)） |
|------|-----------|-------------------|
| **路由方式** | 固定路由，编译时确定 | 动态路由，运行时根据状态决定 |
| **决策时机** | 编译时 | 运行时（每次执行节点后） |
| **API 签名** | `addEdge(from, to)` | `addConditionalEdges(from, router, [pathMap])` |
| **适用场景** | 线性流程、固定顺序 | 分支流程、循环流程、ReAct 模式 |
| **示例** | `START → A → B → END` | `agent → [判断] → tools/END` |
| **循环支持** | ❌ 不支持 | ✅ 支持（如 `tools → agent` 循环） |
| **多分支** | ❌ 一对一 | ✅ 一对多 |

---

## 9. JS/Python API 差异速查

| 特性 | LangGraph.js | LangGraph (Python) |
|------|-------------|-------------------|
| 条件边方法 | `addConditionalEdges`（驼峰） | `add_conditional_edges`（蛇形） |
| 预构建路由 | `toolsCondition`（驼峰） | `tools_condition`（蛇形） |
| 工具节点 | `new ToolNode(tools)` | `ToolNode(tools)` |
| 绑定工具 | `llm.bindTools(tools)` | `llm.bind_tools(tools)` |
| 路由返回值 | `return 'tools'` 或 `return END` | `return 'tools'` 或 `return END` |
| tool_calls 检测 | `lastMsg.tool_calls?.length` | `hasattr(last_msg, 'tool_calls')` |
| 递归限制 | `{ recursion_limit: 50 }` | `{'recursion_limit': 50}` |
| 默认递归限制 | 25 | 10000 |

### 9.1 关键差异详解

**① 命名风格**

```js
// JavaScript — 驼峰命名
.addConditionalEdges('agent', toolsCondition)
```

```python
# Python — 蛇形命名
.add_conditional_edges('agent', tools_condition)
```

**② tool_calls 检测方式**

```js
// JavaScript — 可选链
if (lastMsg.tool_calls?.length > 0) { ... }
```

```python
# Python — hasattr
if hasattr(last_msg, 'tool_calls') and last_msg.tool_calls:
    ...
```

**③ 递归限制默认值差异巨大**

```js
// JavaScript 默认 25 — 容易触发
// Python 默认 10000 — 几乎不会触发
// 最佳实践：始终显式传入
```

---

## 10. 常见问题与最佳实践

### 10.1 常见问题

**Q1: "Recursion limit of 25 reached" 错误？**

A: JS 版默认 `recursion_limit` 仅为 25，ReAct 循环中每次 agent→tools→agent 算 2 个 SuperStep，很容易超限。解决方案：

```js
const result = await app.invoke(initialState, { recursion_limit: 100 })
```

**Q2: 路由函数返回了不存在的节点名？**

A: 路由函数必须返回已注册的节点名或 `END`。检查 `addNode` 注册的名称与 router 返回值是否一致。

**Q3: toolsCondition 和自定义 router 如何选择？**

A:
- 标准 ReAct 循环（agent ↔ tools）→ 使用 `toolsCondition`
- 需要多分支路由（>2 个目标）→ 使用自定义 router
- 需要在路由时记录日志/埋点 → 包装 `toolsCondition`

**Q4: ToolNode 如何处理工具执行错误？**

A: 设置 `handleToolErrors: true`：

```js
const toolNode = new ToolNode(tools, {
  handleToolErrors: true  // 工具错误会被包装为 ToolMessage 而非抛出异常
})
```

**Q5: 条件边可以和 Command 混用吗？**

A: 可以。如果节点返回了 `Command`，条件边会被跳过（Command 优先级更高）。详见 [Command 详解](./LangGraph.js命令式路由Command详解.md)。

### 10.2 最佳实践

**① 始终显式设置 recursion_limit**

```js
// ✅ 推荐
const result = await app.invoke(input, { recursion_limit: 50 })

// ❌ 不推荐：依赖默认值
const result = await app.invoke(input)
```

**② 使用 toolsCondition 而非重复造轮子**

```js
// ✅ 推荐：使用官方预构建路由
.addConditionalEdges('agent', toolsCondition)

// ❌ 不推荐：手写等价逻辑（除非需要定制）
.addConditionalEdges('agent', (state) => {
  const lastMsg = state.messages[state.messages.length - 1]
  if (lastMsg.tool_calls?.length > 0) return 'tools'
  return END
})
```

**③ 工具描述要清晰准确**

```js
// ✅ 推荐：清晰的描述帮助 LLM 正确选择工具
const getWeather = tool(async ({ city }) => { ... }, {
  name: 'get_weather',
  description: '查询指定城市的天气信息。当用户询问天气时调用此工具。',
  schema: z.object({
    city: z.string().describe('城市名称，如 北京、上海、广州')
  })
})

// ❌ 不推荐：模糊的描述
const getWeather = tool(async ({ city }) => { ... }, {
  name: 'get_weather',
  description: '获取天气',
  schema: z.object({ city: z.string() })
})
```

**④ 使用 messages 追加式 reducer**

```js
// ✅ 推荐：追加式，保留完整对话历史
messages: Annotation({
  reducer: (left, right) => left.concat(right),
  default: () => []
})

// ❌ 不推荐：覆盖式，丢失历史
messages: Annotation({
  reducer: (_, right) => right,
  default: () => []
})
```

**⑤ 在 router 中包装 toolsCondition 以添加日志**

```js
.addConditionalEdges('agent', (state) => {
  const lastMsg = state.messages[state.messages.length - 1]
  const hasToolCalls = lastMsg.tool_calls?.length > 0

  // 记录路由决策
  console.log(`[Router] tool_calls: ${hasToolCalls ? lastMsg.tool_calls.map(t => t.name).join(', ') : 'none'}`)
  console.log(`[Router] → ${hasToolCalls ? 'tools' : 'END'}`)

  // 委托给官方 toolsCondition
  return toolsCondition(state)
})
```

---

> 📚 **下一步学习**：
> - [LangGraph.js Command 命令式路由详解](./LangGraph.js命令式路由Command详解.md) — 了解节点内部动态路由的另一种范式
> - [LangGraph.js 人机协同 Interrupt 详解](./LangGraph.js人机协同Interrupt详解.md) — 在路由中加入人工审批环节
> - [LangGraph.js 深入学习路线](./LangGraph.js深入学习路线.md) — 返回学习路线总览