# LangGraph.js 流式 Streaming 详解 — 5 种 streamMode 全解析

> 对应示例组件：[`LangGraphStage12Streaming.vue`](../../pages/langgraph/LangGraphStage12Streaming.vue)（阶段十二）
> 代码示例：[`langgraphStreamingSamples.js`](../../composables/langgraphStreamingSamples.js)
> 官网依据：[Concepts → Streaming](https://langchain-ai.github.io/langgraphjs/concepts/streaming/)
>
> Streaming 是 LangGraph 官网的核心章节，也是前端 LLM 应用体验的关键——没有流式输出，用户就要盯着空白页面等待完整响应。本篇系统讲解 LangGraph.js 的 5 种 `streamMode`、节点内自定义流（`getWriter`）、多模式组合与子图流式透传。

---

## 目录

1. [为什么需要 Streaming](#1-为什么需要-streaming)
2. [stream() 基本用法](#2-stream-基本用法)
3. [5 种 streamMode 全解析](#3-5-种-streammode-全解析)
4. [messages 模式：打字机效果核心](#4-messages-模式打字机效果核心)
5. [custom 模式与 getWriter 自定义流](#5-custom-模式与-getwriter-自定义流)
6. [多模式组合](#6-多模式组合)
7. [子图流式透传](#7-子图流式透传)
8. [Functional API 的流式](#8-functional-api-的流式)
9. [与 Vue 前端结合实战](#9-与-vue-前端结合实战)
10. [JS 与 Python 对照](#10-js-与-python-对照)
11. [最佳实践与选型指南](#11-最佳实践与选型指南)

---

## 1. 为什么需要 Streaming

### 1.1 没有流式的痛点

```
用户提问 ──invoke()──▶ [节点A 3s] ──▶ [节点B 5s] ──▶ 完整结果
                        ▲ 用户盯着空白页等 8 秒
```

- LLM 生成 500 字回答需要 5~15 秒，`invoke()` 要等全部生成完才返回
- 多节点图的总延迟 = 各节点延迟之和，等待时间成倍放大
- 用户无法感知「系统在干活」，体验极差

### 1.2 流式带来的改变

```
用户提问 ──stream()──▶ ⌨️ 令牌流（逐字出现）
                       📦 节点进度（analyze 完成 → respond 执行中）
                       📡 自定义事件（"正在检索知识库..."）
```

- **打字机效果**：LLM 每生成一个令牌就推给前端，首字延迟从秒级降到毫秒级
- **过程可见**：每个节点完成即推送增量，用户知道执行到哪一步
- **业务事件**：节点内部可以推送任意自定义事件（进度、阶段、日志）

### 1.3 LangChain 层 vs LangGraph 层的流式

| 层级 | API | 覆盖范围 | 本项目位置 |
|------|-----|----------|------------|
| LangChain 模型层 | `llm.stream()` | 单次 LLM 调用的令牌流 | [LangChainStage3Stream.vue](../../pages/langchain/LangChainStage3Stream.vue) |
| LangChain 链层 | `chain.stream()` | 整条 LCEL 链的流式 | 同上 |
| **LangGraph 图层** | `graph.stream(input, { streamMode })` | **整个图执行过程**（状态+令牌+自定义事件） | 本篇 |

LangGraph 的流式是「超集」：不仅能拿 LLM 令牌，还能拿图状态演变和节点内自定义事件。

---

## 2. stream() 基本用法

### 2.1 基本形态

```js
// graph.stream() 返回 async iterable，用 for await 消费
for await (const chunk of await graph.stream(input, { streamMode: 'updates' })) {
  console.log(chunk)
}
```

三个关键点：

1. **`await graph.stream(...)`**：先 await 得到 async iterable（不是直接 for await 一个 Promise）
2. **`streamMode`**：决定输出什么类型的事件（下节详解），默认 `'values'`
3. **chunk 形态由 streamMode 决定**：单模式时 chunk 就是数据；多模式（数组）时 chunk 是 `[mode, data]` 元组

### 2.2 与 invoke() 的关系

```js
// invoke = stream 的「收尾」：只拿最终状态
const final = await graph.invoke(input, config)

// stream = invoke 的「过程」：每个超步都推送事件，最后也有完整状态
for await (const chunk of await graph.stream(input, config)) { ... }
```

两者执行的是同一个图、产生同样的检查点。区别只在「过程事件是否暴露给调用方」。

### 2.3 config 传递

```js
// stream 的第二个参数与 invoke 完全一致：
// configurable（thread_id 等）、recursionLimit、callbacks、tags...
for await (const chunk of await graph.stream(
  input,
  { configurable: { thread_id: 't1' }, recursionLimit: 25, streamMode: 'updates' }
)) { ... }
```

---

## 3. 5 种 streamMode 全解析

### 3.1 总览表

| streamMode | 输出内容 | 数据形态 | 粒度 | 典型场景 |
|------------|----------|----------|------|----------|
| `values` | 每个超步后的**完整状态** | `State` 对象 | 节点级 | 状态面板、调试状态演变 |
| `updates` | 每个超步的**节点增量** | `{ nodeName: partialState }` | 节点级 | 节点进度展示 |
| `messages` | LLM 输出的**令牌流** | `[messageChunk, metadata]` 元组 | 令牌级 ⭐ | 前端打字机效果 |
| `custom` | 节点内 `writer()` 推送的**自定义事件** | 任意（原样透传） | 事件级 | 进度、阶段提示、业务事件 |
| `debug` | 引擎调试事件 | `{ type, payload }` | 引擎级 | 排查执行细节 |

### 3.2 values — 完整状态快照

每个超步（superstep）结束后，输出**累积到当前为止的完整状态**：

```js
// 图：START → analyze → respond → END
for await (const chunk of await graph.stream(input, { streamMode: 'values' })) {
  console.log(chunk)
}
// 输出 3 次：
// 第1次（初始输入）: { question: '为什么天是蓝的？' }
// 第2次（analyze 后）: { question: '...', steps: ['瑞利散射...', '大气层...'] }
// 第3次（respond 后）: { question: '...', steps: [...], answer: '天空呈蓝色是因为...' }
```

特点：

- 每条 chunk 都是**全量**，不依赖前序事件即可使用（天然幂等，适合状态面板直接渲染）
- 状态大时冗余高（N 个节点输出 N 份全量）

### 3.3 updates — 节点增量

每个超步只输出**该步执行的节点返回的增量**，键是节点名：

```js
for await (const chunk of await graph.stream(input, { streamMode: 'updates' })) {
  console.log(chunk)
}
// 输出 2 次：
// { analyze: { steps: ['瑞利散射...', '大气层...'] } }
// { respond: { answer: '天空呈蓝色是因为...' } }
```

特点：

- 数据量小，语义清晰（「哪个节点返回了什么」）
- 前端可据此做节点级进度条/步骤高亮
- 并行节点（Send）时同一超步可能包含多个键

### 3.4 messages — LLM 令牌流 ⭐

捕获图内**所有 LLM 调用**的输出令牌，输出 `[messageChunk, metadata]` 元组：

```js
for await (const [message, metadata] of await graph.stream(input, { streamMode: 'messages' })) {
  if (typeof message.content === 'string' && message.content) {
    console.log(metadata.langgraph_node, message.content)
  }
}
// metadata.langgraph_node 标识令牌来自哪个节点：
// analyze "1. 瑞利散射..."
// analyze "2. 大气层..."
// respond "天空呈蓝色..."
```

特点：

- **粒度最细**（令牌级），是打字机效果的数据源
- 图内每个 LLM 调用的令牌都会出现（包括中间节点），需用 `metadata.langgraph_node` 过滤
- `messageChunk` 是 `AIMessageChunk`，`content` 可能是字符串或 content blocks 数组

### 3.5 custom — 自定义事件

接收节点内部通过 `getWriter()` 推送的任意内容（详见 §5）：

```js
for await (const chunk of await graph.stream(input, { streamMode: 'custom' })) {
  console.log(chunk)  // writer() 推送的原样内容
}
```

### 3.6 debug — 调试事件

输出引擎级调试事件（任务调度、检查点写入全过程）：

```js
for await (const chunk of await graph.stream(input, { streamMode: 'debug' })) {
  console.log(chunk.type)  // 'task' | 'checkpoint' | ...
}
```

特点：

- 事件量最大，信息最底层（每个任务的开始/结束、每次检查点写入）
- 仅用于排查图执行问题，生产环境不要开启

### 3.7 选型速查

```
要打字机效果？            → messages（过滤 metadata.langgraph_node）
要节点进度条？            → updates
要状态面板（全量渲染）？    → values
要业务进度/阶段提示？      → custom + getWriter
要排查图执行细节？        → debug
都要？                    → 数组组合（见 §6）
```

---

## 4. messages 模式：打字机效果核心

### 4.1 数据形态

`messages` 模式输出元组 `[messageChunk, metadata]`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `messageChunk` | `AIMessageChunk` | 令牌增量；`content` 为字符串或 content blocks |
| `metadata.langgraph_node` | `string` | 令牌来源节点名（**过滤中间节点输出的关键**） |
| `metadata.langgraph_step` | `number` | 超步序号 |
| `metadata.langgraph_triggers` | `string[]` | 触发该节点执行的边 |

### 4.2 过滤中间节点

多节点图中每个 LLM 调用的令牌都会出现在 `messages` 流里。前端通常只渲染「最终回答节点」：

```js
for await (const [message, metadata] of await graph.stream(input, { streamMode: 'messages' })) {
  const text = typeof message.content === 'string' ? message.content : ''
  if (text && metadata.langgraph_node === 'respond') {
    // 只拼接 respond 节点的令牌 → 干净的打字机文本
    // ⚠️ 节点名不能与状态字段（channel）同名：状态字段是 answer，节点名用 respond
    this.typewriterText += text
  }
}
```

### 4.3 完整 Vue 打字机组件模式

```vue
<template>
  <div class="typewriter">{{ text }}<span v-if="loading" class="cursor">▌</span></div>
</template>

<script>
// methods 中：
async run() {
  this.loading = true
  this.text = ''
  for await (const [message, metadata] of await graph.stream(
    { question: this.question },
    { streamMode: 'messages' }
  )) {
    const t = typeof message.content === 'string' ? message.content : ''
    if (t && metadata.langgraph_node === 'respond') {
      this.text += t   // Vue 响应式自动更新视图
    }
  }
  this.loading = false
}
</script>
```

要点：

- Vue 的响应式系统让 `this.text += t` 直接驱动视图更新，无需手动 DOM 操作
- `content` 可能是数组（多模态/content blocks），先判断 `typeof === 'string'`
- 流结束后可再发一次 `updates`/`invoke` 拿结构化最终状态（如果需要）

---

## 5. custom 模式与 getWriter 自定义流

### 5.1 getWriter 基本用法

```js
import { getWriter } from '@langchain/langgraph'

const analyzeNode = async (state, config) => {
  // ⚠️ 浏览器等无 AsyncLocalStorage 的环境必须传入节点函数第二参数 config
  const writer = getWriter(config)    // 节点内部调用，返回可直接调用的函数
  writer('🔍 正在分析问题：' + state.question)   // 推送自定义事件

  const msg = await llm.invoke([...])
  writer('✅ 分析完成')

  return { steps: [...] }
}

// 消费端：只有 streamMode 含 'custom' 时事件才进入流
for await (const chunk of await graph.stream(input, { streamMode: 'custom' })) {
  console.log(chunk)  // '🔍 正在分析问题：...' / '✅ 分析完成'
}
```

### 5.2 关键行为

| 行为 | 说明 |
|------|------|
| 返回值 | **可直接调用的函数**（JS 版没有 `writer.write()` 包装，直接 `writer(x)`） |
| 生效条件 | 仅当 `stream` 配置的 `streamMode` 包含 `'custom'`；否则 `writer` 可能为 `undefined`，**调用前请判空** `if (typeof writer === 'function')` |
| 调用位置 | **StateGraph 节点内**（节点函数签名 `async (state, config)`，config 由框架注入）；**Functional API 的 task 内不行**，见 §8 |
| 内容类型 | 任意可序列化值：字符串、对象、数字……原样透传给消费端 |
| 获取失败 | 无 AsyncLocalStorage 的环境（如浏览器）**直接抛异常** `Config not retrievable...`；节点函数签名必须为 `async (state, config)`，并传入 `getWriter(config)`（不传参会退回 AsyncLocalStorage 兜底，浏览器中必然失败） |

### 5.3 推送结构化事件

`writer()` 不限于字符串，推荐推送结构化对象便于前端路由：

```js
writer({ type: 'progress', node: 'retrieve', percent: 60 })
writer({ type: 'stage', stage: 'rerank', message: '正在重排...' })

// 消费端按 type 分发
for await (const chunk of await graph.stream(input, { streamMode: 'custom' })) {
  if (chunk.type === 'progress') updateProgressBar(chunk.percent)
  if (chunk.type === 'stage') showStageHint(chunk.message)
}
```

### 5.4 custom vs messages 的分工

| 维度 | messages | custom |
|------|----------|--------|
| 数据来源 | LLM 输出令牌（框架自动捕获） | 节点代码手动推送 |
| 内容控制权 | 模型决定 | 完全由开发者决定 |
| 典型内容 | 回答文本 | 进度百分比、阶段提示、检索命中数、工具执行状态 |
| 组合建议 | 两者常一起用：custom 做进度提示，messages 做打字机 |

---

## 6. 多模式组合

### 6.1 数组形式

`streamMode` 传数组即可一次执行同时订阅多种事件，此时 chunk 变为 `[mode, data]` 元组：

```js
for await (const [mode, chunk] of await graph.stream(
  input,
  { streamMode: ['updates', 'custom', 'messages'] }
)) {
  if (mode === 'updates')  renderNodeProgress(chunk)   // { analyze: {...} }
  if (mode === 'custom')   showCustomEvent(chunk)      // writer 推送的内容
  if (mode === 'messages') appendToken(chunk)          // [messageChunk, metadata]
}
```

### 6.2 典型组合方案

| 组合 | 适用场景 |
|------|----------|
| `['updates', 'messages']` | 节点进度 + 打字机（最常用的前端组合） |
| `['updates', 'custom', 'messages']` | 进度 + 业务事件 + 打字机（完整体验） |
| `['values', 'messages']` | 状态面板 + 打字机 |
| `['debug']` | 本地排查问题 |

### 6.3 注意事项

- 组合模式下**必须解构元组**：`const [mode, chunk] = ...`，否则会把元组当数据用导致渲染错误
- `messages` 在组合模式中输出的 `chunk` 仍是 `[messageChunk, metadata]`，即整体是 `[mode, [messageChunk, metadata]]` 双层元组
- 多模式不会互相影响执行过程，只是「多路复用」同一个执行流

---

## 7. 子图流式透传

### 7.1 问题：子图事件默认不可见

父图把子图作为节点调用时，子图内部的节点更新/令牌默认**不会**出现在父图的流里。

### 7.2 subgraphs: true

```js
// 父图：parentGraph 内含子图节点 child
for await (const [namespace, chunk] of await parentGraph.stream(
  input,
  { subgraphs: true, streamMode: 'updates' }
)) {
  // namespace: [] → 父图自身事件
  // namespace: ['child'] → 子图内部事件（多级子图时是路径数组）
  const source = namespace.length ? namespace.join(' > ') : '父图'
  console.log(`[${source}]`, chunk)
}
```

### 7.3 与多模式组合叠加

```js
// subgraphs + 多模式：chunk 是 [namespace, [mode, data]] 三层结构
for await (const [namespace, mode, data] of await parentGraph.stream(
  input,
  { subgraphs: true, streamMode: ['updates', 'custom'] }
)) {
  const source = namespace.length ? namespace.join(' > ') : '父图'
  console.log(`[${source}][${mode}]`, data)
}
```

### 7.4 使用要点

- `namespace` 是**数组**：空数组 = 父图；`['child']` = 一级子图；`['child', 'grandchild']` = 多级嵌套
- 子图透传对 `messages` 模式同样生效（子图内 LLM 令牌也会带 namespace 出现）
- 与 [阶段十一 Subgraph](./LangGraph.js子图Subgraph详解.md) 的「不同 schema 转换」配合使用时，注意流事件的形态以**子图自身 schema** 为准

---

## 8. Functional API 的流式

[阶段十三 Functional API](./LangGraph.js深入学习路线.md)（`entrypoint` + `task`）的流式与 StateGraph 完全同构：

> ⚠️ **最容易踩的坑**：`task` 函数**拿不到 config**。
> `entrypoint` 的包装是 `func(input, config)`（框架注入），而 `task` 的包装是 `func(...args)`（只转发你显式传入的实参），源码见 `@langchain/langgraph/dist/pregel/call.cjs`。
> 所以在浏览器（无 AsyncLocalStorage）环境下，**必须**在 `entrypoint` 内取 writer 再传给 task：

```js
import { entrypoint, task, getWriter } from '@langchain/langgraph'

// ✅ task 的第二个参数是 writer —— 由 entrypoint 显式传入（框架不会给 task 注入 config）
const analyze = task('analyze', async (q, writer) => {
  if (typeof writer === 'function') writer('🔍 分析中...')   // 必须判空
  return { steps: ['...'] }
})

const workflow = entrypoint({ name: 'qa' }, async (q, config) => {
  // ✅ 只有 entrypoint 的第二个参数才是注入的 config
  const writer = getWriter(config)
  const r = await analyze(q, writer)
  if (typeof writer === 'function') writer('✅ 完成')
  return { answer: '...' }
})

// 消费端：streamMode 传数组可同时订阅 custom 与 values
for await (const [mode, payload] of await workflow.stream(q, { streamMode: ['custom', 'values'] })) {
  if (mode === 'custom') console.log('writer 事件:', payload)
  if (mode === 'values') console.log('最终结果:', payload)   // values 里已含返回值
}
```

> 不要写成「先 `stream()` 再 `invoke()`」来「既拿流又拿结果」——那会让整个工作流**执行两遍**（LLM 调用翻倍、`executionCount` 异常递增）。用 `streamMode: ['custom', 'values']` 即可一次执行同时拿到两者。

差异点：

| 维度 | StateGraph | Functional API |
|------|-----------|----------------|
| 自定义流 | 节点内 `getWriter(config)`（config 由框架注入） | **entrypoint 内** `getWriter(config)`，再传给 task；task 内调用会抛 `Config not retrievable` |
| `updates` 事件键 | 节点名 | task 名称 |
| `values` 事件 | 状态快照 | entrypoint 返回值累积 |
| checkpointer | `compile({ checkpointer })` | `entrypoint({ checkpointer }, fn)` |

---

## 9. 与 Vue 前端结合实战

### 9.1 本项目示例组件的架构

[`LangGraphStage12Streaming.vue`](../../pages/langgraph/LangGraphStage12Streaming.vue) 的流式处理分三层：

```
┌─────────────────────────────────────────────────────┐
│ 消费层：for await (chunk of await graph.stream(...))  │
│   ├─ 单模式：handleChunk(streamMode, chunk)           │
│   └─ 组合模式：const [mode, data] = chunk → handleChunk│
├─────────────────────────────────────────────────────┤
│ 分发层：handleChunk(mode, chunk) 按 mode 路由          │
│   ├─ values   → valueSnapshots[]（快照列表）           │
│   ├─ updates  → updateLogs[]（节点增量列表）           │
│   ├─ messages → typewriterText（打字机，过滤节点）      │
│   ├─ custom   → customLogs[]（自定义事件列表）          │
│   └─ debug    → debugLogs[]（限 30 条）+ debugStats    │
├─────────────────────────────────────────────────────┤
│ 渲染层：Vue 响应式自动更新（无需手动 DOM）               │
└─────────────────────────────────────────────────────┘
```

### 9.2 关键实现片段

```js
// 组合模式消费
const isCombo = this.streamMode === 'combo'
const streamMode = isCombo ? ['updates', 'custom', 'messages'] : this.streamMode

for await (const chunk of await graph.stream({ question }, { streamMode })) {
  if (isCombo) {
    const [mode, data] = chunk
    this.handleChunk(mode, data)
  } else {
    this.handleChunk(this.streamMode, chunk)
  }
}
```

```js
// messages 打字机：只渲染 answer 节点令牌
} else if (mode === 'messages') {
  const [message, metadata] = chunk
  const node = metadata && metadata.langgraph_node
  const text = typeof message.content === 'string' ? message.content : ''
  if (text && node === 'respond') {
    this.typewriterText += text
  }
}
```

### 9.3 体验优化建议

| 优化点 | 做法 |
|--------|------|
| 光标闪烁 | `<span class="cursor">▌</span>` + CSS `animation: blink` |
| 自动滚动 | `watch` 打字机容器 `scrollTop = scrollHeight` |
| 中断处理 | 组件销毁时 `break` 退出 for await（async iterator 会正常关闭） |
| 错误降级 | try/catch 包裹整个流消费，失败时回退 `invoke()` |
| 首字延迟 | `messages` 模式天然最优；不要在打字机前再套 `await invoke()` |

---

## 10. JS 与 Python 对照

| 能力 | LangGraph.js | LangGraph Python |
|------|--------------|------------------|
| 流式执行 | `graph.stream(input, { streamMode })` + `for await` | `graph.stream(input, stream_mode=...)` + `for`（异步 `astream`） |
| 完整状态 | `streamMode: 'values'` | `stream_mode='values'` |
| 节点增量 | `streamMode: 'updates'` | `stream_mode='updates'` |
| 令牌流 | `streamMode: 'messages'` → `[message, metadata]` | `stream_mode='messages'` → `(message, metadata)` |
| 自定义流写入 | `getWriter()` → `writer(x)` | `get_stream_writer()` → `writer(x)` |
| 自定义流消费 | `streamMode: 'custom'` | `stream_mode='custom'` |
| 调试事件 | `streamMode: 'debug'` | `stream_mode='debug'` |
| 多模式组合 | `streamMode: ['updates', 'custom']` → `[mode, chunk]` | `stream_mode=['updates', 'custom']` → `(mode, chunk)` |
| 子图透传 | `{ subgraphs: true }` → `[namespace, chunk]` | `subgraphs=True` → `(namespace, chunk)` |
| 令牌来源节点 | `metadata.langgraph_node` | `metadata['langgraph_node']` |

Python 侧完整示例见示例组件中的「🐍 LangGraph Python 对比代码」折叠块（源码：[`langgraphStreamingSamples.js`](../../composables/langgraphStreamingSamples.js) 的 `stage12StreamingPyCode`）。

---

## 11. 最佳实践与选型指南

### 11.1 选型决策树

```
前端要逐字显示 AI 回复？
├─ 是 → messages（必须过滤 metadata.langgraph_node）
│        └─ 还要节点进度？ → 组合 ['updates', 'messages']
└─ 否 →
   ├─ 要展示「执行到哪个节点」？ → updates
   ├─ 要渲染完整状态面板？ → values
   ├─ 要业务级进度/阶段提示？ → custom + getWriter
   └─ 要排查执行细节？ → debug（仅本地）
```

### 11.2 最佳实践清单

1. **打字机必过滤节点**：`metadata.langgraph_node === '目标节点'`，否则中间节点的 LLM 输出会混入最终答案
2. **custom 推结构化对象**：`writer({ type, ... })` 优于裸字符串，前端按 `type` 路由更健壮
3. **组合模式先解构**：`const [mode, chunk] = ...` 是组合模式的第一行代码
4. **debug 只在本地开**：事件量最大，生产环境开启会拖慢流并刷爆日志
5. **getWriter 必传 config**：StateGraph 节点签名 `async (state, config)` + `getWriter(config)`；Functional API 中 task **拿不到 config**，须在 entrypoint 内取 writer 再传入。浏览器等无 AsyncLocalStorage 环境无参调用会直接抛异常
6. **流结束补最终状态**：`messages` 模式不含状态事件，需要最终状态时组合 `updates` 或流后再 `invoke`
7. **错误处理包住整个循环**：流中途异常（网络断开、recursionLimit）要在 try/catch 内消费
8. **与 checkpointer 无冲突**：stream 与 invoke 产生同样的检查点，可放心配合 thread_id 使用

### 11.3 常见坑

| 坑 | 现象 | 原因与解法 |
|----|------|-----------|
| 打字机出现「两段回答」 | 最终答案里混入了分析步骤文本 | 没过滤 `langgraph_node`，中间节点令牌也被拼接了 |
| 组合模式渲染出 `[object Object]` | 页面显示元组而非数据 | 忘了解构 `[mode, chunk]` |
| `writer()` 推送的事件收不到 | custom 流为空 | `streamMode` 没包含 `'custom'`；或 writer 为 `undefined` 时未判空 |
| `Config not retrievable...` 报错 | 节点 / task 内 getWriter 抛异常 | 环境不支持 AsyncLocalStorage（如浏览器）；StateGraph 节点加 `config` 参数；**Functional API 的 task 无法拿 config，必须在 entrypoint 内 `getWriter(config)` 后传入 task** |
| 结果与日志重复、LLM 调用翻倍 | 工作流执行了两次 | 同时调用了 `stream()` 和 `invoke()`；改用 `streamMode: ['custom', 'values']` 一次执行取结果 |
| 子图事件看不到 | 父图流里没有子图节点更新 | 没开 `{ subgraphs: true }` |
| `await graph.stream()` 漏 await | `for await` 直接报错 | `stream()` 返回 Promise，需先 await 得到 async iterable |

---

## 参考资源

- 官网：[Concepts → Streaming](https://langchain-ai.github.io/langgraphjs/concepts/streaming/)
- 官网 How-tos：[Stream Mode / Stream Subgraphs / Stream Custom Data](https://langchain-ai.github.io/langgraphjs/how-tos/)
- 本项目关联：
  - 示例组件：[`LangGraphStage12Streaming.vue`](../../pages/langgraph/LangGraphStage12Streaming.vue)
  - 代码示例：[`langgraphStreamingSamples.js`](../../composables/langgraphStreamingSamples.js)
  - 前置：[子图 Subgraph 详解](./LangGraph.js子图Subgraph详解.md)（子图透传）、[Functional API（阶段十三）](./LangGraph.js深入学习路线.md)
  - LangChain 层流式：[`LangChainStage3Stream.vue`](../../pages/langchain/LangChainStage3Stream.vue)
