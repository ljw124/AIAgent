# Vercel AI SDK 详细指南

> Vercel AI SDK 是一个 TypeScript 工具包，用于构建 AI 驱动的应用程序。它提供了统一的 API 来与各种 LLM 提供商交互，并内置了流式响应、工具调用、生成式 UI 等能力。

---

## 目录

1. [概述与核心概念](#1-概述与核心概念)
2. [安装与快速开始](#2-安装与快速开始)
3. [核心模块详解](#3-核心模块详解)
   - [3.1 AI SDK Core (`ai`)](#31-ai-sdk-core-ai)
   - [3.2 AI SDK UI (`@ai-sdk/react` / `@ai-sdk/vue`)](#32-ai-sdk-ui-ai-sdkreact--ai-sdkvue)
   - [3.3 AI SDK RSC (`ai/rsc`)](#33-ai-sdk-rsc-airsc)
4. [Provider 与模型配置](#4-provider-与模型配置)
5. [流式响应处理](#5-流式响应处理)
6. [工具调用 (Tool Calling)](#6-工具调用-tool-calling)
7. [生成式 UI (Generative UI)](#7-生成式-ui-generative-ui)
8. [聊天机器人完整示例](#8-聊天机器人完整示例)
9. [Agent 模式实现](#9-agent-模式实现)
10. [错误处理与重试](#10-错误处理与重试)
11. [与前端框架集成](#11-与前端框架集成)
12. [最佳实践](#12-最佳实践)

---

## 1. 概述与核心概念

### 1.1 什么是 Vercel AI SDK？

Vercel AI SDK 由三个核心包组成：

| 包名 | 用途 | 适用场景 |
|------|------|---------|
| `ai` | 核心库，提供 `generateText`、`streamText` 等函数 | 后端/Node.js 环境 |
| `@ai-sdk/react` / `@ai-sdk/vue` | UI 层 hooks（`useChat`、`useCompletion` 等） | React/Vue 前端 |
| `ai/rsc` | React Server Components 集成 | Next.js App Router |

### 1.2 核心设计理念

```
┌─────────────────────────────────────────────────────┐
│                    前端 (Browser)                     │
│  useChat / useCompletion / useObject                 │
│  → 自动处理流式响应、状态管理、错误处理                  │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP POST (SSE)
┌──────────────────────▼──────────────────────────────┐
│                 后端 (API Route)                      │
│  streamText / generateText / streamObject            │
│  → 调用 LLM、处理工具调用、返回流式响应                 │
└──────────────────────┬──────────────────────────────┘
                       │ API Call
┌──────────────────────▼──────────────────────────────┐
│              LLM Provider (OpenAI 等)                 │
└─────────────────────────────────────────────────────┘
```

### 1.3 与传统 fetch 的对比

| 特性 | 原生 fetch | Vercel AI SDK |
|------|-----------|---------------|
| 流式响应解析 | 手动 `getReader()` + `TextDecoder` | 自动处理 |
| 工具调用 | 手动解析 JSON + 执行 | 内置 `tool()` 定义 + 自动执行 |
| 状态管理 | 手动管理 loading/error/data | `useChat` 自动管理 |
| 多 Provider | 每个 Provider 不同 API | 统一接口切换 |
| 类型安全 | 手动定义 | 完整 TypeScript 支持 |

---

## 2. 安装与快速开始

### 2.1 安装

```bash
# 核心库
npm install ai

# Provider 适配器（按需安装）
npm install @ai-sdk/openai      # OpenAI
npm install @ai-sdk/anthropic   # Anthropic Claude
npm install @ai-sdk/google      # Google Gemini
npm install @ai-sdk/mistral     # Mistral
npm install @ai-sdk/deepseek    # DeepSeek

# 前端 hooks（按框架选择）
npm install @ai-sdk/react       # React
npm install @ai-sdk/vue         # Vue
npm install @ai-sdk/svelte      # Svelte
npm install @ai-sdk/solid       # SolidJS
```

### 2.2 最小示例

**后端 API Route（Next.js 示例）：**

```typescript
// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai'
import { streamText } from 'ai'

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
  })

  return result.toDataStreamResponse()
}
```

**前端组件（React 示例）：**

```tsx
// app/page.tsx
'use client'
import { useChat } from '@ai-sdk/react'

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat()

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>
          <strong>{m.role}:</strong> {m.content}
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
        <button type="submit">发送</button>
      </form>
    </div>
  )
}
```

---

## 3. 核心模块详解

### 3.1 AI SDK Core (`ai`)

Core 包提供两个核心函数：

#### `generateText` — 非流式生成

```typescript
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'

const { text, toolCalls, toolResults, finishReason, usage } = await generateText({
  model: openai('gpt-4o'),
  system: '你是一个有帮助的助手',
  prompt: '解释什么是量子计算',
  maxTokens: 500,
  temperature: 0.7,
})

console.log(text)
console.log(`消耗 token: ${usage.totalTokens}`)
```

**返回值说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `text` | `string` | 生成的完整文本 |
| `toolCalls` | `ToolCall[]` | 模型请求的工具调用列表 |
| `toolResults` | `ToolResult[]` | 工具执行结果 |
| `finishReason` | `'stop' \| 'length' \| 'tool-calls' \| ...` | 生成停止原因 |
| `usage` | `LanguageModelUsage` | Token 使用统计 |
| `warnings` | `Warning[]` | 警告信息 |
| `response` | `Response` | 原始响应对象 |

#### `streamText` — 流式生成

```typescript
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

const result = streamText({
  model: openai('gpt-4o'),
  messages: [
    { role: 'user', content: '写一首关于春天的诗' }
  ],
})

// 方式1：返回 HTTP 流式响应（推荐）
return result.toDataStreamResponse()

// 方式2：手动消费流
for await (const chunk of result.textStream) {
  process.stdout.write(chunk)
}

// 方式3：获取完整文本
const fullText = await result.text
```

**`streamText` 配置选项：**

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `model` | `LanguageModel` | 必填 | 语言模型实例 |
| `messages` | `CoreMessage[]` | 必填 | 对话消息数组 |
| `system` | `string` | - | 系统提示词 |
| `maxTokens` | `number` | - | 最大生成 token 数 |
| `temperature` | `number` | - | 采样温度 (0-2) |
| `topP` | `number` | - | 核采样参数 |
| `stopSequences` | `string[]` | - | 停止序列 |
| `tools` | `Record<string, Tool>` | - | 工具定义 |
| `toolChoice` | `'auto' \| 'none' \| 'required' \| ToolChoice` | `'auto'` | 工具选择策略 |
| `maxSteps` | `number` | `1` | 最大工具调用轮次 |
| `onFinish` | `callback` | - | 完成回调 |
| `onStepFinish` | `callback` | - | 每步完成回调 |

### 3.2 AI SDK UI (`@ai-sdk/react` / `@ai-sdk/vue`)

#### `useChat` — 聊天 Hook

```typescript
// React
import { useChat } from '@ai-sdk/react'

const {
  // 状态
  messages,        // Message[] — 对话历史
  input,           // string — 输入框值
  isLoading,       // boolean — 是否加载中
  error,           // Error | undefined — 错误信息

  // 操作
  setMessages,     // (messages: Message[]) => void
  setInput,        // (input: string) => void
  handleSubmit,    // (e: React.FormEvent) => void
  handleInputChange, // (e: React.ChangeEvent) => void
  append,          // (message: Message) => Promise<void>
  reload,          // () => Promise<void>
  stop,            // () => void
  addToolResult,   // (result: { toolCallId: string; result: any }) => void
} = useChat({
  // 配置选项
  api: '/api/chat',           // API 端点
  initialMessages: [],         // 初始消息
  initialInput: '',            // 初始输入
  id: 'my-chat',              // 聊天 ID（用于持久化）
  body: {},                    // 额外的请求体
  headers: {},                 // 额外的请求头
  credentials: 'same-origin',  // fetch credentials

  // 回调
  onResponse: (response) => {},  // 收到响应时
  onFinish: (message) => {},     // 完成时
  onError: (error) => {},        // 错误时

  // 工具调用处理
  onToolCall: ({ toolCall }) => {}, // 工具调用时
})
```

**Message 类型定义：**

```typescript
interface Message {
  id: string
  role: 'system' | 'user' | 'assistant' | 'data' | 'tool'
  content: string
  createdAt?: Date

  // 工具调用相关
  toolInvocations?: ToolInvocation[]
  experimental_attachments?: Attachment[]
  data?: any
  annotations?: any[]
}

interface ToolInvocation {
  state: 'partial-call' | 'call' | 'result'
  toolCallId: string
  toolName: string
  args: any
  result?: any
}
```

#### `useCompletion` — 补全 Hook

```typescript
import { useCompletion } from '@ai-sdk/react'

const {
  completion,      // string — 补全结果
  input,
  isLoading,
  error,
  setInput,
  handleSubmit,
  handleInputChange,
  complete,        // (prompt: string) => Promise<void>
  stop,
} = useCompletion({
  api: '/api/completion',
})
```

#### `useObject` — 结构化对象生成 Hook

```typescript
import { useObject } from '@ai-sdk/react'
import { z } from 'zod'

const { object, isLoading, error, submit } = useObject({
  api: '/api/object',
  schema: z.object({
    name: z.string(),
    age: z.number(),
    email: z.string().email(),
  }),
})
```

### 3.3 AI SDK RSC (`ai/rsc`)

用于 React Server Components，允许在服务端直接调用 AI 并返回 UI 组件：

```tsx
// app/actions.ts
'use server'
import { createAI, getAIState, getMutableAIState, streamUI } from 'ai/rsc'

export async function submitUserMessage(userInput: string) {
  'use server'

  const aiState = getMutableAIState()

  const result = await streamUI({
    model: openai('gpt-4o'),
    messages: [
      ...aiState.get(),
      { role: 'user', content: userInput }
    ],
    text: ({ content, done }) => {
      if (done) {
        aiState.done([...aiState.get(), { role: 'assistant', content }])
      }
      return <div>{content}</div>
    },
    tools: {
      getWeather: {
        description: '获取天气信息',
        parameters: z.object({ city: z.string() }),
        generate: async function* ({ city }) {
          yield <div>查询中...</div>
          const weather = await fetchWeather(city)
          return <WeatherCard city={city} data={weather} />
        },
      },
    },
  })

  return result.value
}
```

---

## 4. Provider 与模型配置

### 4.1 支持的 Provider

```typescript
// OpenAI
import { openai } from '@ai-sdk/openai'
const model = openai('gpt-4o')
const model = openai('gpt-4-turbo')
const model = openai('gpt-3.5-turbo')

// Anthropic
import { anthropic } from '@ai-sdk/anthropic'
const model = anthropic('claude-3-5-sonnet-20241022')

// Google
import { google } from '@ai-sdk/google'
const model = google('gemini-1.5-pro')

// DeepSeek
import { deepseek } from '@ai-sdk/deepseek'
const model = deepseek('deepseek-chat')

// Mistral
import { mistral } from '@ai-sdk/mistral'
const model = mistral('mistral-large-latest')

// 自定义 Provider（兼容 OpenAI API 的服务）
import { createOpenAI } from '@ai-sdk/openai'

const customProvider = createOpenAI({
  baseURL: 'https://your-custom-api.com/v1',
  apiKey: 'your-api-key',
})

const model = customProvider('your-model-name')
```

### 4.2 模型配置

```typescript
import { openai } from '@ai-sdk/openai'

const model = openai('gpt-4o', {
  // 额外配置
  user: 'user-123',           // 用户标识（用于 OpenAI 监控）
  organization: 'org-xxx',    // 组织 ID
  // 自定义请求头
  headers: {
    'X-Custom-Header': 'value',
  },
})
```

### 4.3 环境变量配置

```bash
# .env.local
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
GOOGLE_GENERATIVE_AI_API_KEY=xxx
DEEPSEEK_API_KEY=sk-xxx
MISTRAL_API_KEY=xxx
```

---

## 5. 流式响应处理

### 5.1 数据流协议

Vercel AI SDK 使用自定义的 SSE 数据流协议，支持多种内容类型：

```
// 文本增量
0:"你好"
0:"，我是"
0:"AI 助手"

// 工具调用开始
9:{"toolCallId":"call_xxx","toolName":"getWeather","args":{}}

// 工具调用参数增量
c:{"toolCallId":"call_xxx","argsText":"{\"city\""}
c:{"toolCallId":"call_xxx","argsText":":\"北京\"}"}

// 工具调用结果
a:{"toolCallId":"call_xxx","result":"北京今天晴，25°C"}

// 完成
d:{"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":20}}
```

### 5.2 手动处理流式响应

```typescript
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

const result = streamText({
  model: openai('gpt-4o'),
  messages: [...],
})

// 监听文本流
for await (const textPart of result.textStream) {
  console.log('文本:', textPart)
}

// 监听完整流（包含工具调用等）
for await (const part of result.fullStream) {
  switch (part.type) {
    case 'text-delta':
      console.log('文本增量:', part.textDelta)
      break
    case 'tool-call':
      console.log('工具调用:', part.toolName, part.args)
      break
    case 'tool-result':
      console.log('工具结果:', part.result)
      break
    case 'finish':
      console.log('完成:', part.finishReason)
      break
  }
}

// 获取原始响应
const response = result.toDataStreamResponse()
```

### 5.3 自定义流式端点（Express/Node.js）

```typescript
// server.ts (Express 示例)
import express from 'express'
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

const app = express()
app.use(express.json())

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
  })

  // 转换为 SSE 流并 pipe 到响应
  const response = result.toDataStreamResponse()
  const reader = response.body?.getReader()

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  if (!reader) {
    res.end()
    return
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    res.write(value)
  }
  res.end()
})

app.listen(3000)
```

---

## 6. 工具调用 (Tool Calling)

### 6.1 定义工具

```typescript
import { tool } from 'ai'
import { z } from 'zod'

const weatherTool = tool({
  description: '获取指定城市的天气信息',
  parameters: z.object({
    city: z.string().describe('城市名称，如"北京"、"上海"'),
    unit: z.enum(['celsius', 'fahrenheit']).optional().default('celsius')
      .describe('温度单位'),
  }),
  execute: async ({ city, unit }) => {
    // 实际调用天气 API
    const weather = await fetchWeatherAPI(city, unit)
    return {
      temperature: weather.temp,
      condition: weather.condition,
      humidity: weather.humidity,
    }
  },
})

const searchTool = tool({
  description: '搜索互联网信息',
  parameters: z.object({
    query: z.string().describe('搜索关键词'),
    maxResults: z.number().optional().default(5).describe('最大结果数'),
  }),
  execute: async ({ query, maxResults }) => {
    const results = await searchAPI(query, maxResults)
    return results.map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.snippet,
    }))
  },
})
```

### 6.2 使用工具

```typescript
import { generateText, streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

// 非流式
const { text, toolCalls, toolResults } = await generateText({
  model: openai('gpt-4o'),
  messages: [{ role: 'user', content: '北京今天天气怎么样？' }],
  tools: {
    getWeather: weatherTool,
    searchWeb: searchTool,
  },
  toolChoice: 'auto',  // 'auto' | 'none' | 'required'
  maxSteps: 5,         // 最大工具调用轮次（Agent 循环）
})

// 流式
const result = streamText({
  model: openai('gpt-4o'),
  messages: [...],
  tools: { getWeather: weatherTool },
  maxSteps: 3,
})

// 监听工具调用事件
for await (const part of result.fullStream) {
  if (part.type === 'tool-call') {
    console.log(`调用工具: ${part.toolName}`, part.args)
  }
  if (part.type === 'tool-result') {
    console.log(`工具结果:`, part.result)
  }
}
```

### 6.3 前端处理工具调用

```tsx
// React 组件中处理工具调用
import { useChat } from '@ai-sdk/react'

function ChatWithTools() {
  const { messages, addToolResult } = useChat({
    // 当模型请求工具调用时，可以在这里处理
    onToolCall: ({ toolCall }) => {
      console.log('工具调用:', toolCall)

      // 如果是需要用户确认的工具
      if (toolCall.toolName === 'confirmAction') {
        const confirmed = window.confirm(`确认执行: ${toolCall.args.action}?`)
        addToolResult({
          toolCallId: toolCall.toolCallId,
          result: confirmed ? 'confirmed' : 'cancelled',
        })
      }
    },
  })

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>
          {/* 渲染工具调用状态 */}
          {m.toolInvocations?.map(tool => (
            <div key={tool.toolCallId} className="tool-call">
              {tool.state === 'partial-call' && <span>准备调用 {tool.toolName}...</span>}
              {tool.state === 'call' && <span>正在执行 {tool.toolName}...</span>}
              {tool.state === 'result' && (
                <div>
                  <span>✅ {tool.toolName} 完成</span>
                  <pre>{JSON.stringify(tool.result, null, 2)}</pre>
                </div>
              )}
            </div>
          ))}
          <p>{m.content}</p>
        </div>
      ))}
    </div>
  )
}
```

### 6.4 工具调用策略

```typescript
// 强制使用工具
const result = await generateText({
  model: openai('gpt-4o'),
  messages: [...],
  tools: { getWeather: weatherTool },
  toolChoice: 'required',  // 必须调用工具
})

// 指定具体工具
const result = await generateText({
  model: openai('gpt-4o'),
  messages: [...],
  tools: { getWeather: weatherTool, searchWeb: searchTool },
  toolChoice: {
    type: 'tool',
    toolName: 'getWeather',  // 强制使用特定工具
  },
})

// 禁用工具
const result = await generateText({
  model: openai('gpt-4o'),
  messages: [...],
  tools: { getWeather: weatherTool },
  toolChoice: 'none',  // 不使用任何工具
})
```

---

## 7. 生成式 UI (Generative UI)

### 7.1 概念

生成式 UI 允许 AI 不仅生成文本，还能生成 UI 组件。这是 Vercel AI SDK 的独特能力。

### 7.2 使用 `streamUI`（RSC）

```tsx
// app/actions.tsx
'use server'
import { streamUI } from 'ai/rsc'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

// 定义可生成的 UI 组件
function WeatherCard({ city, temp, condition }: {
  city: string
  temp: number
  condition: string
}) {
  return (
    <div className="weather-card">
      <h3>{city}</h3>
      <div className="temp">{temp}°C</div>
      <div>{condition}</div>
    </div>
  )
}

function StockChart({ symbol, data }: { symbol: string; data: any }) {
  return (
    <div className="stock-chart">
      <h3>{symbol} 股价走势</h3>
      {/* 实际图表组件 */}
    </div>
  )
}

export async function generateUI(prompt: string) {
  const result = await streamUI({
    model: openai('gpt-4o'),
    messages: [{ role: 'user', content: prompt }],
    text: ({ content, done }) => {
      if (done) {
        return <div className="prose">{content}</div>
      }
      return <div className="prose">{content}</div>
    },
    tools: {
      showWeather: {
        description: '显示天气卡片',
        parameters: z.object({
          city: z.string(),
          temp: z.number(),
          condition: z.string(),
        }),
        generate: async function* ({ city, temp, condition }) {
          yield <div>正在获取 {city} 天气...</div>
          return <WeatherCard city={city} temp={temp} condition={condition} />
        },
      },
      showStock: {
        description: '显示股票图表',
        parameters: z.object({
          symbol: z.string(),
        }),
        generate: async function* ({ symbol }) {
          yield <div>正在加载 {symbol} 数据...</div>
          const data = await fetchStockData(symbol)
          return <StockChart symbol={symbol} data={data} />
        },
      },
    },
  })

  return result.value
}
```

### 7.3 前端生成式 UI（非 RSC）

```tsx
// 在普通 React 组件中实现生成式 UI
import { useChat } from '@ai-sdk/react'

// 定义工具 → 组件的映射
const toolUIComponents: Record<string, React.ComponentType<any>> = {
  showWeather: WeatherCard,
  showStock: StockChart,
  showTable: DataTable,
  showCode: CodeBlock,
}

function GenerativeChat() {
  const { messages } = useChat()

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>
          {/* 渲染文本内容 */}
          {m.content && <p>{m.content}</p>}

          {/* 渲染工具调用生成的 UI */}
          {m.toolInvocations?.map(tool => {
            if (tool.state !== 'result') return null

            const UIComponent = toolUIComponents[tool.toolName]
            if (!UIComponent) return null

            return <UIComponent key={tool.toolCallId} {...tool.result} />
          })}
        </div>
      ))}
    </div>
  )
}
```

---

## 8. 聊天机器人完整示例

### 8.1 后端 API（Next.js App Router）

```typescript
// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai'
import { streamText, tool } from 'ai'
import { z } from 'zod'

// 定义工具
const tools = {
  getCurrentTime: tool({
    description: '获取当前时间',
    parameters: z.object({
      timezone: z.string().optional().default('Asia/Shanghai'),
    }),
    execute: async ({ timezone }) => {
      return new Date().toLocaleString('zh-CN', { timeZone: timezone })
    },
  }),

  searchKnowledge: tool({
    description: '搜索知识库',
    parameters: z.object({
      query: z.string().describe('搜索查询'),
    }),
    execute: async ({ query }) => {
      // 实际搜索逻辑
      const results = await searchDatabase(query)
      return results
    },
  }),
}

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: openai('gpt-4o'),
    system: `你是一个专业的 AI 助手。你可以：
- 回答各种问题
- 获取当前时间
- 搜索知识库
请用中文回复。`,
    messages,
    tools,
    maxSteps: 5,
    temperature: 0.7,
    onFinish: ({ text, toolCalls, toolResults, usage }) => {
      console.log('对话完成', { text, usage })
    },
  })

  return result.toDataStreamResponse()
}
```

### 8.2 前端组件（React）

```tsx
// components/ChatBot.tsx
'use client'
import { useChat } from '@ai-sdk/react'
import { useState, useRef, useEffect } from 'react'

export default function ChatBot() {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    stop,
    reload,
  } = useChat({
    api: '/api/chat',
    onError: (err) => {
      console.error('聊天错误:', err)
    },
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="chat-container">
      {/* 消息列表 */}
      <div className="messages">
        {messages.map(m => (
          <div key={m.id} className={`message ${m.role}`}>
            <div className="role-badge">
              {m.role === 'user' ? '👤 你' : '🤖 AI'}
            </div>

            {/* 文本内容 */}
            {m.content && <div className="content">{m.content}</div>}

            {/* 工具调用 */}
            {m.toolInvocations?.map(tool => (
              <div key={tool.toolCallId} className="tool-invocation">
                {tool.state === 'partial-call' && (
                  <div className="tool-loading">
                    🔧 准备调用 {tool.toolName}...
                  </div>
                )}
                {tool.state === 'call' && (
                  <div className="tool-executing">
                    ⚙️ 正在执行 {tool.toolName}...
                    <pre>{JSON.stringify(tool.args, null, 2)}</pre>
                  </div>
                )}
                {tool.state === 'result' && (
                  <div className="tool-result">
                    ✅ {tool.toolName} 完成
                    <pre>{JSON.stringify(tool.result, null, 2)}</pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        {/* 加载指示器 */}
        {isLoading && (
          <div className="message assistant">
            <div className="typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="error-banner">
          <span>❌ {error.message}</span>
          <button onClick={() => reload()}>重试</button>
        </div>
      )}

      {/* 输入区域 */}
      <form onSubmit={handleSubmit} className="input-area">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder="输入消息..."
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          发送
        </button>
        {isLoading && (
          <button type="button" onClick={() => stop()}>
            停止
          </button>
        )}
      </form>
    </div>
  )
}
```

### 8.3 Vue 版本

```vue
<!-- components/ChatBot.vue -->
<script setup>
import { useChat } from '@ai-sdk/vue'

const {
  messages,
  input,
  handleSubmit,
  isLoading,
  error,
  stop,
  reload,
} = useChat({
  api: '/api/chat',
})

const messagesContainer = ref(null)

watch(messages, () => {
  nextTick(() => {
    messagesContainer.value?.scrollTo({
      top: messagesContainer.value.scrollHeight,
      behavior: 'smooth',
    })
  })
}, { deep: true })
</script>

<template>
  <div class="chat-container">
    <div ref="messagesContainer" class="messages">
      <div
        v-for="m in messages"
        :key="m.id"
        :class="['message', m.role]"
      >
        <div class="role-badge">
          {{ m.role === 'user' ? '👤 你' : '🤖 AI' }}
        </div>
        <div v-if="m.content" class="content">{{ m.content }}</div>

        <!-- 工具调用 -->
        <div
          v-for="tool in m.toolInvocations"
          :key="tool.toolCallId"
          class="tool-invocation"
        >
          <div v-if="tool.state === 'call'" class="tool-executing">
            ⚙️ 正在执行 {{ tool.toolName }}...
          </div>
          <div v-if="tool.state === 'result'" class="tool-result">
            ✅ {{ tool.toolName }} 完成
          </div>
        </div>
      </div>
    </div>

    <div v-if="error" class="error-banner">
      ❌ {{ error.message }}
      <button @click="reload()">重试</button>
    </div>

    <form @submit="handleSubmit" class="input-area">
      <input
        v-model="input"
        placeholder="输入消息..."
        :disabled="isLoading"
      />
      <button type="submit" :disabled="isLoading || !input.trim()">
        发送
      </button>
      <button v-if="isLoading" type="button" @click="stop()">
        停止
      </button>
    </form>
  </div>
</template>
```

---

## 9. Agent 模式实现

### 9.1 什么是 Agent 模式

Agent 模式通过设置 `maxSteps > 1` 实现，允许模型在单次请求中进行多轮工具调用：

```
用户输入 → LLM 思考 → 调用工具A → 获取结果 → LLM 再思考 → 调用工具B → 获取结果 → 生成最终回复
```

### 9.2 基础 Agent 实现

```typescript
import { generateText, tool } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const agentTools = {
  // 思考工具 — 让 Agent 记录中间推理
  think: tool({
    description: '记录思考过程，用于复杂问题的逐步推理',
    parameters: z.object({
      thought: z.string().describe('当前的思考内容'),
    }),
    execute: async ({ thought }) => {
      console.log('🧠 Agent 思考:', thought)
      return { recorded: true }
    },
  }),

  // 计算器工具
  calculator: tool({
    description: '执行数学计算',
    parameters: z.object({
      expression: z.string().describe('数学表达式，如 "2 + 2 * 3"'),
    }),
    execute: async ({ expression }) => {
      try {
        const result = eval(expression) // 生产环境请使用安全的 math 库
        return { expression, result }
      } catch (e) {
        return { error: e.message }
      }
    },
  }),

  // 数据库查询工具
  queryDatabase: tool({
    description: '查询数据库',
    parameters: z.object({
      sql: z.string().describe('SQL 查询语句'),
    }),
    execute: async ({ sql }) => {
      // 实际数据库查询
      const results = await db.query(sql)
      return { rows: results, count: results.length }
    },
  }),

  // 发送邮件工具
  sendEmail: tool({
    description: '发送邮件',
    parameters: z.object({
      to: z.string().email(),
      subject: z.string(),
      body: z.string(),
    }),
    execute: async ({ to, subject, body }) => {
      // 实际发送邮件
      await emailService.send({ to, subject, body })
      return { sent: true, to, subject }
    },
  }),
}

// Agent 执行
async function runAgent(userPrompt: string) {
  const { text, steps } = await generateText({
    model: openai('gpt-4o'),
    system: `你是一个智能 Agent，可以：
1. 使用 think 工具记录思考过程
2. 使用 calculator 进行计算
3. 使用 queryDatabase 查询数据
4. 使用 sendEmail 发送邮件

请逐步思考，在需要时使用工具，最后给出完整回复。`,
    prompt: userPrompt,
    tools: agentTools,
    maxSteps: 10,  // 最多 10 轮工具调用
    temperature: 0.7,
  })

  console.log(`Agent 执行了 ${steps.length} 步`)
  console.log('最终回复:', text)

  return { text, steps }
}

// 使用示例
await runAgent('查询上周销售额最高的产品，计算其占总销售额的百分比，然后将结果发送到 manager@company.com')
```

### 9.3 带记忆的 Agent

```typescript
import { generateText, CoreMessage } from 'ai'
import { openai } from '@ai-sdk/openai'

class AgentWithMemory {
  private messages: CoreMessage[] = []
  private longTermMemory: Map<string, any> = new Map()

  constructor(private systemPrompt: string) {
    this.messages.push({ role: 'system', content: systemPrompt })
  }

  async chat(userInput: string) {
    // 添加用户消息
    this.messages.push({ role: 'user', content: userInput })

    // 注入长期记忆到上下文
    const memoryContext = this.buildMemoryContext()
    if (memoryContext) {
      this.messages.push({
        role: 'system',
        content: `相关记忆:\n${memoryContext}`,
      })
    }

    const { text, steps } = await generateText({
      model: openai('gpt-4o'),
      messages: this.messages,
      tools: this.tools,
      maxSteps: 5,
    })

    // 保存助手回复
    this.messages.push({ role: 'assistant', content: text })

    // 更新长期记忆
    this.updateMemory(userInput, text, steps)

    // 上下文窗口管理：如果消息过多，进行摘要压缩
    if (this.messages.length > 20) {
      await this.summarizeConversation()
    }

    return { text, steps }
  }

  private buildMemoryContext(): string {
    const memories = Array.from(this.longTermMemory.values())
    return memories.map(m => `- ${m.key}: ${m.value}`).join('\n')
  }

  private updateMemory(input: string, output: string, steps: any[]) {
    // 提取关键信息存入长期记忆
    // 实际项目中可能使用向量数据库
  }

  private async summarizeConversation() {
    // 对早期对话进行摘要，保留最近的消息
    const earlyMessages = this.messages.slice(0, -10)
    const recentMessages = this.messages.slice(-10)

    const { text: summary } = await generateText({
      model: openai('gpt-4o-mini'),  // 使用更便宜的模型做摘要
      prompt: `请总结以下对话的关键信息：\n${JSON.stringify(earlyMessages)}`,
    })

    this.messages = [
      { role: 'system', content: this.systemPrompt },
      { role: 'system', content: `对话历史摘要：${summary}` },
      ...recentMessages,
    ]
  }

  private tools = {
    // ... 工具定义
  }
}
```

### 9.4 多 Agent 协作

```typescript
// Supervisor Agent 模式
async function supervisorAgent(task: string) {
  // 1. 规划阶段：分析任务并分配给子 Agent
  const { text: plan } = await generateText({
    model: openai('gpt-4o'),
    system: '你是任务规划器，将复杂任务分解为子任务',
    prompt: `分析以下任务并分解为子任务：${task}`,
  })

  // 2. 执行阶段：并行或串行执行子任务
  const subTasks = parsePlan(plan)

  const results = await Promise.all(
    subTasks.map(subTask =>
      generateText({
        model: openai('gpt-4o'),
        system: `你是专门处理"${subTask.type}"的专家 Agent`,
        prompt: subTask.description,
        tools: getToolsForTask(subTask.type),
        maxSteps: 5,
      })
    )
  )

  // 3. 汇总阶段：合并结果
  const { text: finalAnswer } = await generateText({
    model: openai('gpt-4o'),
    system: '你是结果汇总器，将多个子任务的结果整合为最终答案',
    prompt: `子任务结果：\n${results.map(r => r.text).join('\n---\n')}\n\n原始任务：${task}`,
  })

  return finalAnswer
}
```

---

## 10. 错误处理与重试

### 10.1 错误类型

```typescript
import { generateText, APICallError, InvalidResponseDataError } from 'ai'

try {
  const { text } = await generateText({
    model: openai('gpt-4o'),
    prompt: 'Hello',
  })
} catch (error) {
  if (APICallError.isInstance(error)) {
    console.error('API 调用错误:', error.statusCode, error.message)
    // 处理限流、认证失败等
  } else if (InvalidResponseDataError.isInstance(error)) {
    console.error('响应数据无效:', error.message)
    // 处理解析错误
  } else {
    console.error('未知错误:', error)
  }
}
```

### 10.2 重试策略

```typescript
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxRetries) throw error

      const delay = baseDelay * Math.pow(2, attempt - 1) // 指数退避
      console.log(`第 ${attempt} 次重试，等待 ${delay}ms...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  throw new Error('unreachable')
}

// 使用
const { text } = await withRetry(() =>
  generateText({
    model: openai('gpt-4o'),
    prompt: 'Hello',
  })
)
```

### 10.3 优雅降级

```typescript
async function generateWithFallback(prompt: string) {
  const models = [
    openai('gpt-4o'),           // 首选
    openai('gpt-4-turbo'),      // 备选1
    openai('gpt-3.5-turbo'),    // 备选2
  ]

  for (const model of models) {
    try {
      const { text } = await generateText({
        model,
        prompt,
        maxTokens: 1000,
      })
      return { text, model: model.modelId }
    } catch (error) {
      console.warn(`模型 ${model.modelId} 失败:`, error)
      continue
    }
  }

  throw new Error('所有模型均失败')
}
```

---

## 11. 与前端框架集成

### 11.1 Next.js 集成

```typescript
// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai'
import { streamText } from 'ai'

export const runtime = 'edge'  // 使用 Edge Runtime 获得更低延迟

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
  })

  return result.toDataStreamResponse()
}
```

### 11.2 Express.js 集成

```typescript
import express from 'express'
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

const app = express()
app.use(express.json())

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
  })

  result.pipeDataStreamToResponse(res)
})

app.listen(3000)
```

### 11.3 Nuxt.js (Vue) 集成

```typescript
// server/api/chat.post.ts
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

export default defineEventHandler(async (event) => {
  const { messages } = await readBody(event)

  const result = streamText({
    model: openai('gpt-4o'),
    messages,
  })

  return result.toDataStreamResponse()
})
```

### 11.4 纯前端 + 自定义后端

```typescript
// 如果后端不是 Node.js，前端可以直接使用 fetch + 手动解析
async function customChat(messages: Message[]) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value)
    // 解析 Vercel AI SDK 的数据流格式
    const lines = chunk.split('\n')
    for (const line of lines) {
      if (line.startsWith('0:')) {
        // 文本增量
        const text = JSON.parse(line.substring(2))
        console.log('文本:', text)
      } else if (line.startsWith('9:')) {
        // 工具调用开始
        const toolCall = JSON.parse(line.substring(2))
        console.log('工具调用:', toolCall)
      } else if (line.startsWith('a:')) {
        // 工具结果
        const result = JSON.parse(line.substring(2))
        console.log('工具结果:', result)
      }
    }
  }
}
```

---

## 12. 最佳实践

### 12.1 性能优化

```typescript
// 1. 使用 Edge Runtime 降低延迟
export const runtime = 'edge'

// 2. 使用更小更快的模型做简单任务
const fastModel = openai('gpt-4o-mini')
const powerfulModel = openai('gpt-4o')

// 3. 设置合理的 maxTokens 避免浪费
const result = await generateText({
  model: openai('gpt-4o'),
  prompt: '简短回答：什么是 TypeScript？',
  maxTokens: 200,  // 限制输出长度
})

// 4. 使用缓存减少重复调用
const cache = new Map<string, string>()

async function cachedGenerate(prompt: string) {
  const key = hash(prompt)
  if (cache.has(key)) return cache.get(key)

  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    prompt,
  })

  cache.set(key, text)
  return text
}
```

### 12.2 安全实践

```typescript
// 1. 输入验证
import { z } from 'zod'

const messageSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().max(10000),
  })).max(50),
})

