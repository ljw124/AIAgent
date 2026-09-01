# LangChain.js 前端学习路径

> 面向前端开发者（Vue/React），以 **LangChain.js** 为主线，兼顾对 Python 版 LangChain 的概念了解。目标：能用 JS/TS 构建 LLM 驱动的 Agent 应用。

---

## 目录

1. [学习路线总览](#1-学习路线总览)
2. [阶段零：JS/TS 基础回顾](#2-阶段零jsts-基础回顾)
3. [阶段一：LangChain.js 核心概念](#3-阶段一langchainjs-核心概念)
4. [阶段二：RAG — 检索增强生成](#4-阶段二rag--检索增强生成)
5. [阶段三：Agent 与 Tool Calling](#5-阶段三agent-与-tool-calling)
6. [阶段四：生产级实践](#6-阶段四生产级实践)
7. [Python 版概念对照（了解即可）](#7-python-版概念对照了解即可)
8. [技术选型建议](#8-技术选型建议)
9. [推荐资源](#9-推荐资源)

---

## 1. 学习路线总览

```
┌─────────────────────────────────────────────────────────────────┐
│                     LangChain.js 前端学习路线                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  阶段零          阶段一           阶段二         阶段三     阶段四 │
│  JS/TS 回顾  →  核心概念  →  RAG 检索  →  Agent  →  生产实践    │
│  (1周)         (1-2周)       (2周)        (2周)      (持续)     │
│                                                                 │
│  ┌────────┐  ┌──────────┐  ┌────────┐  ┌────────┐  ┌────────┐ │
│  │ Promise │  │ Model I/O│  │ Loader │  │ Tool   │  │ 错误处理│ │
│  │ async   │  │ Prompt   │  │ Split  │  │ Agent  │  │ 重试    │ │
│  │ Type    │  │ Chain    │  │ Vector │  │ Memory │  │ 监控    │ │
│  │ Stream  │  │ LCEL     │  │ Search │  │ Graph  │  │ 部署    │ │
│  └────────┘  └──────────┘  └────────┘  └────────┘  └────────┘ │
│                                                                 │
│  ───────────── 同步了解 Python 版概念（不写代码）─────────────    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 你的技术栈定位

| 层级 | 技术 | 你的现状 |
|------|------|----------|
| 前端 UI | Vue 2 + [`useAIChat`](../composables/useAIChat.js) composable | ✅ 已有 |
| AI 交互 | Vercel AI SDK（[`vercel-ai-sdk-guide.md`](vercel-ai-sdk-guide.md)） | ✅ 已有文档 |
| Agent 编排 | **LangChain.js** ← 本次学习目标 | 🔲 待学习 |
| 概念参考 | LangChain Python 版（[`langchain-guide.md`](langchain-guide.md)） | ✅ 已有文档 |

---

## 2. 阶段零：JS/TS 基础回顾

学习 LangChain.js 前，确保以下 JS/TS 概念扎实。

### 2.1 Promise 与 async/await

LangChain.js 所有 API 都是异步的。

```typescript
// 基本模式
const result = await model.invoke("Hello");

// 批量并发
const results = await Promise.all([
  model.invoke("问题1"),
  model.invoke("问题2"),
]);

// 错误处理
try {
  const result = await chain.invoke({ question: "..." });
} catch (error) {
  console.error("调用失败:", error);
}
```

### 2.2 TypeScript 泛型与类型推导

LangChain.js 重度使用 TypeScript，类型系统是其核心优势。

```typescript
// 泛型约束输入输出类型
import { Runnable } from "@langchain/core/runnables";

const chain: Runnable<string, string> = prompt.pipe(model).pipe(parser);

// 类型会自动推导
const result: string = await chain.invoke("hello"); // ✅ 类型安全
```

### 2.3 流式处理（Stream / AsyncIterator）

```typescript
// LangChain.js 流式输出
const stream = await model.stream("讲个故事");
for await (const chunk of stream) {
  process.stdout.write(chunk.content); // 逐字输出
}

// 结合 Vercel AI SDK 的流式处理
import { StreamingTextResponse } from "ai";
// 将 LangChain 流转换为 AI SDK 兼容格式
```

### 2.4 函数式编程模式

```typescript
// LCEL 管道模式（类似 RxJS pipe）
const chain = prompt.pipe(model).pipe(parser);

// RunnableLambda 函数式转换
import { RunnableLambda } from "@langchain/core/runnables";

const chain = prompt
  .pipe(model)
  .pipe(new RunnableLambda({ func: (x) => x.content.toUpperCase() }));
```

---

## 3. 阶段一：LangChain.js 核心概念

### 3.1 安装与项目初始化

```bash
# 核心包（必装）
npm install @langchain/core

# LLM 提供商
npm install @langchain/openai        # OpenAI
npm install @langchain/anthropic     # Anthropic Claude

# 社区集成（按需）
npm install @langchain/community
```

### 3.2 Model I/O — 模型交互

```typescript
import { ChatOpenAI } from "@langchain/openai";

// 初始化模型
const model = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0.7,
  maxTokens: 2048,
});

// 基本调用
const response = await model.invoke("Hello, world!");
console.log(response.content); // AI 回复文本

// 流式调用
const stream = await model.stream("讲个笑话");
for await (const chunk of stream) {
  console.log(chunk.content); // 逐 token 输出
}

// 批量调用
const results = await model.batch([
  "问题1",
  "问题2",
  "问题3",
]);
```

### 3.3 Prompt Template — 提示词模板

```typescript
import { ChatPromptTemplate } from "@langchain/core/prompts";

// 从消息列表创建
const prompt = ChatPromptTemplate.fromMessages([
  ["system", "你是一个{role}助手，请用{language}回答"],
  ["human", "{input}"],
]);

// 格式化
const formatted = await prompt.format({
  role: "前端开发",
  language: "中文",
  input: "解释什么是闭包",
});

// 直接与模型串联
const chain = prompt.pipe(model);
const result = await chain.invoke({
  role: "前端开发",
  language: "中文",
  input: "解释什么是闭包",
});
```

### 3.4 LCEL — LangChain 表达式语言

LCEL 使用 `.pipe()` 方法串联组件，是 LangChain.js 的核心设计模式。

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

// 构建链
const chain = ChatPromptTemplate.fromTemplate("讲一个关于{topic}的笑话")
  .pipe(new ChatOpenAI({ model: "gpt-4o-mini" }))
  .pipe(new StringOutputParser());

// 调用
const joke = await chain.invoke({ topic: "程序员" });
console.log(joke); // 纯文本字符串

// LCEL 的优势：
// 1. 类型安全 — 输入输出类型自动推导
// 2. 流式支持 — 自动获得 .stream() 能力
// 3. 可组合 — 链可以嵌套组合
```

### 3.5 Output Parser — 输出解析

```typescript
import { StringOutputParser } from "@langchain/core/output_parsers";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { z } from "zod"; // 用 Zod 定义 schema

// 字符串解析器（最简单）
const parser = new StringOutputParser();
const text = await parser.parse(aiMessage);

// 结构化输出（用 Zod schema）
const schema = z.object({
  name: z.string().describe("人物姓名"),
  age: z.number().describe("年龄"),
  skills: z.array(z.string()).describe("技能列表"),
});

const parser = StructuredOutputParser.fromZodSchema(schema);
const chain = prompt.pipe(model).pipe(parser);

const result = await chain.invoke({ input: "张三，28岁，会Python和TypeScript" });
// result: { name: "张三", age: 28, skills: ["Python", "TypeScript"] }
```

### 3.6 动手练习

```typescript
// 练习：构建一个翻译链
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

const translateChain = ChatPromptTemplate.fromTemplate(
  "将以下文本翻译成{target_language}：\n\n{text}"
)
  .pipe(new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.3 }))
  .pipe(new StringOutputParser());

const result = await translateChain.invoke({
  text: "Hello, how are you?",
  target_language: "中文",
});
console.log(result); // "你好，你怎么样？"
```

---

## 4. 阶段二：RAG — 检索增强生成

RAG 是 LangChain 最经典的应用场景：让 LLM 基于你的私有知识库回答问题。

### 4.1 文档加载

```typescript
import { TextLoader } from "langchain/document_loaders/fs/text";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { CSVLoader } from "@langchain/community/document_loaders/fs/csv";

// 加载文本文件
const loader = new TextLoader("./docs/readme.txt");
const docs = await loader.load();

// 加载 PDF
const pdfLoader = new PDFLoader("./docs/report.pdf");
const pdfDocs = await pdfLoader.load();

// 每个 doc 结构：
// { pageContent: "文档内容...", metadata: { source: "文件路径" } }
```

### 4.2 文本分割

```typescript
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,    // 每块最大字符数
  chunkOverlap: 200,  // 块之间重叠字符数
});

const splitDocs = await splitter.splitDocuments(docs);
console.log(`分割为 ${splitDocs.length} 个文档块`);
```

### 4.3 向量嵌入与存储

```typescript
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";

// 创建嵌入模型
const embeddings = new OpenAIEmbeddings();

// 创建向量存储（内存版，适合开发）
const vectorStore = await MemoryVectorStore.fromDocuments(
  splitDocs,
  embeddings
);

// 相似度搜索
const relevantDocs = await vectorStore.similaritySearch("你的问题", 4);
```

### 4.4 构建 RAG 链

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";

// 1. 创建 retriever
const retriever = vectorStore.asRetriever({ k: 4 });

// 2. 创建 QA 链
const qaPrompt = ChatPromptTemplate.fromTemplate(`
根据以下上下文回答问题。如果无法从上下文中找到答案，请说"我不知道"。

上下文：
{context}

问题：{input}

回答：
`);

const combineDocsChain = await createStuffDocumentsChain({
  llm: new ChatOpenAI({ model: "gpt-4o" }),
  prompt: qaPrompt,
  outputParser: new StringOutputParser(),
});

// 3. 创建检索链
const ragChain = await createRetrievalChain({
  retriever,
  combineDocsChain,
});

// 4. 使用
const result = await ragChain.invoke({
  input: "你的问题",
});
console.log(result.answer);
```

### 4.5 动手练习

```typescript
// 练习：构建一个代码库问答机器人
// 1. 加载你的项目文件
// 2. 分割为代码块
// 3. 存入向量数据库
// 4. 用自然语言提问代码相关问题
```

---

## 5. 阶段三：Agent 与 Tool Calling

Agent 是 LangChain 最强大的能力——让 LLM 自主决定使用哪些工具、按什么顺序执行。

### 5.1 定义 Tool

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// 方式一：用 tool() 函数 + Zod schema
const searchTool = tool(
  async ({ query }) => {
    // 模拟搜索
    return `搜索结果：关于"${query}"的资料...`;
  },
  {
    name: "web_search",
    description: "搜索互联网获取最新信息",
    schema: z.object({
      query: z.string().describe("搜索关键词"),
    }),
  }
);

const calculatorTool = tool(
  async ({ expression }) => {
    try {
      // 注意：生产环境不要用 eval，这里仅作示例
      return String(Function(`"use strict"; return (${expression})`)());
    } catch {
      return "计算错误";
    }
  },
  {
    name: "calculator",
    description: "执行数学计算，输入数学表达式",
    schema: z.object({
      expression: z.string().describe("数学表达式，如 '2 + 3 * 4'"),
    }),
  }
);
```

### 5.2 创建 Agent

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { createToolCallingAgent } from "langchain/agents";
import { AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const model = new ChatOpenAI({ model: "gpt-4o", temperature: 0 });

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "你是一个有用的助手，可以使用工具来回答问题。"],
  ["human", "{input}"],
  ["placeholder", "{agent_scratchpad}"],
]);

// 创建 Agent
const agent = await createToolCallingAgent({
  llm: model,
  tools: [searchTool, calculatorTool],
  prompt,
});

// 创建执行器
const agentExecutor = new AgentExecutor({
  agent,
  tools: [searchTool, calculatorTool],
  verbose: true, // 打印执行过程
});

// 使用
const result = await agentExecutor.invoke({
  input: "2024年北京GDP增长率是多少？把这个数字乘以2",
});
console.log(result.output);
```

### 5.3 Agent 执行流程

```
用户输入 → Agent 思考 → 决定调用工具 → 执行工具 → 获取结果
                                    ↑                    ↓
                                    └── 需要更多信息？ ←──┘
                                    ↓ 不需要
                                 生成最终回答 → 返回用户
```

### 5.4 动手练习

```typescript
// 练习：构建一个数据分析 Agent
// 工具1：查询数据库
// 工具2：生成图表
// 工具3：导出报告
// Agent 根据用户需求自动组合这些工具
```

---

## 6. 阶段四：生产级实践

### 6.1 错误处理与重试

```typescript
import { ChatOpenAI } from "@langchain/openai";

const model = new ChatOpenAI({
  model: "gpt-4o",
  maxRetries: 3,              // 自动重试
  timeout: 30000,             // 30 秒超时
  maxConcurrency: 5,          // 最大并发数
});

// 手动重试逻辑
async function invokeWithFallback(chain, input) {
  try {
    return await chain.invoke(input);
  } catch (error) {
    console.error("主模型失败，切换到备用模型:", error.message);
    const fallbackModel = new ChatOpenAI({ model: "gpt-4o-mini" });
    return await fallbackModel.invoke(input);
  }
}
```

### 6.2 流式响应 + 前端展示

```typescript
// 后端（Node.js / Next.js API Route）
export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = await agentExecutor.stream({ input: messages });

  // 转换为 AI SDK 兼容的流
  const textEncoder = new TextEncoder();
  const readableStream = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.output) {
          controller.enqueue(textEncoder.encode(chunk.output));
        }
      }
      controller.close();
    },
  });

  return new Response(readableStream);
}

