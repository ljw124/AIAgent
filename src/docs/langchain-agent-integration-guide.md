# LangChain Agent 集成完整流程

> 本文档详细说明如何在现有 Vue 2 项目中集成 LangChain.js Agent，涵盖从架构设计、BFF 层搭建、Agent 开发、前后端联调到生产部署的完整流程。

---

## 目录

1. [架构总览](#1-架构总览)
2. [阶段一：BFF 层搭建（Node.js 后端）](#2-阶段一bff-层搭建)
3. [阶段二：Agent 核心开发](#3-阶段二agent-核心开发)
4. [阶段三：SSE 流式适配（对接现有前端）](#4-阶段三sse-流式适配)
5. [阶段四：前端集成](#5-阶段四前端集成)
6. [阶段五：生产化增强](#6-阶段五生产化增强)
7. [完整代码清单](#7-完整代码清单)
8. [常见问题排查](#8-常见问题排查)

---

## 1. 架构总览

### 1.1 目标架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      前端 (Vue 2)                                │
│                                                                 │
│  AISDKChat.vue  ←──  useAIChat composable  ←──  SSE 流式消费    │
│                                                                 │
│  已有能力：                                                      │
│  ✅ 消息列表渲染（user / assistant）                             │
│  ✅ 多段展示（thinking / tool_use / tool_result / text）         │
│  ✅ 流式接收（SSE ReadableStream 解析）                          │
│  ✅ stop / reload / clear                                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ POST /api/agent/chat
                           │ Accept: text/event-stream
┌──────────────────────────▼──────────────────────────────────────┐
│                    BFF 层 (Node.js / Express)                    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Agent Service (agent-service.js)             │   │
│  │                                                           │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │   │
│  │  │  Tools   │  │  Agent   │  │  SSE Adapter         │   │   │
│  │  │  工具集   │  │  执行器   │  │  流式适配器           │   │   │
│  │  └──────────┘  └──────────┘  └──────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                      外部服务                                    │
│  OpenAI API  │  向量数据库  │  业务 API  │  数据库               │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 与现有架构的关系

| 现有组件 | 集成后的变化 |
|----------|-------------|
| [`useAIChat.js`](../composables/useAIChat.js) | **无需修改** — 只需改 `endpoint` 指向新的 Agent API |
| [`AISDKChat.vue`](../pages/AISDKChat.vue) | **无需修改** — segments 结构保持不变 |
| 现有 API `/api/text2db/chatbi/chatbot/dataAnalysis` | **保留** — 新 Agent API 作为独立端点 |
| SSE 消息格式 (`thinking`/`tool_use`/`tool_result`/`text`) | **完全兼容** — Agent 输出适配为相同格式 |

### 1.3 渐进式引入策略

```
第1步：搭建 BFF 层（Express + LangChain.js）
  └→ 新增 /api/agent/chat 端点，与现有 API 并存

第2步：开发第一个 Agent（简单问答 + 1个工具）
  └→ 验证链路：前端 → BFF → Agent → LLM → 前端

第3步：逐步增加工具和复杂度
  └→ 每加一个工具，前端 segments 自动展示

第4步：切换前端 endpoint
  └→ useAIChat 的 endpoint 从旧 API 切到新 Agent API
```

---

## 2. 阶段一：BFF 层搭建

### 2.1 项目初始化

```bash
# 在项目根目录创建 bff 目录
mkdir bff
cd bff

# 初始化 Node.js 项目
npm init -y

# 安装核心依赖
npm install express cors dotenv
npm install @langchain/core @langchain/openai
npm install langchain

# 安装开发依赖
npm install -D typescript @types/node @types/express tsx
```

### 2.2 目录结构

```
bff/
├── package.json
├── tsconfig.json
├── .env                          # API Key 等敏感配置
├── .env.example                  # 配置模板（提交到 Git）
├── src/
│   ├── index.ts                  # Express 入口，路由注册
│   ├── routes/
│   │   └── agent.routes.ts       # Agent 相关路由
│   ├── services/
│   │   └── agent.service.ts      # Agent 核心逻辑
│   ├── tools/
│   │   ├── index.ts              # 工具注册中心
│   │   ├── search.tool.ts        # 搜索工具
│   │   ├── database.tool.ts      # 数据库查询工具
│   │   └── calculator.tool.ts    # 计算工具
│   ├── adapters/
│   │   └── sse.adapter.ts        # LangChain 流 → SSE 格式适配
│   └── types/
│       └── index.ts              # 类型定义
└── data/                         # 本地数据文件（可选）
```

### 2.3 基础配置文件

**`.env`**（不要提交到 Git）：
```bash
# OpenAI
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL=gpt-4o

# 服务端口
PORT=3001

# LangSmith（可选，用于调试追踪）
LANGCHAIN_TRACING_V2=false
LANGCHAIN_API_KEY=ls_xxxxxxxxxxxxxxxxxxxx
LANGCHAIN_PROJECT=ai-agent
```

**`.env.example`**（提交到 Git）：
```bash
OPENAI_API_KEY=your-api-key-here
OPENAI_MODEL=gpt-4o
PORT=3001
LANGCHAIN_TRACING_V2=false
LANGCHAIN_API_KEY=your-langsmith-key-here
LANGCHAIN_PROJECT=ai-agent
```

**`tsconfig.json`**：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 2.4 Express 入口

**`src/index.ts`**：

```typescript
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { agentRouter } from "./routes/agent.routes.js";

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================================
// 中间件
// ============================================================
app.use(cors({
  origin: "http://localhost:8080", // Vue 开发服务器地址
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

// ============================================================
// 路由
// ============================================================
app.use("/api/agent", agentRouter);

// 健康检查
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ============================================================
// 全局错误处理
// ============================================================
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Server Error]", err);
  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : "服务器内部错误",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Agent BFF 服务已启动: http://localhost:${PORT}`);
  console.log(`📡 Agent API: http://localhost:${PORT}/api/agent/chat`);
});
```

### 2.5 路由定义

**`src/routes/agent.routes.ts`**：

```typescript
import { Router, Request, Response } from "express";
import { AgentService } from "../services/agent.service.js";

export const agentRouter = Router();

// 单例 AgentService（启动时初始化一次）
let agentService: AgentService | null = null;

async function getAgentService(): Promise<AgentService> {
  if (!agentService) {
    agentService = new AgentService();
    await agentService.initialize();
    console.log("✅ Agent 初始化完成");
  }
  return agentService;
}

// ============================================================
// POST /api/agent/chat — SSE 流式对话
// ============================================================
agentRouter.post("/chat", async (req: Request, res: Response) => {
  try {
    const { messages, convId, username } = req.body;

    // 参数校验
    if (!messages) {
      res.status(400).json({ error: "缺少 messages 参数" });
      return;
    }

    // 提取最后一条用户消息作为 Agent 输入
    const userMessage = typeof messages === "string"
      ? messages
      : (Array.isArray(messages)
          ? messages.filter((m: any) => m.role === "user").pop()?.content || messages
          : String(messages));

    if (!userMessage || (typeof userMessage === "string" && !userMessage.trim())) {
      res.status(400).json({ error: "消息内容为空" });
      return;
    }

    // 设置 SSE 响应头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // 禁用 Nginx 缓冲
    res.flushHeaders();

    // 获取 Agent 服务
    const service = await getAgentService();

    // 发送开始事件
    res.write(`data: ${JSON.stringify({ messageType: "start", convId, username })}\n\n`);

    // 流式执行 Agent
    try {
      await service.streamChat(userMessage, (chunk) => {
        // 每个 chunk 作为 SSE data 行发送
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      });
    } catch (agentError: any) {
      console.error("[Agent Error]", agentError);
      res.write(`data: ${JSON.stringify({
        messageType: "error",
        error: agentError.message || "Agent 执行错误",
        last: true,
      })}\n\n`);
    }

    // 发送结束标记
    res.write(`data: ${JSON.stringify({ messageType: "done", last: true })}\n\n`);
    res.end();

  } catch (error: any) {
    console.error("[Route Error]", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({ messageType: "error", error: error.message, last: true })}\n\n`);
      res.end();
    }
  }
});

// ============================================================
// GET /api/agent/tools — 获取可用工具列表
// ============================================================
agentRouter.get("/tools", async (_req: Request, res: Response) => {
  try {
    const service = await getAgentService();
    const tools = service.getAvailableTools();
    res.json({ tools });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// GET /api/agent/health — Agent 健康检查
// ============================================================
agentRouter.get("/health", async (_req: Request, res: Response) => {
  try {
    const service = await getAgentService();
    const status = service.getStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

---

## 3. 阶段二：Agent 核心开发

### 3.1 类型定义

**`src/types/index.ts`**：

```typescript
// ============================================================
// SSE 消息类型（与前端 useAIChat 的 processChunk 对齐）
// ============================================================

export type SSEMessageType = "thinking" | "tool_use" | "tool_result" | "text" | "error" | "start" | "done";

export interface SSEChunk {
  messageType: SSEMessageType;
  last?: boolean;

  // thinking 类型
  thinking?: string;

  // tool_use 类型
  toolUseList?: Array<{
    toolName: string;
    toolInput: string;
  }>;

  // tool_result 类型
  toolResult?: {
    toolOutputList: Array<{
      text: string;
    }>;
  };

  // text 类型
  content?: string;
  text?: string;

  // error 类型
  error?: string;
}

// ============================================================
// Agent 相关类型
// ============================================================

export interface ToolInfo {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}

export interface AgentStatus {
  initialized: boolean;
  model: string;
  toolCount: number;
  uptime: number;
}
```

### 3.2 工具定义

**`src/tools/calculator.tool.ts`**：

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * 数学计算工具
 * 注意：生产环境应使用 mathjs 等安全库替代 eval
 */
export const calculatorTool = tool(
  async ({ expression }) => {
    try {
      // 安全的白名单计算（仅允许数字和基本运算符）
      const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, "");
      const result = Function(`"use strict"; return (${sanitized})`)();
      return `计算结果: ${expression} = ${result}`;
    } catch (error: any) {
      return `计算错误: ${error.message}`;
    }
  },
  {
    name: "calculator",
    description: "执行数学计算。输入一个数学表达式，返回计算结果。支持加减乘除、括号、百分比。",
    schema: z.object({
      expression: z.string().describe("数学表达式，例如: '(100 + 200) * 0.8'"),
    }),
  }
);
```

**`src/tools/search.tool.ts`**：

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * 网络搜索工具（示例实现）
 * 生产环境可替换为 Tavily、SerpAPI 等真实搜索服务
 */
export const searchTool = tool(
  async ({ query }) => {
    // 模拟搜索 — 生产环境替换为真实 API 调用
    console.log(`[Search] 搜索关键词: ${query}`);

    // 示例：调用 Tavily Search API
    // const response = await fetch("https://api.tavily.com/search", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query }),
    // });
    // const data = await response.json();
    // return JSON.stringify(data.results);

    return JSON.stringify({
      query,
      results: [
        { title: `关于"${query}"的搜索结果1`, snippet: "这是搜索结果的摘要信息..." },
        { title: `关于"${query}"的搜索结果2`, snippet: "更多相关信息..." },
      ],
    });
  },
  {
    name: "web_search",
    description: "搜索互联网获取最新信息。当需要查找实时数据、新闻或未知信息时使用此工具。",
    schema: z.object({
      query: z.string().describe("搜索关键词，用简洁的语言描述你想查找的内容"),
    }),
  }
);
```

**`src/tools/database.tool.ts`**：

```typescript
import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * 数据库查询工具（示例）
 * 实际项目中连接你的业务数据库
 */
export const databaseTool = tool(
  async ({ sql }) => {
    // 模拟数据库查询 — 生产环境替换为真实数据库连接
    console.log(`[Database] 执行查询: ${sql}`);

    // 示例：使用 PostgreSQL
    // import { Pool } from "pg";
    // const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    // const result = await pool.query(sql);
    // return JSON.stringify(result.rows);

    // 安全检查：禁止危险操作
    const dangerousKeywords = ["DROP", "DELETE", "TRUNCATE", "ALTER", "INSERT", "UPDATE", "CREATE"];
    const upperSQL = sql.toUpperCase();
    for (const keyword of dangerousKeywords) {
      if (upperSQL.includes(keyword)) {
        return `错误：不允许执行 ${keyword} 操作。仅支持 SELECT 查询。`;
      }
    }

    return JSON.stringify({
      sql,
      rows: [
        { id: 1, name: "示例数据1", value: 100 },
        { id: 2, name: "示例数据2", value: 200 },
      ],
      rowCount: 2,
    });
  },
  {
    name: "query_database",
    description: "查询数据库获取业务数据。仅支持 SELECT 查询，不支持修改操作。",
    schema: z.object({
      sql: z.string().describe("SQL SELECT 查询语句"),
    }),
  }
);
```

**`src/tools/index.ts`** — 工具注册中心：

```typescript
import { StructuredTool } from "@langchain/core/tools";
import { calculatorTool } from "./calculator.tool.js";
import { searchTool } from "./search.tool.js";
import { databaseTool } from "./database.tool.js";
import { ToolInfo } from "../types/index.js";

// ============================================================
// 工具注册中心
// 新增工具只需在此数组中添加即可
// ============================================================

export const ALL_TOOLS: StructuredTool[] = [
  calculatorTool,
  searchTool,
  databaseTool,
  // 在此添加更多工具...
];

/**
 * 获取工具信息列表（用于前端展示可用工具）
 */
export function getToolInfos(): ToolInfo[] {
  return ALL_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    schema: t.schema as unknown as Record<string, unknown>,
  }));
}

/**
 * 按名称获取工具
 */
export function getToolByName(name: string): StructuredTool | undefined {
  return ALL_TOOLS.find((t) => t.name === name);
}
```

### 3.3 Agent Service 核心

**`src/services/agent.service.ts`**：

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ALL_TOOLS, getToolInfos } from "../tools/index.js";
import { SSEChunk, AgentStatus } from "../types/index.js";

// ============================================================
// System Prompt — Agent 的系统指令
// ============================================================

const SYSTEM_PROMPT = `你是一个智能 AI 助手，可以使用工具来帮助用户解决问题。

## 你的能力
- 数学计算：使用 calculator 工具执行精确的数学运算
- 网络搜索：使用 web_search 工具查找最新信息
- 数据库查询：使用 query_database 工具查询业务数据

## 工作原则
1. 仔细分析用户的问题，判断是否需要使用工具
2. 如果需要多个工具，按合理的顺序依次调用
3. 工具返回结果后，用自然语言向用户解释
4. 如果工具执行失败，尝试其他方法或向用户说明
5. 回答要简洁、准确、有帮助

## 当前时间
${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
`;

// ============================================================
// AgentService — Agent 生命周期管理
// ============================================================

export class AgentService {
  private executor: AgentExecutor | null = null;
  private model: ChatOpenAI;
  private startTime: number;

  constructor() {
    this.model = new ChatOpenAI({
      model: process.env.OPENAI_MODEL || "gpt-4o",
      temperature: 0.7,
      maxTokens: 4096,
      timeout: 60000,       // 60 秒超时
      maxRetries: 2,        // 自动重试 2 次
    });
    this.startTime = Date.now();
  }

  /**
   * 初始化 Agent（创建 Executor）
   */
  async initialize(): Promise<void> {
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", SYSTEM_PROMPT],
      ["human", "{input}"],
      ["placeholder", "{agent_scratchpad}"],
    ]);

    const agent = await createToolCallingAgent({
      llm: this.model,
      tools: ALL_TOOLS,
      prompt,
    });

    this.executor = new AgentExecutor({
      agent,
      tools: ALL_TOOLS,
      verbose: process.env.NODE_ENV === "development",
      maxIterations: 10,          // 最大工具调用轮次
      returnIntermediateSteps: true, // 返回中间步骤（用于 SSE 推送）
    });

    console.log(`✅ Agent 初始化完成，已加载 ${ALL_TOOLS.length} 个工具`);
  }

  /**
   * 流式执行 Agent 对话
   *
   * @param userMessage - 用户输入
   * @param onChunk - 每产生一个 SSE chunk 时的回调
   */
  async streamChat(
    userMessage: string,
    onChunk: (chunk: SSEChunk) => void
  ): Promise<void> {
    if (!this.executor) {
      throw new Error("Agent 未初始化，请先调用 initialize()");
    }

    // ============================================================
    // 使用 streamEvents 获取详细的执行事件
    // ============================================================
    const stream = this.executor.streamEvents(
      { input: userMessage },
      { version: "v2" }
    );

    let currentThinking = "";
    let hasSentThinking = false;

    for await (const event of stream) {
      switch (event.event) {
        // ============================================================
        // LLM 开始生成（发送 thinking 开始标记）
        // ============================================================
        case "on_chat_model_start": {
          if (!hasSentThinking) {
            onChunk({
              messageType: "thinking",
              thinking: "正在分析你的问题...",
              last: false,
            });
            hasSentThinking = true;
          }
          break;
        }

        // ============================================================
        // LLM 流式输出 token（累积为思考内容）
        // ============================================================
        case "on_chat_model_stream": {
          const content = event.data?.chunk?.content;
          if (content) {
            currentThinking += content;
            onChunk({
              messageType: "thinking",
              thinking: currentThinking,
              last: false,
            });
          }
          break;
        }

        // ============================================================
        // LLM 生成结束（标记 thinking 完成）
        // ============================================================
        case "on_chat_model_end": {
          if (hasSentThinking) {
            onChunk({
              messageType: "thinking",
              thinking: currentThinking || "分析完成",
              last: true,
            });
          }
          break;
        }

        // ============================================================
        // 工具调用开始
        // ============================================================
        case "on_tool_start": {
          const toolName = event.name || "unknown";
          const toolInput = JSON.stringify(event.data?.input, null, 2);

          onChunk({
            messageType: "tool_use",
            toolUseList: [{ toolName, toolInput }],
            last: false,
          });
          break;
        }

        // ============================================================
        // 工具调用结束
        // ============================================================
        case "on_tool_end": {
          const output = event.data?.output;
          const outputText = typeof output === "string" ? output : JSON.stringify(output, null, 2);

          // 标记 tool_use 完成
          onChunk({
            messageType: "tool_use",
            toolUseList: [{ toolName: event.name || "unknown", toolInput: "" }],
            last: true,
          });

          // 发送工具结果
          onChunk({
            messageType: "tool_result",
            toolResult: {
              toolOutputList: [{ text: outputText }],
            },
            last: true,
          });

          // 重置 thinking 状态（为下一轮准备）
          currentThinking = "";
          hasSentThinking = false;
          break;
        }

        // ============================================================
        // Agent 最终输出（流式）
        // ============================================================
        case "on_chain_stream": {
          const output = event.data?.chunk?.output;
          if (output && typeof output === "string") {
            onChunk({
              messageType: "text",
              content: output,
              text: output,
              last: false,
            });
          }
          break;
        }

        // ============================================================
        // Agent 执行结束
        // ============================================================
        case "on_chain_end": {
          const finalOutput = event.data?.output?.output;
          if (finalOutput && typeof finalOutput === "string") {
            onChunk({
              messageType: "text",
              content: finalOutput,
              text: finalOutput,
              last: true,
            });
          }
          break;
        }
      }
    }
  }

  /**
   * 获取可用工具列表
   */
  getAvailableTools() {
    return getToolInfos();
  }

  /**
   * 获取 Agent 状态
   */
  getStatus(): AgentStatus {
    return {
      initialized: this.executor !== null,
      model: process.env.OPENAI_MODEL || "gpt-4o",
      toolCount: ALL_TOOLS.length,
      uptime: Date.now() - this.startTime,
    };
  }
}
```

---

## 4. 阶段三：SSE 流式适配

### 4.1 数据流对照

LangChain `streamEvents` 事件 → 前端 `processChunk` 的映射关系：

```
LangChain 事件                         SSE Chunk (messageType)     前端展示
─────────────────────────────────────  ─────────────────────────  ────────────
on_chat_model_start                   → thinking (last: false)    💭 思考过程
on_chat_model_stream (逐 token)       → thinking (持续更新)        💭 思考过程
on_chat_model_end                     → thinking (last: true)     💭 思考过程 ✓

on_tool_start                         → tool_use (last: false)    🔧 工具调用
on_tool_end                           → tool_use (last: true)     🔧 工具调用 ✓
                                      → tool_result (last: true)  📋 工具结果

on_chain_stream (output)              → text (last: false)        纯文本流式
on_chain_end (output)                 → text (last: true)         纯文本 ✓
```

### 4.2 前端无需修改的原因

现有的 [`useAIChat.js`](../composables/useAIChat.js) 中 `processChunk` 函数已经处理了四种 `messageType`：

```javascript
// useAIChat.js 第 96-146 行 — 已支持的 messageType
switch (msgType) {
  case 'thinking':    // ✅ Agent 的思考过程
  case 'tool_use':    // ✅ Agent 的工具调用
  case 'tool_result': // ✅ Agent 的工具结果
  case 'text':        // ✅ Agent 的最终回答
}
```

只要 BFF 层输出的 SSE 格式与现有 API 一致，前端**零改动**即可接入。

### 4.3 格式兼容性检查清单

| 字段 | 现有 API 格式 | Agent BFF 输出 | 兼容 |
|------|-------------|---------------|------|
| `messageType` | `"thinking"` | `"thinking"` | ✅ |
| `messageType` | `"tool_use"` | `"tool_use"` | ✅ |
| `messageType` | `"tool_result"` | `"tool_result"` | ✅ |
| `messageType` | `"text"` | `"text"` | ✅ |
| `last` | `true/false` | `true/false` | ✅ |
| `thinking` | string | string | ✅ |
| `toolUseList[0].toolName` | string | string | ✅ |
| `toolUseList[0].toolInput` | string | string | ✅ |
| `toolResult.toolOutputList[0].text` | string | string | ✅ |
| `content` / `text` | string | string | ✅ |

---

## 5. 阶段四：前端集成

### 5.1 方式一：新增 Agent 页面（推荐，渐进式）

创建新的 composable 实例指向 Agent API：

```javascript
// src/pages/AgentChat.vue 中使用
import { useAIChat } from '@/composables/useAIChat'

export default {
  name: 'AgentChat',
  setup() {
    const {
      messages, input, isLoading, error,
      handleSubmit, handleInputChange, stop, reload, setMessages
    } = useAIChat({
      endpoint: 'http://localhost:3001/api/agent/chat',  // ← 指向 Agent BFF
      convId: 'agent-' + Date.now(),
      username: 'admin',
      extra: { agentType: 2 }  // 标记为 Agent 模式
    })

    return {
      messages, input, isLoading, error,
      handleSubmit, handleInputChange, stop, reload,
      clearChat: () => setMessages([])
    }
  }
}
```

### 5.2 方式二：切换现有页面（快速验证）

修改 [`useAIChat.js`](../composables/useAIChat.js) 的默认配置：

```javascript
// useAIChat.js 第 28-36 行
const DEFAULT_API_CONFIG = {
  // endpoint: '/api/text2db/chatbi/chatbot/dataAnalysis',  // 旧 API
  endpoint: 'http://localhost:3001/api/agent/chat',          // 新 Agent API
  convId: '1787626439941',
  username: 'admin',
  extra: {
    relatedModelId: '1776826577318',
    agentType: 1
  }
}
```

### 5.3 Vue CLI 代理配置（解决跨域）

如果不想在代码中写绝对路径，配置 `vue.config.js` 代理：

```javascript
// vue.config.js
module.exports = {
  devServer: {
    proxy: {
      '/api/agent': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // 保留现有代理
      '/api/text2db': {
        target: 'http://your-existing-backend',
        changeOrigin: true,
      },
    },
  },
}
```

配置代理后，前端使用相对路径即可：

```javascript
useAIChat({
  endpoint: '/api/agent/chat',  // 代理到 http://localhost:3001
})
```

---

## 6. 阶段五：生产化增强

### 6.1 错误处理增强

```typescript
// src/services/agent.service.ts 中添加

async streamChat(userMessage: string, onChunk: (chunk: SSEChunk) => void): Promise<void> {
  // ... 原有代码 ...

  // 添加超时保护
  const TIMEOUT_MS = 120_000; // 2 分钟总超时
  const startTime = Date.now();

  for await (const event of stream) {
    // 超时检查
    if (Date.now() - startTime > TIMEOUT_MS) {
      onChunk({
        messageType: "error",
        error: "请求超时，请简化问题后重试",
        last: true,
      });
      break;
    }

    // Token 用量监控
    if (event.event === "on_chat_model_end") {
      const tokenUsage = event.data?.output?.llmOutput?.tokenUsage;
      if (tokenUsage) {
        console.log(`[Token] 输入: ${tokenUsage.promptTokens}, 输出: ${tokenUsage.completionTokens}`);
      }
    }

    // ... 原有事件处理 ...
  }
}
```

### 6.2 请求限流

```typescript
// src/middleware/rate-limiter.ts

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

export function rateLimiter(maxRequests: number = 30, windowMs: number = 60_000) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const key = req.ip || "unknown";
    const now = Date.now();
    const entry = rateLimitMap.get(key);

    if (!entry || now > entry.resetTime) {
      rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      next();
      return;
    }

    if (entry.count >= maxRequests) {
      res.status(429).json({
        error: "请求过于频繁，请稍后再试",
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      });
      return;
    }

    entry.count++;
    next();
  };
}

// 定期清理过期条目
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 60_000);
```

在 `src/index.ts` 中使用：

```typescript
import { rateLimiter } from "./middleware/rate-limiter.js";

app.use("/api/agent", rateLimiter(30, 60_000)); // 每分钟 30 次
```

### 6.3 日志与监控

```typescript
// src/services/logger.ts

export class AgentLogger {
  static logRequest(convId: string, userMessage: string) {
    console.log(`[${new Date().toISOString()}] [REQ] convId=${convId} msg="${userMessage.slice(0, 100)}..."`);
  }

  static logToolCall(toolName: string, input: string) {
    console.log(`[${new Date().toISOString()}] [TOOL] ${toolName}(${input.slice(0, 100)})`);
  }

  static logTokenUsage(promptTokens: number, completionTokens: number) {
    console.log(`[${new Date().toISOString()}] [TOKEN] in=${promptTokens} out=${completionTokens} total=${promptTokens + completionTokens}`);
  }

  static logError(error: Error, context?: string) {
    console.error(`[${new Date().toISOString()}] [ERROR] ${context || ""}: ${error.message}`);
    console.error(error.stack);
  }

  static logDuration(convId: string, durationMs: number) {
    console.log(`[${new Date().toISOString()}] [DURATION] convId=${convId} ${durationMs}ms`);
  }
}
```

### 6.4 环境变量完整配置

```bash
# .env — 完整配置

# ========== OpenAI ==========
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL=gpt-4o
OPENAI_BASE_URL=https://api.openai.com/v1    # 可选：自定义 API 地址

# ========== 服务配置 ==========
PORT=3001
NODE_ENV=development

# ========== LangSmith（可选）==========
LANGCHAIN_TRACING_V2=false
LANGCHAIN_API_KEY=ls_xxxxxxxxxxxxxxxxxxxx
LANGCHAIN_PROJECT=ai-agent

# ========== 外部服务 ==========
# TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxxxxxx   # 搜索 API
# DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
# REDIS_URL=redis://localhost:6379            # 缓存

# ========== 限流配置 ==========
RATE_LIMIT_MAX=30
RATE_LIMIT_WINDOW_MS=60000

# ========== Agent 配置 ==========
AGENT_MAX_ITERATIONS=10
AGENT_TIMEOUT_MS=120000
```

### 6.5 Docker 部署

**`bff/Dockerfile`**：

```dockerfile
FROM node:20-alpine

WORKDIR /app

# 复制依赖文件
COPY package.json package-lock.json ./
RUN npm ci --production

# 复制源码
COPY dist/ ./dist/
COPY .env.example ./.env

EXPOSE 3001

CMD ["node", "dist/index.js"]
```

**`bff/.dockerignore`**：
```
node_modules
src
.env
*.log
```

### 6.6 package.json scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## 7. 完整代码清单

### 7.1 文件清单

```
bff/
├── .env                              # 环境变量（不提交 Git）
├── .env.example                      # 环境变量模板
├── .dockerignore
├── .gitignore
├── Dockerfile
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                      # Express 入口
    ├── routes/
    │   └── agent.routes.ts           # Agent 路由
    ├── services/
    │   ├── agent.service.ts          # Agent 核心服务
    │   └── logger.ts                 # 日志服务
    ├── tools/
    │   ├── index.ts                  # 工具注册中心
    │   ├── calculator.tool.ts        # 计算工具
    │   ├── search.tool.ts            # 搜索工具
    │   └── database.tool.ts          # 数据库工具
    ├── adapters/
    │   └── sse.adapter.ts            # SSE 适配器（可选）
    ├── middleware/
    │   └── rate-limiter.ts           # 限流中间件
    └── types/
        └── index.ts                  # 类型定义
```

### 7.2 启动命令

```bash
# 1. 进入 bff 目录
cd bff

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 OPENAI_API_KEY

# 4. 开发模式启动
npm run dev

# 5. 验证
curl http://localhost:3001/health
# → {"status":"ok","timestamp":"..."}

curl http://localhost:3001/api/agent/health
# → {"initialized":true,"model":"gpt-4o","toolCount":3,"uptime":...}

# 6. 测试对话
curl -X POST http://localhost:3001/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":"计算 (100 + 200) * 0.8"}'
```

### 7.3 前端切换

```javascript
// 方式一：新增 Agent 页面
// src/pages/AgentChat.vue
import { useAIChat } from '@/composables/useAIChat'
const chat = useAIChat({ endpoint: '/api/agent/chat' })

// 方式二：修改默认配置
// src/composables/useAIChat.js 第 29 行
endpoint: '/api/agent/chat',
```

---

## 8. 常见问题排查

### Q1: Agent 不调用工具，直接回答

**原因**：模型认为不需要工具就能回答。

**解决**：
1. 在 System Prompt 中明确指示何时使用工具
2. 降低 temperature（如 0.3）使模型更倾向于遵循指令
3. 检查工具描述是否清晰

### Q2: SSE 流中断，前端收不到完整响应

**原因**：可能是超时、Nginx 缓冲或连接断开。

**解决**：
1. 设置 `res.setHeader("X-Accel-Buffering", "no")` 禁用 Nginx 缓冲
2. 增加 Agent 超时时间
3. 检查是否有代理/负载均衡器截断了 SSE 连接

### Q3: 前端 segments 显示异常

**原因**：SSE chunk 的 `messageType` 或字段名不匹配。

**排查**：
```javascript
// 在 useAIChat.js 的 processChunk 中添加调试日志
console.log('[DEBUG] chunk:', JSON.stringify(chunk));
```

对照本文档 [4.3 格式兼容性检查清单](#43-格式兼容性检查清单) 逐字段核对。

### Q4: 跨域请求被拒绝

**解决**：
1. 确保 BFF 层 `cors` 中间件配置了正确的前端地址
2. 或使用 Vue CLI 代理（[5.3 节](#53-vue-cli-代理配置)）

### Q5: OpenAI API 调用失败

**排查步骤**：
1. 检查 `.env` 中 `OPENAI_API_KEY` 是否正确
2. 检查网络是否能访问 `https://api.openai.com`
3. 检查 API Key 余额是否充足
4. 尝试切换模型（如 `gpt-4o-mini` 替代 `gpt-4o`）

---

> **相关文档**：
> - [`langchain-js-learning-path.md`](langchain-js-learning-path.md) — LangChain.js 学习路径
> - [`langchain-guide.md`](langchain-guide.md) — LangChain Python 版完整指南（概念参考）
> - [`vercel-ai-sdk-guide.md`](vercel-ai-sdk-guide.md) — Vercel AI SDK 前端集成
> - [`python-knowledge-for-langchain.md`](python-knowledge-for-langchain.md) — Python 基础知识（按需查阅）