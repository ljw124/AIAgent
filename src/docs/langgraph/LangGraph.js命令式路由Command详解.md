# LangGraph.js Command 命令式路由详解

> 前置条件：已完成 [LangGraph.js 深入学习路线](./LangGraph.js深入学习路线.md) 的阶段三（条件边路由），理解 `addConditionalEdges` 和声明式路由的基本用法。
>
> 目标：掌握 LangGraph 的 `Command` API，理解命令式路由（节点内决策）与声明式条件边（边层面决策）的区别，能够在节点内部动态决定跳转目标并同时更新状态。
>
> 🆕 本文档与 [`LangGraphStage4Command.vue`](../../pages/langgraph/LangGraphStage4Command.vue) 组件配套，所有代码均可在浏览器中运行（内网大模型）。

---

## 目录

1. [Command 概述 — 什么是命令式路由](#1-command-概述--什么是命令式路由)
2. [Command 构造函数深入](#2-command-构造函数深入)
3. [Command.goto — 快捷跳转](#3-commandgoto--快捷跳转)
4. [Command.update — 快捷状态更新](#4-commandupdate--快捷状态更新)
5. [ends 参数 — 声明可能的目标节点](#5-ends-参数--声明可能的目标节点)
6. [Command vs 条件边 深度对比](#6-command-vs-条件边-深度对比)
7. [消息分析器实战](#7-消息分析器实战)
8. [Command 与 resume（Interrupt 恢复）](#8-command-与-resumeinterrupt-恢复)
9. [JS/Python API 差异速查](#9-jspython-api-差异速查)
10. [常见问题与最佳实践](#10-常见问题与最佳实践)

---

## 1. Command 概述 — 什么是命令式路由

### 1.1 概念

在 LangGraph 中，有两种方式控制图的执行流程：

| 方式 | 类型 | 决策位置 | API |
|------|------|---------|-----|
| **声明式路由** | 条件边 | 边层面（图编译时注册，运行时执行） | [`addConditionalEdges(from, router)`](node_modules/@langchain/langgraph/dist/index.d.ts) |
| **命令式路由** | Command | 节点内部（与业务逻辑紧密耦合） | [`new Command({ goto, update })`](node_modules/@langchain/langgraph/dist/index.d.ts) |

**Command** 允许节点函数在内部直接决定下一步跳转到哪个节点，同时可以更新状态。这是一种更灵活、更紧密的路由方式。

### 1.2 核心 API 一览

```
┌──────────────────────────────────────────────────────────────────────┐
│                    LangGraph Command 核心 API                          │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  new Command({ goto, update, resume, graph })                  │   │
│  │  完整的命令式路由控制                                            │   │
│  │  • goto: 跳转目标节点名或 END                                    │   │
│  │  • update: 同时更新状态                                          │   │
│  │  • resume: 恢复 interrupt 暂停（见 Interrupt 详解）               │   │
│  │  • graph: Command.PARENT — 返回父图（子图场景）                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────────┐  ┌────────────────────────────────┐    │
│  │  Command.goto(nodeName)  │  │  Command.update(stateUpdate)    │    │
│  │  快捷方式：仅跳转          │  │  快捷方式：仅更新状态             │    │
│  └─────────────────────────┘  └────────────────────────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.3 命令式路由全景图

```
                    ┌──────────┐
                    │  START   │
                    └────┬─────┘
                         │  (普通边)
                    ┌────▼─────┐
                    │ analyzer │  ← 节点内部用 Command 动态决策
                    └────┬─────┘
                         │  (Command.goto)
          ┌──────────────┼──────────────┬──────────────┐
          ▼              ▼              ▼              ▼
   ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────┐
   │ priority   │ │ escalation │ │ normal     │ │ END  │
   │ Handler    │ │ Handler    │ │ Handler    │ │      │
   └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └──────┘
         │              │              │
         ▼              ▼              ▼
      ┌──────┐      ┌──────┐      ┌──────┐
      │ END  │      │ END  │      │ END  │
      └──────┘      └──────┘      └──────┘
```

---

## 2. Command 构造函数深入

### 2.1 导入路径

```js
import { Command } from '@langchain/langgraph'
```

### 2.2 构造函数签名

```ts
new Command(options: {
  goto?: string | typeof END,       // 跳转目标节点名
  update?: Record<string, any>,     // 状态更新（合并到当前状态）
  resume?: any,                     // 恢复 interrupt 的值（见 Interrupt 详解）
  graph?: typeof Command.PARENT     // 返回父图（子图场景）
})
```

### 2.3 参数详解

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `goto` | `string \| typeof END` | ❌ | 指定下一步要执行的节点名。不指定时走默认边 |
| `update` | `Record<string, any>` | ❌ | 同时更新状态，会合并到当前状态中 |
| `resume` | `any` | ❌ | 恢复 `interrupt()` 暂停的值（见 Interrupt 详解） |
| `graph` | `Command.PARENT` | ❌ | 在子图中返回父图（见 Subgraph 详解） |

### 2.4 基本用法

```js
// 在节点函数中返回 Command
const analyzerNode = (state) => {
  if (state.text.includes('紧急')) {
    // 🔀 命令式路由：跳转到 priorityHandler，同时更新状态
    return new Command({
      goto: 'priorityHandler',
      update: { priority: 'high', handled: true }
    })
  }

  // ➡️ 不返回 Command → 走默认边
  return { priority: 'normal' }
}
```

### 2.5 Command 的执行优先级

```
节点函数返回值判断：
  │
  ├── 返回 Command 实例
  │   └── ✅ 使用 Command.goto 决定下一个节点
  │        （条件边被跳过，Command 优先级更高）
  │
  └── 返回普通对象
      └── ✅ 走默认边或条件边
           （与普通节点行为一致）
```

> **关键规则**：当节点返回 `Command` 时，该节点的条件边会被**跳过**，Command 的 `goto` 直接决定下一个节点。

---

## 3. Command.goto — 快捷跳转

### 3.1 静态方法

```js
Command.goto(nodeName: string | typeof END): Command
```

### 3.2 等价关系

```js
// 完整写法
new Command({ goto: 'priorityHandler' })

// 快捷写法 — 完全等价
Command.goto('priorityHandler')
```

### 3.3 使用示例

```js
const analyzerNode = (state) => {
  if (state.text.includes('紧急')) {
    return Command.goto('priorityHandler')  // 仅跳转，不更新状态
  }
  return Command.goto(END)  // 直接终止
}
```

---

## 4. Command.update — 快捷状态更新

### 4.1 静态方法

```js
Command.update(stateUpdate: Record<string, any>): Command
```

### 4.2 等价关系

```js
// 完整写法
new Command({ update: { priority: 'high', handled: true } })

// 快捷写法 — 完全等价
Command.update({ priority: 'high', handled: true })
```

### 4.3 使用场景

`Command.update` 不指定 `goto`，因此节点执行后会走默认边或条件边。它适用于**只需要更新状态、不需要改变路由**的场景：

```js
const preprocessNode = (state) => {
  // 预处理数据，更新状态，但路由由条件边决定
  return Command.update({
    cleanedText: state.text.trim().toLowerCase(),
    preprocessed: true
  })
}
```

### 4.4 三种快捷方式对比

| 写法 | goto | update | 使用场景 |
|------|------|--------|---------|
| `new Command({ goto, update })` | ✅ | ✅ | 同时跳转 + 更新状态 |
| `Command.goto(node)` | ✅ | ❌ | 仅跳转 |
| `Command.update(obj)` | ❌ | ✅ | 仅更新状态，走默认边 |

---

## 5. ends 参数 — 声明可能的目标节点

### 5.1 为什么需要 ends

当节点使用 `Command` 进行动态路由时，LangGraph 在编译时**无法静态分析**节点可能跳转到哪些目标。这会导致图结构不完整。

`ends` 参数告诉 LangGraph：「这个节点可能跳转到以下目标节点」，确保图编译正确。

### 5.2 使用方式

```js
.addNode('analyzer', analyzerNode, {
  ends: ['priorityHandler', 'escalationHandler', 'normalHandler', END]
})
```

### 5.3 不声明 ends 的后果

如果节点返回 `Command({ goto: 'someNode' })` 但 `someNode` 未在 `ends` 中声明，LangGraph 会抛出错误：

```
Error: Node 'analyzer' returned a Command with goto 'priorityHandler' 
but 'priorityHandler' is not in the node's ends list.
```

### 5.4 ends 与条件边的区别

| 特性 | `ends` 参数 | `addConditionalEdges` |
|------|-----------|----------------------|
| 用途 | 声明 Command 可能的目标 | 定义条件路由逻辑 |
| 决策位置 | 节点内部（Command） | 边层面（router 函数） |
| 是否必须 | 使用 Command 时必须 | 使用条件路由时必须 |
| 编译时检查 | ✅ 验证目标节点存在 | ✅ 验证目标节点存在 |

---

## 6. Command vs 条件边 深度对比

### 6.1 核心差异

| 特性 | 条件边（[`addConditionalEdges`](node_modules/@langchain/langgraph/dist/index.d.ts)） | Command（[`new Command`](node_modules/@langchain/langgraph/dist/index.d.ts)） |
|------|-----------|----------|
| **路由方式** | 声明式 — 在边层面定义 router 函数 | 命令式 — 在节点内部直接返回 Command |
| **决策位置** | 图编译时注册，运行时在边层面执行 | 节点函数内部，与业务逻辑紧密耦合 |
| **状态更新** | router 函数只返回目标节点名，不更新状态 | `Command.update` 可同时更新状态 + 路由 |
| **API 签名** | `addConditionalEdges(from, router)` | `return new Command({ goto, update })` |
| **适用场景** | 基于状态字段的简单分支判断 | 节点内部复杂决策、需要同时更新状态和路由 |
| **可读性** | 图结构清晰，路由逻辑集中在 router 中 | 路由逻辑分散在各节点中，需查看节点代码 |
| **LLM 集成** | router 是同步函数，不能调用 LLM | 节点内可调用 LLM 后再用 Command 路由 |
| **优先级** | 低（Command 返回时被跳过） | 高（覆盖条件边） |

### 6.2 选择决策树

```
需要动态路由？
  │
  ├── 路由逻辑简单（基于状态字段判断）？
  │   └── ✅ 使用条件边（addConditionalEdges）
  │
  ├── 需要在节点内调用 LLM 后再决定路由？
  │   └── ✅ 使用 Command
  │
  ├── 需要同时更新状态 + 改变路由？
  │   └── ✅ 使用 Command
  │
  └── 希望图结构一目了然？
      └── ✅ 使用条件边（addConditionalEdges）
```

### 6.3 同一场景的两种实现对比

**场景**：消息分析器，根据 LLM 分类结果路由到不同处理节点。

**方式一：Command（命令式）**

```js
const analyzerNode = async (state) => {
  // ⚡ 节点内调用 LLM 分类
  const category = await llm.classify(state.text)

  // 🔀 直接在节点内用 Command 路由
  if (category === 'urgent') {
    return new Command({
      goto: 'priorityHandler',
      update: { priority: 'high', handled: true }
    })
  }
  if (category === 'complaint') {
    return new Command({
      goto: 'escalationHandler',
      update: { priority: 'critical', handled: true }
    })
  }
  // 普通消息 → 不返回 Command，走默认边
  return { priority: 'normal' }
}

const graph = new StateGraph(AnalyzerState)
  .addNode('analyzer', analyzerNode, {
    ends: ['priorityHandler', 'escalationHandler', 'normalHandler', END]
  })
  .addNode('priorityHandler', priorityHandler)
  .addNode('escalationHandler', escalationHandler)
  .addNode('normalHandler', normalHandler)
  .addEdge(START, 'analyzer')
  .addEdge('priorityHandler', END)
  .addEdge('escalationHandler', END)
  .addEdge('normalHandler', END)
```

**方式二：条件边（声明式）**

```js
const analyzerNode = async (state) => {
  // ⚡ 节点内调用 LLM 分类
  const category = await llm.classify(state.text)

  // 只设置状态字段，不直接路由
  if (category === 'urgent') return { priority: 'high' }
  if (category === 'complaint') return { priority: 'critical' }
  if (category === 'end') return { shouldEnd: true }
  return { priority: 'normal' }
}

// 路由逻辑在边层面
const router = (state) => {
  if (state.shouldEnd) return END
  if (state.priority === 'high') return 'priorityHandler'
  if (state.priority === 'critical') return 'escalationHandler'
  return 'normalHandler'
}

const graph = new StateGraph(AnalyzerState)
  .addNode('analyzer', analyzerNode)
  .addNode('priorityHandler', priorityHandler)
  .addNode('escalationHandler', escalationHandler)
  .addNode('normalHandler', normalHandler)
  .addEdge(START, 'analyzer')
  .addConditionalEdges('analyzer', router)  // ← 声明式路由
  .addEdge('priorityHandler', END)
  .addEdge('escalationHandler', END)
  .addEdge('normalHandler', END)
```

---

## 7. 消息分析器实战

### 7.1 场景描述

实现一个消息分析器：用户输入消息 → LLM 分析分类 → 根据分类路由到不同处理节点。

分类规则：
- **urgent**（紧急）→ `priorityHandler`（优先处理）
- **complaint**（投诉）→ `escalationHandler`（升级处理）
- **end**（结束）→ 直接 `END`
- **normal**（普通）→ `normalHandler`（普通处理）

### 7.2 状态定义

```js
import { Annotation } from '@langchain/langgraph'

const AnalyzerState = Annotation.Root({
  text: Annotation({
    reducer: (_, right) => right,
    default: () => ''
  }),
  priority: Annotation({
    reducer: (_, right) => right,
    default: () => 'normal'
  }),
  handled: Annotation({
    reducer: (_, right) => right,
    default: () => false
  }),
  handlerNote: Annotation({
    reducer: (_, right) => right,
    default: () => ''
  })
})
```

### 7.3 节点函数

```js
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
import { Command } from '@langchain/langgraph'

const llm = new ChatOpenAI({
  model: 'EB-DeepSeek-V4-Pro',
  temperature: 0
})

// analyzer 节点：LLM 分析 + Command 动态路由
const analyzerNode = async (state) => {
  const { text } = state

  // ⚡ 用 LLM 分析消息分类
  const prompt = `请分析以下消息的分类，只返回一个单词：
  - 紧急/故障/宕机 → 返回 'urgent'
  - 投诉/不满/抱怨 → 返回 'complaint'
  - 结束/终止/再见 → 返回 'end'
  - 其他 → 返回 'normal'

  消息：${text}

  分类结果：`

  const response = await llm.invoke([new HumanMessage(prompt)])
  const category = response.content.trim().toLowerCase()

  // 🔀 在节点内部根据 LLM 分类结果用 Command 动态路由
  if (category === 'urgent') {
    return new Command({
      goto: 'priorityHandler',
      update: { priority: 'high', handled: true }
    })
  }

  if (category === 'complaint') {
    return new Command({
      goto: 'escalationHandler',
      update: { priority: 'critical', handled: true }
    })
  }

  if (category === 'end') {
    return new Command({
      goto: END,
      update: { handled: true }
    })
  }

  // ➡️ 普通消息 → 不返回 Command，走默认边
  return { priority: 'normal', handled: false }
}

// 各处理节点
const priorityHandler = (state) => ({
  handlerNote: `[优先处理] 已紧急响应: ${state.text.substring(0, 80)}`
})

const escalationHandler = (state) => ({
  handlerNote: `[升级处理] 已升级投诉: ${state.text.substring(0, 80)}`
})

const normalHandler = (state) => ({
  handlerNote: `[普通处理] 已记录: ${state.text.substring(0, 80)}`,
  handled: true
})
```

### 7.4 图构建

```js
import { StateGraph, START, END } from '@langchain/langgraph'

const graph = new StateGraph(AnalyzerState)
  .addNode('analyzer', analyzerNode, {
    // ⚠️ 使用 Command 的节点必须声明 ends
    ends: ['priorityHandler', 'escalationHandler', 'normalHandler', END]
  })
  .addNode('priorityHandler', priorityHandler)
  .addNode('escalationHandler', escalationHandler)
  .addNode('normalHandler', normalHandler)
  .addEdge(START, 'analyzer')
  .addEdge('priorityHandler', END)
  .addEdge('escalationHandler', END)
  .addEdge('normalHandler', END)

const app = graph.compile()
```

### 7.5 执行示例

```js
// 紧急消息
const result1 = await app.invoke({ text: '紧急！服务器宕机了，请立即处理' })
// → analyzer 返回 Command({ goto: 'priorityHandler', update: { priority: 'high' } })
// → priorityHandler 执行
// → END

// 投诉消息
const result2 = await app.invoke({ text: '我要投诉产品质量问题，太差了' })
// → analyzer 返回 Command({ goto: 'escalationHandler', update: { priority: 'critical' } })
// → escalationHandler 执行
// → END

// 普通消息
const result3 = await app.invoke({ text: '今天天气不错' })
// → analyzer 返回 { priority: 'normal' }（不返回 Command）
// → 走默认边到 normalHandler
// → END

// 结束消息
const result4 = await app.invoke({ text: '结束' })
// → analyzer 返回 Command({ goto: END })
// → 直接终止
```

---

## 8. Command 与 resume（Interrupt 恢复）

`Command` 的 `resume` 参数用于恢复 `interrupt()` 暂停的执行。这是 Human-in-the-Loop 模式的核心机制。

```js
// interrupt 暂停后，用 Command({ resume }) 恢复
const result = await app.invoke(
  new Command({ resume: { approved: true, comment: '同意执行' } }),
  { configurable: { thread_id: threadId } }
)
```

> 详细说明见 [LangGraph.js 人机协同 Interrupt 详解](./LangGraph.js人机协同Interrupt详解.md)。

---

## 9. JS/Python API 差异速查

| 特性 | LangGraph.js | LangGraph (Python) |
|------|-------------|-------------------|
| 导入路径 | `import { Command } from '@langchain/langgraph'` | `from langgraph.types import Command` |
| 构造函数 | `new Command({ goto, update })` | `Command(goto=..., update=...)` |
| 快捷跳转 | `Command.goto(node)` | `Command(goto=node)` |
| 快捷更新 | `Command.update(obj)` | `Command(update=obj)` |
| ends 参数 | `addNode(name, fn, { ends: [...] })` | `add_node(name, fn)`（Python 不需要 ends） |
| goto: END | `goto: END` | `goto=END` |
| 返回父图 | `graph: Command.PARENT` | `graph=Command.PARENT` |

### 9.1 关键差异详解

**① 构造方式**

```js
// JavaScript — 使用 new 构造函数
return new Command({
  goto: 'priorityHandler',
  update: { priority: 'high' }
})
```

```python
# Python — 直接实例化
return Command(
    goto='priorityHandler',
    update={'priority': 'high'}
)
```

**② ends 参数**

```js
// JavaScript — 必须声明 ends
.addNode('analyzer', analyzerNode, {
  ends: ['priorityHandler', 'escalationHandler', END]
})
```

```python
# Python — 不需要 ends，自动推断
graph.add_node('analyzer', analyzer_node)
```

**③ 快捷方式**

```js
// JavaScript — 静态方法
Command.goto('target')
Command.update({ key: 'value' })
```

```python
# Python — 构造函数参数
Command(goto='target')
Command(update={'key': 'value'})
```

---

## 10. 常见问题与最佳实践

### 10.1 常见问题

**Q1: 返回 Command 后条件边还执行吗？**

A: 不执行。当节点返回 `Command` 时，该节点的条件边被**跳过**，Command 的 `goto` 直接决定下一个节点。

**Q2: 不声明 ends 会怎样？**

A: LangGraph 编译时会报错，提示目标节点不在 ends 列表中。使用 Command 的节点**必须**声明 `ends`。

**Q3: Command 和条件边如何选择？**

A:
- 路由逻辑简单、基于状态字段 → 条件边
- 需要在节点内调用 LLM 后再路由 → Command
- 需要同时更新状态 + 改变路由 → Command
- 希望图结构清晰可读 → 条件边

**Q4: Command 可以同时更新多个状态字段吗？**

A: 可以。`update` 是一个对象，可以包含任意多个字段：

```js
return new Command({
  goto: 'nextNode',
  update: {
    priority: 'high',
    handled: true,
    timestamp: Date.now(),
    handlerNote: '已紧急响应'
  }
})
```

**Q5: 不返回 Command 时节点行为是什么？**

A: 与普通节点完全一致——返回的状态更新被合并，然后走默认边或条件边。

### 10.2 最佳实践

**① 使用 LLM 分类 + Command 路由实现智能分发**

```js
// ✅ 推荐：LLM 理解语义后动态路由
const router = async (state) => {
  const intent = await llm.classify(state.text)
  switch (intent) {
    case 'search': return new Command({ goto: 'searchNode', update: { intent } })
    case 'calculate': return new Command({ goto: 'calcNode', update: { intent } })
    default: return new Command({ goto: 'fallbackNode', update: { intent } })
  }
}
```

**② 始终声明完整的 ends 列表**

```js
// ✅ 推荐：列出所有可能的目标
.addNode('analyzer', analyzerNode, {
  ends: ['priorityHandler', 'escalationHandler', 'normalHandler', END]
})

// ❌ 不推荐：遗漏可能的目标
.addNode('analyzer', analyzerNode, {
  ends: ['priorityHandler', 'normalHandler']  // 缺少 escalationHandler 和 END
})
```

**③ 使用 Command.update 而非 Command.goto 保持图结构清晰**

```js
// ✅ 推荐：仅更新状态，让条件边决定路由
return Command.update({ priority: 'high' })

// ⚠️ 谨慎使用：直接跳转会绕过条件边
return Command.goto('priorityHandler')
```

**④ 在复杂场景中混合使用 Command 和条件边**

```js
const graph = new StateGraph(MyState)
  .addNode('analyzer', analyzerNode, {
    ends: ['handlerA', 'handlerB', 'handlerC']
  })
  .addNode('handlerA', handlerA)
  .addNode('handlerB', handlerB)
  .addNode('handlerC', handlerC)
  .addEdge(START, 'analyzer')
  // analyzer 内部用 Command 做一级路由（LLM 分类）
  // handlerA/B/C 之后用条件边做二级路由（状态字段判断）
  .addConditionalEdges('handlerA', routerA)
  .addConditionalEdges('handlerB', routerB)
  .addEdge('handlerC', END)
```

**⑤ 避免在 Command 中执行副作用**

```js
// ❌ 不推荐：在返回 Command 前执行副作用
const badNode = async (state) => {
  await sendNotification(state.text)  // 副作用
  return new Command({ goto: 'nextNode' })
}

// ✅ 推荐：副作用放在目标节点中
const goodNode = (state) => {
  return new Command({ goto: 'nextNode', update: { needsNotification: true } })
}

const nextNode = async (state) => {
  if (state.needsNotification) {
    await sendNotification(state.text)
  }
  return { notified: true }
}
```

---

> 📚 **下一步学习**：
> - [LangGraph.js 条件边路由 Routing 详解](./LangGraph.js条件边路由Routing详解.md) — 回顾声明式路由的完整用法
> - [LangGraph.js 人机协同 Interrupt 详解](./LangGraph.js人机协同Interrupt详解.md) — 了解 Command.resume 在中断恢复中的应用
> - [LangGraph.js 子图 Subgraph 详解](./LangGraph.js子图Subgraph详解.md) — 了解 Command.PARENT 在子图返回父图中的应用
> - [LangGraph.js 深入学习路线](./LangGraph.js深入学习路线.md) — 返回学习路线总览