// 前端（Vue 2 中使用 useAIChat）
// useAIChat 已封装了 SSE 解析，只需配置 endpoint 即可
```

### 6.3 与 Vercel AI SDK 配合

```typescript
// LangChain.js 负责 Agent 编排
// Vercel AI SDK 负责流式传输和前端 UI

import { LangChainAdapter } from "ai";

// 将 LangChain 流转换为 AI SDK 兼容格式
export async function POST(req: Request) {
  const { messages } = await req.json();
  const stream = await agentExecutor.stream({ input: messages });
  return LangChainAdapter.toDataStreamResponse(stream);
}
```

### 6.4 监控与调试

```typescript
// LangSmith 追踪（可选）
import { Client } from "langsmith";

const client = new Client({
  apiKey: process.env.LANGCHAIN_API_KEY,
});

// 或在模型初始化时配置
const model = new ChatOpenAI({
  model: "gpt-4o",
  callbacks: [
    {
      handleLLMStart: async (llm, prompts) => {
        console.log("LLM 调用开始:", prompts);
      },
      handleLLMEnd: async (output) => {
        console.log("LLM 调用完成，Token 用量:", output.llmOutput);
      },
    },
  ],
});
```

---

## 7. Python 版概念对照（了解即可）

作为前端开发者，不需要写 Python 代码，但理解 Python 版的概念有助于：
- 阅读社区教程和博客（大部分是 Python 版）
- 与后端 AI 工程师协作
- 理解 LangChain 的设计思想

### 核心概念一一对应

| 概念 | Python 版 | LangChain.js | 说明 |
|------|-----------|-------------|------|
| 模型调用 | `model.invoke()` | `model.invoke()` | API 完全一致 |
| 提示词模板 | `ChatPromptTemplate.from_messages()` | `ChatPromptTemplate.fromMessages()` | 方法名驼峰化 |
| 管道串联 | `prompt \| model \| parser` | `prompt.pipe(model).pipe(parser)` | Python 用 `\|`，JS 用 `.pipe()` |
| 输出解析 | `StrOutputParser()` | `new StringOutputParser()` | JS 需要 `new` |
| 工具定义 | `@tool` 装饰器 | `tool()` 函数 | 语法不同，概念相同 |
| Agent 创建 | `create_tool_calling_agent()` | `createToolCallingAgent()` | 函数名驼峰化 |
| 流式输出 | `model.astream()` | `model.stream()` | JS 统一用 `stream()` |
| 类型系统 | Pydantic | Zod | 不同的 schema 库 |

### 阅读 Python 教程时的「翻译」技巧

```python
# Python 版代码
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from langchain_core.output_parsers import StrOutputParser