// 2. 速率限制
const rateLimit = new Map<string, number>()

function checkRateLimit(userId: string, maxRequests: number = 10) {
  const now = Date.now()
  const userRequests = rateLimit.get(userId) || 0

  if (userRequests >= maxRequests) {
    throw new Error('请求过于频繁，请稍后再试')
  }

  rateLimit.set(userId, userRequests + 1)
  setTimeout(() => rateLimit.set(userId, (rateLimit.get(userId) || 1) - 1), 60000)
}

// 3. 内容过滤
async function filterContent(text: string): Promise<boolean> {
  // 使用 moderation API 或自定义规则
  const { text: result } = await generateText({
    model: openai('gpt-4o-mini'),
    prompt: `以下内容是否包含不当信息？只回答 "safe" 或 "unsafe"：\n${text}`,
    maxTokens: 10,
  })
  return result.trim().toLowerCase() === 'safe'
}
```

### 12.3 成本控制

```typescript
// 1. 监控 Token 使用
const { text, usage } = await generateText({
  model: openai('gpt-4o'),
  prompt: '...',
  onFinish: ({ usage }) => {
    console.log(`本次消耗: ${usage.totalTokens} tokens`)
    // 记录到监控系统
    metrics.recordTokenUsage(usage)
  },
})

// 2. 设置预算上限
const MAX_COST_PER_REQUEST = 0.1  // 美元

