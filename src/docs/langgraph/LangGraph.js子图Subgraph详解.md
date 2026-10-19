# LangGraph.js Subgraph 子图嵌套详解

> 前置条件：已完成 [LangGraph.js 深入学习路线](./LangGraph.js深入学习路线.md) 的阶段十（Context 运行时上下文），理解 `Annotation.Root` 状态定义和 `StateGraph` 基本用法。
>
> 目标：掌握 Subgraph（子图）机制，理解「已编译的图可作为另一个图的节点」这一核心概念，能独立构建层次化、可复用的多 Agent 工作流。
>
> 🆕 本文档与 [`LangGraphStage11Subgraph.vue`](../../pages/langgraph/LangGraphStage11Subgraph.vue) 组件配套，所有代码均可在浏览器中运行（内网大模型）。

---

## 目录

1. [Subgraph 概述 — 为什么需要子图](#1-subgraph-概述--为什么需要子图)
2. [核心机制：编译 → 添加 → 映射](#2-核心机制编译--添加--映射)
3. [实战：摘要 Agent + 翻译 Agent 子图协作](#3-实战摘要-agent--翻译-agent-子图协作)
4. [状态映射深入](#4-状态映射深入)
5. [子图 vs 单图对比](#5-子图-vs-单图对比)
6. [子图复用与模块化](#6-子图复用与模块化)
7. [与 Multi-Agent 的关系](#7-与-multi-agent-的关系)
8. [JS/Python API 差异速查](#8-jspython-api-差异速查)
9. [常见问题与最佳实践](#9-常见问题与最佳实践)

---

## 1. Subgraph 概述 — 为什么需要子图

### 1.1 问题场景

假设你要构建一个「文本摘要 + 翻译」工作流。最简单的做法是把所有逻辑塞进一个图：

```
START → summarize（LLM 摘要）→ translate（LLM 翻译）→ END
```

这在简单场景下没问题，但随着系统复杂度增长，会遇到以下痛点：

| 痛点 | 表现 | Subgraph 解法 |
|------|------|---------------|
| **图结构膨胀** | 一个图包含 20+ 节点，难以理解和维护 | 按职责拆分为独立子图，父图只做编排 |
| **无法复用** | 摘要逻辑被硬编码在某个节点函数中，其他图想用只能复制代码 | 摘要子图编译一次，多个父图引用 |
| **状态污染** | 所有节点共享全局状态，节点间意外覆盖 | 子图有独立状态空间，只暴露需要的键 |
| **测试困难** | 只能整体测试整个图 | 每个子图可独立编译、独立测试 |
| **团队协作** | 多人修改同一个图文件，频繁冲突 | 不同人负责不同子图，并行开发 |

### 1.2 什么是 Subgraph

Subgraph（子图）是 LangGraph 的核心机制之一：**将一个已编译的 `StateGraph` 作为另一个图的节点使用**。

```
┌─────────────────────────────────────────────────────────┐
│                    父图 (Supervisor Graph)                │
│                                                         │
│  ┌──────────────────┐    ┌──────────────────┐           │
│  │   子图 A          │    │   子图 B          │           │
│  │  (summaryAgent)  │ →  │  (translateAgent) │           │
│  │                  │    │                   │           │
│  │  ┌────────────┐  │    │  ┌─────────────┐  │           │
│  │  │ summarize  │  │    │  │  translate  │  │           │
│  │  │ (LLM 节点) │  │    │  │  (LLM 节点) │  │           │
│  │  └────────────┘  │    │  └─────────────┘  │           │
│  └──────────────────┘    └──────────────────┘           │
│                                                         │
│  父图状态: { input, summaryResult, translateResult }     │
│  子图A状态: { input, summaryResult }  ← 独立状态空间      │
│  子图B状态: { summaryResult, translateResult } ← 独立    │
└─────────────────────────────────────────────────────────┘
```

### 1.3 与普通节点的区别

| 特性 | 普通节点 (`addNode(name, fn)`) | 子图节点 (`addNode(name, compiledGraph)`) |
|------|-------------------------------|------------------------------------------|
| 粒度 | 单个函数 | 完整的图（可包含多个节点 + 边） |
| 状态 | 共享父图状态 | 独立状态空间（自己的 `Annotation.Root`） |
| 复用 | 函数可复用 | 整个图结构可复用 |
| 编译 | 不需要 | 必须先 `.compile()` |
| 可视化 | 父图 Mermaid 中显示为单个节点 | 父图 Mermaid 中显示为子图边界 |

---

## 2. 核心机制：编译 → 添加 → 映射

Subgraph 的使用遵循严格的三步流程：

### 2.1 第一步：定义子图状态（独立状态空间）

```js
import { StateGraph, Annotation, START, END } from '@langchain/langgraph'

// 子图 A 的状态定义 — 完全独立于父图
const SummaryState = Annotation.Root({
  input: Annotation({
    reducer: (_, right) => right,
    default: () => ''
  }),
  summaryResult: Annotation({
    reducer: (_, right) => right,
    default: () => ''
  })
})
```

**关键点**：子图状态键名决定了哪些父图状态会被自动映射进来（详见第 4 节）。

### 2.2 第二步：构建并编译子图

```js
const summaryGraph = new StateGraph(SummaryState)
  .addNode('summarize', async (state) => {
    const msg = await llm.invoke([new HumanMessage(
      '请用一句话总结以下内容（不超过50字）：\n\n' + state.input
    )])
    return { summaryResult: msg.content }
  })
  .addEdge(START, 'summarize')
  .addEdge('summarize', END)
  .compile()  // ⚠️ 必须先编译！
```

**⚠️ 关键规则**：子图必须先调用 `.compile()`，才能作为节点添加到父图。未编译的子图传给 `addNode()` 会报错。

### 2.3 第三步：将子图作为节点添加到父图

```js
const SupervisorState = Annotation.Root({
  input: Annotation({ reducer: (_, right) => right, default: () => '' }),
  summaryResult: Annotation({ reducer: (_, right) => right, default: () => '' }),
  translateResult: Annotation({ reducer: (_, right) => right, default: () => '' })
})

const supervisorGraph = new StateGraph(SupervisorState)
  .addNode('summaryAgent', summaryGraph)      // ✅ 已编译的子图作为节点
  .addNode('translateAgent', translateGraph)  // ✅ 已编译的子图作为节点
  .addEdge(START, 'summaryAgent')
  .addEdge('summaryAgent', 'translateAgent')
  .addEdge('translateAgent', END)
  .compile()
```

### 2.4 完整流程示意

```
定义子图状态 → 构建子图 → .compile() → 定义父图状态 → 构建父图 → addNode(子图) → .compile()
    ↑_______________ 可独立测试 _______________↑    ↑_____________ 父图编排 _____________↑
```

---

## 3. 实战：摘要 Agent + 翻译 Agent 子图协作

> 完整可运行代码见 [`LangGraphStage11Subgraph.vue`](../../pages/langgraph/LangGraphStage11Subgraph.vue) 的 `runSubgraphMode()` 方法。

### 3.1 场景描述

输入一段中文文本 → 子图A（摘要 Agent）生成中文摘要 → 子图B（翻译 Agent）将摘要翻译成英文。

### 3.2 子图 A：文本摘要 Agent

```js
// 子图 A 状态定义
const SummaryState = Annotation.Root({
  input: Annotation({           // ← 从父图自动映射
    reducer: (_, right) => right,
    default: () => ''
  }),
  summaryResult: Annotation({  // → 自动写回父图
    reducer: (_, right) => right,
    default: () => ''
  })
})

const summaryGraph = new StateGraph(SummaryState)
  .addNode('summarize', async (state) => {
    const msg = await llm.invoke([
      new HumanMessage('请用一句话总结以下内容（不超过50字）：\n\n' + state.input)
    ])
    return { summaryResult: msg.content }
  })
  .addEdge(START, 'summarize')
  .addEdge('summarize', END)
  .compile()
```

### 3.3 子图 B：翻译 Agent

```js
// 子图 B 状态定义
const TranslateState = Annotation.Root({
  summaryResult: Annotation({   // ← 从父图自动映射（接收子图A的输出）
    reducer: (_, right) => right,
    default: () => ''
  }),
  translateResult: Annotation({ // → 自动写回父图
    reducer: (_, right) => right,
    default: () => ''
  })
})

const translateGraph = new StateGraph(TranslateState)
  .addNode('translate', async (state) => {
    const msg = await llm.invoke([
      new HumanMessage('请将以下内容翻译成英文：\n\n' + state.summaryResult)
    ])
    return { translateResult: msg.content }
  })
  .addEdge(START, 'translate')
  .addEdge('translate', END)
  .compile()
```

### 3.4 父图：编排两个子图

```js
const SupervisorState = Annotation.Root({
  input: Annotation({ reducer: (_, right) => right, default: () => '' }),
  summaryResult: Annotation({ reducer: (_, right) => right, default: () => '' }),
  translateResult: Annotation({ reducer: (_, right) => right, default: () => '' })
})

const supervisorGraph = new StateGraph(SupervisorState)
  .addNode('summaryAgent', summaryGraph)      // 子图作为节点
  .addNode('translateAgent', translateGraph)  // 子图作为节点
  .addEdge(START, 'summaryAgent')
  .addEdge('summaryAgent', 'translateAgent')
  .addEdge('translateAgent', END)
  .compile()

// 执行
const result = await supervisorGraph.invoke({
  input: 'LangGraph是LangChain团队推出的图编排框架，支持构建复杂的多节点LLM工作流...'
})
// result.summaryResult → "LangGraph是一个用于构建复杂LLM工作流的图编排框架"
// result.translateResult → "LangGraph is a graph orchestration framework for building complex LLM workflows"
```

### 3.5 数据流追踪

```
父图 invoke({ input: "..." })
  │
  ├─→ summaryAgent 子图执行
  │     ├─ 输入映射: 父图.input → 子图.input（同名键自动传递）
  │     ├─ summarize 节点: LLM 生成摘要
  │     └─ 输出映射: 子图.summaryResult → 父图.summaryResult
  │
  ├─→ translateAgent 子图执行
  │     ├─ 输入映射: 父图.summaryResult → 子图.summaryResult（同名键自动传递）
  │     ├─ translate 节点: LLM 翻译
  │     └─ 输出映射: 子图.translateResult → 父图.translateResult
  │
  └─→ 返回 { input, summaryResult, translateResult }
```

---

## 4. 状态映射深入

### 4.1 同名键自动映射规则

LangGraph 的子图状态映射遵循**同名键自动传递**原则：

```
┌──────────────────────────────────────────────────────┐
│                 状态映射规则                           │
├──────────────────────────────────────────────────────┤
│                                                      │
│  父图状态                    子图状态                  │
│  ┌──────────────┐          ┌──────────────┐          │
│  │ input        │ ──自动──→ │ input        │          │
│  │ summaryResult│ ←─自动── │ summaryResult│          │
│  │ translateRes.│          │              │          │
│  │ extraField   │          │              │  ← 不映射 │
│  └──────────────┘          └──────────────┘          │
│                                                      │
│  规则：                                                │
│  ① 父图 → 子图：父图中与子图状态同名的键，自动传入子图    │
│  ② 子图 → 父图：子图执行完毕后，与父图状态同名的键自动写回 │
│  ③ 不匹配的键：被忽略，不会报错                          │
└──────────────────────────────────────────────────────┘
```

### 4.2 映射示例

```js
// 父图状态有 4 个键
const ParentState = Annotation.Root({
  input: Annotation<string>(),
  summaryResult: Annotation<string>(),
  translateResult: Annotation<string>(),
  extraField: Annotation<string>()    // 子图中没有这个键
})

// 子图状态只有 2 个键
const ChildState = Annotation.Root({
  input: Annotation<string>(),        // ✅ 同名，自动映射
  summaryResult: Annotation<string>() // ✅ 同名，自动映射
})

// 执行时：
// 父图.input → 子图.input（自动传入）
// 父图.summaryResult → 子图.summaryResult（自动传入）
// 父图.extraField → 不传入子图（子图没有这个键）
// 子图.summaryResult（修改后）→ 父图.summaryResult（自动写回）
```

### 4.3 状态隔离的好处

```js
// 子图内部可以定义父图不需要的中间状态
const ChildState = Annotation.Root({
  input: Annotation<string>(),
  summaryResult: Annotation<string>(),
  // 以下键只在子图内部使用，不会污染父图状态
  internalDraft: Annotation<string>(),
  retryCount: Annotation<number>(),
  intermediateResult: Annotation<string>()
})
```

这种隔离机制让你可以：
- 在子图内部自由添加中间状态，不用担心与父图或其他子图冲突
- 子图的内部实现细节对外部完全透明
- 修改子图内部逻辑不影响父图

---

## 5. 子图 vs 单图对比

[`LangGraphStage11Subgraph.vue`](../../pages/langgraph/LangGraphStage11Subgraph.vue) 提供了两种模式的对比演示：

### 5.1 单图模式

```js
// 所有节点在一个图中，状态全局共享
const singleGraph = new StateGraph(SingleState)
  .addNode('summarize', async (state) => { /* ... */ })
  .addNode('translate', async (state) => { /* ... */ })
  .addEdge(START, 'summarize')
  .addEdge('summarize', 'translate')
  .addEdge('translate', END)
  .compile()
```

### 5.2 子图模式

```js
// 子图独立定义、独立编译
const summaryGraph = new StateGraph(SummaryState)
  .addNode('summarize', async (state) => { /* ... */ })
  .addEdge(START, 'summarize')
  .addEdge('summarize', END)
  .compile()

const translateGraph = new StateGraph(TranslateState)
  .addNode('translate', async (state) => { /* ... */ })
  .addEdge(START, 'translate')
  .addEdge('translate', END)
  .compile()

// 父图编排
const supervisorGraph = new StateGraph(SupervisorState)
  .addNode('summaryAgent', summaryGraph)
  .addNode('translateAgent', translateGraph)
  .addEdge(START, 'summaryAgent')
  .addEdge('summaryAgent', 'translateAgent')
  .addEdge('translateAgent', END)
  .compile()
```

### 5.3 对比总结

| 特性 | 单图模式 | 子图模式 |
|------|----------|----------|
| **结构** | 所有节点在一个图中 | 父图 + 多个子图，层次化结构 |
| **状态管理** | 全局共享状态 | 子图独立状态 + 父图编排状态 |
| **可复用性** | 节点函数可复用，但图结构不可复用 | 整个子图（含内部结构）可复用 |
| **可测试性** | 只能整体测试 | 每个子图可独立编译、独立测试 |
| **代码组织** | 单文件，节点多了难以维护 | 多文件/多模块，职责清晰 |
| **团队协作** | 多人修改同一文件易冲突 | 不同人负责不同子图 |
| **适用场景** | 简单线性工作流（≤5 个节点） | 复杂多 Agent 系统、需要模块化拆分 |
| **执行效率** | 略快（无状态映射开销） | 略有状态映射开销（通常可忽略） |

---

## 6. 子图复用与模块化

### 6.1 同一子图被多个父图引用

```js
// 定义一个通用的「情感分析」子图
const SentimentState = Annotation.Root({
  text: Annotation<string>(),
  sentiment: Annotation<string>()
})

const sentimentGraph = new StateGraph(SentimentState)
  .addNode('analyze', async (state) => {
    const msg = await llm.invoke([
      new HumanMessage(`分析以下文本的情感（正面/负面/中性）：${state.text}`)
    ])
    return { sentiment: msg.content }
  })
  .addEdge(START, 'analyze')
  .addEdge('analyze', END)
  .compile()  // 编译一次

// 父图 1：客服系统 — 先分析情感再回复
const customerServiceGraph = new StateGraph(CustomerState)
  .addNode('sentimentCheck', sentimentGraph)  // 复用同一个子图实例
  .addNode('generateReply', replyNode)
  .addEdge(START, 'sentimentCheck')
  .addEdge('sentimentCheck', 'generateReply')
  .addEdge('generateReply', END)
  .compile()

// 父图 2：内容审核系统 — 先分析情感再决定是否发布
const moderationGraph = new StateGraph(ModerationState)
  .addNode('sentimentCheck', sentimentGraph)  // 复用同一个子图实例
  .addNode('approveOrReject', moderationNode)
  .addEdge(START, 'sentimentCheck')
  .addEdge('sentimentCheck', 'approveOrReject')
  .addEdge('approveOrReject', END)
  .compile()
```

### 6.2 子图库模式

```js
// agents/summaryAgent.js
export function createSummaryAgent(llm) {
  const SummaryState = Annotation.Root({
    input: Annotation<string>(),
    summaryResult: Annotation<string>()
  })

  return new StateGraph(SummaryState)
    .addNode('summarize', async (state) => {
      const msg = await llm.invoke([
        new HumanMessage(`请总结：${state.input}`)
      ])
      return { summaryResult: msg.content }
    })
    .addEdge(START, 'summarize')
    .addEdge('summarize', END)
    .compile()
}

// agents/translateAgent.js
export function createTranslateAgent(llm, targetLang = '英文') {
  const TranslateState = Annotation.Root({
    summaryResult: Annotation<string>(),
    translateResult: Annotation<string>()
  })

  return new StateGraph(TranslateState)
    .addNode('translate', async (state) => {
      const msg = await llm.invoke([
        new HumanMessage(`请翻译成${targetLang}：${state.summaryResult}`)
      ])
      return { translateResult: msg.content }
    })
    .addEdge(START, 'translate')
    .addEdge('translate', END)
    .compile()
}

// 父图使用
import { createSummaryAgent } from './agents/summaryAgent'
import { createTranslateAgent } from './agents/translateAgent'

const summaryAgent = createSummaryAgent(llm)
const translateAgent = createTranslateAgent(llm, '日文')

const workflow = new StateGraph(ParentState)
  .addNode('summaryAgent', summaryAgent)
  .addNode('translateAgent', translateAgent)
  // ...
  .compile()
```

---

## 7. 与 Multi-Agent 的关系

### 7.1 Subgraph 是 Multi-Agent 的底层机制

[阶段十四（Multi-Agent）](./LangGraph.js多Agent系统详解.md) 中使用的 `createReactAgent` 本质上也是一个已编译的图：

```js
import { createReactAgent } from '@langchain/langgraph/prebuilt'

// createReactAgent 返回的是一个已编译的 StateGraph
const salesAgent = createReactAgent({
  llm,
  tools: [checkPriceTool],
  systemPrompt: '你是售前客服...'
})
// salesAgent 就是一个 compiled graph，可以直接作为子图节点

const supervisorGraph = new StateGraph(SupervisorState)
  .addNode('salesAgent', salesAgent)     // 子图作为节点
  .addNode('supportAgent', supportAgent) // 子图作为节点
  // ...
  .compile()
```

### 7.2 区别与联系

```
Subgraph（机制）                  Multi-Agent（架构）
├── 已编译图作为节点        →     Worker Agent 就是子图
├── 状态键名匹配映射        →     Supervisor 与 Worker 的状态传递
├── 父图编排               →     Supervisor 图 / Swarm 图的骨架
└── 固定边（addEdge）       →     LLM 动态路由（条件边）/ handoff 工具
```

| 维度 | Stage11 Subgraph | Stage13 Multi-Agent |
|------|-----------------|---------------------|
| 编排方式 | 固定边（`addEdge`） | LLM 动态决策（条件边） |
| 节点类型 | 自定义子图 | `createReactAgent` 预构建 Agent |
| 路由逻辑 | 编译时确定 | 运行时由 LLM 决定 |
| 复杂度 | ⭐⭐ | ⭐⭐⭐⭐ |
| 适用场景 | 固定流程（摘要→翻译） | 动态任务分发（客服分流） |

**核心区别**：Stage11 的父图用**固定边**编排子图（`summaryAgent → translateAgent`），而 Multi-Agent 系统用 **LLM 动态决策**（Supervisor 路由）或 **handoff 工具**（Swarm 交接）控制流转。

---

## 8. JS/Python API 差异速查

| 操作 | LangGraph.js | LangGraph (Python) |
|------|-------------|-------------------|
| 状态定义 | `Annotation.Root({...})` | `TypedDict` |
| 创建图 | `new StateGraph(State)` | `StateGraph(State)` |
| 添加子图节点 | `.addNode('name', compiledGraph)` | `.add_node('name', compiled_graph)` |
| 编译子图 | `.compile()` | `.compile()` |
| 执行 | `graph.invoke(state)` | `graph.invoke(state)` |
| 状态映射 | 同名键自动映射 | 同名键自动映射 |

> **关键一致性**：子图机制在 JS 和 Python 版本中几乎完全一致，核心流程都是「先 compile → 再 addNode」。唯一的语法差异是 JS 用 `Annotation.Root` 定义状态，Python 用 `TypedDict`。

---

## 9. 常见问题与最佳实践

### 9.1 常见问题

**Q1: 子图编译后还能修改吗？**

不能。`.compile()` 返回的是一个不可变的 `CompiledStateGraph`。如果需要不同的子图配置，应创建新的子图实例。

**Q2: 子图可以嵌套子图吗？**

可以。子图内部可以继续包含子图，形成多层嵌套结构。但建议不超过 3 层，否则调试困难。

**Q3: 子图执行失败会怎样？**

子图内部的异常会向上传播到父图。建议在子图节点内部做好 try-catch，或使用父图的错误处理边。

**Q4: 父图和子图可以有同名但不同类型的键吗？**

不建议。虽然 LangGraph 按名称匹配，但类型不一致可能导致运行时错误。保持同名键的类型一致是最佳实践。

**Q5: 子图可以使用父图的 `MemorySaver` 吗？**

子图默认使用自己的 Checkpoint 机制。如果父图配置了 `MemorySaver`，子图的执行也会被记录在同一个 Checkpoint 中（通过 `thread_id` 关联）。

### 9.2 最佳实践

1. **先编译再添加**：永远记住 `.compile()` 必须在 `addNode()` 之前
2. **状态键名约定**：父图和子图之间传递的数据使用相同的键名，利用自动映射
3. **子图粒度适中**：一个子图包含 1-5 个节点为宜，太少没必要拆，太多失去模块化意义
4. **独立测试**：每个子图编译后可以先独立 `invoke()` 测试，确认正确后再集成到父图
5. **命名规范**：子图节点名使用 `xxxAgent` 或 `xxxSubgraph` 后缀，与普通节点区分
6. **避免深层嵌套**：子图嵌套不超过 3 层，过深会导致状态追踪困难
7. **文档化状态契约**：为每个子图明确文档化它需要哪些输入键、产出哪些输出键

---

## 相关文档

- [LangGraph.js 深入学习路线](./LangGraph.js深入学习路线.md) — 完整 13 阶段学习路径
- [LangGraph.js 多 Agent 系统详解](./LangGraph.js多Agent系统详解.md) — Subgraph 在 Multi-Agent 中的应用
- [LangGraphStage11Subgraph.vue](../../pages/langgraph/LangGraphStage11Subgraph.vue) — 配套可运行组件