prompt = ChatPromptTemplate.from_template("讲一个关于{topic}的笑话")
model = ChatOpenAI(model="gpt-4o-mini")
parser = StrOutputParser()

chain = prompt | model | parser
result = chain.invoke({"topic": "程序员"})
```

```typescript
// 对应的 LangChain.js 代码
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";

const prompt = ChatPromptTemplate.fromTemplate("讲一个关于{topic}的笑话");
const model = new ChatOpenAI({ model: "gpt-4o-mini" });
const parser = new StringOutputParser();

const chain = prompt.pipe(model).pipe(parser);
const result = await chain.invoke({ topic: "程序员" });
```

**关键差异**：
1. `from_template` → `fromTemplate`（驼峰命名）
2. `ChatOpenAI(model="...")` → `new ChatOpenAI({ model: "..." })`（需要 `new` + 对象参数）
3. `|` 操作符 → `.pipe()` 方法
4. 所有调用加 `await`

---

## 8. 技术选型建议

### 你的项目技术栈建议

```
┌──────────────────────────────────────────┐
│              前端 (Vue 2)                 │
│  useAIChat composable + AISDKChat.vue    │
│  负责：UI 展示、流式渲染、用户交互         │
└──────────────┬───────────────────────────┘
               │ HTTP/SSE