function estimateCost(model: string, promptTokens: number, completionTokens: number) {
  const pricing = {
    'gpt-4o': { input: 0.005 / 1000, output: 0.015 / 1000 },
    'gpt-4o-mini': { input: 0.00015 / 1000, output: 0.0006 / 1000 },
  }
  const p = pricing[model]
  return promptTokens * p.input + completionTokens * p.output
}

// 3. 使用更便宜的模型做预处理
async function smartRouter(prompt: string) {
  // 先用便宜模型判断复杂度
  const { text: complexity } = await generateText({
    model: openai('gpt-4o-mini'),
    prompt: `判断以下问题的复杂度（simple/medium/complex）：${prompt}`,
    maxTokens: 10,
  })

  // 根据复杂度选择模型
  const model = complexity.includes('simple')
    ? openai('gpt-4o-mini')
    : openai('gpt-4o')

  return generateText({ model, prompt })
}
```

### 12.4 用户体验

```typescript
// 1. 流式响应 + 打字机效果
const { messages, isLoading } = useChat({
  api: '/api/chat',
})

// 2. 乐观更新
const { append } = useChat()

async function sendMessage(content: string) {
  // 立即显示用户消息
  append({ role: 'user', content })

  // AI 回复会自动流式显示
}

// 3. 中断与恢复
const { stop, reload } = useChat()

