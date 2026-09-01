# LangChain.js 深入学习路线（基于内网大模型实战）

> 前置条件：已完成 [`InnerModelChat.vue`](../../pages/inner/InnerModelChat.vue) 的 LangChain.js 改造，能通过 `ChatOpenAI` + `invoke()` 正常调用内网大模型。
>
> 目标：从「会用」到「精通」，系统掌握 LangChain.js 的核心能力，能独立构建 LLM 驱动的 Agent 应用。

---

## 目录

1. [学习路线总览](#1-学习路线总览)
2. [阶段一：Prompt Template — 提示词模板](#2-阶段一prompt-template--提示词模板)
3. [阶段二：Chain — 链式调用](#3-阶段二chain--链式调用)
4. [阶段三：Tool Calling — 工具调用](#4-阶段三tool-calling--工具调用)
5. [阶段四：Agent — 智能体](#5-阶段四agent--智能体)
6. [阶段五：RAG — 检索增强生成](#6-阶段五rag--检索增强生成)
7. [阶段六：Streaming — 流式输出](#7-阶段六streaming--流式输出)
8. [阶段七：Structured Output — 结构化输出](#8-阶段七structured-output--结构化输出)
9. [进阶主题](#9-进阶主题)

---

## 1. 学习路线总览

```
┌──────────────────────────────────────────────────────────────────────────┐
│                  LangChain.js 深入学习路线（7 个阶段）                       │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  起点              阶段一          阶段二         阶段三         阶段四    │
│  ┌────────┐     ┌──────────┐   ┌────────┐   ┌────────┐   ┌────────┐   │
│  │ 当前   │ ──→ │ Prompt   │ → │ Chain  │ → │ Tool   │ → │ Agent  │   │
│  │ invoke │     │ Template │   │ 链式   │   │ Calling│   │ 智能体 │   │
│  └────────┘     └──────────┘   └────────┘   └────────┘   └────────┘   │
│                                                                          │
│  阶段五          阶段六          阶段七                                    │
│  ┌────────┐     ┌──────────┐   ┌──────────────┐                        │
│  │  RAG   │     │ Streaming│   │ Structured   │                        │
│  │ 检索增强│     │ 流式输出 │   │ Output 结构化 │                        │
│  └────────┘     └──────────┘   └──────────────┘                        │
│                                                                          │
│  每个阶段 = 概念讲解 + 可运行示例代码（Vue 组件）                             │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | Vue 2（Options API） | 项目现有技术栈 |
| LLM 调用 | `@langchain/openai` `ChatOpenAI` | 已安装 ✅ |
| 消息类型 | `@langchain/core/messages` | 已安装 ✅ |
| API 代理 | Vue CLI devServer proxy `/inner` | 已配置 ✅ |
| API Key | Webpack DefinePlugin 注入 `INNER_API_KEY` | 已配置 ✅ |
| 模型 | `EB-DeepSeek-V4-Pro`（内网） | 已可用 ✅ |

### 示例代码位置

所有示例代码放在 `src/pages/inner/` 目录下，以独立 Vue 组件形式存在，可在左侧菜单中切换查看。

```
src/pages/inner/
├── InnerModelChat.vue          ← 当前已完成的 LangChain.js 调用（起点）
├── InnerModelPythonChat.vue    ← Python 调用
├── LangChainStage1Prompt.vue   ← 阶段一：Prompt Template
├── LangChainStage2Chain.vue    ← 阶段二：Chain 链式调用
├── LangChainStage3Tool.vue     ← 阶段三：Tool Calling
├── LangChainStage4Agent.vue    ← 阶段四：Agent
├── LangChainStage5RAG.vue      ← 阶段五：RAG
├── LangChainStage6Stream.vue   ← 阶段六：Streaming
└── LangChainStage7Structured.vue ← 阶段七：Structured Output
```

---

## 2. 阶段一：Prompt Template — 提示词模板

### 2.1 概念

当前 [`InnerModelChat.vue`](../../pages/inner/InnerModelChat.vue) 中，System Prompt 是硬编码的字符串：

```javascript
const langChainMessages = [
  new SystemMessage('你是一个有用的AI助手，请用中文回答。'),
  ...historyMessages,
]
```

**Prompt Template** 将提示词抽象为模板，支持变量插值，实现提示词的复用和动态构造。

### 2.2 核心 API

| API | 说明 |
|-----|------|
| `ChatPromptTemplate.fromMessages()` | 从消息数组创建模板 |
| `MessagesPlaceholder` | 占位符，用于插入历史消息列表 |
| `prompt.formatMessages()` | 格式化模板，传入变量值 |
| `prompt.pipe(model)` | 将模板与模型串联成链 |

### 2.3 示例代码

→ [`LangChainStage1Prompt.vue`](../../pages/langchain/LangChainStage1Prompt.vue)

**学习要点：**
- 如何用 `ChatPromptTemplate` 替代硬编码 System Prompt
- `MessagesPlaceholder` 的作用——在模板中为对话历史预留位置
- 模板变量 `{role}` `{language}` 的动态替换

---

## 3. 阶段二：Chain — 链式调用

### 3.1 概念

当前代码中，每次调用都需要手动构造消息数组、创建 `ChatOpenAI` 实例、调用 `invoke()`。**Chain（链）** 将这些步骤组合成一个可复用的管道。

LCEL（LangChain Expression Language）使用 `.pipe()` 方法串联组件：

```
PromptTemplate → ChatOpenAI → OutputParser
```

### 3.2 核心 API

| API | 说明 |
|-----|------|
| `.pipe()` | LCEL 管道操作符，串联 Runnable |
| `StringOutputParser` | 将 AIMessage 解析为纯文本字符串 |
| `RunnableSequence` | 多个 Runnable 组成的序列 |
| `chain.invoke()` | 执行链，传入输入变量 |

### 3.3 示例代码

→ [`LangChainStage2Chain.vue`](../../pages/langchain/LangChainStage2Chain.vue)

**学习要点：**
- LCEL `.pipe()` 管道模式的威力
- `StringOutputParser` 简化输出处理（不再需要 `.content`）
- 链的复用——创建一次，多次调用
- 与阶段一代码的对比：从手动组装到声明式管道

---

## 4. 阶段三：Tool Calling — 工具调用

### 4.1 概念

Tool Calling 让 LLM 能够调用外部函数/API，获取实时数据或执行操作。这是 Agent 的基础能力。

流程：
```
用户问题 → LLM 决定调用哪个工具 → 执行工具 → 将结果返回 LLM → LLM 生成最终回复
```

### 4.2 核心 API

| API | 说明 |
|-----|------|
| `llm.bindTools([...tools])` | 将工具绑定到模型 |
| `tool()` from `@langchain/core/tools` | 定义工具函数 |
| `zod` schema | 定义工具参数的类型和描述 |
| `AIMessage.tool_calls` | LLM 返回的工具调用请求 |
| `ToolMessage` | 工具执行结果消息 |

### 4.3 示例代码

→ [`LangChainStage3Tool.vue`](../../pages/langchain/LangChainStage3Tool.vue)

**学习要点：**
- 用 `tool()` 定义工具，Zod schema 描述参数
- `bindTools()` 让模型知道有哪些工具可用
- 手动处理 tool_calls 循环（调用工具 → 返回结果 → LLM 再生成）
- 这是理解 Agent 的前置知识

---

## 5. 阶段四：Agent — 智能体

### 5.1 概念

Agent 是 Tool Calling 的自动化版本。它自动处理「思考→调用工具→观察结果→再思考」的循环，直到得出最终答案。

```
┌──────────────────────────────────────────┐
│                  Agent                    │
│  ┌────────┐   ┌────────┐   ┌─────────┐  │
│  │ Think  │ → │  Act   │ → │ Observe │  │
│  │ 思考   │   │ 执行工具│   │ 观察结果│  │
│  └────────┘   └────────┘   └─────────┘  │
│       ↑                         │        │
│       └─────────────────────────┘        │
│              循环直到完成                  │
└──────────────────────────────────────────┘
```

### 5.2 核心 API

| API | 说明 |
|-----|------|
| `createReactAgent()` | 创建 ReAct 模式 Agent |
| `AgentExecutor` | Agent 执行器（旧版 API） |
| `agent.invoke()` | 执行 Agent，自动处理工具循环 |

### 5.3 示例代码

→ [`LangChainStage4Agent.vue`](../../pages/langchain/LangChainStage4Agent.vue)

**学习要点：**
- Agent 与手动 Tool Calling 的区别——自动化循环
- ReAct（Reasoning + Acting）模式
- Agent 的中间步骤（intermediateSteps）——可观察思考过程
- 与阶段三代码的对比

---

## 6. 阶段五：RAG — 检索增强生成

### 6.1 概念

RAG（Retrieval-Augmented Generation）让 LLM 能够基于外部知识库回答问题，解决「模型训练数据过时」和「幻觉」问题。

```
用户问题 → 检索相关文档 → 将文档注入 Prompt → LLM 基于文档回答
```

### 6.2 核心 API

| API | 说明 |
|-----|------|
| `RecursiveCharacterTextSplitter` | 文档分割器 |
| `MemoryVectorStore` | 内存向量存储（无需外部数据库） |
| `OpenAIEmbeddings` | 文本嵌入（向量化） |
| `createStuffDocumentsChain()` | 创建文档填充链 |
| `createRetrievalChain()` | 创建检索链 |

### 6.3 示例代码

→ [`LangChainStage5RAG.vue`](../../pages/langchain/LangChainStage5RAG.vue)

**学习要点：**
- 文档加载 → 分割 → 向量化 → 存储 → 检索的完整流程
- `MemoryVectorStore` 用于演示（生产环境用 Pinecone/Chroma 等）
- 检索到的文档如何注入 Prompt
- 注意：内网模型的 embedding API 可能与 OpenAI 不同，需要适配

---

## 7. 阶段六：Streaming — 流式输出

### 7.1 概念

当前 `invoke()` 是等待完整响应后一次性返回。`stream()` 可以逐 token 返回，实现打字机效果，提升用户体验。

### 7.2 核心 API

| API | 说明 |
|-----|------|
| `llm.stream(messages)` | 流式调用，返回 AsyncIterable |
| `for await...of` | 遍历流式 chunk |
| `AIMessageChunk` | 流式响应的消息块类型 |
| `chain.stream()` | 链也自动支持流式（LCEL 的优势） |

### 7.3 示例代码

→ [`LangChainStage6Stream.vue`](../../pages/langchain/LangChainStage6Stream.vue)

**学习要点：**
- `stream()` vs `invoke()` 的区别
- `for await...of` 消费 AsyncIterable
- 在 Vue 中实时更新 UI（逐字显示）
- LCEL 链自动获得流式能力

---

## 8. 阶段七：Structured Output — 结构化输出

### 8.1 概念

默认情况下，LLM 返回的是自由文本。但在很多场景中，我们需要 LLM 输出**符合预定义结构的数据**（如 JSON），以便程序直接解析和使用。

**典型应用场景：**
- 📇 **信息提取**：从文本中提取人物、事件、数值等结构化信息
- 📊 **情感分析**：输出标准化的情感标签 + 置信度
- 🏷️ **文本分类**：将文本归类到预定义的类别体系
- 📝 **表单填充**：从自然语言描述中提取表单字段

LangChain.js 提供三种方式实现结构化输出：

| 方式 | 复杂度 | 适用场景 |
|------|--------|----------|
| `withStructuredOutput()` + Zod | ⭐ 低 | **推荐**，直接返回 JS 对象 |
| `StructuredOutputParser` | ⭐⭐ 中 | 需要自定义格式指令时 |
| `response_format: json_object` | ⭐⭐⭐ 高 | 模型原生支持 JSON Mode 时 |

### 8.2 核心 API

| API | 说明 |
|-----|------|
| `llm.withStructuredOutput(schema)` | 绑定 Zod schema，返回解析好的 JS 对象 |
| `z.object({...})` | Zod 定义输出结构（字段名、类型、描述） |
| `z.enum([...])` | 枚举类型约束 |
| `z.array(z.string())` | 数组类型约束 |
| `StructuredOutputParser.fromZodSchema()` | 从 Zod schema 创建解析器 |
| `parser.getFormatInstructions()` | 生成格式指令文本（注入 Prompt） |
| `parser.parse(text)` | 将 LLM 文本输出解析为 JS 对象 |
| `modelKwargs.response_format` | OpenAI 兼容的 JSON Mode 参数 |

### 8.3 示例代码

→ [`LangChainStage7Structured.vue`](../../pages/langchain/LangChainStage7Structured.vue)

**学习要点：**
- 用 Zod 定义输出 schema——`z.object()`、`z.enum()`、`z.array()`、`.describe()`
- `withStructuredOutput()` 一步到位：绑定 schema → 调用 → 直接拿到 JS 对象
- `StructuredOutputParser` 的两步流程：注入格式指令 → LLM 输出 → `parser.parse()`
- `response_format: { type: 'json_object' }` 的 OpenAI 兼容用法
- 结构化输出建议设置 `temperature: 0` 以提高输出稳定性
- 三种方式的对比：代码量、灵活性、模型兼容性

---

## 9. 进阶主题

完成七个阶段后，可以进一步探索：

| 主题 | 说明 | 相关包 |
|------|------|--------|
| **Memory** | 对话记忆管理（摘要记忆、缓冲记忆） | `@langchain/core` |
| **Multi-Agent** | 多个 Agent 协作 | `langgraph` |
| **LangGraph** | 状态图工作流引擎 | `@langchain/langgraph` |
| **Callback** | 自定义回调（日志、监控） | `@langchain/core` |
| **Cache** | 响应缓存（减少 API 调用） | `@langchain/core` |
| **Fallback** | 模型降级策略 | `@langchain/core` |

---

## 参考资源

- [LangChain.js 官方文档](https://js.langchain.com/docs/introduction/)
- [LangChain.js API 参考](https://api.js.langchain.com/)
- [LCEL 指南](https://js.langchain.com/docs/concepts/lcel/)
- [本项目 LangChain.js 学习路径（概念版）](langchain-js-learning-path.md)
- [本项目 LangChain 指南（Python 版）](langchain-guide.md)