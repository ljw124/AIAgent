# LangGraph.js 人机协同（Interrupt）详解

> 前置条件：已完成 [LangGraph.js 深入学习路线](./LangGraph.js深入学习路线.md) 的阶段四（Command 命令模式），理解 `Command` 的基本用法。
>
> 目标：掌握 LangGraph 的 `interrupt()` / `Command({ resume })` API，理解 Human-in-the-Loop 人机协同工作流，实现 AI 生成 → 人工审批 → 继续执行的完整闭环。
>
> 🆕 本文档与 [`LangGraphStage5Interrupt.vue`](../../pages/langgraph/LangGraphStage5Interrupt.vue) 组件配套，所有代码均可在浏览器中运行（内网大模型）。

---

## 目录

1. [Interrupt 概述 — 什么是人机协同](#1-interrupt-概述--什么是人机协同)
2. [interrupt() 核心机制深入](#2-interrupt-核心机制深入)
3. [Command({ resume }) — 恢复执行](#3-commandresume--恢复执行)
4. [中断检测：isInterrupted / INTERRUPT / isGraphInterrupt](#4-中断检测isinterrupted--interrupt--isgraphinterrupt)
5. [条件路由审批工作流实战](#5-条件路由审批工作流实战)
6. [循环审批模式（拒绝 → 重新生成 → 再次审批）](#6-循环审批模式拒绝--重新生成--再次审批)
7. [invoke() vs stream() 在中断场景的差异](#7-invoke-vs-stream-在中断场景的差异)
8. [checkpointer 依赖与配置](#8-checkpointer-依赖与配置)
9. [JS/Python API 差异速查](#9-jspython-api-差异速查)
10. [常见问题与最佳实践](#10-常见问题与最佳实践)

---

## 1. Interrupt 概述 — 什么是人机协同

### 1.1 概念

**Human-in-the-Loop（人机协同）** 是 LangGraph 的核心设计模式之一。它允许图在执行过程中**暂停**，等待人工输入后再继续执行。这在以下场景中至关重要：

| 场景 | 说明 |
|------|------|
| **审批工作流** | AI 生成方案 → 暂停等待人工审批 → 批准后执行 |
| **敏感操作确认** | AI 准备执行高风险操作 → 暂停等待人工确认 |
| **多轮修订** | AI 生成内容 → 人工反馈 → AI 修订 → 再次审批 |
| **数据标注** | AI 预处理 → 暂停等待人工标注 → 继续处理 |

### 1.2 核心 API 一览

```
┌──────────────────────────────────────────────────────────────────────┐
│                    LangGraph Interrupt 核心 API                        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────┐         ┌──────────────────────────────┐   │
│  │   interrupt(value)   │         │   Command({ resume: value })  │   │
│  │   在节点中暂停执行      │         │   恢复暂停的执行               │   │
│  │   value → 抛给调用方   │         │   value → interrupt() 返回值  │   │
│  └─────────────────────┘         └──────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────┐         ┌──────────────────────────────┐   │
│  │   isInterrupted()    │         │   isGraphInterrupt()          │   │
│  │   检查返回值是否中断    │         │   检查异常是否为中断异常        │   │
│  └─────────────────────┘         └──────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │   INTERRUPT 常量                                              │   │
│  │   从 invoke/stream 返回值中提取中断信息的特殊键                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.3 工作流全景图

```
                    ┌──────────┐
                    │  START   │
                    └────┬─────┘
                         │
                    ┌────▼─────┐
                    │ generate │  ← LLM 生成方案
                    └────┬─────┘
                         │
                    ┌────▼─────┐
                    │ approval │  ← ⏸️ interrupt() 暂停，等待人工审批
                    └────┬─────┘
                         │
                    ┌────▼─────┐
                    │ 条件路由  │  ← approved?
                    └─┬─────┬──┘
                      │     │
           ✅ 批准     │     │  ❌ 拒绝
                      │     │
              ┌───▼──┐ │ ┌──▼──────┐
              │execute│ │ │revisePlan│ ← LLM 重新生成
              └───┬──┘ │ └────┬─────┘
                  │    │      │
              ┌───▼──┐ │      │ ↻ 循环回 approval
              │  END  │ │      │
              └──────┘ │      │
                       └──────┘
```

---

## 2. interrupt() 核心机制深入

### 2.1 导入路径

```js
import { interrupt } from '@langchain/langgraph'
```

### 2.2 函数签名

```ts
function interrupt<T>(value: T): T
```

`interrupt()` 是一个**特殊的函数**，只能在 LangGraph 节点函数内部调用。它的行为分为两个阶段：

| 阶段 | 行为 | 说明 |
|------|------|------|
| **暂停阶段** | 抛出 `GraphInterrupt` 异常 | 将 `value` 作为中断信息传递给调用方，图引擎捕获异常并保存当前状态到 checkpointer |
| **恢复阶段** | 返回 `resume` 值 | 当调用方通过 `Command({ resume })` 恢复执行时，`interrupt()` 返回 `resume` 传入的值 |

### 2.3 工作原理（6 步详解）

```
① 节点中调用 interrupt(value)
   │
   ▼
② LangGraph 抛出 GraphInterrupt 异常
   │  (异常中包含 value 作为中断信息)
   ▼
③ 图引擎捕获异常，将当前状态保存到 checkpointer
   │  (如 MemorySaver，状态被序列化存储)
   ▼
④ 调用方检测到中断状态（isInterrupted / isGraphInterrupt）
   │  (前端展示「等待审批」UI)
   ▼
⑤ 用户做出决策后，调用 app.invoke(new Command({ resume: decision }), config)
   │  (使用相同的 thread_id 确保从 checkpointer 恢复状态)
   ▼
⑥ 图引擎从 checkpointer 恢复状态，将 resume 值作为 interrupt() 的返回值
   │  (节点继续执行 interrupt() 之后的代码)
   ▼
   继续执行后续节点
```

### 2.4 基本用法示例

```js
import { interrupt } from '@langchain/langgraph'

// 在节点函数中调用
const waitApproval = (state) => {
  // ⏸️ 暂停执行，将审批信息传递给调用方
  const decision = interrupt({
    question: '请审批以下方案：',
    plan: state.plan
  })

  // ▶️ 恢复后，decision 是 Command({ resume }) 传入的值
  // 例如：{ approved: true, comment: '同意执行' }
  return { approved: decision.approved }
}
```

### 2.5 interrupt() 的值传递机制

```
interrupt(value)                    Command({ resume: decision })
     │                                      │
     │  value 作为中断信息                    │  decision 作为恢复值
     │  传递给调用方                          │  传回给 interrupt()
     ▼                                      ▼
┌─────────────┐                      ┌─────────────┐
│  调用方收到   │                      │ interrupt()  │
│  value 并展示 │ ──── 用户决策 ────→ │ 返回 decision │
└─────────────┘                      └─────────────┘
```

> **关键理解**：`interrupt()` 的**参数**（传给调用方看）和**返回值**（调用方传回来）是**两个不同的值**。参数是"给人类看什么"，返回值是"人类决定了什么"。

---

## 3. Command({ resume }) — 恢复执行

### 3.1 导入路径

```js
import { Command } from '@langchain/langgraph'
```

### 3.2 构造函数

```ts
new Command({ resume: T })
```

`Command({ resume })` 创建一个恢复命令，`resume` 的值会作为 `interrupt()` 的返回值。

### 3.3 使用方式

```js
// 批准方案
const result = await app.invoke(
  new Command({ resume: { approved: true, comment: '同意执行' } }),
  { configurable: { thread_id: threadId } }  // ← 必须使用相同的 thread_id
)

// 拒绝方案
const result = await app.invoke(
  new Command({ resume: { approved: false, comment: '方案不可行，请重新设计' } }),
  { configurable: { thread_id: threadId } }
)
```

### 3.4 关键约束

| 约束 | 说明 |
|------|------|
| **必须使用相同 thread_id** | 图引擎通过 `thread_id` 从 checkpointer 中找到暂停的状态并恢复 |
| **必须注入 checkpointer** | `graph.compile({ checkpointer })` 是 interrupt 的前置条件 |
| **resume 值类型自由** | 可以是字符串、对象、数字等任意类型，与 `interrupt()` 的泛型参数对应 |

---

## 4. 中断检测：isInterrupted / INTERRUPT / isGraphInterrupt

LangGraph 提供了**三种**检测中断的方式，分别适用于不同的调用场景。

### 4.1 isInterrupted(result) — 检查返回值

```js
import { isInterrupted, INTERRUPT } from '@langchain/langgraph'

const result = await app.invoke({ plan: '' }, config)

if (isInterrupted(result)) {
  // result 包含中断信息
  const interrupts = result[INTERRUPT]       // Interrupt[] 数组
  const interruptValue = interrupts[0]?.value // 第一个中断的值
  console.log('图已暂停:', interruptValue)
}
```

**适用场景**：使用 `invoke()` 调用图时。

### 4.2 INTERRUPT 常量 — 提取中断数据

```js
import { INTERRUPT } from '@langchain/langgraph'

// result[INTERRUPT] 是一个 Interrupt[] 数组
// 每个 Interrupt 包含：
// {
//   value: any,        // interrupt() 传入的值
//   resumable: boolean // 是否可恢复
// }
```

### 4.3 isGraphInterrupt(error) — 检查异常

```js
import { isGraphInterrupt } from '@langchain/langgraph'

try {
  const result = await app.invoke({ plan: '' }, config)
} catch (err) {
  if (isGraphInterrupt(err) && err.interrupts?.length > 0) {
    // err 是 GraphInterrupt 异常
    const interruptValue = err.interrupts[0]?.value
    console.log('图已暂停（异常方式）:', interruptValue)
  }
}
```

**适用场景**：当 `invoke()` 在某些运行时条件下抛出异常而非返回中断结果时，作为兜底检测。

### 4.4 三种检测方式对比

| 方式 | 检测对象 | 使用场景 | 可靠性 |
|------|---------|---------|--------|
| [`isInterrupted(result)`](node_modules/@langchain/langgraph/dist/index.d.ts) | `invoke()` 返回值 | 标准 invoke 调用 | ⭐⭐⭐ 推荐首选 |
| [`result[INTERRUPT]`](node_modules/@langchain/langgraph/dist/index.d.ts) | 返回值中的中断数组 | 需要访问中断详情 | ⭐⭐⭐ 配合 isInterrupted 使用 |
| [`isGraphInterrupt(err)`](node_modules/@langchain/langgraph/dist/index.d.ts) | catch 捕获的异常 | 兜底检测 | ⭐⭐ 作为异常处理补充 |

### 4.5 推荐的检测模式

```js
async function runWithInterrupt(app, input, config) {
  try {
    const result = await app.invoke(input, config)

    // 首选：检查返回值
    if (isInterrupted(result)) {
      const interrupts = result[INTERRUPT]
      return { status: 'interrupted', interrupts }
    }

    return { status: 'completed', result }
  } catch (err) {
    // 兜底：检查异常
    if (isGraphInterrupt(err) && err.interrupts?.length > 0) {
      return { status: 'interrupted', interrupts: err.interrupts }
    }
    throw err
  }
}
```

---

## 5. 条件路由审批工作流实战

### 5.1 场景描述

一个完整的审批工作流：AI 生成方案 → 暂停等待人工审批 → 根据审批结果路由到不同分支。

### 5.2 状态定义

```js
import { Annotation } from '@langchain/langgraph'

const ApprovalState = Annotation.Root({
  // 方案内容（覆盖式更新）
  plan: Annotation({
    reducer: (_, right) => right,
    default: () => ''
  }),
  // 审批结果（覆盖式更新）
  approved: Annotation({
    reducer: (_, right) => right,
    default: () => false
  }),
  // 执行结果（覆盖式更新）
  result: Annotation({
    reducer: (_, right) => right,
    default: () => ''
  })
})
```

### 5.3 节点函数实现

```js
import { ChatOpenAI } from '@langchain/openai'
import { interrupt } from '@langchain/langgraph'

const llm = new ChatOpenAI({
  model: 'EB-DeepSeek-Flash',
  temperature: 0.7
})

// 节点1：LLM 生成方案
const generatePlan = async (state) => {
  const plan = await llm.invoke(`请为「${state.plan || '默认主题'}」生成一个详细的执行方案`)
  return { plan: plan.content }
}

// 节点2：等待人工审批（interrupt 暂停）
const waitApproval = (state) => {
  // ⏸️ 暂停，将方案展示给审批人
  const decision = interrupt({
    question: '请审批以下方案：',
    plan: state.plan
  })
  // ▶️ 恢复后，decision 是审批人传入的值
  return { approved: decision.approved }
}

// 节点3：执行方案（仅批准后到达）
const executePlan = (state) => {
  return { result: `方案已执行：${state.plan.substring(0, 50)}...` }
}

// 节点4：LLM 根据反馈重新生成方案
const revisePlan = async (state) => {
  const newPlan = await llm.invoke(
    `原方案被拒绝，请根据以下反馈重新生成方案：\n原方案：${state.plan}\n反馈：请重新设计`
  )
  return { plan: newPlan.content, approved: false }
}
```

### 5.4 条件路由

```js
// 条件路由函数：根据审批结果决定下一步
const routeAfterApproval = (state) => {
  return state.approved ? 'execute' : 'revisePlan'
}
```

### 5.5 图构建

```js
import { StateGraph, START, END, MemorySaver } from '@langchain/langgraph'

const checkpointer = new MemorySaver()

const graph = new StateGraph(ApprovalState)
  .addNode('generate', generatePlan)
  .addNode('approval', waitApproval)
  .addNode('execute', executePlan)
  .addNode('revisePlan', revisePlan)
  .addEdge(START, 'generate')
  .addEdge('generate', 'approval')
  .addConditionalEdges('approval', routeAfterApproval, {
    execute: 'execute',      // 批准 → 执行
    revisePlan: 'revisePlan' // 拒绝 → 重新生成
  })
  .addEdge('execute', END)
  .addEdge('revisePlan', 'approval')  // ← 循环回 approval 重新审批

// ⚠️ 必须注入 checkpointer，否则 interrupt() 会报错
const app = graph.compile({ checkpointer })
```

### 5.6 完整执行流程

```js
// 第一步：启动工作流，执行到 interrupt 处暂停
const threadId = 'thread-' + Date.now()
const config = { configurable: { thread_id: threadId } }

const result1 = await app.invoke({ plan: '双十一促销活动方案' }, config)

if (isInterrupted(result1)) {
  const interrupts = result1[INTERRUPT]
  const planContent = interrupts[0]?.value?.plan
  console.log('⏸️ 图已暂停，方案内容:', planContent)
  // 此时前端展示「等待审批」UI
}

// 第二步：批准方案，恢复执行
const result2 = await app.invoke(
  new Command({ resume: { approved: true, comment: '同意执行' } }),
  config  // ← 使用相同的 thread_id
)
// isInterrupted(result2) === false，图执行完毕 → END
console.log('✅ 执行结果:', result2.result)
```

---

## 6. 循环审批模式（拒绝 → 重新生成 → 再次审批）

### 6.1 循环机制

当审批人**拒绝**方案时，工作流进入循环：

```
approval (拒绝) → revisePlan (LLM 重新生成) → approval (再次 interrupt)
                                                      │
                                                      ├── 批准 → execute → END
                                                      └── 拒绝 → revisePlan → ... (循环)
```

这个循环由图的边结构自然支持：

```js
.addEdge('revisePlan', 'approval')  // ← 循环回 approval
```

### 6.2 循环中的 interrupt 检测

每次循环回到 `approval` 节点时，`interrupt()` 会**再次触发**，调用方需要再次检测中断状态：

```js
async function resumeExecution(app, config, approved, comment) {
  const result = await app.invoke(
    new Command({ resume: { approved, comment } }),
    config
  )

  if (isInterrupted(result)) {
    // 再次中断！说明方案被拒绝，LLM 已重新生成，等待再次审批
    const interrupts = result[INTERRUPT]
    const newPlan = interrupts[0]?.value?.plan
    console.log('⏸️ 图再次暂停，新方案:', newPlan)
    return { status: 'interrupted_again', plan: newPlan }
  }

  // 没有中断，流程正常结束（批准 → execute → END）
  return { status: 'completed', result }
}
```

### 6.3 循环轮次追踪

在实际应用中，可以追踪修订轮次：

```js
// 组件 data 中维护
data() {
  return {
    revisionCount: 0  // 修订轮次计数
  }
}

// 每次检测到再次中断时递增
if (isInterrupted(result)) {
  this.revisionCount++
  // 展示「第 N 轮重新审批」
}
```

### 6.4 循环终止条件

循环在以下条件终止：

| 条件 | 路由 | 结果 |
|------|------|------|
| 审批人**批准** | `approval → execute → END` | 工作流正常结束 |
| 审批人**拒绝** | `approval → revisePlan → approval` | 继续循环（无内置终止条件） |

> **注意**：LangGraph 本身**不会**自动终止循环。如果需要限制最大修订轮次，需要在节点逻辑中自行判断（例如在 `revisePlan` 中检查轮次计数，超过阈值后直接返回 `approved: true` 强制通过）。

---

## 7. invoke() vs stream() 在中断场景的差异

### 7.1 核心差异

| 特性 | [`invoke()`](node_modules/@langchain/langgraph/dist/index.d.ts) | [`stream()`](node_modules/@langchain/langgraph/dist/index.d.ts) |
|------|----------|----------|
| 中断检测 | ✅ 检查每个 chunk 的 `__interrupt__` 标记 | ❌ 非嵌套图中 `_suppressInterrupt` 返回 true，静默结束 |
| 返回值 | 包含 `INTERRUPT` 键的中断结果 | `for await` 正常结束，不抛出异常 |
| 推荐场景 | **中断/恢复工作流** | 普通流式输出 |

### 7.2 为什么 stream() 不适合中断场景

```js
// ❌ 不推荐：stream() 在非嵌套图中会 suppress GraphInterrupt
const stream = await app.stream({ plan: '' }, config)
for await (const chunk of stream) {
  // chunk 不会包含中断信息
  // for await 正常结束，无法检测到中断
}

// ✅ 推荐：invoke() 正确返回中断信息
const result = await app.invoke({ plan: '' }, config)
if (isInterrupted(result)) {
  // 正确检测到中断
}
```

### 7.3 技术原因

LangGraph 内部有一个 `_suppressInterrupt` 标志：
- 在**非嵌套图**（顶层图）中使用 `stream()` 时，该标志为 `true`，导致 `GraphInterrupt` 被静默处理
- `invoke()` 会检查每个 chunk 是否包含 `__interrupt__` 标记，正确返回中断信息
- 在**嵌套图**（子图）中使用 `stream()` 时，中断会正常传播

---

## 8. checkpointer 依赖与配置

### 8.1 为什么 interrupt 必须依赖 checkpointer

```
interrupt() 暂停时：
  ┌──────────────────────────────────────────────┐
  │  1. 当前状态需要被保存                          │
  │  2. 恢复时需要知道从哪个节点继续                  │
  │  3. 需要知道 interrupt() 在哪个位置被调用         │
  │                                                │
  │  → 这些信息都存储在 checkpointer 中              │
  └──────────────────────────────────────────────┘
```

### 8.2 可用的 checkpointer 实现

| 实现 | 包 | 适用场景 |
|------|-----|---------|
| [`MemorySaver`](node_modules/@langchain/langgraph-checkpoint/dist/memory.d.ts) | `@langchain/langgraph` | 开发/测试，内存存储，重启丢失 |
| `SqliteSaver` | `@langchain/langgraph-checkpoint-sqlite` | 单机生产，持久化到 SQLite |
| `PostgresSaver` | `@langchain/langgraph-checkpoint-postgres` | 分布式生产，持久化到 PostgreSQL |

### 8.3 配置方式

```js
import { MemorySaver } from '@langchain/langgraph'

// 创建 checkpointer 实例
const checkpointer = new MemorySaver()

// 编译时注入
const app = graph.compile({ checkpointer })

// 调用时通过 thread_id 关联
const config = { configurable: { thread_id: 'my-thread-001' } }
```

### 8.4 不注入 checkpointer 的后果

```js
// ❌ 没有 checkpointer
const app = graph.compile()  // 未注入 checkpointer

// 调用 interrupt() 时会抛出错误：
// Error: interrupt() requires a checkpointer. 
// Please compile your graph with a checkpointer.
```

---

## 9. JS/Python API 差异速查

| 特性 | LangGraph.js | LangGraph (Python) |
|------|-------------|-------------------|
| `interrupt()` 签名 | `interrupt(value)` | `interrupt(value)` — **完全一致** |
| 恢复命令 | `new Command({ resume: value })` | `Command(resume=value)` |
| checkpointer 注入 | `graph.compile({ checkpointer })` | `graph.compile(checkpointer=checkpointer)` |
| 线程配置 | `{ configurable: { thread_id } }` | `{'configurable': {'thread_id': thread_id}}` |
| 中断检测 | `isInterrupted(result)` | `result.__interrupt__` 或 `is_interrupted(result)` |
| 中断数据键 | `INTERRUPT` 常量 | `'__interrupt__'` 字符串键 |
| 异常检测 | `isGraphInterrupt(err)` | `isinstance(err, GraphInterrupt)` |
| 状态定义 | `Annotation.Root({...})` | `TypedDict` 或 `MessagesState` |

### 9.1 关键差异详解

**① Command 构造方式**

```js
// JavaScript — 使用 new 构造函数
new Command({ resume: { approved: true } })
```

```python
# Python — 直接实例化
Command(resume={'approved': True})
```

**② checkpointer 注入方式**

```js
// JavaScript — 对象参数
graph.compile({ checkpointer: memorySaver })
```

```python
# Python — 关键字参数
graph.compile(checkpointer=memory_saver)
```

**③ 中断数据提取**

```js
// JavaScript — 使用 INTERRUPT 常量
import { INTERRUPT } from '@langchain/langgraph'
const interrupts = result[INTERRUPT]
```

```python
# Python — 使用字符串键
interrupts = result.__interrupt__
```

---

## 10. 常见问题与最佳实践

### 10.1 常见问题

**Q1: interrupt() 报错 "requires a checkpointer"？**

A: 必须在 `graph.compile()` 时注入 checkpointer：

```js
const app = graph.compile({ checkpointer: new MemorySaver() })
```

**Q2: 恢复执行后状态丢失？**

A: 恢复时必须使用**相同的 `thread_id`**：

```js
// 第一次调用
const config = { configurable: { thread_id: 'thread-001' } }
await app.invoke({ plan: '' }, config)

// 恢复调用 — 必须使用相同的 config
await app.invoke(new Command({ resume: value }), config)
```

**Q3: stream() 无法检测到中断？**

A: 使用 `invoke()` 替代 `stream()`。`stream()` 在非嵌套图中会 suppress 中断异常。

**Q4: 如何在 interrupt 中传递复杂数据？**

A: `interrupt()` 的参数可以是任意类型：

```js
const decision = interrupt({
  question: '请审批',
  plan: state.plan,
  metadata: { timestamp: Date.now(), priority: 'high' },
  options: ['批准', '拒绝', '修改']
})
```

**Q5: 多个节点都有 interrupt 时如何区分？**

A: 通过 `interrupt()` 传入的值中携带节点标识：

```js
// 节点 A
const decision = interrupt({ node: 'approval', plan: state.plan })

// 节点 B
const feedback = interrupt({ node: 'review', content: state.content })

// 调用方通过 interrupts[0].value.node 区分
```

### 10.2 最佳实践

**① 始终使用 try-catch 双重检测**

```js
async function safeInvoke(app, input, config) {
  try {
    const result = await app.invoke(input, config)
    if (isInterrupted(result)) {
      return { interrupted: true, data: result[INTERRUPT] }
    }
    return { interrupted: false, result }
  } catch (err) {
    if (isGraphInterrupt(err)) {
      return { interrupted: true, data: err.interrupts }
    }
    throw err
  }
}
```

**② 使用有意义的 interrupt 值**

```js
// ✅ 推荐：结构化数据，便于调用方解析
interrupt({
  type: 'approval_required',
  plan: state.plan,
  timestamp: Date.now()
})

// ❌ 不推荐：无结构的字符串
interrupt('请审批')
```

**③ 管理 thread_id 生命周期**

```js
// 为每个工作流会话生成唯一 thread_id
const threadId = `workflow-${Date.now()}-${Math.random().toString(36).slice(2)}`

// 完成后清理（可选）
// await checkpointer.deleteThread(threadId)
```

**④ 限制循环次数**

```js
const MAX_REVISIONS = 3

const revisePlan = async (state) => {
  // 在状态中追踪修订次数
  const revisionCount = (state.revisionCount || 0) + 1

  if (revisionCount > MAX_REVISIONS) {
    // 超过最大修订次数，强制通过
    return { plan: state.plan, approved: true, revisionCount }
  }

  const newPlan = await llm.invoke('根据反馈重新生成方案...')
  return { plan: newPlan.content, approved: false, revisionCount }
}
```

**⑤ 避免在 interrupt 节点中执行副作用**

```js
// ❌ 不推荐：在 interrupt 前执行副作用
const badNode = async (state) => {
  await sendNotification(state.plan)  // 副作用
  const decision = interrupt({ plan: state.plan })
  // 如果用户拒绝，通知已发送但无法撤回
}

// ✅ 推荐：在 interrupt 后、确认路由后执行副作用
const goodNode = (state) => {
  const decision = interrupt({ plan: state.plan })
  return { approved: decision.approved }
}

const executeNode = async (state) => {
  await sendNotification(state.plan)  // 仅在批准后执行
  return { result: 'done' }
}
```

---

> 📚 **下一步学习**：
> - [LangGraph.js 检查点 Checkpoint 详解](./LangGraph.js检查点Checkpoint详解.md) — 深入理解 interrupt 依赖的 checkpointer 机制
> - [LangGraph.js 短期记忆 Memory 详解](./LangGraph.js短期记忆Memory详解.md) — 理解 MemorySaver 的完整能力
> - [LangGraph.js 深入学习路线](./LangGraph.js深入学习路线.md) — 返回学习路线总览