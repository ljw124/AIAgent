<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-07
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-10-16
 * @Description: LangChain 中间件（Middleware）学习教程 — 以 JS 版（v1）为主体，Python 版作为原理对照
 *   说明：LangChain.js（langchain@1.5.x）已完整支持 middleware API（createAgent + createMiddleware）
 *   项目实际实现：src/composables/middlewareSamples.js + src/pages/langchain/LangChainStage8Meddleware.vue
-->

# LangChain 中间件（Middleware）详解

> 本文以 **LangChain.js（`langchain@1.5.x`）v1 Middleware 体系**为主体讲解，Python 版（`BaseCallbackHandler` / `AgentMiddleware`）作为原理对照保留在[第九章](#九python-版对照原理参考)。
>
> 项目实际实现：
> - 示例代码：[`middlewareSamples.js`](../../composables/middlewareSamples.js)（5 个自定义中间件 + 6 个官方内置中间件）
> - 示例页面：[`LangChainStage8Meddleware.vue`](../pages/langchain/LangChainStage8Meddleware.vue)（阶段八）
> - Python 参考版：[`MiddlewareModel.py`](../../composables/MiddlewareModel.py)（已废弃，保留作对照）

---

## 📖 目录

- [一、什么是中间件](#一什么是中间件)
- [二、为什么需要中间件](#二为什么需要中间件)
- [三、LangChain.js 中间件体系总览（v1）](#三langchainjs-中间件体系总览v1)
- [四、自定义中间件（createMiddleware）](#四自定义中间件createmiddleware)
- [五、官方内置中间件（JS 版）](#五官方内置中间件js-版)
- [六、进阶中间件：ModelFallback / ToolCallLimit / 动态 System Prompt](#六进阶中间件modelfallback--toollimit--动态-system-prompt)
- [七、双层中间件架构实战（项目实现）](#七双层中间件架构实战项目实现)
- [八、实际应用场景（JS 版）](#八实际应用场景js-版)
- [九、Python 版对照（原理参考）](#九python-版对照原理参考)
- [十、最佳实践](#十最佳实践)

---

## 一、什么是中间件

**中间件（Middleware）** 是一种允许你在 **LLM 调用之前、之后或环绕调用** 插入自定义逻辑的机制，而无需修改模型调用代码本身。

它类似于 Web 框架（如 Express、Koa）中的中间件概念，但专门针对 **LLM 调用链** 设计。

```js
// 伪代码：中间件包裹模型调用
async function middleware(request, handler) {
  // 调用前逻辑
  const response = await handler(request) // 实际模型调用
  // 调用后逻辑
  return response
}
```

---

## 二、为什么需要中间件

在实际开发中，我们经常需要在模型调用前后做各种处理：

| 需求 | 传统做法 | 中间件做法 |
|---|---|---|
| 记录每次调用的耗时 | 在每个调用点写日志 | 一个中间件统一处理 |
| 缓存相同请求的结果 | 手动检查缓存 | 中间件自动缓存 |
| 对输入做敏感信息脱敏 | 每次调用前手动处理 | 中间件统一脱敏 |
| 限制调用频率（限流） | 各处手动计数 | 中间件统一限流 |
| 失败自动重试 | 各处写 try/catch | 中间件统一重试 |
| 主模型故障降级备用模型 | 各处写 fallback 逻辑 | 中间件统一降级 |

**核心价值**：把横切关注点（日志、缓存、限流、重试等）从业务代码中抽离出来，实现 **关注点分离**，让业务代码更干净、可复用。

---

## 三、LangChain.js 中间件体系总览（v1）

### 3.1 两层中间件架构

LangChain.js v1（`langchain@1.5.x`）中，自定义中间件与官方内置中间件 **统一通过 `createAgent({ middleware: [...] })` 编排**，形成双层架构：

| 维度 | 自定义中间件 | 官方内置中间件 |
|---|---|---|
| 创建方式 | [`createMiddleware({...})`](https://reference.langchain.com/javascript/langchain/) 工厂函数 | 从 `langchain` 直接导入工厂函数 |
| 传递方式 | `createAgent({ middleware: [...] })` | 同左（统一在 middleware 数组） |
| 工作层级 | LLM 调用级别（`beforeModel`/`afterModel`） | Agent 级别（摘要、审批、PII、限流） |
| 适用场景 | 日志、计时、脱敏、指标 | 摘要、人机协同、PII、待办、调用限制 |

### 3.2 架构关系图

```
┌─────────────────────────────────────────────────┐
│            createAgent({ middleware })           │
│  ┌───────────────────────────────────────────┐  │
│  │  官方内置中间件（Agent 级别）               │  │
│  │  summarization / humanInTheLoop /         │  │
│  │  pii / todoList / modelCallLimit /        │  │
│  │  modelRetry / modelFallback /             │  │
│  │  toolCallLimit                            │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │  自定义中间件（LLM 调用级别）              │  │
│  │  before / after / around /                │  │
│  │  sensitiveData / metrics                  │  │
│  └───────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────┐  │
│  │  ChatOpenAI (LLM)                         │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### 3.3 createAgent 完整参数（langchain@1.5.x）

| 参数 | 类型 | 说明 |
|---|---|---|
| `model` | ChatModel | **必填**，LLM 模型实例 |
| `tools` | Tool[] | 工具列表（可选） |
| `systemPrompt` | string | 系统提示词（可选） |
| `middleware` | Middleware[] | 中间件列表（可选） |
| `responseFormat` | ZodSchema 或 { schema, prompt?, method? } | 结构化输出（可选） |
| `stateSchema` | Annotation.Root | 自定义状态 schema（可选） |
| `contextSchema` | Annotation.Root | 运行时上下文 schema（可选） |
| `name` / `description` | string | Agent 名称/描述（多 Agent 场景，可选） |
| `version` | `'v1'` 或 `'v2'` | 工具调用版本（v2 支持并行 Send API） |
| `includeAgentName` | `'inline'` 或 boolean | 消息中是否包含 Agent 名称 |
| `checkpointer` | Checkpointer | 短期记忆持久化（可选） |
| `store` | BaseStore | 长期记忆存储（可选） |
| `signal` | AbortSignal | 取消信号（可选） |

### 3.4 createMiddleware 六大钩子

| 钩子 | 签名 | 时机 | 典型用途 |
|---|---|---|---|
| `beforeModel` | `(state, runtime)` | 每次模型调用**前** | 参数校验、鉴权、注入上下文 |
| `afterModel` | `(state, runtime)` | 每次模型调用**后** | 结果处理、缓存写入、指标采集 |
| `beforeAgent` | `(state, runtime)` | Agent 执行**前** | 初始化状态、加载配置 |
| `afterAgent` | `(state, runtime)` | Agent 执行**后** | 清理、结果汇总 |
| `wrapModelCall` | `(request, handler)` | **环绕**模型调用 | 重试、限流、超时、**动态 System Prompt** |
| `wrapToolCall` | `(request, handler)` | **环绕**工具调用 | 工具审批、错误处理、结果过滤 |

### 3.5 执行顺序

```
用户消息 → createAgent
  → beforeAgent（Agent 执行前）
  → 循环（直到不再调用模型）：
      → beforeModel（模型调用前）
      → wrapModelCall 环绕层（重试/限流/动态 prompt）
        → 实际 API 调用
      → afterModel（模型调用后）
      → 若有工具调用 → wrapToolCall 环绕层 → 执行工具
  → afterAgent（Agent 执行后）
  → 返回最终结果
```

---

## 四、自定义中间件（createMiddleware）

### 4.1 Before / After / Around 三种模式

对应 [`middlewareSamples.js`](../../composables/middlewareSamples.js) 中的实现：

```js
import { createMiddleware } from 'langchain'

// ① Before 中间件 — 调用前执行
export const beforeMiddleware = createMiddleware({
  name: 'BeforeMiddleware',
  beforeModel: (state) => {
    console.log(`[Before] LLM 调用开始，输入消息数: ${state.messages?.length || 0}`)
    return state
  }
})

// ② After 中间件 — 调用后执行
export const afterMiddleware = createMiddleware({
  name: 'AfterMiddleware',
  afterModel: (state) => {
    const lastMsg = state.messages?.[state.messages.length - 1]
    console.log(`[After] LLM 调用结束，输出长度: ${lastMsg?.content?.length || 0} 字符`)
    return state
  }
})

// ③ Around 中间件 — 环绕执行（beforeModel 记录开始 + afterModel 计算耗时）
export const aroundMiddleware = createMiddleware({
  name: 'AroundMiddleware',
  beforeModel: (state) => {
    state.__startTime = Date.now() // 前缀属性避免与 state 冲突
    return state
  },
  afterModel: (state) => {
    const elapsed = state.__startTime ? Date.now() - state.__startTime : 0
    console.log(`[Around] 调用耗时: ${(elapsed / 1000).toFixed(2)} 秒`)
    return state
  }
})
```

> **注意**：`beforeModel`/`afterModel` 中修改 `state` 时，使用 `__` 前缀属性（如 `__startTime`）避免与业务状态字段冲突。

### 4.2 wrapModelCall — 环绕拦截（最强大的钩子）

`wrapModelCall` 可以在模型调用前后做任意包装，是实现 **重试、限流、超时、动态 System Prompt** 的核心钩子：

```js
import { createMiddleware } from 'langchain'

// 环绕中间件：统一计时 + 统一异常处理
const wrapMiddleware = createMiddleware({
  name: 'WrapMiddleware',
  wrapModelCall: async (request, handler) => {
    const start = Date.now()
    try {
      const response = await handler(request) // 执行实际模型调用
      console.log(`[Wrap] 调用成功，耗时 ${Date.now() - start}ms`)
      return response
    } catch (err) {
      console.error(`[Wrap] 调用失败: ${err.message}`)
      throw err
    }
  }
})
```

`request` 对象包含本次模型调用的完整信息（`model`、`systemPrompt`、`messages`、`tools` 等），修改后传给 `handler` 即可影响实际调用——这是[动态 System Prompt](#63-动态-system-promptwrapmodelcall-改写)的实现基础。

---

## 五、官方内置中间件（JS 版）

从 `langchain` 包直接导入工厂函数，无需额外安装。项目在 [`middlewareSamples.js`](../../composables/middlewareSamples.js) 中使用了 6 个：

### 5.1 内置中间件列表（项目已用）

| 中间件 | 工厂函数 | 作用 | 项目配置 |
|---|---|---|---|
| 摘要中间件 | `summarizationMiddleware` | 对话历史接近 token 限制时自动摘要 | `trigger: { tokens: 4000 }`，`keep: { messages: 20 }` |
| 人机协同中间件 | `humanInTheLoopMiddleware` | 工具调用前暂停，等待人工确认 | `interruptOn: { tool_use: true }` |
| PII 中间件 | `piiMiddleware` | 检测和脱敏个人身份信息 | `piiMiddleware('email', { strategy: 'redact' })` |
| 待办列表中间件 | `todoListMiddleware` | 为 Agent 提供 `write_todos` 工具 | 默认配置 |
| 调用限制中间件 | `modelCallLimitMiddleware` | 限制模型调用次数，防止滥用超配额 | `runLimit: 10`，`exitBehavior: 'end'` |
| 重试中间件 | `modelRetryMiddleware` | 调用失败自动重试 | `maxRetries: 2` |

### 5.2 导入方式

```js
import {
  summarizationMiddleware,
  humanInTheLoopMiddleware,
  piiMiddleware,
  todoListMiddleware,
  modelCallLimitMiddleware,
  modelRetryMiddleware
} from 'langchain'
```

### 5.3 各中间件用法详解（JS 版）

#### summarizationMiddleware — 摘要中间件

```js
summarizationMiddleware({
  model: llm,                    // 用于生成摘要的模型实例
  trigger: { tokens: 4000 },     // 多轮历史超 4000 tokens 时触发摘要
  keep: { messages: 20 }         // 摘要后保留最近 20 条消息
})
```

#### humanInTheLoopMiddleware — 人机协同中间件

```js
humanInTheLoopMiddleware({
  interruptOn: { tool_use: true },          // 工具调用前中断等待审批
  descriptionPrefix: '工具执行需要人工审批'   // 审批提示前缀
})
```

#### piiMiddleware — PII 中间件

```js
piiMiddleware('email', {
  strategy: 'redact',      // 策略：block(阻止) / redact(脱敏) / mask(掩码) / hash(哈希)
  applyToInput: true,      // 对输入应用
  applyToOutput: true      // 对输出应用
})
// 支持类型：email / credit_card / ip / mac_address / url 等
```

#### todoListMiddleware — 待办列表中间件

```js
todoListMiddleware() // 无需参数，Agent 自动获得 write_todos 工具
```

#### modelCallLimitMiddleware — 调用限制中间件

```js
modelCallLimitMiddleware({
  runLimit: 10,            // 单次运行最大调用次数
  exitBehavior: 'end'      // 达到限制后：'end'(正常结束) 或 'error'(抛异常)
})
```

#### modelRetryMiddleware — 重试中间件

```js
modelRetryMiddleware({
  maxRetries: 2            // 调用失败自动重试次数
})
```

---

## 六、进阶中间件：ModelFallback / ToolCallLimit / 动态 System Prompt

> 对应官网对照清单 P0-2 的「仍缺」项，是 Stage 8 之外的进阶内容。

### 6.1 ModelFallbackMiddleware — 模型降级

主模型调用失败（超时/限流/服务不可用）时自动降级到备用模型：

```js
import { modelFallbackMiddleware } from 'langchain'

const fallback = modelFallbackMiddleware({
  models: [llmPrimary, llmBackup]  // 按顺序尝试的模型列表，主模型失败自动切换备用
})
```

**与 `modelRetryMiddleware` 的组合策略**：Retry 解决「瞬时故障」（网络抖动），Fallback 解决「持续故障」（主模型服务宕机）。生产环境建议两者叠加：

```js
middleware: [
  modelRetryMiddleware({ maxRetries: 2 }),      // 先重试 2 次
  modelFallbackMiddleware({ models: [backup] }) // 仍失败则降级
]
```

### 6.2 ToolCallLimitMiddleware — 工具调用限制

限制 **工具调用轮次**（区别于 `modelCallLimitMiddleware` 限制模型调用次数），防止 Agent 陷入「调用工具 → 无进展 → 再调用」的死循环：

```js
import { toolCallLimitMiddleware } from 'langchain'

toolCallLimitMiddleware({
  limit: 20,               // 单次运行最多工具调用次数
  exitBehavior: 'end'      // 达到限制后正常结束并返回已有结果
})
```

### 6.3 动态 System Prompt（wrapModelCall 改写）

利用 `wrapModelCall` 钩子，在每次模型调用前根据 **当前状态** 动态改写 System Prompt：

```js
import { createMiddleware } from 'langchain'

const dynamicPromptMiddleware = createMiddleware({
  name: 'DynamicPromptMiddleware',
  wrapModelCall: async (request, handler) => {
    const messageCount = request.messages?.length || 0
    // 根据对话轮数动态调整提示词
    const dynamicPrompt = messageCount > 6
      ? '你是一个简洁的AI助手，历史对话较长，请直接给出要点式回答。'
      : '你是一个有用的AI助手，请用中文详细回答。'
    return handler({
      ...request,
      systemPrompt: dynamicPrompt // 改写本次调用的 System Prompt
    })
  }
})
```

**典型场景**：
- 多租户系统按用户身份注入个性化提示词（参考 [`CustomerAgent/modules/middleware.js`](../../pages/CustomerAgent/modules/middleware.js)）
- 长对话自动切换「简洁模式」控制输出长度
- 按工具调用次数注入「引导收敛」提示，配合 `toolCallLimitMiddleware` 防死循环

---

## 七、双层中间件架构实战（项目实现）

项目 [`middlewareSamples.js`](../../composables/middlewareSamples.js) 演示了如何将自定义中间件与官方内置中间件统一编排：

```js
import { createMiddleware, createAgent } from 'langchain'
import {
  summarizationMiddleware, humanInTheLoopMiddleware, piiMiddleware,
  todoListMiddleware, modelCallLimitMiddleware, modelRetryMiddleware
} from 'langchain'
import { ChatOpenAI } from '@langchain/openai'

// ============================================================
// 第一步：创建 ChatOpenAI 实例
// ============================================================
const llm = new ChatOpenAI({
  model: 'EB-DeepSeek-V4-Pro',
  temperature: 0.7,
  configuration: { baseURL: window.location.origin + '/inner/' }
})

// ============================================================
// 第二步：组装自定义中间件（5 个，按开关配置）
// ============================================================
const customMiddlewares = [
  beforeMiddleware,        // 调用前日志
  afterMiddleware,         // 调用后日志
  aroundMiddleware,        // 环绕计时
  sensitiveDataMiddleware, // 敏感数据脱敏
  metricsMiddleware        // 指标采集
]

// ============================================================
// 第三步：组装官方内置中间件（6 个，按开关配置）
// ============================================================
const officialMiddlewares = [
  summarizationMiddleware({ model: llm, trigger: { tokens: 4000 }, keep: { messages: 20 } }),
  humanInTheLoopMiddleware({ interruptOn: { tool_use: true } }),
  piiMiddleware('email', { strategy: 'redact', applyToInput: true, applyToOutput: true }),
  todoListMiddleware(),
  modelCallLimitMiddleware({ runLimit: 10, exitBehavior: 'end' }),
  modelRetryMiddleware({ maxRetries: 2 })
]

// ============================================================
// 第四步：createAgent 统一编排（双层中间件架构）
// ============================================================
const agent = createAgent({
  model: llm,
  middleware: [...customMiddlewares, ...officialMiddlewares],
  systemPrompt: '你是一个有用的AI助手，请用中文回答。'
})

// ============================================================
// 第五步：调用 Agent
// ============================================================
const result = await agent.invoke({
  messages: [{ role: 'user', content: '你好' }]
})
const content = result.messages[result.messages.length - 1]?.content
```

### 执行流程

```
用户消息 → createAgent
  → 官方中间件处理（PII检测、摘要检查、调用计数等）
  → ChatOpenAI.invoke()
    → 自定义中间件.beforeModel()（Before → Around → SensitiveData）
    → 实际 API 调用
    → 自定义中间件.afterModel()（Around → After → Metrics）
  → 官方中间件后处理（TodoList提取、HumanInTheLoop审核等）
  → 返回最终结果
```

### Vue 页面集成要点

[`LangChainStage8Meddleware.vue`](../pages/langchain/LangChainStage8Meddleware.vue) 的集成方式：

1. **中间件开关配置**：下拉多选组件维护 `selectedMiddleware` 数组，computed 转换为 `{ key: boolean }` 配置对象
2. **日志收集**：通过拦截 `console.log` 收集中间件执行日志，在聊天记录中以折叠面板展示
3. **动态组装**：每次发送请求时按开关重新组装中间件列表，`createAgent` 按需创建

---

## 八、实际应用场景（JS 版）

### 8.1 敏感信息脱敏（自定义中间件）

```js
const sensitiveDataMiddleware = createMiddleware({
  name: 'SensitiveDataMiddleware',
  beforeModel: (state) => {
    if (state.messages) {
      state.messages.forEach((msg, i) => {
        let masked = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        // 手机号脱敏：保留前3位和后4位
        masked = masked.replace(/1[3-9]\d{9}/g, (m) => m.slice(0, 3) + '****' + m.slice(7))
        // 身份证脱敏
        masked = masked.replace(/\d{6}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g, '****身份证已脱敏****')
        console.log(`[脱敏] 输入 #${i}: ${masked.substring(0, 80)}...`)
      })
    }
    return state
  }
})
```

### 8.2 调用统计与监控（自定义中间件）

```js
// 使用闭包变量实现跨请求统计
const metricsState = { callCount: 0, totalTime: 0 }

const metricsMiddleware = createMiddleware({
  name: 'MetricsMiddleware',
  beforeModel: (state) => {
    state.__metricsStartTime = Date.now()
    return state
  },
  afterModel: (state) => {
    metricsState.callCount++
    if (state.__metricsStartTime) {
      metricsState.totalTime += Date.now() - state.__metricsStartTime
    }
    const avg = metricsState.totalTime / metricsState.callCount
    console.log(`[指标] 累计调用 ${metricsState.callCount} 次，平均耗时 ${(avg / 1000).toFixed(2)} 秒`)
    return state
  }
})
```

### 8.3 PII 检测与脱敏（官方内置中间件）

```js
// 一行代码搞定邮箱脱敏
piiMiddleware('email', { strategy: 'redact', applyToInput: true, applyToOutput: true })
```

### 8.4 任务管理（官方内置中间件）

```js
const agent = createAgent({ model: llm, middleware: [todoListMiddleware()] })
const result = await agent.invoke({ messages: [{ role: 'user', content: '帮我规划学习计划' }] })
// result 中包含 Agent 自动创建的任务列表（todos）
```

### 8.5 多租户动态提示词（自定义中间件 + wrapModelCall）

参考 [`CustomerAgent/modules/middleware.js`](../../pages/CustomerAgent/modules/middleware.js) 的多租户实现思路：

```js
const tenantPromptMiddleware = createMiddleware({
  name: 'TenantPromptMiddleware',
  wrapModelCall: async (request, handler) => {
    const tenant = request.runtime?.context?.tenant || 'default'
    const tenantPrompts = {
      vip: '你是VIP客户专属助手，回答需专业且优先推荐高级服务。',
      default: '你是一个有用的AI助手，请用中文回答。'
    }
    return handler({ ...request, systemPrompt: tenantPrompts[tenant] })
  }
})
```

---

## 九、Python 版对照（原理参考）

> 本节保留 Python 版实现作为原理对照。项目已迁移至 JS 版（上文第三~八章），Python 版仅用于理解中间件的设计思想。

### 9.1 Python 两种中间件机制

| 维度 | 自定义中间件 | 官方内置中间件 |
|---|---|---|
| 基类 | [`BaseCallbackHandler`](https://reference.langchain.com/python/langchain_core/callbacks) | [`AgentMiddleware`](https://reference.langchain.com/python/langchain/agents/middleware) |
| 导入路径 | `langchain_core.callbacks` | `langchain.agents.middleware` |
| 传递方式 | `ChatOpenAI(callbacks=...)` | `create_agent(middleware=...)` |
| 工作层级 | LLM 调用级别（每次 API 调用触发） | Agent 级别（工具调用、状态管理等） |
| 适用场景 | 日志、计时、脱敏、指标统计 | 摘要、人机协同、PII 检测、待办列表、调用限制 |

### 9.2 JS/Python 钩子对照表

| Python（BaseCallbackHandler） | JS（createMiddleware） | 说明 |
|---|---|---|
| `on_llm_start()` | `beforeModel` | 模型调用前 |
| `on_llm_end()` | `afterModel` | 模型调用后 |
| `on_llm_error()` | `afterModel`（通过 catch 处理）或 `wrapModelCall` try/catch | 错误处理 |
| `on_chain_start()` / `on_chain_end()` | `beforeAgent` / `afterAgent` | Agent 级别 |
| —（Python 无直接对应） | `wrapModelCall` / `wrapToolCall` | JS v1 特有的环绕拦截钩子 |

### 9.3 Python 自定义中间件示例

```python
from langchain_core.callbacks import BaseCallbackHandler
import time

class BeforeMiddleware(BaseCallbackHandler):
    """调用前：参数校验、鉴权、注入上下文"""
    def on_llm_start(self, serialized, prompts, **kwargs):
        print(f"[Before] LLM 调用开始，输入消息数: {len(prompts)}")

class AfterMiddleware(BaseCallbackHandler):
    """调用后：结果处理、缓存写入、指标采集"""
    def on_llm_end(self, response, **kwargs):
        text = response.generations[0][0].text
        print(f"[After] LLM 调用结束，输出长度: {len(text)} 字符")

class AroundMiddleware(BaseCallbackHandler):
    """环绕：统一计时、统一异常处理"""
    def on_llm_start(self, serialized, prompts, **kwargs):
        self.start_time = time.time()

    def on_llm_end(self, response, **kwargs):
        elapsed = time.time() - self.start_time
        print(f"[Around] 调用耗时: {elapsed:.2f} 秒")

# 传递方式：ChatOpenAI(callbacks=[...])
llm = ChatOpenAI(
    model="gpt-4o",
    callbacks=[BeforeMiddleware(), AfterMiddleware(), AroundMiddleware()]
)
# 执行顺序：Before.on_llm_start → Around.on_llm_start → API调用 → Around.on_llm_end → After.on_llm_end
```

### 9.4 Python 官方内置中间件示例

```python
from langchain.agents import create_agent
from langchain.agents.middleware import (
    SummarizationMiddleware, HumanInTheLoopMiddleware,
    PIIMiddleware, TodoListMiddleware, ModelCallLimitMiddleware,
)

agent = create_agent(
    model=llm,
    middleware=[
        SummarizationMiddleware(model=llm, trigger=('tokens', 4000), keep=('messages', 20)),
        HumanInTheLoopMiddleware(interrupt_on={'tool_use': True}),
        PIIMiddleware(pii_type='email', strategy='redact', apply_to_input=True, apply_to_output=True),
        TodoListMiddleware(),
        ModelCallLimitMiddleware(run_limit=10, exit_behavior='end'),
    ],
    system_prompt="你是一个有用的AI助手，请用中文回答。",
)
result = agent.invoke({"messages": [HumanMessage(content="你好")]})
print(result["messages"][-1].content)
```

### 9.5 Python 版完整参考

完整 Python 实现见 [`MiddlewareModel.py`](../../composables/MiddlewareModel.py)（已废弃，保留作为参考）。

---

## 十、最佳实践

1. **分层使用**：自定义中间件处理 LLM 级别关注点（日志、计时、脱敏），官方中间件处理 Agent 级别关注点（摘要、PII、任务管理、限流）
2. **单一职责**：每个中间件只做一件事（日志、缓存、限流分开写）
3. **注意顺序**：`middleware` 数组中 `beforeModel` 按列表顺序执行，`afterModel` 逆序执行
4. **避免副作用**：中间件应尽量无状态；需要跨请求统计时使用闭包变量（如 `metricsState`）
5. **state 属性命名**：在 `beforeModel`/`afterModel` 中向 state 写入临时数据时，使用 `__` 前缀（如 `__startTime`）避免与业务字段冲突
6. **性能考量**：中间件会增加调用开销，避免在热路径中做重操作
7. **容错组合**：生产环境建议 `modelRetryMiddleware`（瞬时故障）+ `modelFallbackMiddleware`（持续故障）+ `toolCallLimitMiddleware`（防死循环）三层叠加
8. **版本要求**：JS 版需要 `langchain >= 1.5.x`（本项目 `^1.5.15`）；Python 版官方内置中间件需要 `langchain >= 1.4.0`

---

## 总结

- LangChain.js v1（`langchain@1.5.x`）提供 **统一的中间件体系**：自定义（`createMiddleware`）和官方内置（工厂函数）都通过 `createAgent({ middleware: [...] })` 编排
- **自定义中间件** 六大钩子：`beforeModel`/`afterModel`/`beforeAgent`/`afterAgent`/`wrapModelCall`/`wrapToolCall`，其中 `wrapModelCall` 是实现重试、限流、动态 System Prompt 的核心
- **官方内置中间件**（项目已用 6 个）：`summarizationMiddleware`、`humanInTheLoopMiddleware`、`piiMiddleware`、`todoListMiddleware`、`modelCallLimitMiddleware`、`modelRetryMiddleware`
- **进阶中间件**：`modelFallbackMiddleware`（模型降级）、`toolCallLimitMiddleware`（工具调用限制防死循环）、动态 System Prompt（`wrapModelCall` 改写）
- 两种中间件统一编排形成 **双层中间件架构**，项目实现见 [`middlewareSamples.js`](../../composables/middlewareSamples.js) + [`LangChainStage8Meddleware.vue`](../pages/langchain/LangChainStage8Meddleware.vue)
- Python 版（`BaseCallbackHandler` + `AgentMiddleware`）作为原理对照保留在[第九章](#九python-版对照原理参考)，钩子对应关系见 [9.2 对照表](#92-jspython-钩子对照表)
