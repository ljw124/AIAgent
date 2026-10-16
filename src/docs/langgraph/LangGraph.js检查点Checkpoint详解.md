# LangGraph.js Checkpoint 检查点与 Time Travel 详解

> 前置条件：已完成 [LangGraph.js 深入学习路线](./LangGraph.js深入学习路线.md) 的阶段七（MemorySaver 短期记忆），理解 `thread_id` 和 Checkpoint 基本概念。
>
> 目标：掌握 LangGraph 的 `getState()` / `getStateHistory()` / `updateState()` API，实现 Time Travel（回放/分叉），理解 Checkpoint 的底层数据结构与执行模型。
>
> 🆕 本文档与 [`LangGraphStage9Checkpoint.vue`](../../pages/langgraph/LangGraphStage9Checkpoint.vue) 组件配套，所有代码均可在浏览器中运行（内网大模型）。

---

## 目录

1. [Checkpoint 概述 — 什么是检查点](#1-checkpoint-概述--什么是检查点)
2. [Checkpoint 数据结构深入](#2-checkpoint-数据结构深入)
3. [getState — 查看当前状态快照](#3-getstate--查看当前状态快照)
4. [getStateHistory — 遍历历史检查点](#4-getstatehistory--遍历历史检查点)
5. [Time Travel：回放（Replay）](#5-time-travel回放replay)
6. [Time Travel：分叉（Fork）](#6-time-travel分叉fork)
7. [updateState — 手动修改状态](#7-updatestate--手动修改状态)
8. [线程管理与 Checkpoint 生命周期](#8-线程管理与-checkpoint-生命周期)
9. [Checkpoint 与 MemorySaver 的关系](#9-checkpoint-与-memorysaver-的关系)
10. [JS/Python API 差异速查](#10-jspython-api-差异速查)
11. [常见问题与最佳实践](#11-常见问题与最佳实践)

---

## 1. Checkpoint 概述 — 什么是检查点

### 1.1 概念

Checkpoint（检查点）是 LangGraph 在**每个超级步骤（superstep）执行后**自动保存的状态快照。它记录了图执行到某个时刻的完整状态，包括所有通道值、下一步要执行的节点、以及父检查点的引用。

```
┌─────────────────────────────────────────────────────────────────┐
│                    Checkpoint 执行模型                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  时间轴 →                                                        │
│                                                                 │
│  [用户输入] → [节点A执行] → [节点B执行] → [节点C执行] → [END]     │
│       │            │            │            │           │       │
│       ▼            ▼            ▼            ▼           ▼       │
│    CP#1         CP#2         CP#3         CP#4        CP#5      │
│  (parent:null) (parent:CP#1) (parent:CP#2) (parent:CP#3) (parent:CP#4) │
│                                                                 │
│  每个 Checkpoint 通过 parentConfig 形成单向链表                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 为什么需要 Checkpoint

| 能力 | 说明 | 对应 API |
|------|------|----------|
| **状态持久化** | 跨请求保持对话上下文（短期记忆） | `MemorySaver` + `thread_id` |
| **状态查询** | 随时查看当前执行状态 | [`getState()`](#3-getstate--查看当前状态快照) |
| **历史回溯** | 查看所有历史检查点 | [`getStateHistory()`](#4-getstatehistory--遍历历史检查点) |
| **回放（Replay）** | 从历史检查点重新执行 | [`invoke(null, cpConfig)`](#5-time-travel回放replay) |
| **分叉（Fork）** | 从历史检查点走不同路径 | [`invoke(newInput, cpConfig)`](#6-time-travel分叉fork) |
| **状态修改** | 手动修改检查点状态 | [`updateState()`](#7-updatestate--手动修改状态) |
| **中断恢复** | 人机协同中断后恢复执行 | `Command({ resume })` |

### 1.3 Checkpoint 与 MemorySaver 的关系

```
┌──────────────────────────────────────────┐
│              MemorySaver                  │
│  ┌────────────────────────────────────┐  │
│  │  storage: {                        │  │
│  │    "thread-001": {                 │  │
│  │      "": {                         │  │
│  │        "cp-uuid-1": [data, meta],  │  │  ← Checkpoint #1
│  │        "cp-uuid-2": [data, meta],  │  │  ← Checkpoint #2
│  │        "cp-uuid-3": [data, meta],  │  │  ← Checkpoint #3
│  │      }                             │  │
│  │    },                              │  │
│  │    "thread-002": { ... }           │  │
│  │  }                                 │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘

MemorySaver 是 Checkpoint 的存储引擎
Checkpoint 是 MemorySaver 中存储的数据单元
thread_id 是隔离不同对话的命名空间
```

> **关键理解**：`MemorySaver` 是存储层（*where*），`Checkpoint` 是数据单元（*what*），`getState/getStateHistory` 是查询接口（*how*）。

---

## 2. Checkpoint 数据结构深入

### 2.1 核心类型定义

```ts
// Checkpoint 核心数据
interface Checkpoint {
  v: number                              // Checkpoint 格式版本（当前为 4）
  id: string                             // Checkpoint ID（uuid6 格式）
  ts: string                             // 时间戳（ISO 8601）
  channel_values: Record<string, unknown> // 通道值（如 messages、自定义状态字段）
  channel_versions: Record<string, number> // 通道版本号（用于增量更新）
  versions_seen: Record<string, Record<string, number>> // 节点已见版本
}

// Checkpoint 元数据
interface CheckpointMetadata {
  source: 'input' | 'loop' | 'update' | 'fork'  // 来源
  step: number                                    // 超级步骤编号
  writes: Record<string, unknown> | null          // 本次写入的通道更新
  parents: Record<string, string>                 // 父检查点映射
}

// Checkpoint 元组（getState/getStateHistory 返回）
interface CheckpointTuple {
  config: RunnableConfig              // 包含 thread_id + checkpoint_id 的配置
  checkpoint: Checkpoint              // Checkpoint 数据
  metadata?: CheckpointMetadata       // 元数据
  parentConfig?: RunnableConfig       // 父 Checkpoint 配置（形成链）
  pendingWrites?: PendingWrite[]      // 待处理的写入（中断时）
}

// StateSnapshot（getState 返回的高层封装）
interface StateSnapshot {
  values: Record<string, unknown>     // 当前状态值
  next: string[]                      // 下一步要执行的节点列表（空数组 = 已结束）
  config: RunnableConfig              // 当前检查点配置
  parentConfig?: RunnableConfig       // 父检查点配置
  createdAt?: string                  // 创建时间
  metadata?: CheckpointMetadata       // 元数据
  tasks?: PregelTask[]                // 待执行的任务
}
```

### 2.2 Checkpoint 链结构

```
CP#1 (parent: null)
  │
  ├── config: { configurable: { thread_id: "t1", checkpoint_id: "cp-001" } }
  ├── values: { messages: [HumanMessage("你好")] }
  ├── next: ["agent"]
  └── metadata: { step: 0, source: "input" }
       │
       ▼
CP#2 (parent: CP#1)
  │
  ├── config: { configurable: { thread_id: "t1", checkpoint_id: "cp-002" } }
  ├── parentConfig: { configurable: { thread_id: "t1", checkpoint_id: "cp-001" } }
  ├── values: { messages: [HumanMessage("你好"), AIMessage("你好！")] }
  ├── next: []
  └── metadata: { step: 1, source: "loop" }
```

### 2.3 channel_values 详解

`channel_values` 是 Checkpoint 的核心，存储了图执行到该时刻的所有状态值：

```js
// 典型 channel_values 示例
{
  messages: [
    HumanMessage { content: "我叫张三" },
    AIMessage { content: "你好张三！" },
    HumanMessage { content: "我叫什么名字？" },
    AIMessage { content: "你叫张三。" }
  ],
  // 自定义状态字段（如果定义了 Annotation）
  summaryResult: "...",
  translateResult: "..."
}
```

---

## 3. getState — 查看当前状态快照

### 3.1 API 签名

```js
const snapshot = await graph.getState(config: RunnableConfig): Promise<StateSnapshot>
```

### 3.2 参数说明

| 参数 | 类型 | 说明 |
|------|------|------|
| `config` | `RunnableConfig` | 必须包含 `configurable.thread_id` |
| `config.configurable.thread_id` | `string` | 线程 ID，用于隔离不同对话 |
| `config.configurable.checkpoint_id` | `string`（可选） | 指定检查点 ID，不传则返回最新 |

### 3.3 返回值 StateSnapshot

| 字段 | 类型 | 说明 |
|------|------|------|
| `values` | `Record<string, unknown>` | 当前状态的所有值 |
| `next` | `string[]` | 下一步要执行的节点列表（空数组 = 已结束） |
| `config` | `RunnableConfig` | 当前检查点的完整配置 |
| `parentConfig` | `RunnableConfig \| undefined` | 父检查点配置 |
| `createdAt` | `string \| undefined` | 检查点创建时间（ISO 8601） |
| `metadata` | `CheckpointMetadata \| undefined` | 元数据（含 step、source 等） |
| `tasks` | `PregelTask[] \| undefined` | 待执行的任务列表 |

### 3.4 实战代码

```js
import { MemorySaver } from '@langchain/langgraph'
import { createReactAgent } from '@langchain/langgraph/prebuilt'

const memorySaver = new MemorySaver()
const agent = createReactAgent({
  llm,
  tools: [calculatorTool],
  checkpointer: memorySaver
})

// 执行一轮对话
await agent.invoke(
  { messages: [new HumanMessage('你好，我叫张三')] },
  { configurable: { thread_id: 'demo-001' } }
)

// 查看当前状态快照
const snapshot = await agent.getState({
  configurable: { thread_id: 'demo-001' }
})

console.log(snapshot.values.messages.length)  // 2（用户消息 + AI 回复）
console.log(snapshot.next)                     // []（已结束）
console.log(snapshot.config.configurable.checkpoint_id)  // "1f7a3b2c..."
console.log(snapshot.parentConfig?.configurable?.checkpoint_id) // 父检查点 ID
console.log(snapshot.metadata?.step)           // 1
```

### 3.5 组件中的实际应用

在 [`LangGraphStage9Checkpoint.vue`](../../pages/langgraph/LangGraphStage9Checkpoint.vue) 中，`refreshState()` 方法封装了 `getState`：

```js
async refreshState() {
  const agent = this.buildAgent()
  const config = { configurable: { thread_id: this.currentThreadId } }
  const snapshot = await agent.getState(config)

  if (snapshot && snapshot.values) {
    const msgs = snapshot.values.messages || []
    this.currentState = {
      checkpointId: snapshot.config?.configurable?.checkpoint_id?.substring(0, 8),
      nextNodes: snapshot.next || [],
      messageCount: msgs.length,
      createdAt: this.formatTime(snapshot.createdAt),
      parentCheckpointId: snapshot.parentConfig?.configurable?.checkpoint_id?.substring(0, 8)
    }
  }
}
```

---

## 4. getStateHistory — 遍历历史检查点

### 4.1 API 签名

```js
const historyIterator = graph.getStateHistory(config: RunnableConfig): AsyncGenerator<StateSnapshot>
```

### 4.2 参数说明

| 参数 | 类型 | 说明 |
|------|------|------|
| `config` | `RunnableConfig` | 必须包含 `configurable.thread_id` |
| `config.configurable.checkpoint_id` | `string`（可选） | 从指定检查点开始回溯，不传则从最新开始 |

### 4.3 遍历顺序

`getStateHistory` 返回一个**异步迭代器**，按**时间倒序**（最新 → 最旧）遍历：

```
getStateHistory 遍历顺序：
  CP#5 (最新) → CP#4 → CP#3 → CP#2 → CP#1 (最旧)
```

### 4.4 实战代码

```js
// 遍历所有历史检查点
const history = []
for await (const snapshot of agent.getStateHistory({
  configurable: { thread_id: 'demo-001' }
})) {
  history.push({
    checkpointId: snapshot.config?.configurable?.checkpoint_id,
    messageCount: snapshot.values?.messages?.length || 0,
    step: snapshot.metadata?.step,
    nextNodes: snapshot.next || [],
    parentCheckpointId: snapshot.parentConfig?.configurable?.checkpoint_id
  })
}

console.log(`共 ${history.length} 个检查点`)
// 输出示例：
// [
//   { checkpointId: "cp-005", messageCount: 8, step: 4, nextNodes: [] },
//   { checkpointId: "cp-004", messageCount: 6, step: 3, nextNodes: ["agent"] },
//   { checkpointId: "cp-003", messageCount: 4, step: 2, nextNodes: ["tools"] },
//   { checkpointId: "cp-002", messageCount: 2, step: 1, nextNodes: [] },
//   { checkpointId: "cp-001", messageCount: 1, step: 0, nextNodes: ["agent"] }
// ]
```

### 4.5 从指定检查点回溯

```js
// 从 CP#3 开始回溯（只返回 CP#3、CP#2、CP#1）
for await (const snapshot of agent.getStateHistory({
  configurable: {
    thread_id: 'demo-001',
    checkpoint_id: 'cp-003-full-uuid'
  }
})) {
  // 只会遍历 CP#3 及更早的检查点
}
```

### 4.6 组件中的实际应用

```js
async refreshHistory() {
  const agent = this.buildAgent()
  const config = { configurable: { thread_id: this.currentThreadId } }
  const history = []

  for await (const snapshot of agent.getStateHistory(config)) {
    const msgs = snapshot.values?.messages || []
    history.push({
      checkpointId: snapshot.config?.configurable?.checkpoint_id?.substring(0, 8),
      fullCheckpointId: snapshot.config?.configurable?.checkpoint_id,
      config: snapshot.config,           // ⚠️ 保存完整 config，用于 Time Travel
      parentConfig: snapshot.parentConfig,
      messageCount: msgs.length,
      step: snapshot.metadata?.step || '?',
      createdAt: this.formatTime(snapshot.createdAt),
      parentCheckpointId: snapshot.parentConfig?.configurable?.checkpoint_id?.substring(0, 8),
      nextNodes: snapshot.next || []
    })
  }

  this.checkpointHistory = history
}
```

---

## 5. Time Travel：回放（Replay）

### 5.1 什么是回放

回放（Replay）是从一个历史检查点**重新执行**图，不追加新输入。它让你可以"重播"过去的执行过程，查看中间状态。

```
原始执行路径：
  CP#1 → CP#2 → CP#3 → CP#4 → CP#5

回放 CP#3：
  CP#3 → [重新执行] → CP#3' → CP#4' → CP#5'
         ↑ 从 CP#3 的状态开始，重新走后续节点
```

### 5.2 API 用法

```js
// 传入 null 表示不追加新输入，仅重放
const result = await agent.invoke(null, checkpointConfig)
```

**关键点**：
- 第一个参数传 `null`（不是 `{}`，不是 `undefined`）
- 第二个参数是历史检查点的 `config`（从 `getStateHistory` 中获取的 `snapshot.config`）
- 回放会创建**新的检查点**，不会覆盖原有检查点

### 5.3 实战代码

```js
// 1. 先执行几轮对话
await agent.invoke(
  { messages: [new HumanMessage('我叫张三')] },
  { configurable: { thread_id: 'demo-001' } }
)
await agent.invoke(
  { messages: [new HumanMessage('我喜欢吃火锅')] },
  { configurable: { thread_id: 'demo-001' } }
)

// 2. 获取历史检查点
const history = []
for await (const snapshot of agent.getStateHistory({
  configurable: { thread_id: 'demo-001' }
})) {
  history.push(snapshot)
}

// 3. 选择第 2 个检查点（第一轮对话后），回放
const targetCP = history[1]  // 第一轮对话后的检查点
const result = await agent.invoke(null, targetCP.config)

// result.messages 将包含从 CP#2 重新执行后的完整消息
// 注意：回放会重新调用 LLM，可能产生不同的回复
```

### 5.4 组件中的实际应用

```js
async replayFromCheckpoint() {
  // 从 checkpointHistory 中找到选中的检查点
  const cp = this.checkpointHistory.find(
    c => c.checkpointId === this.selectedCheckpointId
  )

  const agent = this.buildAgent()

  // ⚠️ 传入 null + 历史 config，触发回放
  const result = await agent.invoke(null, cp.config)

  // 更新 UI 消息列表
  this.messages = result.messages.map(m => ({
    role: m._getType() === 'human' ? 'user' : 'assistant',
    content: m.content
  }))
}
```

### 5.5 回放的典型场景

| 场景 | 说明 |
|------|------|
| **调试** | 回放某个中间步骤，检查 LLM 在那个时刻的决策 |
| **审计** | 重现用户报告的异常行为 |
| **对比测试** | 用不同模型回放同一检查点，对比输出质量 |
| **教学** | 展示图执行到某一步时的内部状态 |

---

## 6. Time Travel：分叉（Fork）

### 6.1 什么是分叉

分叉（Fork）是从一个历史检查点**继续执行**，但传入**新的输入**。这会创建一个新的执行分支，原有分支不受影响。

```
原始执行路径：
  CP#1 → CP#2 → CP#3 → CP#4 → CP#5

分叉 CP#3（传入新输入）：
  CP#3 → [新输入] → CP#3' → CP#4' → CP#5'
         ↑ 从 CP#3 的状态 + 新消息，走不同路径
```

### 6.2 API 用法

```js
// 传入新消息 + 历史检查点 config
const result = await agent.invoke(
  { messages: [new HumanMessage('新问题')] },
  checkpointConfig
)
```

**关键点**：
- 第一个参数传入**新的消息**（不是 `null`）
- 第二个参数是历史检查点的 `config`
- 新消息会**追加**到历史检查点的消息列表中
- 分叉创建**新的检查点分支**，原分支不受影响

### 6.3 实战代码

```js
// 1. 先执行几轮对话
await agent.invoke(
  { messages: [new HumanMessage('我叫张三，今年25岁')] },
  { configurable: { thread_id: 'demo-001' } }
)
await agent.invoke(
  { messages: [new HumanMessage('我喜欢吃火锅')] },
  { configurable: { thread_id: 'demo-001' } }
)

// 2. 获取第一轮对话后的检查点
const history = []
for await (const snapshot of agent.getStateHistory({
  configurable: { thread_id: 'demo-001' }
})) {
  history.push(snapshot)
}
const firstRoundCP = history[1]  // 第一轮对话后

// 3. 从第一轮分叉：问不同的问题
const forkResult = await agent.invoke(
  { messages: [new HumanMessage('我今年多大？')] },
  firstRoundCP.config
)
// AI 会回答 "你今年25岁"（因为分叉点保留了"我叫张三，今年25岁"的上下文）
// 但不会知道"火锅"（那是分叉点之后的信息）
```

### 6.4 组件中的实际应用

```js
async forkFromCheckpoint() {
  const cp = this.checkpointHistory.find(
    c => c.checkpointId === this.selectedCheckpointId
  )

  const agent = this.buildAgent()

  // ⚠️ 传入新消息 + 历史 config，触发分叉
  const result = await agent.invoke(
    { messages: [new HumanMessage(this.forkInput)] },
    cp.config
  )

  // 更新 UI 消息列表
  this.messages = result.messages.map(m => ({
    role: m._getType() === 'human' ? 'user' : 'assistant',
    content: m.content
  }))
}
```

### 6.5 回放 vs 分叉对比

| 特性 | 回放（Replay） | 分叉（Fork） |
|------|---------------|-------------|
| 输入 | `null` | 新消息 |
| 行为 | 从检查点重新执行原路径 | 从检查点走新路径 |
| LLM 调用 | 重新调用（可能不同输出） | 处理新输入 |
| 检查点 | 创建新检查点 | 创建新分支 |
| 典型场景 | 调试、审计、对比 | A/B 测试、假设分析、错误恢复 |
| 状态变化 | 可能覆盖后续状态 | 创建独立分支 |

---

## 7. updateState — 手动修改状态

### 7.1 API 签名

```js
const result = await graph.updateState(config, values): Promise<RunnableConfig>
```

### 7.2 参数说明

| 参数 | 类型 | 说明 |
|------|------|------|
| `config` | `RunnableConfig` | 必须包含 `thread_id`，可选 `checkpoint_id` |
| `values` | `Record<string, unknown>` | 要更新的状态键值对 |

### 7.3 作用

`updateState` 允许你**手动修改**某个检查点的状态值，就像图在那个时刻产生了不同的输出。这在以下场景非常有用：

- **修正错误**：LLM 给出了错误答案，手动修正后继续
- **注入上下文**：在某个检查点注入额外的上下文信息
- **模拟中断恢复**：模拟 `interrupt` 后的 `Command({ resume })` 行为

### 7.4 实战代码

```js
// 1. 执行一轮对话
await agent.invoke(
  { messages: [new HumanMessage('1+1等于几？')] },
  { configurable: { thread_id: 'demo-001' } }
)
// AI 可能回答 "1+1等于2"

// 2. 获取当前状态
const snapshot = await agent.getState({
  configurable: { thread_id: 'demo-001' }
})

// 3. 手动修改状态：把 AI 的回复改成错误的
const messages = [...snapshot.values.messages]
messages.push(new AIMessage('1+1等于3'))  // 故意改成错误答案

await agent.updateState(
  { configurable: { thread_id: 'demo-001' } },
  { messages }
)

// 4. 继续对话
const result = await agent.invoke(
  { messages: [new HumanMessage('你确定吗？再算一遍')] },
  { configurable: { thread_id: 'demo-001' } }
)
// AI 会基于被修改后的上下文（认为之前说了"1+1=3"）来回复
```

### 7.5 updateState vs Fork

| 操作 | 方式 | 效果 |
|------|------|------|
| `updateState` | 直接修改检查点的 `channel_values` | 修改历史状态，后续执行基于修改后的状态 |
| Fork | 从历史检查点 + 新输入继续执行 | 创建新分支，不修改原检查点 |

---

## 8. 线程管理与 Checkpoint 生命周期

### 8.1 thread_id 的作用

`thread_id` 是 Checkpoint 系统的**命名空间**，用于隔离不同对话/会话：

```
MemorySaver 存储结构：
  thread_id: "user-001-session-a"
    ├── checkpoint_1
    ├── checkpoint_2
    └── checkpoint_3

  thread_id: "user-001-session-b"
    ├── checkpoint_1
    └── checkpoint_2

  thread_id: "user-002-session-a"
    └── checkpoint_1
```

### 8.2 线程操作

```js
// 创建新线程（只需使用新的 thread_id）
const newConfig = { configurable: { thread_id: 'new-thread-' + Date.now() } }
await agent.invoke(
  { messages: [new HumanMessage('你好')] },
  newConfig
)

// 切换线程（只需改变 config 中的 thread_id）
const configA = { configurable: { thread_id: 'thread-a' } }
const configB = { configurable: { thread_id: 'thread-b' } }

// 删除线程（清理所有 Checkpoint）
await memorySaver.deleteThread('thread-a')
```

### 8.3 Checkpoint 生命周期

```
创建：每次 superstep 执行后自动创建
  ↓
查询：getState / getStateHistory
  ↓
回放/分叉：invoke(null, cpConfig) / invoke(newInput, cpConfig)
  ↓
删除：memorySaver.deleteThread(threadId)
```

> **注意**：`MemorySaver` 存储在内存中，页面刷新后所有 Checkpoint 丢失。生产环境应使用持久化 Checkpointer（如 `PostgresSaver`、`SqliteSaver`）。

---

## 9. Checkpoint 与 MemorySaver 的关系

### 9.1 架构层次

```
┌─────────────────────────────────────────────────────────┐
│                    应用层                                │
│  getState() / getStateHistory() / updateState()         │
│  invoke(null, cpConfig) — Replay                        │
│  invoke(newInput, cpConfig) — Fork                      │
├─────────────────────────────────────────────────────────┤
│                    Checkpoint 抽象层                      │
│  StateSnapshot / CheckpointTuple / Checkpoint            │
├─────────────────────────────────────────────────────────┤
│                    存储层                                │
│  MemorySaver (内存) / PostgresSaver / SqliteSaver        │
│  BaseCheckpointSaver 接口                                │
└─────────────────────────────────────────────────────────┘
```

### 9.2 MemorySaver 核心方法

| 方法 | 说明 | 对应高层 API |
|------|------|-------------|
| `getTuple(config)` | 获取最新 Checkpoint | `getState()` |
| `list(config, options)` | 列出历史 Checkpoint | `getStateHistory()` |
| `put(config, checkpoint, metadata)` | 保存新 Checkpoint | 自动调用（每次 superstep 后） |
| `putWrites(config, writes, taskId)` | 保存中间写入 | 自动调用（中断时） |
| `deleteThread(threadId)` | 删除线程所有数据 | 手动调用 |

### 9.3 自定义 Checkpointer

```js
import { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint'

class MyRedisSaver extends BaseCheckpointSaver {
  async getTuple(config) { /* 从 Redis 读取 */ }
  async list(config, options) { /* 从 Redis 列出 */ }
  async put(config, checkpoint, metadata) { /* 写入 Redis */ }
  async putWrites(config, writes, taskId) { /* 写入 Redis */ }
  async deleteThread(threadId) { /* 从 Redis 删除 */ }
}
```

---

## 10. JS/Python API 差异速查

| 操作 | LangGraph.js | LangGraph (Python) |
|------|-------------|-------------------|
| 获取当前状态 | `graph.getState(config)` | `graph.get_state(config)` |
| 遍历历史 | `for await (s of graph.getStateHistory(config))` | `for s in graph.get_state_history(config)` |
| 更新状态 | `graph.updateState(config, values)` | `graph.update_state(config, values)` |
| 回放 | `graph.invoke(null, cpConfig)` | `graph.invoke(None, cp_config)` |
| 分叉 | `graph.invoke({messages: [...]}, cpConfig)` | `graph.invoke({"messages": [...]}, cp_config)` |
| 状态快照类型 | `StateSnapshot` | `StateSnapshot` |
| Checkpoint 存储 | `MemorySaver` | `MemorySaver` |
| 删除线程 | `memorySaver.deleteThread(tid)` | `memory_saver.delete_thread(tid)` |

> **关键一致性**：JS 和 Python 版本的 Checkpoint API 高度一致，核心概念（StateSnapshot、CheckpointTuple、parentConfig 链）完全相同。主要差异是命名风格（camelCase vs snake_case）和迭代器语法（`for await...of` vs `for...in`）。

---

## 11. 常见问题与最佳实践

### 11.1 常见问题

**Q1: getState 返回 null 怎么办？**

说明该线程还没有任何 Checkpoint。需要先执行至少一次 `invoke()` 或 `stream()`。

**Q2: getStateHistory 返回空列表？**

同样是因为线程还没有执行记录。先发送一条消息后再查询。

**Q3: 回放会修改原检查点吗？**

不会。回放会创建**新的检查点**，原检查点保持不变。你可以通过 `getStateHistory` 看到新的检查点被追加。

**Q4: 分叉后原分支还能访问吗？**

可以。分叉创建的是新检查点，原分支的检查点仍然存在。但需要注意：如果使用同一个 `thread_id`，分叉后的新检查点会成为该线程的"最新"状态。

**Q5: MemorySaver 的数据什么时候丢失？**

页面刷新或进程重启后。`MemorySaver` 是纯内存存储，不持久化。生产环境建议使用 `PostgresSaver` 或 `SqliteSaver`。

**Q6: 如何限制 getStateHistory 返回的数量？**

```js
// 方法1：手动计数
let count = 0
for await (const snapshot of agent.getStateHistory(config)) {
  if (count++ >= 10) break
  // 处理 snapshot
}

// 方法2：从指定 checkpoint_id 开始回溯
for await (const snapshot of agent.getStateHistory({
  configurable: { thread_id: 'xxx', checkpoint_id: 'specific-cp-id' }
})) {
  // 只返回该检查点及更早的
}
```

### 11.2 最佳实践

1. **保存完整 config**：从 `getStateHistory` 获取的 `snapshot.config` 包含 `checkpoint_id`，必须完整保存才能用于回放/分叉
2. **thread_id 命名规范**：使用有意义的命名，如 `user-{userId}-session-{sessionId}`
3. **定期清理**：对于长时间运行的线程，定期调用 `deleteThread` 清理旧检查点，避免内存膨胀
4. **回放前确认**：回放会重新调用 LLM，确保用户知晓这会消耗 API 配额
5. **分叉用于 A/B 测试**：从同一检查点分叉，传入不同输入，对比模型表现
6. **updateState 谨慎使用**：手动修改状态可能导致状态不一致，优先使用 Fork
7. **生产环境持久化**：使用 `PostgresSaver` 或自定义 `BaseCheckpointSaver` 实现持久化

---

## 相关文档

- [LangGraph.js 深入学习路线](./LangGraph.js深入学习路线.md) — 完整 13 阶段学习路径
- [LangGraph.js 短期记忆 Memory 详解](./LangGraph.js短期记忆Memory详解.md) — MemorySaver 底层机制
- [LangGraph.js 长期记忆 Store 详解](./LangGraph.js长期记忆Store详解.md) — 跨线程持久化存储
- [LangGraphStage9Checkpoint.vue](../../pages/langgraph/LangGraphStage9Checkpoint.vue) — 配套可运行组件（含 getState/getStateHistory/Replay/Fork 完整演示）