// 用户可以中断生成
<button onClick={stop}>停止生成</button>

// 中断后可以恢复
<button onClick={reload}>继续生成</button>

// 4. 错误恢复
const { error, reload } = useChat({
  onError: (error) => {
    toast.error(`AI 回复失败: ${error.message}`)
  },
})

{error && (
  <div>
    发生错误: {error.message}
    <button onClick={reload}>重试</button>
  </div>
)}
```

---

## 附录：快速参考

### A. 常用 API 速查

| 函数/Hook | 用途 | 流式 |
|-----------|------|------|
| `generateText()` | 生成文本 | ❌ |
| `streamText()` | 流式生成文本 | ✅ |
| `generateObject()` | 生成结构化对象 | ❌ |
| `streamObject()` | 流式生成结构化对象 | ✅ |
| `useChat()` | 聊天 UI Hook | ✅ |
| `useCompletion()` | 补全 UI Hook | ✅ |
| `useObject()` | 结构化对象 UI Hook | ✅ |
| `tool()` | 定义工具 | - |
| `streamUI()` | 生成式 UI（RSC） | ✅ |

### B. Provider 速查

| Provider | 包名 | 环境变量 |
|----------|------|---------|
| OpenAI | `@ai-sdk/openai` | `OPENAI_API_KEY` |
| Anthropic | `@ai-sdk/anthropic` | `ANTHROPIC_API_KEY` |
| Google | `@ai-sdk/google` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| DeepSeek | `@ai-sdk/deepseek` | `DEEPSEEK_API_KEY` |
| Mistral | `@ai-sdk/mistral` | `MISTRAL_API_KEY` |
| 自定义 OpenAI 兼容 | `createOpenAI()` | 自定义 |

### C. 消息角色

| 角色 | 说明 |
|------|------|
| `system` | 系统提示词，定义 AI 行为 |
| `user` | 用户消息 |
| `assistant` | AI 回复 |
| `tool` | 工具调用结果 |
| `data` | 附加数据消息 |

---

> **下一步建议**：尝试用 Vercel AI SDK 的 `useChat` 重构你当前的 `App.vue`，对比原生 fetch + 手动 SSE 解析与框架方案的差异，体会开发效率的提升。