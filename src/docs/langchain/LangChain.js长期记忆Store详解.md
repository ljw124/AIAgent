# LangChain.js 长期记忆（Long-term Memory）详解

> 基于 `@langchain/core` v1.2.9 + `@langchain/langgraph` v1.4.13 实战验证
>
> LangChain.js 通过 LangGraph 的 **Store** 机制实现长期记忆，允许跨线程、跨会话持久化信息。短期记忆（`MemorySaver`）随线程生命周期存在，而长期记忆（`BaseStore`）可以跨线程共享，实现用户偏好记忆、知识库存储等场景。

---

## 目录

1. [短期记忆 vs 长期记忆](#1-短期记忆-vs-长期记忆)
2. [BaseStore — 长期存储抽象基类](#2-basestore--长期存储抽象基类)
3. [InMemoryStore — 内存长期存储](#3-inmemorystore--内存长期存储)
4. [Store 核心 API 详解](#4-store-核心-api-详解)
5. [createReactAgent + Store 实战](#5-createreactagent--store-实战)
6. [向量语义搜索（Vector Search）](#6-向量语义搜索vector-search)
7. [在 Graph 节点中访问 Store](#7-在-graph-节点中访问-store)
8. [生产环境持久化方案](#8-生产环境持久化方案)
9. [短期记忆 + 长期记忆 联合使用](#9-短期记忆--长期记忆-联合使用)
10. [最佳实践](#10-最佳实践)

---

## 1. 短期记忆 vs 长期记忆

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      LangChain.js 记忆体系全景                              │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────┐   ┌─────────────────────────────────┐  │
│  │   MemorySaver (短期记忆)      │   │  BaseStore (长期记忆)             │  │
│  │   @langchain/langgraph       │   │  @langchain/langgraph-checkpoint │  │
│  ├─────────────────────────────┤   ├─────────────────────────────────┤  │
│  │  生命周期: 线程级别            │   │  生命周期: 跨线程、跨会话          │  │
│  │  隔离方式: thread_id          │   │  隔离方式: namespace 命名空间      │  │
│  │  数据结构: Checkpoint 链      │   │  数据结构: 键值对 + 向量索引        │  │
│  │  典型场景: 多轮对话上下文       │   │  典型场景: 用户偏好、知识库、缓存   │  │
│  │  持久化: Checkpoint 自动保存   │   │  持久化: 手动 put/get/search      │  │
│  └─────────────────────────────┘   └─────────────────────────────────┘  │
│                                                                          │
│  对比总结：                                                               │
│  • MemorySaver 记住"这次对话说了什么"（对话上下文）                          │
│  • BaseStore 记住"这个用户是谁、喜欢什么"（跨会话持久信息）                   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

| 特性 | [`MemorySaver`](node_modules/@langchain/langgraph-checkpoint/dist/memory.d.ts) | [`BaseStore`](node_modules/@langchain/langgraph-checkpoint/dist/store/base.d.ts) |
|------|----------|-------------|
| 所属包 | `@langchain/langgraph` | `@langchain/langgraph-checkpoint` |
| 用途 | 短期对话记忆（Checkpoint） | 长期键值存储 |
| 生命周期 | 线程级别（随 thread_id） | **跨线程共享** |
| 隔离机制 | `thread_id` | `namespace`（命名空间） |
| 数据结构 | Checkpoint 链（版本化状态快照） | 键值对 + 可选向量索引 |
| 查询能力 | 按 thread_id 获取最新状态 | 支持过滤、分页、语义搜索 |
| 典型场景 | 多轮对话上下文 | 用户偏好、知识库、全局缓存 |
| 持久化 | 内存（可替换为 SqliteSaver/PostgresSaver） | 内存（可替换为数据库实现） |

---

## 2. BaseStore — 长期存储抽象基类

### 2.1 导入路径

```js
import { InMemoryStore } from '@langchain/langgraph';
// BaseStore 是抽象基类，通常直接使用 InMemoryStore
```

### 2.2 类层次结构

```
BaseStore (抽象基类)
  ├── InMemoryStore (内存实现，支持向量搜索)
  └── AsyncBatchedStore (异步批量包装器)
```

[`BaseStore`](node_modules/@langchain/langgraph-checkpoint/dist/store/base.d.ts:277) 是一个抽象基类，定义了长期存储的标准接口。它支持：

- **分层命名空间**（Hierarchical Namespaces）：用字符串数组组织数据，如 `["users", "profiles"]`
- **键值存储**：每个命名空间下可以有多个键值对
- **向量语义搜索**：配置 Embeddings 后支持自然语言查询
- **过滤与分页**：支持 `$eq`、`$gt`、`$gte`、`$lt`、`$lte`、`$ne` 等操作符

### 2.3 Item 数据结构

```ts
// 存储项
interface Item {
  value: Record<string, any>;  // 存储的数据对象，键可被过滤
  key: string;                  // 命名空间内的唯一标识
  namespace: string[];          // 分层路径，如 ["documents", "user123"]
  createdAt: Date;              // 创建时间
  updatedAt: Date;              // 最后更新时间
}

// 搜索结果项（带相似度分数）
interface SearchItem extends Item {
  score?: number;  // 余弦相似度分数，-1 到 1，越高越匹配
}
```

---

## 3. InMemoryStore — 内存长期存储

### 3.1 导入路径

```js
import { InMemoryStore } from '@langchain/langgraph';
```

### 3.2 基本用法

[`InMemoryStore`](node_modules/@langchain/langgraph-checkpoint/dist/store/memory.d.ts:37) 是 `BaseStore` 的纯内存实现，使用 JavaScript Map 存储数据。**数据在进程退出后丢失**，适用于开发/测试。

```js
import { InMemoryStore } from '@langchain/langgraph';

// 创建 Store 实例
const store = new InMemoryStore();

// 存储用户偏好
await store.put(
  ['users', 'preferences'],  // namespace
  'user-001',                // key
  {                          // value
    language: 'zh-CN',
    theme: 'dark',
    expertise: 'frontend',
    lastActive: new Date().toISOString(),
  }
);

// 读取用户偏好
const prefs = await store.get(['users', 'preferences'], 'user-001');
console.log(prefs);
// {
//   key: 'user-001',
//   namespace: ['users', 'preferences'],
//   value: { language: 'zh-CN', theme: 'dark', expertise: 'frontend', ... },
//   createdAt: 2026-09-10T...,
//   updatedAt: 2026-09-10T...
// }

// 更新用户偏好
await store.put(['users', 'preferences'], 'user-001', {
  language: 'zh-CN',
  theme: 'light',  // 更新主题
  expertise: 'frontend',
});

// 删除用户偏好
await store.delete(['users', 'preferences'], 'user-001');
```

### 3.3 命名空间设计

命名空间是分层路径，用于组织数据：

```js
// 用户相关数据
['users', 'profiles']          // 用户档案
['users', 'preferences']       // 用户偏好
['users', 'history']           // 用户历史

// 文档/知识库
['documents', 'tech']          // 技术文档
['documents', 'policies']      // 政策文档

// 缓存
['cache', 'embeddings']        // 嵌入缓存
['cache', 'responses']         // 响应缓存

// 全局配置
['config', 'system']           // 系统配置
['config', 'features']         // 功能开关
```

---

## 4. Store 核心 API 详解

### 4.1 `put()` — 存储/更新数据

```js
await store.put(
  namespace: string[],           // 分层命名空间
  key: string,                   // 唯一标识
  value: Record<string, any>,    // 存储的数据（传 null 则删除）
  index?: false | string[]       // 可选：索引配置
);
```

```js
// 简单存储
await store.put(['docs'], 'report-1', {
  title: '2026 Q3 财报',
  content: '本季度营收增长 15%...',
  status: 'published',
  score: 4.8,
});

// 指定索引字段（用于后续过滤搜索）
await store.put(
  ['docs'],
  'report-2',
  {
    title: '2026 Q4 预测',
    content: '预计下季度营收增长 20%...',
    status: 'draft',
    score: 4.2,
  },
  ['title', 'status', 'score']  // 索引这些字段
);

// 删除数据（value 传 null）
await store.put(['docs'], 'report-1', null);
```

### 4.2 `get()` — 读取数据

```js
const item = await store.get(
  namespace: string[],  // 命名空间
  key: string           // 键
);
// 返回 Item | null
```

```js
const doc = await store.get(['docs'], 'report-1');
if (doc) {
  console.log(doc.value.title);   // "2026 Q3 财报"
  console.log(doc.createdAt);     // 创建时间
  console.log(doc.updatedAt);     // 更新时间
}
```

### 4.3 `search()` — 搜索数据

```js
const results = await store.search(
  namespacePrefix: string[],  // 搜索的命名空间前缀
  options?: {
    filter?: Record<string, any>;  // 过滤条件
    limit?: number;                // 返回数量限制（默认 10）
    offset?: number;               // 分页偏移（默认 0）
    query?: string;                // 自然语言语义搜索
  }
);
// 返回 SearchItem[]
```

**过滤操作符：**

| 操作符 | 说明 | 示例 |
|--------|------|------|
| `$eq` | 等于（默认） | `{ status: "active" }` |
| `$ne` | 不等于 | `{ status: { $ne: "deleted" } }` |
| `$gt` | 大于 | `{ score: { $gt: 4.0 } }` |
| `$gte` | 大于等于 | `{ score: { $gte: 3.5 } }` |
| `$lt` | 小于 | `{ age: { $lt: 30 } }` |
| `$lte` | 小于等于 | `{ age: { $lte: 65 } }` |

```js
// 精确匹配过滤
const published = await store.search(['docs'], {
  filter: { status: 'published' },
  limit: 10,
});

// 组合过滤条件
const highScore = await store.search(['docs'], {
  filter: {
    status: 'published',
    score: { $gte: 4.5 },
  },
  limit: 5,
});

// 分页查询
const page1 = await store.search(['docs'], {
  limit: 10,
  offset: 0,
});
const page2 = await store.search(['docs'], {
  limit: 10,
  offset: 10,
});
```

### 4.4 `listNamespaces()` — 列出命名空间

```js
const namespaces = await store.listNamespaces({
  prefix?: string[];    // 按前缀过滤
  suffix?: string[];    // 按后缀过滤
  maxDepth?: number;    // 最大深度
  limit?: number;       // 返回数量限制
  offset?: number;      // 分页偏移
});
```

```js
// 列出所有命名空间
const all = await store.listNamespaces();

// 列出 users 下的所有子命名空间
const userNS = await store.listNamespaces({
  prefix: ['users'],
  maxDepth: 2,
});

// 列出以 "v1" 结尾的命名空间
const v1NS = await store.listNamespaces({
  suffix: ['v1'],
  limit: 50,
});
```

### 4.5 `batch()` — 批量操作

```js
const results = await store.batch([
  { namespace: ['users', 'prefs'], key: 'user-001', value: { theme: 'dark' } },
  { namespace: ['users', 'prefs'], key: 'user-002', value: { theme: 'light' } },
  { namespace: ['docs'], key: 'doc-1', value: { title: 'Report' } },
]);
```

### 4.6 `delete()` — 删除数据

```js
await store.delete(
  namespace: string[],  // 命名空间
  key: string           // 键
);
```

---

## 5. createReactAgent + Store 实战

### 5.1 基本集成

在 [`createReactAgent`](node_modules/@langchain/langgraph/dist/prebuilt/react_agent_executor.d.ts:98) 中通过 `store` 参数注入长期记忆：

```js
import { ChatOpenAI } from '@langchain/openai';
import { MemorySaver, InMemoryStore } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// 1. 创建模型
const model = new ChatOpenAI({
  model: 'gpt-4o',
  temperature: 0.7,
});

// 2. 创建短期记忆（对话上下文）
const memory = new MemorySaver();

// 3. 创建长期记忆（跨会话持久化）
const store = new InMemoryStore();

// 4. 预存一些用户信息
await store.put(['users', 'profiles'], 'user-001', {
  name: '张三',
  role: '高级前端工程师',
  skills: ['Vue.js', 'React', 'TypeScript', 'Node.js'],
  preferences: {
    language: 'zh-CN',
    responseStyle: 'detailed',
  },
});

// 5. 定义工具：读取用户档案
const getUserProfile = tool(
  async ({ userId }) => {
    const profile = await store.get(['users', 'profiles'], userId);
    if (!profile) return `未找到用户 ${userId} 的档案`;
    return JSON.stringify(profile.value, null, 2);
  },
  {
    name: 'get_user_profile',
    description: '获取用户的长期档案信息，包括姓名、角色、技能、偏好等。',
    schema: z.object({
      userId: z.string().describe('用户 ID'),
    }),
  }
);

// 6. 定义工具：更新用户偏好
const updateUserPreference = tool(
  async ({ userId, key, value }) => {
    const profile = await store.get(['users', 'profiles'], userId);
    if (!profile) return `未找到用户 ${userId}`;

    const updated = { ...profile.value };
    updated.preferences = { ...updated.preferences, [key]: value };
    await store.put(['users', 'profiles'], userId, updated);
    return `已更新用户 ${userId} 的偏好：${key} = ${value}`;
  },
  {
    name: 'update_user_preference',
    description: '更新用户的偏好设置。',
    schema: z.object({
      userId: z.string().describe('用户 ID'),
      key: z.string().describe('偏好键名'),
      value: z.string().describe('偏好值'),
    }),
  }
);

// 7. 创建 Agent，同时注入短期记忆和长期记忆
const agent = createReactAgent({
  llm: model,
  tools: [getUserProfile, updateUserPreference],
  checkpointer: memory,   // 短期记忆：对话上下文
  store: store,            // 长期记忆：用户档案
});

// 8. 多轮对话
const config = { configurable: { thread_id: 'session-001' } };

// 第一轮：Agent 读取长期记忆中的用户档案
const result1 = await agent.invoke(
  { messages: [{ role: 'user', content: '我是 user-001，帮我看看我的技能是否适合做全栈开发？' }] },
  config
);
// Agent 会调用 getUserProfile 工具，读取 store 中的用户档案，
// 然后基于档案信息给出个性化建议

// 第二轮：Agent 更新长期记忆
const result2 = await agent.invoke(
  { messages: [{ role: 'user', content: '我最近学了 Python，帮我更新一下技能列表' }] },
  config
);
// Agent 会调用 updateUserPreference 工具，更新 store 中的数据
```

### 5.2 完整参数说明

[`createReactAgent`](node_modules/@langchain/langgraph/dist/prebuilt/react_agent_executor.d.ts) 中与记忆相关的参数：

```ts
function createReactAgent(params: {
  llm: ChatOpenAI;
  tools: Tool[];
  // 短期记忆
  checkpointSaver?: BaseCheckpointSaver | boolean;  // Checkpoint 存储器
  checkpointer?: BaseCheckpointSaver | boolean;      // checkpointSaver 的别名
  // 长期记忆
  store?: BaseStore;                                  // 长期键值存储
  // 其他
  messageModifier?: ...;
  stateModifier?: ...;
  prompt?: ...;
  interruptBefore?: string[] | All;
  interruptAfter?: string[] | All;
  responseFormat?: ...;
  // ...
}): CompiledStateGraph;
```

---

## 6. 向量语义搜索（Vector Search）

### 6.1 配置索引

[`InMemoryStore`](node_modules/@langchain/langgraph-checkpoint/dist/store/memory.d.ts:19) 支持通过 [`IndexConfig`](node_modules/@langchain/langgraph-checkpoint/dist/store/base.d.ts:223) 配置向量搜索：

```js
import { InMemoryStore } from '@langchain/langgraph';
import { OpenAIEmbeddings } from '@langchain/openai';

// 创建带向量搜索的 Store
const store = new InMemoryStore({
  index: {
    dims: 1536,                                              // 向量维度
    embeddings: new OpenAIEmbeddings({                       // Embeddings 模型
      modelName: 'text-embedding-3-small',
    }),
    fields: ['title', 'content'],                            // 要嵌入的字段
  },
});
```

### 6.2 常用 Embeddings 模型维度

| 模型 | 维度 | 说明 |
|------|:--:|------|
| OpenAI `text-embedding-3-large` | 256 / 1024 / 3072 | 可配置维度 |
| OpenAI `text-embedding-3-small` | 512 / 1536 | 性价比高 |
| OpenAI `text-embedding-ada-002` | 1536 | 经典模型 |
| Cohere `embed-english-v3.0` | 1024 | 英文优化 |
| Cohere `embed-multilingual-v3.0` | 1024 | 多语言 |

### 6.3 语义搜索实战

```js
import { InMemoryStore } from '@langchain/langgraph';
import { OpenAIEmbeddings } from '@langchain/openai';

const store = new InMemoryStore({
  index: {
    dims: 1536,
    embeddings: new OpenAIEmbeddings({ modelName: 'text-embedding-3-small' }),
    fields: ['title', 'content'],
  },
});

// 存储知识库文档
await store.put(['knowledge', 'tech'], 'doc-1', {
  title: 'Vue 3 组合式 API 指南',
  content: 'Vue 3 引入了 Composition API，提供更灵活的代码组织方式...',
  tags: ['vue', 'frontend'],
});

await store.put(['knowledge', 'tech'], 'doc-2', {
  title: 'React Hooks 深入解析',
  content: 'React Hooks 允许在函数组件中使用状态和生命周期...',
  tags: ['react', 'frontend'],
});

await store.put(['knowledge', 'tech'], 'doc-3', {
  title: 'Node.js 性能优化实践',
  content: '通过集群模式、缓存策略和异步 I/O 提升 Node.js 性能...',
  tags: ['nodejs', 'backend'],
});

await store.put(['knowledge', 'tech'], 'doc-4', {
  title: 'Python 机器学习入门',
  content: '使用 scikit-learn 进行数据预处理、模型训练和评估...',
  tags: ['python', 'ml'],
});

// 语义搜索：自然语言查询
const results = await store.search(['knowledge'], {
  query: '前端框架的组件化开发方式',
  limit: 3,
});

for (const item of results) {
  console.log(`[${item.score?.toFixed(3)}] ${item.value.title}`);
  // [0.892] Vue 3 组合式 API 指南
  // [0.845] React Hooks 深入解析
  // [0.312] Node.js 性能优化实践
}

// 语义搜索 + 过滤
const filtered = await store.search(['knowledge'], {
  query: '如何提升应用性能',
  filter: { tags: 'backend' },
  limit: 5,
});
```

### 6.4 索引字段路径语法

```js
// 支持嵌套字段和数组索引
await store.put(
  ['docs'],
  'complex-doc',
  {
    metadata: {
      title: '技术报告',
      author: { name: '张三', dept: '工程部' },
    },
    chapters: [
      { content: '第一章：概述' },
      { content: '第二章：方法' },
    ],
  },
  [
    'metadata.title',           // 嵌套字段
    'metadata.author.name',     // 深层嵌套
    'chapters[*].content',      // 数组所有元素
    'chapters[0].content',      // 数组指定索引
  ]
);
```

---

## 7. 在 Graph 节点中访问 Store

### 7.1 通过 `getStore()` 访问

在自定义 Graph 节点中，可以通过 [`getStore()`](node_modules/@langchain/langgraph/dist/pregel/utils/config.d.ts:11) 工具函数访问 Store：

```js
import { StateGraph, Annotation } from '@langchain/langgraph';
import { getStore } from '@langchain/langgraph';
import { BaseStore } from '@langchain/langgraph-checkpoint';

// 定义 State
const State = Annotation.Root({
  messages: Annotation<any[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
});

// 自定义节点：读取长期记忆
async function loadUserContext(state, config) {
  const store = getStore(config);  // 获取 Store 实例
  if (!store) return {};

  const userId = config.configurable?.user_id || 'anonymous';
  const profile = await store.get(['users', 'profiles'], userId);

  if (profile) {
    return {
      messages: [{
        role: 'system',
        content: `当前用户：${profile.value.name}，角色：${profile.value.role}，偏好：${JSON.stringify(profile.value.preferences)}`,
      }],
    };
  }
  return {};
}

// 自定义节点：保存到长期记忆
async function saveUserContext(state, config) {
  const store = getStore(config);
  if (!store) return {};

  const userId = config.configurable?.user_id || 'anonymous';
  const lastMessage = state.messages[state.messages.length - 1];

  // 保存最后一条消息的时间戳
  await store.put(['users', 'activity'], userId, {
    lastActive: new Date().toISOString(),
    lastMessage: lastMessage?.content?.substring(0, 100),
  });

  return {};
}

// 构建 Graph
const graph = new StateGraph(State)
  .addNode('loadContext', loadUserContext)
  .addNode('agent', /* agent node */)
  .addNode('saveContext', saveUserContext)
  .addEdge('__start__', 'loadContext')
  .addEdge('loadContext', 'agent')
  .addEdge('agent', 'saveContext')
  .addEdge('saveContext', '__end__');

const app = graph.compile({
  checkpointer: new MemorySaver(),
  store: new InMemoryStore(),  // 注入 Store
});
```

### 7.2 在 Tool 中访问 Store

Tool 函数可以通过闭包直接访问 Store 实例：

```js
function createStoreTools(store) {
  const rememberFact = tool(
    async ({ fact, category }) => {
      const key = `fact-${Date.now()}`;
      await store.put(['memory', 'facts', category], key, {
        fact,
        category,
        timestamp: new Date().toISOString(),
      });
      return `已记住：${fact}`;
    },
    {
      name: 'remember_fact',
      description: '将重要信息存入长期记忆。',
      schema: z.object({
        fact: z.string().describe('要记住的信息'),
        category: z.string().describe('信息分类'),
      }),
    }
  );

  const recallFacts = tool(
    async ({ category, query }) => {
      const results = await store.search(['memory', 'facts', category], {
        query: query || undefined,
        limit: 5,
      });
      if (results.length === 0) return '未找到相关信息';
      return results.map(r => `- ${r.value.fact} (${r.value.timestamp})`).join('\n');
    },
    {
      name: 'recall_facts',
      description: '从长期记忆中检索相关信息。',
      schema: z.object({
        category: z.string().describe('信息分类'),
        query: z.string().optional().describe('搜索关键词'),
      }),
    }
  );

  return [rememberFact, recallFacts];
}
```

---

## 8. 生产环境持久化方案

### 8.1 方案对比

| 方案 | 存储位置 | 进程重启 | 向量搜索 | 适用场景 |
|------|---------|:--:|:--:|------|
| [`InMemoryStore`](node_modules/@langchain/langgraph-checkpoint/dist/store/memory.d.ts:37) | 内存 | ❌ 丢失 | ✅ 支持 | 开发/测试 |
| `AsyncBatchedStore` | 包装其他 Store | 取决于底层 | 取决于底层 | 批量写入优化 |
| 自定义 `BaseStore` | 数据库/文件 | ✅ 保留 | 自行实现 | 生产环境 |

### 8.2 自定义持久化 Store

继承 [`BaseStore`](node_modules/@langchain/langgraph-checkpoint/dist/store/base.d.ts:277) 实现自定义持久化：

```js
import { BaseStore } from '@langchain/langgraph-checkpoint';

class LocalStorageStore extends BaseStore {
  constructor() {
    super();
    this.prefix = 'langgraph_store_';
  }

  _makeKey(namespace, key) {
    return this.prefix + [...namespace, key].join(':');
  }

  async batch(operations) {
    const results = [];
    for (const op of operations) {
      if (op.value !== undefined) {
        // PutOperation
        if (op.value === null) {
          localStorage.removeItem(this._makeKey(op.namespace, op.key));
        } else {
          const item = {
            value: op.value,
            key: op.key,
            namespace: op.namespace,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          localStorage.setItem(this._makeKey(op.namespace, op.key), JSON.stringify(item));
        }
        results.push(undefined);
      } else {
        // GetOperation
        const raw = localStorage.getItem(this._makeKey(op.namespace, op.key));
        results.push(raw ? JSON.parse(raw) : null);
      }
    }
    return results;
  }
}

// 使用自定义 Store
const store = new LocalStorageStore();
await store.put(['users'], 'profile', { name: '张三' });
const profile = await store.get(['users'], 'profile');
```

### 8.3 前端项目推荐方案

对于浏览器端项目，推荐以下持久化策略：

```
┌─────────────────────────────────────────────────────────┐
│                 前端长期记忆持久化方案                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  开发阶段：InMemoryStore（内存，刷新丢失）                  │
│       ↓                                                 │
│  生产阶段：自定义 BaseStore 实现                           │
│       │                                                 │
│       ├── localStorage 实现（简单，5MB 限制）              │
│       ├── IndexedDB 实现（大容量，支持索引）               │
│       └── 后端 API 实现（通过 REST 调用服务端 Store）      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 9. 短期记忆 + 长期记忆 联合使用

### 9.1 完整架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                    记忆体系完整架构                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  用户输入                                                            │
│     │                                                               │
│     ▼                                                               │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    createReactAgent                           │  │
│  │  ┌─────────────────────┐  ┌──────────────────────────────┐   │  │
│  │  │  MemorySaver         │  │  BaseStore                    │   │  │
│  │  │  (短期记忆)           │  │  (长期记忆)                    │   │  │
│  │  ├─────────────────────┤  ├──────────────────────────────┤   │  │
│  │  │ • 对话历史            │  │  • 用户档案                    │   │  │
│  │  │ • 工具调用链           │  │  • 偏好设置                    │   │  │
│  │  │ • 中间状态            │  │  • 知识库                      │   │  │
│  │  │ • thread_id 隔离      │  │  • 全局缓存                    │   │  │
│  │  │ • 自动 Checkpoint     │  │  • namespace 隔离              │   │  │
│  │  └─────────────────────┘  └──────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  典型工作流：                                                        │
│  1. Agent 收到用户消息                                               │
│  2. 从 BaseStore 加载用户档案（长期记忆）                              │
│  3. 从 MemorySaver 加载对话历史（短期记忆）                            │
│  4. 结合两者生成个性化回复                                            │
│  5. 将重要信息存入 BaseStore（长期记忆）                               │
│  6. MemorySaver 自动保存 Checkpoint（短期记忆）                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 9.2 实战示例

```js
import { ChatOpenAI } from '@langchain/openai';
import { MemorySaver, InMemoryStore } from '@langchain/langgraph';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// 初始化
const model = new ChatOpenAI({ model: 'gpt-4o', temperature: 0.7 });
const memory = new MemorySaver();     // 短期：对话上下文
const store = new InMemoryStore();     // 长期：用户档案 + 知识库

// 预存知识库
await store.put(['knowledge', 'company'], 'policy-1', {
  topic: '请假政策',
  content: '员工每年享有 15 天带薪年假，病假需提供医院证明...',
});
await store.put(['knowledge', 'company'], 'policy-2', {
  topic: '报销政策',
  content: '差旅报销需在 30 天内提交，住宿标准为 500 元/晚...',
});

// 工具：查询公司政策（长期记忆）
const searchPolicy = tool(
  async ({ query }) => {
    const results = await store.search(['knowledge', 'company'], {
      query,
      limit: 3,
    });
    if (results.length === 0) return '未找到相关政策';
    return results.map(r =>
      `【${r.value.topic}】${r.value.content}`
    ).join('\n\n');
  },
  {
    name: 'search_company_policy',
    description: '搜索公司政策和规定。',
    schema: z.object({ query: z.string().describe('搜索关键词') }),
  }
);

// 工具：记住用户信息（长期记忆）
const rememberUserInfo = tool(
  async ({ infoType, content }) => {
    await store.put(['users', 'memories'], `memory-${Date.now()}`, {
      type: infoType,
      content,
      timestamp: new Date().toISOString(),
    });
    return `已记住：${content}`;
  },
  {
    name: 'remember_user_info',
    description: '记住用户告诉你的重要信息，以便后续对话使用。',
    schema: z.object({
      infoType: z.string().describe('信息类型，如 name、preference、goal'),
      content: z.string().describe('要记住的内容'),
    }),
  }
);

// 创建 Agent
const agent = createReactAgent({
  llm: model,
  tools: [searchPolicy, rememberUserInfo],
  checkpointer: memory,   // 短期记忆
  store: store,            // 长期记忆
  prompt: `你是一个有用的助手。请使用 search_company_policy 工具查询公司政策。
当用户告诉你关于他们自己的重要信息时，使用 remember_user_info 工具保存到长期记忆中。
在后续对话中，利用这些记忆提供个性化服务。`,
});

// 使用
const config = { configurable: { thread_id: 'user-001-session' } };

// 对话 1：用户分享个人信息
await agent.invoke({
  messages: [{ role: 'user', content: '我叫张三，在工程部工作，我喜欢简洁的回答风格' }],
}, config);
// Agent 会调用 rememberUserInfo 保存这些信息

// 对话 2：Agent 利用长期记忆
await agent.invoke({
  messages: [{ role: 'user', content: '我想了解一下公司的请假政策' }],
}, config);
// Agent 会调用 searchPolicy 查询政策，并根据用户偏好给出简洁的回答
```

---

## 10. 最佳实践

### 10.1 记忆分层策略

```
┌──────────────────────────────────────────┐
│            记忆分层推荐策略                 │
├──────────────────────────────────────────┤
│                                          │
│  Layer 1: MemorySaver (短期)              │
│  ├── 当前会话的对话历史                     │
│  ├── 工具调用链                            │
│  └── 生命周期：单次会话                     │
│                                          │
│  Layer 2: BaseStore (长期)                │
│  ├── 用户档案（姓名、角色、技能）            │
│  ├── 用户偏好（语言、风格、通知设置）         │
│  ├── 知识库（公司政策、产品文档）            │
│  ├── 重要事实（用户提到的重要信息）           │
│  └── 生命周期：跨会话持久                    │
│                                          │
└──────────────────────────────────────────┘
```

### 10.2 命名空间设计规范

```js
// ✅ 推荐：清晰的分层命名空间
['users', '{userId}', 'profiles']       // 用户档案
['users', '{userId}', 'preferences']    // 用户偏好
['users', '{userId}', 'memories']       // 用户记忆
['knowledge', '{domain}', '{category}'] // 知识库
['cache', '{type}']                     // 缓存

// ❌ 避免：扁平的命名空间
['user_profiles']     // 难以扩展
['stuff']             // 含义不清
```

### 10.3 数据大小控制

```js
// Store 中的数据应保持精简
// ✅ 推荐：存储关键信息
await store.put(['users', 'memories'], 'fact-1', {
  type: 'preference',
  content: '喜欢简洁的回答风格',  // 简短
});

// ❌ 避免：存储大段文本
await store.put(['users', 'memories'], 'fact-1', {
  content: '用户说他喜欢...（5000 字长文）',  // 应存摘要
});

// 对于大文本，存储引用而非内容
await store.put(['docs', 'references'], 'doc-1', {
  title: '技术报告',
  summary: '关于微服务架构的 50 页报告',  // 摘要
  url: 'https://internal/wiki/doc-1',     // 引用
});
```

### 10.4 定期清理

```js
// 清理过期数据
async function cleanupOldMemories(store, maxAgeDays = 90) {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

  const allMemories = await store.search(['users'], { limit: 1000 });
  for (const item of allMemories) {
    const updatedAt = new Date(item.updatedAt).getTime();
    if (updatedAt < cutoff) {
      await store.delete(item.namespace, item.key);
    }
  }
}
```

### 10.5 与 Python 版对比

| 特性 | LangChain Python | LangChain.js |
|------|:--:|:--:|
| `BaseStore` 抽象类 | ✅ `langgraph.store.base` | ✅ `@langchain/langgraph-checkpoint` |
| `InMemoryStore` | ✅ | ✅ |
| `AsyncBatchedStore` | ✅ | ✅ |
| 向量语义搜索 | ✅ | ✅ |
| `getStore()` 工具函数 | ✅ | ✅ |
| `createReactAgent` 的 `store` 参数 | ✅ | ✅ |
| `PostgresStore` | ✅ | ✅（社区包） |
| `SqliteStore` | ✅ | ✅（社区包） |

### 10.6 总结

1. **短期记忆用 `MemorySaver`**：管理对话上下文，自动 Checkpoint，按 `thread_id` 隔离
2. **长期记忆用 `BaseStore`**：跨会话持久化用户信息、知识库、偏好设置
3. **两者配合使用**：`MemorySaver` 记住"说了什么"，`BaseStore` 记住"是谁、喜欢什么"
4. **向量搜索增强检索**：配置 `IndexConfig` 后支持自然语言语义搜索
5. **生产环境需持久化**：`InMemoryStore` 仅用于开发，生产环境需实现自定义 `BaseStore` 或使用数据库方案
6. **前端项目可用 `localStorage`/`IndexedDB`**：继承 `BaseStore` 实现浏览器端持久化