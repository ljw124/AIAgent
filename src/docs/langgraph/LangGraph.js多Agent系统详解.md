# LangGraph.js 多 Agent 系统详解

> 前置条件：已完成 [LangGraph.js 深入学习路线](./LangGraph.js深入学习路线.md) 的阶段十一（Subgraph 子图），理解「已编译的图可作为节点」的机制。
>
> 目标：掌握官网 Multi-agent 专题的三种架构模式（Supervisor / Swarm / Network），能独立构建多 Agent 协作系统，理解消息传递机制与死循环防护。
>
> 🆕 本文档与 [`LangGraphStage14MultiAgent.vue`](../../pages/langgraph/LangGraphStage14MultiAgent.vue) 组件配套，所有代码均可在浏览器中运行（内网大模型）。

---

## 目录

1. [多 Agent 系统概述](#1-多-agent-系统概述)
2. [Supervisor 模式 — 主管编排](#2-supervisor-模式--主管编排)
3. [Swarm 模式 — 交接协作](#3-swarm-模式--交接协作)
4. [Network 模式 — 任意通信](#4-network-模式--任意通信)
5. [三种模式对比与选型](#5-三种模式对比与选型)
6. [多 Agent 进阶](#6-多-agent-进阶)
7. [官网对照表 + JS/Python API 差异速查](#7-官网对照表--jspython-api-差异速查)

---

## 1. 多 Agent 系统概述

### 1.1 为什么需要多 Agent

单 Agent（如 `createReactAgent`）在以下场景会遇到瓶颈：

| 问题 | 表现 | 多 Agent 解法 |
|------|------|---------------|
| **上下文爆炸** | 对话历史 + 工具结果不断累积，超出模型上下文窗口 | 每个 Agent 只看自己职责相关的消息 |
| **职责混杂** | 一个 System Prompt 塞进售前/售后/技术支持所有职责，模型决策混乱 | 每个 Agent 独立 Prompt + 独立工具集 |
| **工具过多** | 绑定 20+ 工具，模型选择准确率下降 | 每个 Agent 只绑定 2-3 个领域工具 |
| **无法并行** | 单 Agent 串行执行所有任务 | 多个 Worker Agent 可并行处理 |

### 1.2 三种架构模式总览

```
┌─────────────────────────────────────────────────────────────────┐
│                  LangGraph 多 Agent 三种架构模式                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ① Supervisor 模式（中心化）          ② Swarm 模式（去中心化）      │
│  ┌────────────┐                     ┌────────┐    ┌────────┐   │
│  │ Supervisor │                     │ Agent A│←──→│ Agent B│   │
│  └─────┬──────┘                     └────────┘    └────────┘   │
│        │ 分发/汇总                        ↑ 交接（handoff）↑      │
│   ┌────┼────┬─────────┐                                        │
│   ▼    ▼    ▼         │            ③ Network 模式（全连接）       │
│ ┌────┐┌────┐┌────┐    │            ┌────┐ ←→ ┌────┐            │
│ │ A  ││ B  ││ C  │    │            │ A  │    │ B  │            │
│ └────┘└────┘└────┘    │            └─┬──┘    └─┬──┘            │
│   Worker Agents       │              ↕   ↕   ↕                 │
│                       │            ┌────┐ ←→ ┌────┐            │
│                       │            │ C  │    │ D  │            │
│                       │            └────┘    └────┘            │
└─────────────────────────────────────────────────────────────────┘
```

| 模式 | 中心化程度 | 通信方式 | 实现复杂度 | 典型场景 |
|------|-----------|----------|-----------|----------|
| **Supervisor** | 高（有主管） | Worker 只与 Supervisor 通信 | ⭐⭐ | 客服分流、任务编排 |
| **Swarm** | 低（无中心） | Agent 之间直接 handoff | ⭐⭐⭐ | 售前转售后、多轮转接 |
| **Network** | 无 | 任意 Agent 互相调用 | ⭐⭐⭐⭐ | 复杂协作（需防死循环） |

### 1.3 与 Stage11 子图的关系

[阶段十一](./LangGraph.js深入学习路线.md) 学的 **Subgraph 是构建多 Agent 的底层机制**：

```
Subgraph（机制）              Multi-Agent（架构）
├── 已编译图作为节点     →     Worker Agent 就是一个子图/预构建 Agent
├── 状态键名匹配映射     →     Supervisor 与 Worker 的状态传递
└── 父图编排            →     Supervisor 图 / Swarm 图的骨架
```

区别在于：Stage11 的父图用**固定边**编排子图（`summaryAgent → translateAgent`），而多 Agent 系统用 **LLM 动态决策**（Supervisor 路由）或 **handoff 工具**（Swarm 交接）控制流转。

---

## 2. Supervisor 模式 — 主管编排

### 2.1 架构

```
                ┌──────────────────┐
                │    Supervisor    │
                │  （LLM 决策路由）  │
                └────────┬─────────┘
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
    ┌────────────┐ ┌────────────┐ ┌────────────┐
    │ 售前 Agent  │ │ 售后 Agent  │ │ 通用 Agent  │
    │ (查价格工具) │ │ (查订单工具) │ │ (无工具)    │
    └────────────┘ └────────────┘ └────────────┘
           │             │             │
           └─────────────┼─────────────┘
                         ▼
                  结果回到 Supervisor
                  （决定：继续派发 or 结束）
```

**核心思想**：Supervisor 是一个普通节点，内部调用 LLM 分析对话，输出 `Command({ goto })` 决定下一个 Worker；Worker 完成后回到 Supervisor，直到 Supervisor 判定任务完成（`goto: END`）。

### 2.2 核心 API

| API | 说明 |
|-----|------|
| `Command({ goto, update })` | Supervisor 节点返回，指定下一个 Worker 并更新状态 |
| `createReactAgent({ llm, tools, prompt })` | 快速构建 Worker Agent（预构建图） |
| `Annotation.Root({ messages })` | 共享状态：所有 Agent 共用一个 messages 列表 |
| `graph.addConditionalEdges` / `Command goto` | 两种路由方式（本文用 Command，更灵活） |

### 2.3 完整实现（JS 版）

场景：智能客服 — Supervisor 将用户问题路由给售前/售后/通用 Agent。

```js
import { ChatOpenAI } from '@langchain/openai'
import { StateGraph, Annotation, START, END, Command } from '@langchain/langgraph'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { tool } from '@langchain/core/tools'
import { HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'

// ============================================================
// 1. 共享状态：所有 Agent 共用一个 messages 列表
//    这是 Supervisor 模式的「共享 state」消息传递方式
// ============================================================
const SupervisorState = Annotation.Root({
  messages: Annotation({
    reducer: (curr, update) => curr.concat(update),
    default: () => []
  }),
  // 记录路由决策，用于 UI 展示
  routeLog: Annotation({
    reducer: (curr, update) => curr.concat(update),
    default: () => []
  })
})

// ============================================================
// 2. Worker Agent 的工具集（每个 Agent 只绑定自己领域的工具）
// ============================================================
const getPriceTool = tool(
  async ({ productName }) => {
    const prices = { '摄像头': '¥299', '门禁机': '¥1599', '报警器': '¥399' }
    return `${productName} 的价格是 ${prices[productName] || '暂无报价'}`
  },
  {
    name: 'get_price',
    description: '查询产品价格',
    schema: z.object({ productName: z.string().describe('产品名称') })
  }
)

const getOrderTool = tool(
  async ({ orderId }) => `订单 ${orderId} 状态：已发货，预计 3 天内送达`,
  {
    name: 'get_order_status',
    description: '查询订单物流状态',
    schema: z.object({ orderId: z.string().describe('订单号') })
  }
)

// ============================================================
// 3. 创建 Worker Agent（用 createReactAgent 预构建）
//    每个 Worker 有独立的 System Prompt + 独立工具集
// ============================================================
function createWorkers(llm) {
  return {
    salesAgent: createReactAgent({
      llm,
      tools: [getPriceTool],
      prompt: '你是售前顾问，负责产品咨询和报价。只回答售前问题，售后问题请说明需要转接。'
    }),
    supportAgent: createReactAgent({
      llm,
      tools: [getOrderTool],
      prompt: '你是售后客服，负责订单查询、退换货处理。只回答售后问题。'
    }),
    generalAgent: createReactAgent({
      llm,
      tools: [],
      prompt: '你是通用客服助手，回答产品介绍、公司信息等一般性问题。'
    })
  }
}

// ============================================================
// 4. Supervisor 节点：LLM 决策路由
//    ⚠️ 核心：返回 Command({ goto }) 动态跳转到 Worker
// ============================================================
function createSupervisorNode(llm, workers) {
  return async (state) => {
    const lastMessage = state.messages[state.messages.length - 1]

    // 让 LLM 分析最后一条消息，决定路由
    const routeResult = await llm.invoke([
      new HumanMessage(
        `分析以下用户消息，判断应该交给哪个 Agent 处理：
- salesAgent：产品咨询、价格查询
- supportAgent：订单查询、退换货、物流
- generalAgent：其他一般问题
- FINISH：任务已完成，可以结束

用户消息：${lastMessage.content}

只输出一个词：salesAgent / supportAgent / generalAgent / FINISH`
      )
    ])

    const decision = routeResult.content.trim()

    // Supervisor 判定完成 → 结束
    if (decision === 'FINISH') {
      return new Command({ goto: END })
    }

    // 路由到对应 Worker
    return new Command({
      goto: decision,
      update: { routeLog: [`Supervisor → ${decision}`] }
    })
  }
}

// ============================================================
// 5. 组装 Supervisor 图
// ============================================================
function buildSupervisorGraph(llm) {
  const workers = createWorkers(llm)

  const graph = new StateGraph(SupervisorState)
    .addNode('supervisor', createSupervisorNode(llm, workers))
    // Worker 作为节点（createReactAgent 返回的就是已编译图）
    .addNode('salesAgent', workers.salesAgent)
    .addNode('supportAgent', workers.supportAgent)
    .addNode('generalAgent', workers.generalAgent)
    .addEdge(START, 'supervisor')
    // ⚠️ Worker 完成后回到 supervisor（形成循环，由 supervisor 决定何时结束）
    .addEdge('salesAgent', 'supervisor')
    .addEdge('supportAgent', 'supervisor')
    .addEdge('generalAgent', 'supervisor')
    .compile()

  return graph
}

// ============================================================
// 6. 执行
// ============================================================
const llm = new ChatOpenAI({
  model: 'EB-DeepSeek-Flash',
  apiKey: INNER_API_KEY,
  configuration: { baseURL: window.location.origin + '/inner/' }
})

const app = buildSupervisorGraph(llm)
const result = await app.invoke({
  messages: [new HumanMessage('我想退货，订单号是 A12345')]
})
// 执行轨迹：supervisor → supportAgent（查订单）→ supervisor → FINISH
```

### 2.4 Python 对照

```python
from langgraph.graph import StateGraph, START, END, MessagesState
from langgraph.types import Command
from langgraph.prebuilt import create_react_agent

# Python 版用 MessagesState（内置 messages reducer）
# Supervisor 节点返回 Command(goto=...)，与 JS 完全一致

def supervisor_node(state: MessagesState) -> Command:
    last_message = state["messages"][-1]
    decision = llm.invoke(f"分析消息决定路由：{last_message.content}").content.strip()
    if decision == "FINISH":
        return Command(goto=END)
    return Command(goto=decision)

graph = (
    StateGraph(MessagesState)
    .add_node("supervisor", supervisor_node)
    .add_node("salesAgent", create_react_agent(llm, [get_price_tool], prompt="你是售前顾问..."))
    .add_node("supportAgent", create_react_agent(llm, [get_order_tool], prompt="你是售后客服..."))
    .add_edge(START, "supervisor")
    .add_edge("salesAgent", "supervisor")
    .add_edge("supportAgent", "supervisor")
    .compile()
)
```

### 2.5 消息传递：共享 state

Supervisor 模式的消息传递是**共享 state**：

```
所有节点（supervisor / workers）读写同一个 state.messages
├── Worker 处理时：能看到完整对话历史（含之前 Worker 的输出）
├── Worker 输出：AIMessage 自动 append 到 messages
└── 优点：上下文完整；缺点：消息会持续累积（长对话需裁剪）
```

---

## 3. Swarm 模式 — 交接协作

### 3.1 架构

```
┌────────────────┐         handoff          ┌────────────────┐
│   售前 Agent    │ ──────────────────────→  │   售后 Agent    │
│ (get_price 工具) │   "转接到售后"            │ (get_order 工具) │
│                │ ←──────────────────────  │                │
└────────────────┘         handoff          └────────────────┘
        ↑                                            │
        │              handoff                        │
        └──────────── 通用 Agent ←────────────────────┘

无中心节点：Agent 之间通过「交接工具」直接跳转
```

**核心思想**：每个 Agent 的工具集中包含 `handoff` 工具（交接给其他 Agent）。LLM 决定调用 handoff 时，通过 `Command({ goto })` 跳转到目标 Agent，并携带对话历史。

### 3.2 核心 API

| API | 说明 |
|-----|------|
| `tool()` 定义 handoff 工具 | 交接工具：LLM 调用它表示「转接」 |
| `Command({ goto, update })` | handoff 工具内部返回，跳转到目标 Agent |
| `createReactAgent({ llm, tools })` | 每个 Agent 绑定自己的工具 + 其他 Agent 的 handoff 工具 |

> **注**：LangGraph.js 官网 How-to 中的 `createHandoff` 是 Python 版 `langchain.agents` 的辅助函数；JS 版直接用 `tool()` + `Command` 组合实现，效果等价。

### 3.3 完整实现（JS 版）

```js
import { ChatOpenAI } from '@langchain/openai'
import { StateGraph, Annotation, START, END, Command } from '@langchain/langgraph'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { tool } from '@langchain/core/tools'
import { HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'

// ============================================================
// 1. 共享状态（Swarm 也用共享 messages，交接时历史自动携带）
// ============================================================
const SwarmState = Annotation.Root({
  messages: Annotation({
    reducer: (curr, update) => curr.concat(update),
    default: () => []
  }),
  handoffLog: Annotation({
    reducer: (curr, update) => curr.concat(update),
    default: () => []
  })
})

// ============================================================
// 2. 定义 handoff 工具（交接的核心）
//    ⚠️ 工具内部返回 Command({ goto })，触发 Agent 跳转
// ============================================================
function createHandoffTool(targetAgent, description) {
  return tool(
    async ({ reason }) => {
      // 返回 Command：跳转到目标 Agent，并记录交接日志
      return new Command({
        goto: targetAgent,
        update: {
          handoffLog: [`交接 → ${targetAgent}（原因：${reason}）`]
        }
      })
    },
    {
      name: `transfer_to_${targetAgent}`,
      description,
      schema: z.object({
        reason: z.string().describe('转接原因，将展示给用户')
      })
    }
  )
}

// ============================================================
// 3. 创建 Swarm Agent（每个 Agent 绑定：自己的工具 + 他人的 handoff）
// ============================================================
function createSwarmAgents(llm) {
  // 售前 Agent：能查价格，能转售后/通用
  const salesAgent = createReactAgent({
    llm,
    tools: [
      getPriceTool,
      createHandoffTool('supportAgent', '用户咨询订单、退货、物流时，转接给售后客服'),
      createHandoffTool('generalAgent', '用户咨询产品介绍、公司信息时，转接给通用客服')
    ],
    prompt: '你是售前顾问。价格问题直接用工具查询；订单/退货问题必须转接售后；其他问题转接通用客服。'
  })

  // 售后 Agent：能查订单，能转售前/通用
  const supportAgent = createReactAgent({
    llm,
    tools: [
      getOrderTool,
      createHandoffTool('salesAgent', '用户想了解新产品价格时，转接给售前顾问'),
      createHandoffTool('generalAgent', '一般性问题时，转接给通用客服')
    ],
    prompt: '你是售后客服。订单/退货问题直接用工具处理；价格咨询转接售前。'
  })

  // 通用 Agent：无业务工具，只能转接
  const generalAgent = createReactAgent({
    llm,
    tools: [
      createHandoffTool('salesAgent', '用户想买产品时，转接给售前顾问'),
      createHandoffTool('supportAgent', '用户有订单问题时，转接给售后客服')
    ],
    prompt: '你是通用客服。产品介绍你直接回答；涉及价格转售前，涉及订单转售后。'
  })

  return { salesAgent, supportAgent, generalAgent }
}

// ============================================================
// 4. 组装 Swarm 图（无 supervisor 节点！）
// ============================================================
function buildSwarmGraph(llm) {
  const agents = createSwarmAgents(llm)

  return new StateGraph(SwarmState)
    .addNode('salesAgent', agents.salesAgent)
    .addNode('supportAgent', agents.supportAgent)
    .addNode('generalAgent', agents.generalAgent)
    // ⚠️ 入口固定为 salesAgent（Swarm 需要指定初始 Agent）
    .addEdge(START, 'salesAgent')
    // Agent 输出不含 handoff（普通回复）→ END
    // Agent 输出含 handoff（Command goto）→ 自动跳转，无需显式边
    .addEdge('salesAgent', END)
    .addEdge('supportAgent', END)
    .addEdge('generalAgent', END)
    .compile()
}

// ============================================================
// 5. 执行：观察交接过程
// ============================================================
const app = buildSwarmGraph(llm)
const result = await app.invoke({
  messages: [new HumanMessage('先问下摄像头多少钱，然后帮我查订单 A12345')]
})
// 执行轨迹：salesAgent（查价格）→ handoff → supportAgent（查订单）→ END
// result.handoffLog: ['交接 → supportAgent（原因：用户需要查询订单）']
```

### 3.4 消息传递：交接携带历史

Swarm 的消息传递本质也是共享 `messages`，但**关注点不同**：

```
Supervisor 模式：Worker 完成后「回到中心」，中心看到全部历史再决策
Swarm 模式：    Agent 交接时「直接跳转」，目标 Agent 看到全部历史继续处理
```

交接时对话历史自动保留（因为共享同一个 `messages` 通道），目标 Agent 无需重新了解背景。

### 3.5 Python 对照

```python
from langchain.agents import create_handoff_tool

# Python 版有现成的 create_handoff_tool 辅助函数
transfer_to_support = create_handoff_tool(
    agent_name="supportAgent",
    description="转接给售后客服"
)

sales_agent = create_react_agent(
    llm,
    tools=[get_price_tool, transfer_to_support],
    prompt="你是售前顾问..."
)
```

---

## 4. Network 模式 — 任意通信

### 4.1 架构

```
        ┌─────────┐
        │ Agent A │←──────┐
        └────┬────┘       │
       ↕     │     ↕      │
┌─────────┐  │  ┌─────────┐
│ Agent C │←─┼─→│ Agent B │
└─────────┘  │  └─────────┘
             │      ↕
        ┌────┴────┐
        │ Agent D │
        └─────────┘

任意 Agent 可调用任意其他 Agent（每个 Agent 都有所有 handoff 工具）
```

### 4.2 实现

Network 模式 = Swarm 模式的全连接版本：每个 Agent 的工具集包含**所有其他 Agent** 的 handoff 工具。

```js
function createNetworkAgents(llm) {
  const agentNames = ['researcher', 'writer', 'reviewer']

  return agentNames.reduce((agents, name) => {
    // 每个 Agent 都有「呼叫其他任意 Agent」的工具
    const handoffTools = agentNames
      .filter(other => other !== name)
      .map(other => createHandoffTool(other, `请求 ${other} 协助`))

    agents[name] = createReactAgent({
      llm,
      tools: [...getToolsFor(name), ...handoffTools],
      prompt: getPromptFor(name)
    })
    return agents
  }, {})
}
```

### 4.3 死循环风险与防护

Network 模式最大的风险是**两个 Agent 互相踢皮球**（A 觉得该 B 处理 → B 觉得该 A 处理 → 无限循环）。

**防护手段**：

| 手段 | 说明 |
|------|------|
| `recursionLimit` | 执行图的超步数上限（默认 25），超限抛错终止 |
| Prompt 约束 | 在 System Prompt 中明确「不要转回刚转给你的 Agent」 |
| 转接计数 | 在 state 中记录 handoff 次数，超过 N 次强制 END |

```js
// 方式一：recursionLimit（最简单）
const result = await app.invoke(
  { messages: [new HumanMessage('...')] },
  { recursionLimit: 10 }  // 超过 10 个超步抛 GraphRecursionError
)

// 方式二：state 中计数（更可控）
const SwarmState = Annotation.Root({
  messages: Annotation({ /* ... */ }),
  handoffCount: Annotation({
    reducer: (curr, update) => (curr ?? 0) + update,
    default: () => 0
  })
})

// handoff 工具中检查
async ({ reason }) => {
  if (state.handoffCount >= 5) {
    return '已达最大转接次数，请人工介入'
  }
  return new Command({ goto: targetAgent, update: { handoffCount: 1 } })
}
```

---

## 5. 三种模式对比与选型

### 5.1 对比表

| 维度 | Supervisor | Swarm | Network |
|------|-----------|-------|---------|
| **中心化** | 有主管节点 | 无中心 | 无中心 |
| **通信路径** | Worker ↔ Supervisor | Agent ↔ Agent（相邻交接） | Agent ↔ Agent（任意） |
| **路由决策者** | Supervisor 的 LLM | 当前 Agent 的 LLM（调 handoff） | 当前 Agent 的 LLM |
| **实现复杂度** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **死循环风险** | 低（主管兜底 FINISH） | 中 | 高（必须防护） |
| **全局视角** | ✅ 主管能看到全部历史 | ❌ 只有局部视角 | ❌ 只有局部视角 |
| **消息传递** | 共享 state | 共享 state + 交接日志 | 共享 state |
| **适用规模** | 3-10 个 Worker | 2-5 个 Agent | 2-4 个 Agent |

### 5.2 选型决策树

```
需要多 Agent 协作？
├── 需要全局编排/任务拆分？ ──→ Supervisor 模式
│   （主管拆解任务，分派 Worker，汇总结果）
│
├── 只是「转接」场景（客服转接）？ ──→ Swarm 模式
│   （当前 Agent 判断该谁处理，直接交接）
│
└── Agent 之间需要互相协作（研究→写作→审校）？ ──→ Network 模式
    （⚠️ 必须加 recursionLimit + 转接计数防护）
```

---

## 6. 多 Agent 进阶

### 6.1 共享 state vs 消息转发的取舍

| 方案 | 优点 | 缺点 | 适用 |
|------|------|------|------|
| **共享 state**（本文方案） | 实现简单，历史完整 | 消息累积，长对话上下文爆炸 | 中短对话 |
| **消息转发**（独立 state） | 每个 Agent 上下文干净 | 需手动传递摘要，实现复杂 | 超长对话/高隔离要求 |

消息转发实现要点：每个 Agent 用独立的 `thread_id`（配合 `MemorySaver`），交接时只传递「任务摘要 + 关键数据」，不传完整历史。

### 6.2 多 Agent + MemorySaver

```js
import { MemorySaver } from '@langchain/langgraph'

const checkpointer = new MemorySaver()
const app = buildSupervisorGraph(llm).withConfig({ checkpointer })

// 每个 Worker 内部也可以有自己的 thread
const config = { configurable: { thread_id: 'session-001' } }
const result = await app.invoke({ messages: [...] }, config)
```

### 6.3 多 Agent 流式输出（观察交接）

用 `streamMode: 'updates'` 可以实时观察 Agent 间的交接事件：

```js
const stream = await app.stream(
  { messages: [new HumanMessage('先查价格再查订单')] },
  { streamMode: 'updates' }
)

for await (const update of stream) {
  // 每个节点完成时输出一次：{ 节点名: 该节点的状态更新 }
  const nodeName = Object.keys(update)[0]
  console.log(`[节点完成] ${nodeName}`)
  if (update[nodeName]?.handoffLog) {
    console.log(`[交接] ${update[nodeName].handoffLog.join(', ')}`)
  }
}
```

### 6.4 死循环防护清单

- [ ] `invoke` 时设置 `recursionLimit`（建议 10-25）
- [ ] Supervisor Prompt 中明确 FINISH 条件
- [ ] Swarm Prompt 中禁止「转回来源 Agent」
- [ ] state 中加 handoffCount 计数，超限强制 END
- [ ] 生产环境捕获 `GraphRecursionError` 转人工处理

---

## 7. 官网对照表 + JS/Python API 差异速查

### 7.1 官网对照

| 官网章节 | 链接 |
|----------|------|
| Multi-agent Concepts | [JS](https://langchain-ai.github.io/langgraphjs/concepts/multi_agent/) / [Python](https://langchain-ai.github.io/langgraph/concepts/multi_agent/) |
| Supervisor How-to | [Python](https://langchain-ai.github.io/langgraph/tutorials/multi_agent/multi-agent-collaboration/) |
| Swarm How-to | [Python](https://langchain-ai.github.io/langgraph/tutorials/multi_agent/agent-supervisor/) |
| createReactAgent | [JS](https://langchain-ai.github.io/langgraphjs/reference/functions/prebuilt.createReactAgent.html) |

### 7.2 JS/Python API 差异速查

| 操作 | LangGraph.js | LangGraph Python |
|------|-------------|------------------|
| 交接工具 | `tool()` + 内部返回 `Command({ goto })` | `create_handoff_tool()` 辅助函数 |
| 预构建 Agent | `createReactAgent({ llm, tools, prompt })` | `create_react_agent(llm, tools, prompt=)` |
| 路由命令 | `new Command({ goto, update })` | `Command(goto=..., update=...)` |
| 共享状态 | `Annotation.Root({ messages })` | `MessagesState`（内置） |
| 循环防护 | `invoke(input, { recursionLimit })` | `invoke(input, { "recursion_limit": n })` |
| 流式观察 | `stream(input, { streamMode: 'updates' })` | `stream(input, { stream_mode: "updates" })` |

---

## 参考资源

- [LangGraph.js Multi-agent Concepts](https://langchain-ai.github.io/langgraphjs/concepts/multi_agent/)
- [LangGraph.js How-to Guides](https://langchain-ai.github.io/langgraphjs/how-tos/)
- 本项目配套组件：[`LangGraphStage14MultiAgent.vue`](../../pages/langgraph/LangGraphStage14MultiAgent.vue)
- 前置知识：[LangGraph.js 深入学习路线 — 阶段十一 Subgraph](./LangGraph.js深入学习路线.md)
- 场景呼应：[LangChain-智能客服项目实战](../langchain/LangChain-智能客服项目实战.md)
