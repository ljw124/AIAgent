# LangChain.js 短期记忆（Memory）详解

> 基于 `@langchain/core` v1.2.9 + `@langchain/langgraph` v1.4.13 实战验证
>
> LangChain.js 提供了**两层短期记忆机制**：传统的 `BaseMemory` 抽象层（用于 Chain）和 LangGraph 的 `MemorySaver` Checkpoint 机制（用于 Agent/Graph）。

---

## 目录

1. [两种记忆机制对比](#1-两种记忆机制对比)
2. [BaseMemory — 传统 Chain 记忆](#2-basememory--传统-chain-记忆)
3. [MemorySaver — LangGraph Checkpoint 记忆](#3-memorysaver--langgraph-checkpoint-记忆)
4. [createReactAgent + MemorySaver 实战](#4-createreactagent--memorysaver-实战)
5. [Checkpoint 机制深入](#5-checkpoint-机制深入)
6. [InMemoryStore — 长期键值存储](#6-inmemorystore--长期键值存储)
7. [最佳实践](#7-最佳实践)

---

## 1. 两种记忆机制对比

```
┌──────────────────────────────────────────────────────────────────────┐
│                    LangChain.js 短期记忆架构                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────┐    ┌──────────────────────────────┐    │
│  │   BaseMemory (传统)      │    │  MemorySaver (LangGraph)      │    │
│  │   @langchain/core/memory │    │  @langchain/langgraph         │    │
│  ├─────────────────────────┤    ├──────────────────────────────┤    │
│  │  适用: Chain             │    │  适用: Agent / Graph           │    │
│  │  粒度: 对话轮次           │    │  粒度: 图节点级别              │    │
│  │  持久化: 需自行实现        │    │  持久化: Checkpoint 自动       │    │
│  │  接口: load/save         │    │  接口: getTuple/put/list       │    │
│  └─────────────────────────┘    └──────────────────────────────┘    │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

| 特性 | [`BaseMemory`](node_modules/@langchain/core/dist/memory.d.ts) | [`MemorySaver`](node_modules/@langchain/langgraph-checkpoint/dist/memory.d.ts) |
|------|----------|-------------|
| 所属包 | `@langchain/core` | `@langchain/langgraph` |
| 基类 | 抽象类 | 继承 [`BaseCheckpointSaver`](node_modules/@langchain/langgraph-checkpoint/dist/base.d.ts) |
| 适用场景 | 简单 Chain 调用 | Agent、StateGraph、复杂工作流 |
| 记忆粒度 | 对话轮次（input/output） | 图节点级别（每个节点执行后自动保存） |
| 线程隔离 | 需自行管理 | 内置 `thread_id` 隔离 |
| 历史回溯 | 不支持 | 支持（通过 `list` 遍历历史 Checkpoint） |
| 中断恢复 | 不支持 | 支持（通过 `getTuple` 恢复状态） |

---

## 2. BaseMemory — 传统 Chain 记忆

### 2.1 导入路径

```js
import { BaseMemory, getInputValue, getOutputValue, getPromptInputKey } from '@langchain/core/memory';
```

### 2.2 类型定义

```ts
// 输入值类型
type InputValues = Record<string, any>;

// 输出值类型
type OutputValues = Record<string, any>;

// 记忆变量类型
type MemoryVariables = Record<string, any>;

// 抽象基类
abstract class BaseMemory {
  abstract get memoryKeys(): string[];

  // 从输入值中加载记忆变量
  abstract loadMemoryVariables(values: InputValues): Promise<MemoryVariables>;

  // 保存上下文（输入 + 输出）
  abstract saveContext(
    inputValues: InputValues,
    outputValues: OutputValues
  ): Promise<void>;
}
```

### 2.3 工具函数

| 函数 | 签名 | 说明 |
|------|------|------|
| `getInputValue` | `(inputValues: InputValues, inputKey?: string) => any` | 从输入中提取值，单输入直接返回，多输入需指定 key |
| `getOutputValue` | `(outputValues: OutputValues, outputKey?: string) => any` | 从输出中提取值，多输出必须指定 key |
| `getPromptInputKey` | `(inputs: Record<string, unknown>, memoryVariables: string[]) => string` | 获取 Prompt 输入 key（排除记忆变量和 "stop"） |

### 2.4 自定义 Memory 示例

```js
import { BaseMemory } from '@langchain/core/memory';

class SimpleBufferMemory extends BaseMemory {
  constructor() {
    super();
    this.chatHistory = [];
  }

  get memoryKeys() {
    return ['chat_history'];
  }

  async loadMemoryVariables(values) {
    return {
      chat_history: this.chatHistory.join('\n')
    };
  }

  async saveContext(inputValues, outputValues) {
    const input = inputValues.input || Object.values(inputValues)[0];
    const output = outputValues.output || Object.values(outputValues)[0];
    this.chatHistory.push(`Human: ${input}`);
    this.chatHistory.push(`AI: ${output}`);
  }
}

// 使用
const memory = new SimpleBufferMemory();
await memory.saveContext({ input: '你好' }, { output: '你好！有什么可以帮助你的？' });
const vars = await memory.loadMemoryVariables({ input: '今天天气怎么样？' });
console.log(vars.chat_history);
// Human: 你好
// AI: 你好！有什么可以帮助你的？
```

> **注意**：LangChain.js 的 `BaseMemory` 是抽象基类，不像 Python 版那样内置了 `ConversationBufferMemory`、`ConversationSummaryMemory` 等具体实现。在 JS 生态中，**推荐使用 LangGraph 的 `MemorySaver` 作为短期记忆方案**。

---

## 3. MemorySaver — LangGraph Checkpoint 记忆

### 3.1 导入路径

```js
import { MemorySaver } from '@langchain/langgraph';
```

### 3.2 类层次结构

```
BaseCheckpointSaver (抽象基类)
  └── MemorySaver (内存实现)
```

[`MemorySaver`](node_modules/@langchain/langgraph-checkpoint/dist/memory.d.ts) 是 LangGraph 内置的**基于内存的 Checkpoint 存储**，用于在 Agent 执行过程中自动保存和恢复状态。

### 3.3 核心 API

| 方法 | 签名 | 说明 |
|------|------|------|
| `getTuple` | `(config: RunnableConfig) => Promise<CheckpointTuple \| undefined>` | 获取指定线程的最新 Checkpoint |
| `put` | `(config, checkpoint, metadata) => Promise<RunnableConfig>` | 保存新的 Checkpoint |
| `putWrites` | `(config, writes: PendingWrite[], taskId: string) => Promise<void>` | 保存中间写入（待处理的通道更新） |
| `list` | `(config, options?: CheckpointListOptions) => AsyncGenerator<CheckpointTuple>` | 列出历史 Checkpoint |
| `deleteThread` | `(threadId: string) => Promise<void>` | 删除线程的所有 Checkpoint 和写入 |
| `getDeltaChannelHistory` | `(options) => Promise<Record<string, DeltaChannelHistory>>` | 获取通道的增量历史（Beta） |

### 3.4 内部存储结构

```ts
class MemorySaver extends BaseCheckpointSaver {
  // 主存储: threadId → checkpointNs → checkpointId → [serialized, metadata, parentId]
  storage: Record<string, Record<string, Record<string, [Uint8Array, Uint8Array, string | undefined]>>>;

  // 写入存储: key → taskId → [channel, checkpointId, serialized]
  writes: Record<string, Record<string, [string, string, Uint8Array]>>;
}
```

### 3.5 Checkpoint 数据结构

```ts
interface Checkpoint {
  v: number;           // Checkpoint 格式版本（当前为 4）
  id: string;          // Checkpoint ID（uuid6）
  ts: string;          // 时间戳（ISO 8601）
  channel_values: Record<string, unknown>;     // 通道值（如 messages）
  channel_versions: Record<string, number>;    // 通道版本号
  versions_seen: Record<string, Record<string, number>>; // 节点已见版本
}

interface CheckpointTuple {
  config: RunnableConfig;           // 包含 thread_id 的配置
  checkpoint: Checkpoint;           // Checkpoint 数据
  metadata?: CheckpointMetadata;    // 元数据（source, step, writes 等）
  parentConfig?: RunnableConfig;    // 父 Checkpoint 配置（形成链）
  pendingWrites?: CheckpointPendingWrite[]; // 待处理的写入
}
```

---

## 4. createReactAgent + MemorySaver 实战

### 4.1 基本用法

```js
import { ChatOpenAI } from '@langchain/openai';
import { MemorySaver } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

// 1. 创建模型
const model = new ChatOpenAI({
  model: 'gpt-4o',
  temperature: 0.7,
});

// 2. 创建短期记忆
const memory = new MemorySaver();

// 3. 创建 Agent，注入 checkpointer
const agent = createReactAgent({
  llm: model,
  tools: [],
  checkpointer: memory,  // ← 关键：注入 MemorySaver
});

// 4. 多轮对话（同一 thread_id 自动保留上下文）
const config = { configurable: { thread_id: 'user-session-001' } };

// 第一轮
const result1 = await agent.invoke(
  { messages: [{ role: 'user', content: '我叫张三' }] },
  config
);
console.log(result1.messages[result1.messages.length - 1].content);
// "你好张三！有什么可以帮助你的？"

// 第二轮 — Agent 记住了名字
const result2 = await agent.invoke(
  { messages: [{ role: 'user', content: '我叫什么名字？' }] },
  config  // ← 相同的 thread_id
);
console.log(result2.messages[result2.messages.length - 1].content);
// "你叫张三。"
```

### 4.2 `createReactAgent` 的 checkpointer 参数

从源码中可以看到 [`createReactAgent`](node_modules/@langchain/langgraph/dist/prebuilt/react_agent_executor.d.ts) 接受以下记忆相关参数：

```ts
function createReactAgent(params: {
  llm: ChatOpenAI;
  tools: Tool[];
  messageModifier?: ...;
  stateModifier?: ...;
  prompt?: ...;
  stateSchema?: ...;
  contextSchema?: ...;
  checkpointSaver?: BaseCheckpointSaver | boolean;  // Checkpoint 存储器
  checkpointer?: BaseCheckpointSaver | boolean;      // checkpointSaver 的别名
  interruptBefore?: string[] | All;                   // 中断前节点
  interruptAfter?: string[] | All;                    // 中断后节点
  store?: BaseStore;                                  // 长期存储
  responseFormat?: ...;
  preModelHook?: ...;
  postModelHook?: ...;
  name?: string;
  description?: string;
  version?: 'v1' | 'v2';
  includeAgentName?: 'inline' | undefined;
}): CompiledStateGraph;
```

> **注意**：`checkpointSaver` 和 `checkpointer` 是等价的别名参数，传入 `MemorySaver` 实例即可。

### 4.3 多线程隔离

```js
const memory = new MemorySaver();
const agent = createReactAgent({ llm: model, tools: [], checkpointer: memory });

// 用户 A 的会话
const configA = { configurable: { thread_id: 'user-a' } };
await agent.invoke({ messages: [{ role: 'user', content: '我叫张三' }] }, configA);

// 用户 B 的会话 — 完全隔离
const configB = { configurable: { thread_id: 'user-b' } };
await agent.invoke({ messages: [{ role: 'user', content: '我叫李四' }] }, configB);

// 用户 A 再次对话 — 仍然记得自己是张三
const resultA = await agent.invoke(
  { messages: [{ role: 'user', content: '我叫什么名字？' }] },
  configA
);
// → "你叫张三。"

// 用户 B 再次对话 — 记得自己是李四
const resultB = await agent.invoke(
  { messages: [{ role: 'user', content: '我叫什么名字？' }] },
  configB
);
// → "你叫李四。"
```

### 4.4 流式输出 + 记忆

```js
const memory = new MemorySaver();
const agent = createReactAgent({ llm: model, tools: [], checkpointer: memory });
const config = { configurable: { thread_id: 'stream-demo' } };

// 流式输出
const stream = await agent.stream(
  { messages: [{ role: 'user', content: '讲个笑话' }] },
  { ...config, streamMode: 'messages' }
);

for await (const [message, metadata] of stream) {
  if (metadata.langgraph_node === 'agent') {
    console.log(message.content);
  }
}
```

---

## 5. Checkpoint 机制深入

### 5.1 工作原理

```
┌─────────────────────────────────────────────────────────────────┐
│                    Checkpoint 工作流程                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  用户输入                                                         │
│     │                                                           │
│     ▼                                                           │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐                   │
│  │  agent  │ ──▶ │  tools  │ ──▶ │  agent  │ ──▶ 最终输出       │
│  │  (节点)  │     │  (节点)  │     │  (节点)  │                   │
│  └────┬────┘     └────┬────┘     └────┬────┘                   │
│       │               │               │                         │
│       ▼               ▼               ▼                         │
│  ┌─────────────────────────────────────────┐                    │
│  │           MemorySaver                     │                    │
│  │  ┌──────────────────────────────────┐    │                    │
│  │  │ storage[thread_id][ns][cp_id]    │    │                    │
│  │  │  = [checkpoint, metadata, parent]│    │                    │
│  │  └──────────────────────────────────┘    │                    │
│  │  ┌──────────────────────────────────┐    │                    │
│  │  │ writes[key][task_id]             │    │                    │
│  │  │  = [channel, cp_id, data]        │    │                    │
│  │  └──────────────────────────────────┘    │                    │
│  └─────────────────────────────────────────┘                    │
│                                                                 │
│  每个节点执行后自动调用 put() 保存 Checkpoint                       │
│  每个节点执行前自动调用 getTuple() 恢复状态                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 手动操作 Checkpoint

```js
const memory = new MemorySaver();

// 查看线程的所有历史 Checkpoint
const config = { configurable: { thread_id: 'my-thread' } };
for await (const tuple of memory.list(config, { limit: 10 })) {
  console.log('Checkpoint ID:', tuple.checkpoint.id);
  console.log('Timestamp:', tuple.checkpoint.ts);
  console.log('Messages:', tuple.checkpoint.channel_values.messages?.length);
  console.log('Parent:', tuple.parentConfig?.configurable?.checkpoint_id);
  console.log('---');
}

// 获取最新 Checkpoint
const latest = await memory.getTuple(config);
if (latest) {
  console.log('Latest checkpoint:', latest.checkpoint.id);
  console.log('Messages:', latest.checkpoint.channel_values.messages);
}

// 删除线程的所有记忆
await memory.deleteThread('my-thread');
```

### 5.3 Checkpoint 链（父子关系）

每个 Checkpoint 通过 `parentConfig` 指向前一个 Checkpoint，形成一条链：

```
Checkpoint #1 (id: aaa)          ← 用户第一轮输入
    ↑ parentConfig
Checkpoint #2 (id: bbb)          ← Agent 节点执行后
    ↑ parentConfig
Checkpoint #3 (id: ccc)          ← Tools 节点执行后
    ↑ parentConfig
Checkpoint #4 (id: ddd)          ← Agent 最终输出
```

这种链式结构使得 LangGraph 可以：
- **回溯**：通过 `list` 遍历历史状态
- **分支**：从任意 Checkpoint 分叉出新的执行路径
- **恢复**：中断后从最近的 Checkpoint 继续执行

---

## 6. InMemoryStore — 长期键值存储

### 6.1 导入路径

```js
import { InMemoryStore } from '@langchain/langgraph';
```

### 6.2 与 MemorySaver 的区别

| 特性 | [`MemorySaver`](node_modules/@langchain/langgraph-checkpoint/dist/memory.d.ts) | [`InMemoryStore`](node_modules/@langchain/langgraph/dist/web.d.ts) |
|------|-------------|---------------|
| 用途 | 短期对话记忆（Checkpoint） | 长期键值存储 |
| 生命周期 | 线程级别 | 跨线程共享 |
| 数据结构 | Checkpoint 链 | 命名空间 + 键值对 |
| 典型场景 | 多轮对话上下文 | 用户偏好、知识库、缓存 |

### 6.3 核心 API

| 方法 | 说明 |
|------|------|
| `putOperation(namespace, key, value)` | 存储键值对 |
| `getOperation(namespace, key)` | 获取键值对 |
| `batch(operations)` | 批量操作 |
| `listNamespacesOperation(options)` | 列出命名空间 |
| `searchOperation(namespace, query)` | 搜索（支持向量相似度） |
| `insertVectors(namespace, vectors)` | 插入向量 |
| `getVectors(namespace)` | 获取向量 |
| `cosineSimilarity(a, b)` | 余弦相似度计算 |

### 6.4 使用示例

```js
import { InMemoryStore } from '@langchain/langgraph';

const store = new InMemoryStore();

// 存储用户偏好
await store.putOperation(['users', 'preferences'], 'user-001', {
  language: 'zh-CN',
  theme: 'dark',
  expertise: 'frontend',
});

// 读取用户偏好
const prefs = await store.getOperation(['users', 'preferences'], 'user-001');
console.log(prefs); // { language: 'zh-CN', theme: 'dark', expertise: 'frontend' }

// 在 createReactAgent 中使用
const agent = createReactAgent({
  llm: model,
  tools: [],
  checkpointer: new MemorySaver(),
  store: store,  // ← 注入长期存储
});
```

---

## 7. 最佳实践

### 7.1 选择正确的记忆方案

```
需要短期记忆？
  │
  ├── 使用 Chain（非 Agent）？
  │     └── 继承 BaseMemory，实现自定义记忆类
  │
  └── 使用 Agent / Graph？
        └── 使用 MemorySaver + thread_id
              │
              ├── 需要长期存储？
              │     └── 配合 InMemoryStore
              │
              └── 需要生产级持久化？
                    └── 替换为 PostgresSaver / SqliteSaver
```

### 7.2 thread_id 命名规范

```js
// ✅ 推荐：使用有意义的 thread_id
const config = {
  configurable: {
    thread_id: `user-${userId}-session-${sessionId}`
  }
};

// ❌ 避免：使用随机 ID（无法恢复会话）
const config = {
  configurable: {
    thread_id: Math.random().toString()
  }
};
```

### 7.3 内存管理

```js
// MemorySaver 将所有数据存储在内存中，注意：
// 1. 进程重启后数据丢失 → 生产环境使用持久化 Saver
// 2. 长时间运行可能内存溢出 → 定期清理旧线程

// 清理超过 1 小时的旧线程
const ONE_HOUR = 60 * 60 * 1000;
for await (const tuple of memory.list({ configurable: {} }, { limit: 100 })) {
  const age = Date.now() - new Date(tuple.checkpoint.ts).getTime();
  if (age > ONE_HOUR) {
    await memory.deleteThread(tuple.config.configurable.thread_id);
  }
}
```

### 7.4 与 Python 版对比

| 特性 | LangChain Python | LangChain.js |
|------|:--:|:--:|
| `BaseMemory` 抽象类 | ✅ `langchain.memory` | ✅ `@langchain/core/memory` |
| `ConversationBufferMemory` | ✅ 内置 | ❌ 需自行实现 |
| `ConversationSummaryMemory` | ✅ 内置 | ❌ 需自行实现 |
| `MemorySaver` | ✅ `langgraph.checkpoint.memory` | ✅ `@langchain/langgraph` |
| `InMemoryStore` | ✅ | ✅ |
| `SqliteSaver` | ✅ | ✅（社区包） |
| `PostgresSaver` | ✅ | ✅（社区包） |
| Checkpoint 机制 | ✅ | ✅ |
| `thread_id` 隔离 | ✅ | ✅ |
| 中断恢复 | ✅ | ✅ |

### 7.5 总结

1. **新项目优先使用 `MemorySaver`**：LangGraph 的 Checkpoint 机制比传统 `BaseMemory` 更强大，支持中断恢复、历史回溯、分支执行
2. **`BaseMemory` 适合简单场景**：如果只是简单的 Chain 调用且不需要 Agent 能力，继承 `BaseMemory` 更轻量
3. **生产环境替换持久化 Saver**：`MemorySaver` 仅适用于开发/测试，生产环境应使用 `SqliteSaver` 或 `PostgresSaver`
4. **配合 `InMemoryStore` 实现长期记忆**：短期对话记忆用 `MemorySaver`，用户偏好/知识库用 `InMemoryStore`