┌──────────────▼───────────────────────────┐
│           BFF 层 (Node.js)               │
│  Vercel AI SDK + LangChain.js            │
│  负责：Agent 编排、Tool Calling、RAG      │
└──────────────┬───────────────────────────┘
               │
┌──────────────▼───────────────────────────┐
│           外部服务                         │
│  OpenAI API / 向量数据库 / 业务 API       │
└──────────────────────────────────────────┘
```

### 渐进式引入策略

| 阶段 | 做什么 | 用什么 |
|------|--------|--------|
| **当前** | 直接调 AI API | Vercel AI SDK（已有） |
| **第一步** | 加 Prompt 模板和输出解析 | LangChain.js Core |
| **第二步** | 构建 RAG 知识库问答 | + Vector Store |
| **第三步** | 构建 Agent 自动调用工具 | + Agent + Tools |
| **第四步** | 生产优化（缓存、监控、降级） | + LangSmith + 缓存层 |

---

## 9. 推荐资源

### 官方文档（必读）

| 资源 | 链接 | 说明 |
|------|------|------|
| LangChain.js 官方文档 | https://js.langchain.com | JS 版入口 |
| LangChain.js API 参考 | https://api.js.langchain.com | 类和方法查询 |
| LCEL 入门 | https://js.langchain.com/docs/expression_language/ | 核心设计模式 |
| Vercel AI SDK | https://sdk.vercel.ai/docs | 与 LangChain 配合使用 |

### 教程与示例

| 资源 | 说明 |
|------|------|
| LangChain.js Quickstart | 官方 5 分钟入门 |
| Build an Agent | 官方 Agent 教程 |
| RAG Tutorial | 官方 RAG 教程 |
| LangChain.js GitHub | 源码中的 examples 目录 |

### 概念参考（Python 版，了解即可）

| 资源 | 说明 |
|------|------|
| [langchain-guide.md](langchain-guide.md) | 项目内已有，Python 版完整指南 |
| [python-knowledge-for-langchain.md](python-knowledge-for-langchain.md) | Python 基础知识（按需查阅） |
| LangChain Python 文档 | https://python.langchain.com |

---

## 附录：快速开始模板

```bash
# 1. 创建 Node.js 项目
mkdir my-langchain-app && cd my-langchain-app
npm init -y

# 2. 安装依赖
npm install @langchain/core @langchain/openai
npm install -D typescript @types/node

# 3. 设置环境变量（.env）
# OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx

# 4. 创建 index.ts
```

```typescript
// index.ts — 最小可运行示例
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

async function main() {
  const prompt = ChatPromptTemplate.fromTemplate(
    "用{language}解释：{concept}"
  );
  const model = new ChatOpenAI({ model: "gpt-4o-mini" });
  const parser = new StringOutputParser();

  const chain = prompt.pipe(model).pipe(parser);

  const result = await chain.invoke({
    language: "中文",
    concept: "闭包",
  });

  console.log(result);
}

main().catch(console.error);
```

```bash
# 5. 运行
npx tsx index.ts
```

---

> **提示**：本文档应与项目内其他文档配合阅读：
> - [`langchain-guide.md`](langchain-guide.md) — Python 版完整指南（概念参考）
> - [`vercel-ai-sdk-guide.md`](vercel-ai-sdk-guide.md) — Vercel AI SDK 前端集成
> - [`python-knowledge-for-langchain.md`](python-knowledge-for-langchain.md) — Python 基础知识（按需查阅）