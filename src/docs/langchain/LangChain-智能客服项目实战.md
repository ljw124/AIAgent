# 智能客服智能体 — 设计方案

> 基于 LangChain.js 10 阶段知识体系，设计一款「智能客服」学习型智能体应用。
> 架构：纯前端 Vue 2 + 内网大模型 API（EB-DeepSeek-V4-Pro），与现有 Stage1-Stage10 架构一致。
> 定位：**以学习 LangChain 全栈知识为核心目标**，保留多租户设计。

---

## 目录

1. [设计目标](#1-设计目标)
2. [LangChain 10 阶段知识映射](#2-langchain-10-阶段知识映射)
3. [系统架构](#3-系统架构)
4. [核心模块设计](#4-核心模块设计)
5. [多租户设计](#5-多租户设计)
6. [前端设计](#6-前端设计)
7. [目录结构](#7-目录结构)
8. [实施路线图](#8-实施路线图)

---

## 1. 设计目标

> **用智能客服场景串联 LangChain 全部 10 个阶段的知识点，在一个完整的应用中实战练习。**

设计原则：

| 原则 | 说明 |
|------|------|
| **一阶段一实战** | 每个 LangChain 阶段必须有对应的代码实现 |
| **纯前端架构** | 与现有 Stage1-Stage10 一致，不引入后端 |
| **保留多租户** | Stage1（Prompt 模板）+ Stage10（Store namespace）的自然延伸 |
| **通用演示工具** | 计算器、天气、知识库搜索 — 覆盖不同工具类型 |
| **内存优先** | MemorySaver、InMemoryStore、MemoryVectorStore 全部内存实现 |

---

## 2. LangChain 10 阶段知识映射

### 2.1 知识融合全景图

```
┌─────────────────────────────────────────────────────────────────────┐
│              智能客服 Agent = 10 阶段知识融合                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  用户提问                                                            │
│     │                                                               │
│     ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Stage8: Middleware 中间件                                     │   │
│  │  ├─ 请求日志（记录每次调用耗时）                              │   │
│  │  └─ Token 统计（累计 Prompt + Completion tokens）             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│     │                                                               │
│     ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Stage6: Agent (createReactAgent)                             │   │
│  │                                                               │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │ Stage1: Prompt Template                               │   │   │
│  │  │ "你是{tenant_name}的智能客服，风格：{tone}..."         │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  │                                                               │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │ Stage9: MemorySaver (短期记忆)                        │   │   │
│  │  │ 记住本轮对话上下文，thread_id 隔离                     │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  │                                                               │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │ Stage10: InMemoryStore (长期记忆)                     │   │   │
│  │  │ 用户偏好记忆，namespace 隔离（按租户+用户）            │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  │                                                               │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │ Stage5: Tools 通用工具集                              │   │   │
│  │  │ calculator | get_weather | search_knowledge           │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  │                                                               │   │
│  │  Think → Act → Observe → Think → ... → Final Answer          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│     │                                                               │
│     ├──→ Stage7: RAG 检索链（search_knowledge 工具触发）            │
│     │    Document → Split → Embed → Store → Retrieve → Inject      │
│     │                                                               │
│     ├──→ Stage2: Chain（RAG 内部 LCEL 链式调用）                    │
│     │    retriever.pipe(prompt).pipe(llm).pipe(parser)              │
│     │                                                               │
│     └──→ Stage3: Stream + Stage4: Structured                        │
│          流式输出 + 结构化回复（含引用来源和置信度）                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 阶段-功能对照表

| 阶段 | 知识点 | 在智能客服中的实战 | 关键 API |
|------|--------|-------------------|----------|
| **Stage1** | Prompt 模板 | 客服角色定义 + 多租户可切换 Prompt | `ChatPromptTemplate.fromMessages()` |
| **Stage2** | LCEL 链 | RAG 检索链串联 | `.pipe()` |
| **Stage3** | 流式输出 | 逐 token 实时展示回复 | `.stream()` |
| **Stage4** | 结构化输出 | 回复含引用来源、置信度 | `responseFormat` + `zod` |
| **Stage5** | 工具调用 | 计算器、天气、知识库搜索 | `tool()` + `bindTools()` |
| **Stage6** | ReAct Agent | 核心引擎 Think→Act→Observe | `createReactAgent()` |
| **Stage7** | RAG | 文档上传→分片→向量化→检索 | `RecursiveCharacterTextSplitter` + `MemoryVectorStore` |
| **Stage8** | 中间件 | 日志 + Token 统计 | `BaseCallbackHandler` |
| **Stage9** | 短期记忆 | 多轮对话上下文，thread_id 隔离 | `MemorySaver` |
| **Stage10** | 长期记忆 | 用户偏好跨会话持久化，namespace 隔离 | `InMemoryStore` |

---

## 3. 系统架构

### 3.1 架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                     Vue 2 浏览器（纯前端）                          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  CustomerChat.vue                          │   │
│  │  对话界面 · 租户切换 · 知识库上传 · 功能开关               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │               useCustomerAgent composable                  │   │
│  │  状态管理 · 流式消费 · 消息段展示 · Agent 生命周期         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              LangChain.js 运行时（浏览器内存）              │   │
│  │                                                              │   │
│  │  createReactAgent ←── Prompt + Tools + Memory + Store       │   │
│  │       │                                                      │   │
│  │       ├── MemorySaver (Stage9)                               │   │
│  │       ├── InMemoryStore (Stage10)                            │   │
│  │       ├── MemoryVectorStore (Stage7)                         │   │
│  │       └── BaseCallbackHandler (Stage8)                       │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬───────────────────────────────────┘
                               │ HTTP API 调用
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│              内网大模型 API (EB-DeepSeek-V4-Pro)                   │
│              base_url: http://lanz.hikvision.com/v3/openai/model  │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 与现有 Stage 架构一致

本设计与项目已有的 [`LangChainStage6Agent.vue`](../src/pages/langchain/LangChainStage6Agent.vue)、[`LangChainStage10Store.vue`](../src/pages/langchain/LangChainStage10Store.vue) 等采用完全相同的架构模式：

- `ChatOpenAI` 直接调用内网 API（API Key 通过 webpack `DefinePlugin` 注入 `INNER_API_KEY`）
- `createReactAgent` 在浏览器中运行
- 所有存储（MemorySaver、InMemoryStore、MemoryVectorStore）在浏览器内存中

---

## 4. 核心模块设计

### 4.1 Agent 引擎（Stage6）

```javascript
// CustomerChat.vue <script> 中

import { ChatOpenAI } from '@langchain/openai'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { MemorySaver } from '@langchain/langgraph'
import { InMemoryStore } from '@langchain/langgraph'

// 初始化 LLM（与现有 Stage 一致）
const llm = new ChatOpenAI({
  model: 'EB-DeepSeek-V4-Pro',
  apiKey: INNER_API_KEY,        // webpack DefinePlugin 注入
  baseURL: 'http://lanz.hikvision.com/v3/openai/model',
  temperature: 0.7,
})

// Stage9: 短期记忆
const checkpointer = new MemorySaver()

// Stage10: 长期记忆
const store = new InMemoryStore()

// Stage5: 工具集
const tools = [calculatorTool, weatherTool, knowledgeSearchTool]

// Stage1: Prompt 模板（多租户可切换）
function buildPrompt(tenantConfig) {
  return ChatPromptTemplate.fromMessages([
    ['system', tenantConfig.systemPrompt],
    ['placeholder', '{messages}'],
  ])
}

// Stage6: 创建 Agent
function createAgent(tenantConfig) {
  return createReactAgent({
    llm,
    tools: tenantConfig.tools,
    prompt: buildPrompt(tenantConfig),
    checkpointer,  // Stage9
    store,         // Stage10
  })
}
```

### 4.2 通用工具集（Stage5）

```javascript
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

// 工具 1：计算器
const calculatorTool = tool(
  async ({ expression }) => {
    const result = Function(`"use strict"; return (${expression})`)()
    return `计算结果：${expression} = ${result}`
  },
  {
    name: 'calculator',
    description: '执行数学计算。支持加减乘除、括号、幂运算等。',
    schema: z.object({
      expression: z.string().describe('数学表达式，如 "(123 + 456) * 789 / 10"'),
    }),
  }
)

// 工具 2：天气查询（模拟数据）
const weatherTool = tool(
  async ({ city }) => {
    const conditions = ['晴', '多云', '小雨', '阴天']
    const temp = Math.floor(Math.random() * 20) + 10
    const condition = conditions[Math.floor(Math.random() * conditions.length)]
    return `${city}今天${condition}，温度 ${temp}°C~${temp + 8}°C`
  },
  {
    name: 'get_weather',
    description: '查询指定城市的天气信息。',
    schema: z.object({
      city: z.string().describe('城市名称，如"北京"、"上海"'),
    }),
  }
)

// 工具 3：知识库搜索（Stage7 RAG 入口）
const knowledgeSearchTool = tool(
  async ({ query }) => {
    const results = await vectorStore.similaritySearchWithScore(query, 3)
    return JSON.stringify(results.map(([doc, score]) => ({
      content: doc.pageContent,
      source: doc.metadata.source,
      score: score,
    })))
  },
  {
    name: 'search_knowledge',
    description: '在知识库中搜索相关文档。当用户询问技术问题、概念解释时使用。',
    schema: z.object({
      query: z.string().describe('搜索查询内容'),
    }),
  }
)
```

### 4.3 RAG 知识库（Stage2 + Stage7）

```javascript
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory'

// Stage7: 文档分片器
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 500,
  chunkOverlap: 50,
})

// Stage7: 向量存储（内存）
let vectorStore = null

// Stage7 Step 1-4: 文档加载 → 分片 → 向量化 → 存储
async function ingestDocument(content, metadata) {
  const docs = await splitter.createDocuments([content], [metadata])
  if (!vectorStore) {
    vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings)
  } else {
    await vectorStore.addDocuments(docs)
  }
  return docs.length
}

// Stage7 Step 5: 相似度检索
async function searchKnowledge(query, k = 3) {
  if (!vectorStore) return []
  return await vectorStore.similaritySearchWithScore(query, k)
}

// Stage2: RAG 检索链
function createRAGChain() {
  const retriever = vectorStore.asRetriever({ k: 3 })

  const ragPrompt = ChatPromptTemplate.fromMessages([
    ['system', `基于以下文档内容回答问题。如果文档中没有相关信息，请如实说明。
     文档内容：
     {context}`],
    ['human', '{question}'],
  ])

  return RunnableSequence.from([
    {
      context: retriever.pipe(
        new RunnableLambda({
          func: (docs) => docs.map(d => d.pageContent).join('\n\n')
        })
      ),
      question: new RunnableLambda({ func: (input) => input }),
    },
    ragPrompt,
    llm,
    new StringOutputParser(),
  ])
}
```

### 4.4 中间件（Stage8）

```javascript
import { BaseCallbackHandler } from '@langchain/core/callbacks/base'

// 精简版中间件：日志 + Token 统计
class CustomerAgentCallback extends BaseCallbackHandler {
  name = 'CustomerAgentCallback'

  constructor() {
    super()
    this.totalPromptTokens = 0
    this.totalCompletionTokens = 0
    this.startTime = null
  }

  async handleLLMStart() {
    this.startTime = Date.now()
    console.log(`[Agent] LLM 调用开始`)
  }

  async handleLLMEnd(output) {
    const usage = output.llmOutput?.usage
    if (usage) {
      this.totalPromptTokens += usage.promptTokens || 0
      this.totalCompletionTokens += usage.completionTokens || 0
    }
    const elapsed = Date.now() - this.startTime
    console.log(`[Agent] LLM 调用完成，耗时 ${elapsed}ms`)
  }

  async handleLLMError(error) {
    console.error(`[Agent] LLM 调用失败:`, error.message)
  }

  async handleToolStart(tool, input) {
    console.log(`[Agent] 工具调用: ${tool.name}(${input})`)
  }

  async handleToolEnd(output) {
    console.log(`[Agent] 工具返回: ${output.substring(0, 100)}...`)
  }

  getStats() {
    return {
      promptTokens: this.totalPromptTokens,
      completionTokens: this.totalCompletionTokens,
      total: this.totalPromptTokens + this.totalCompletionTokens,
    }
  }
}
```

### 4.5 流式处理（Stage3）

```javascript
// Stage3: Agent 流式调用 + 消息段解析
async function* streamAgent(agent, userMessage, threadId) {
  const stream = await agent.stream(
    { messages: [new HumanMessage(userMessage)] },
    {
      configurable: { thread_id: threadId },
      streamMode: 'values',
    }
  )

  for await (const chunk of stream) {
    const messages = chunk.agent?.messages ?? chunk.messages
    if (!messages?.length) continue

    const lastMsg = messages[messages.length - 1]
    const msgType = lastMsg._getType?.()

    if (msgType === 'ai') {
      // Stage6: 工具调用
      if (lastMsg.tool_calls?.length > 0) {
        for (const tc of lastMsg.tool_calls) {
          yield { type: 'tool_use', toolName: tc.name, toolInput: tc.args }
        }
      }
      // Stage3: 文本回复
      if (lastMsg.content) {
        yield { type: 'text', content: lastMsg.content }
      }
    }

    if (msgType === 'tool') {
      if (lastMsg.name === 'search_knowledge') {
        // Stage7: 检索结果
        try {
          const sources = JSON.parse(lastMsg.content)
          yield { type: 'retrieved', sources }
        } catch {
          yield { type: 'tool_result', toolName: lastMsg.name, toolOutput: lastMsg.content }
        }
      } else {
        yield { type: 'tool_result', toolName: lastMsg.name, toolOutput: lastMsg.content }
      }
    }
  }

  yield { type: 'done' }
}
```

---

## 5. 多租户设计

### 5.1 为什么保留多租户？

多租户是 LangChain 多个阶段知识的自然交汇点：

| 阶段 | 多租户中的体现 | 学习价值 |
|------|---------------|---------|
| **Stage1** | 每个租户独立的 System Prompt | Prompt 模板参数化和复用 |
| **Stage7** | 每个租户独立的知识库 | 向量存储隔离和切换 |
| **Stage10** | namespace 按租户隔离 | Store namespace 分层设计 |
| **Stage5** | 每个租户可配置不同工具集 | 工具动态注册和选择 |

### 5.2 租户配置

```javascript
// CustomerChat.vue data 中

const builtinTenants = [
  {
    id: 'tech-doc',
    name: '技术文档助手',
    systemPrompt: `你是技术文档助手，专注于回答编程和技术问题。
回答风格：专业、准确、简洁。
当用户询问技术概念时，优先使用 search_knowledge 工具检索知识库。
如果知识库中没有相关信息，请如实告知用户。`,
    tools: ['calculator', 'search_knowledge'],
    knowledgeBase: { type: 'builtin', sources: ['langchain-docs'] },
  },
  {
    id: 'study-tutor',
    name: '学习辅导助手',
    systemPrompt: `你是学习辅导助手，帮助用户理解复杂概念。
回答风格：耐心、通俗易懂、善于举例。
使用 search_knowledge 工具查找学习资料。
如果用户做计算题，使用 calculator 工具。`,
    tools: ['calculator', 'get_weather', 'search_knowledge'],
    knowledgeBase: { type: 'builtin', sources: ['study-materials'] },
  },
  {
    id: 'general',
    name: '通用助手',
    systemPrompt: `你是一个通用的智能助手，可以回答问题、执行计算、查询天气。
根据用户需求灵活选择合适的工具。`,
    tools: ['calculator', 'get_weather', 'search_knowledge'],
    knowledgeBase: { type: 'upload', sources: [] },
  },
]
```

### 5.3 租户隔离机制

```
┌─────────────────────────────────────────────────────────────────┐
│                    多租户隔离（3 个维度）                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  维度 1: Prompt 隔离（Stage1）                                    │
│    Tenant A → systemPrompt: "你是技术文档助手..."                 │
│    Tenant B → systemPrompt: "你是学习辅导助手..."                 │
│                                                                   │
│  维度 2: 知识库隔离（Stage7）                                     │
│    Tenant A → VectorStore_A（LangChain 文档）                     │
│    Tenant B → VectorStore_B（学习资料）                           │
│                                                                   │
│  维度 3: Store namespace 隔离（Stage10）                          │
│    Tenant A → ['tech-doc', 'users', userId, ...]                 │
│    Tenant B → ['study-tutor', 'users', userId, ...]              │
│                                                                   │
│  共享维度：                                                       │
│    MemorySaver（Stage9）→ thread_id 隔离，不区分租户              │
│    通用工具（Stage5）→ 所有租户共享同一套工具                     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. 前端设计

### 6.1 CustomerChat.vue（唯一页面）

```
┌──────────────────────────────────────────────────────────────────┐
│  🤖 智能客服 Agent — LangChain 10 阶段综合实战                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─ 租户与线程 ──────────────────────────────────────────────┐   │
│  │ 租户：[技术文档助手 ▼]  线程：[thread-001 ▼] [🔄新建]      │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─ 功能开关 ────────────────────────────────────────────────┐   │
│  │ [✓]流式(Stage3) [✓]结构化(Stage4) [✓]短期记忆(Stage9)     │   │
│  │ [✓]长期记忆(Stage10) [✓]思考过程(Stage6) [✓]检索结果(S7)  │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─ 知识库（Stage7）─────────────────────────────────────────┐   │
│  │ [🚀初始化内置知识库] [📎上传文件(.txt/.md)]                 │   │
│  │ 状态：✅ 已就绪 (42 个文档片段)                             │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─ 对话区域 ────────────────────────────────────────────────┐   │
│  │                                                              │   │
│  │  👤 用户：LangChain 的 RAG 流程是怎样的？                    │   │
│  │                                                              │   │
│  │  🤖 客服：                                                   │   │
│  │    🧠 思考：用户询问 RAG 流程，需要检索知识库                │   │
│  │    🔧 调用工具：search_knowledge("RAG 流程")                 │   │
│  │    📎 检索到 3 个相关文档（相似度: 95%, 87%, 72%）           │   │
│  │    💬 RAG（检索增强生成）包含以下 7 个步骤...                │   │
│  │                                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─ 状态栏 ──────────────────────────────────────────────────┐   │
│  │ 🧠 短期记忆: 4 轮 | 🗄️ 长期记忆: 已加载 | 🪙 Token: 1,234 │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌─ 输入区 ──────────────────────────────────────────────────┐   │
│  │ 💬 输入您的问题...                     [发送(Ctrl+Enter)]  │   │
│  └────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 多段消息展示（Segments）

| Segment 类型 | 对应阶段 | 展示样式 | 可折叠 |
|-------------|---------|---------|:---:|
| `thinking` | Stage6 | 🧠 灰色斜体 | ✅ |
| `tool_use` | Stage5 | 🔧 蓝色边框，显示工具名+参数 | ✅ |
| `tool_result` | Stage5 | 👁️ 绿色边框，显示工具返回 | ✅ |
| `retrieved` | Stage7 | 📎 黄色边框，显示来源+相似度 | ✅ |
| `text` | Stage3 | 💬 正常文本，逐 token 流式展示 | - |
| `structured` | Stage4 | 📋 JSON 格式化展示 | ✅ |
| `error` | - | ❌ 红色错误提示 | - |

### 6.3 useCustomerAgent Composable 核心状态

```javascript
// src/composables/useCustomerAgent.js

export function useCustomerAgent() {
  // === 核心状态 ===
  const messages = ref([])              // 对话消息（含 segments）
  const loading = ref(false)
  const error = ref(null)

  // 租户与线程
  const tenants = ref(builtinTenants)
  const currentTenantId = ref('tech-doc')
  const currentThreadId = ref(generateId())

  // 功能开关
  const enableStream = ref(true)        // Stage3
  const enableStructured = ref(false)   // Stage4
  const enableMemory = ref(true)        // Stage9
  const enableStore = ref(true)         // Stage10
  const showThinking = ref(true)        // Stage6
  const showRetrieved = ref(true)       // Stage7

  // 知识库
  const knowledgeReady = ref(false)
  const docCount = ref(0)

  // 统计
  const tokenStats = ref({ prompt: 0, completion: 0, total: 0 })
  const memoryRounds = ref(0)

  // === 核心方法 ===
  async function send(userInput) { /* Agent 流式调用 + 消息段解析 */ }
  async function initKnowledge() { /* 初始化内置知识库 */ }
  async function uploadFile(file) { /* FileReader 读取 + 分片 + 向量化 */ }
  function switchTenant(tenantId) { /* 切换租户 → 重建 Agent + 切换知识库 */ }
  function newThread() { /* 生成新 threadId */ }

  return { /* ... */ }
}
```

---

## 7. 目录结构

```
src/
├── pages/
│   └── customer-agent/
│       └── CustomerChat.vue              # 主对话界面（唯一新增页面）
├── composables/
│   └── useCustomerAgent.js               # 客服 Agent composable（新增）
│
└── (现有文件保持不变...)
```

> 不需要新增 BFF 目录，不需要新增后端代码。所有逻辑在 [`CustomerChat.vue`](src/pages/customer-agent/CustomerChat.vue) 和 [`useCustomerAgent.js`](src/composables/useCustomerAgent.js) 中完成，与现有 Stage1-Stage10 架构完全一致。

---

## 8. 实施路线图

```
┌─────────────────────────────────────────────────────────────────┐
│                    实施路线图（6 个 Phase）                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Phase 1: 基础框架                                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ □ CustomerChat.vue 页面骨架 + useCustomerAgent           │    │
│  │ □ LLM 连接（复用现有 INNER_API_KEY）                     │    │
│  │ □ 基础对话功能（Stage1 Prompt + Stage3 Stream）          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          ↓                                         │
│  Phase 2: Agent + 工具                                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ □ 通用工具注册：计算器 + 天气（Stage5）                   │    │
│  │ □ createReactAgent 创建（Stage6）                        │    │
│  │ □ Agent 思考过程展示（Think→Act→Observe）                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          ↓                                         │
│  Phase 3: RAG 知识库                                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ □ 文档分片 + MemoryVectorStore（Stage7）                  │    │
│  │ □ RAG 检索链构建（Stage2）                                │    │
│  │ □ search_knowledge 工具集成                               │    │
│  │ □ 知识库上传 UI（FileReader）                             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          ↓                                         │
│  Phase 4: 记忆系统                                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ □ MemorySaver 短期记忆（Stage9）                          │    │
│  │ □ InMemoryStore 长期记忆（Stage10）                       │    │
│  │ □ 线程切换 + 用户偏好存取                                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          ↓                                         │
│  Phase 5: 增强特性                                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ □ 结构化输出（Stage4）— responseFormat + Zod             │    │
│  │ □ 中间件集成（Stage8）— 日志 + Token 统计                │    │
│  │ □ 流式渲染优化                                            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                          ↓                                         │
│  Phase 6: 多租户                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ □ 租户配置切换（Prompt + 知识库 + 工具集）               │    │
│  │ □ Store namespace 租户隔离验证                            │    │
│  │ □ 整体联调                                                │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 各阶段学习重点

| Phase | 涉及阶段 | 核心交付物 | 学习重点 |
|-------|---------|-----------|---------|
| Phase 1 | Stage1,3 | 页面骨架 + 基础对话 | Prompt 模板 + 流式输出 |
| Phase 2 | Stage5,6 | Agent 引擎 + 工具集 | `createReactAgent` + `tool()` |
| Phase 3 | Stage2,7 | RAG 检索链 + 知识库 | 文档→分片→向量→检索 全流程 |
| Phase 4 | Stage9,10 | 双层记忆系统 | MemorySaver vs InMemoryStore |
| Phase 5 | Stage3,4,8 | 流式优化 + 结构化 + 中间件 | 工程化增强 |
| Phase 6 | Stage1,7,10 | 多租户隔离 | namespace 分层设计实战 |