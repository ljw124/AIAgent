/*
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-10-09
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-10-09 14:47:24
 * @Description: LangChain.js 中间件（Middleware）演示 — 自定义中间件 + 官方内置中间件
 *
 * 架构说明：
 * - 前 5 个为「自定义中间件」，通过 createMiddleware() 创建
 * - 后 6 个为「官方内置中间件」，从 langchain 直接导入
 * - 两者通过 createAgent({ middleware: [...] }) 统一编排
 *
 * 对应 Python 版：src/composables/MiddlewareModel.py（已废弃，保留作为参考）
 */

/* global INNER_API_KEY */
import { createMiddleware, createAgent } from 'langchain'
import {
  summarizationMiddleware,
  humanInTheLoopMiddleware,
  piiMiddleware,
  todoListMiddleware,
  modelCallLimitMiddleware,
  modelRetryMiddleware
} from 'langchain'
import { ChatOpenAI } from '@langchain/openai'

// ============================================================
// 第一部分：五个自定义中间件（createMiddleware）
// ============================================================
// 【什么是 createMiddleware？】
// LangChain.js 提供的中间件工厂函数，接收一个配置对象，返回中间件实例。
// 支持的钩子：beforeModel、afterModel、beforeAgent、afterAgent、wrapModelCall、wrapToolCall
//
// 【与 Python BaseCallbackHandler 的对应关系】
// Python on_llm_start  → JS beforeModel
// Python on_llm_end    → JS afterModel
// Python on_llm_error  → JS afterModel（通过 catch 处理）
// ============================================================

// ----------------------------------------------------------
// 中间件一：Before 中间件 — 调用前执行
// ----------------------------------------------------------
export const beforeMiddleware = createMiddleware({
  name: 'BeforeMiddleware',
  /**
   * beforeModel：在每次模型调用之前执行
   * @param {object} state - 当前状态，包含 messages、tools 等
   * @param {object} runtime - 运行时信息
   * @returns {object} 修改后的 state
   */
  beforeModel: (state) => {
    const log = (msg) => console.log(`[Before 中间件] ${msg}`)
    log(`⏱️ LLM 调用开始，时间戳: ${new Date().toLocaleTimeString()}`)
    log(`📝 输入消息数: ${state.messages?.length || 0}`)
    return state
  }
})

// ----------------------------------------------------------
// 中间件二：After 中间件 — 调用后执行
// ----------------------------------------------------------
export const afterMiddleware = createMiddleware({
  name: 'AfterMiddleware',
  /**
   * afterModel：在每次模型调用成功之后执行
   */
  afterModel: (state) => {
    const log = (msg) => console.log(`[After 中间件] ${msg}`)
    log('✅ LLM 调用结束')
    const lastMsg = state.messages?.[state.messages.length - 1]
    if (lastMsg?.content) {
      log(`📊 输出长度: ${typeof lastMsg.content === 'string' ? lastMsg.content.length : JSON.stringify(lastMsg.content).length} 字符`)
    }
    log('💾 可将结果写入缓存/数据库')
    return state
  }
})

// ----------------------------------------------------------
// 中间件三：Around 中间件 — 环绕执行（计时 + 异常处理）
// ----------------------------------------------------------
export const aroundMiddleware = createMiddleware({
  name: 'AroundMiddleware',
  /**
   * beforeModel：记录开始时间
   */
  beforeModel: (state) => {
    console.log('[Around 中间件] 🔄 开始计时')
    // 使用 Symbol 避免与 state 中其他属性冲突
    state.__startTime = Date.now()
    return state
  },
  /**
   * afterModel：计算耗时
   */
  afterModel: (state) => {
    const elapsed = state.__startTime ? Date.now() - state.__startTime : 0
    console.log(`[Around 中间件] ⏱️ 调用耗时: ${(elapsed / 1000).toFixed(2)} 秒`)
    return state
  }
})

// ----------------------------------------------------------
// 中间件四：敏感数据脱敏中间件
// ----------------------------------------------------------
export const sensitiveDataMiddleware = createMiddleware({
  name: 'SensitiveDataMiddleware',
  /**
   * beforeModel：对输入消息进行脱敏后输出日志
   * 注意：只脱敏日志输出，不修改实际发送给 LLM 的内容
   */
  beforeModel: (state) => {
    const log = (msg) => console.log(`[脱敏中间件] ${msg}`)
    if (state.messages) {
      state.messages.forEach((msg, i) => {
        let masked = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        // 手机号脱敏：保留前3位和后4位，中间用 **** 替代（如 138****1234）
        masked = masked.replace(/1[3-9]\d{9}/g, (match) => match.slice(0, 3) + '****' + match.slice(7))
        // 身份证脱敏：3301**********1234
        masked = masked.replace(/\d{6}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g, '****身份证已脱敏****')
        log(`🔒 输入 #${i} 已脱敏: ${masked.substring(0, 80)}...`)
      })
    }
    return state
  }
})

// ----------------------------------------------------------
// 中间件五：指标采集中间件
// ----------------------------------------------------------
// 使用闭包变量实现跨请求的统计（对应 Python 的类变量）
const metricsState = {
  callCount: 0,
  totalTime: 0
}

export const metricsMiddleware = createMiddleware({
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
    console.log(`[指标中间件] 📈 累计调用: ${metricsState.callCount} 次，平均耗时: ${(avg / 1000).toFixed(2)} 秒`)
    return state
  }
})

// ============================================================
// 第二部分：中间件组装函数
// ============================================================

/**
 * 根据配置开关，组装「自定义中间件」列表
 * @param {object} options - 开关配置
 * @returns {Array} 自定义中间件实例列表
 */
export function buildCustomMiddlewares(options = {}) {
  const {
    before = true,
    after = true,
    around = true,
    sensitive = true,
    metrics = true
  } = options

  const middlewares = []

  if (before) middlewares.push(beforeMiddleware)
  if (after) middlewares.push(afterMiddleware)
  if (around) middlewares.push(aroundMiddleware)
  if (sensitive) middlewares.push(sensitiveDataMiddleware)
  if (metrics) middlewares.push(metricsMiddleware)

  return middlewares
}

/**
 * 根据配置开关，组装「官方内置中间件」列表
 * @param {object} llm - ChatOpenAI 实例（部分中间件需要 model 参数）
 * @param {object} options - 开关配置
 * @returns {Array} 官方中间件实例列表
 */
export function buildOfficialMiddlewares(llm, options = {}) {
  const {
    summarization = true,
    humanInTheLoop = true,
    pii = true,
    todo = true,
    callLimit = true,
    retry = true
  } = options

  const middlewares = []

  if (summarization) {
    // SummarizationMiddleware: 当对话历史接近 token 限制时自动摘要
    middlewares.push(summarizationMiddleware({
      model: llm,
      trigger: { tokens: 4000 }, // 多轮历史超 4000 tokens 时触发
      keep: { messages: 20 }
    }))
  }

  if (humanInTheLoop) {
    // HumanInTheLoopMiddleware: 在工具调用前暂停，等待人工确认
    middlewares.push(humanInTheLoopMiddleware({
      interruptOn: { tool_use: true }, // 需要 tools 触发 tool_use 时触发
      descriptionPrefix: '工具执行需要人工审批'
    }))
  }

  if (pii) {
    // PIIMiddleware: 检测和脱敏个人身份信息
    middlewares.push(piiMiddleware('email', {
      strategy: 'redact',
      applyToInput: true,
      applyToOutput: true
    }))
  }

  if (todo) {
    // TodoListMiddleware: 为 Agent 提供 write_todos 工具
    middlewares.push(todoListMiddleware())
  }

  if (callLimit) {
    // ModelCallLimitMiddleware: 限制模型调用次数
    middlewares.push(modelCallLimitMiddleware({
      runLimit: 10, // 单次请求中 LLM 调用超 10 次时触发
      exitBehavior: 'end'
    }))
  }

  if (retry) {
    // ModelRetryMiddleware: 调用失败自动重试
    middlewares.push(modelRetryMiddleware({ maxRetries: 2 }))
  }

  return middlewares
}


// ============================================================
// 第三部分：核心聊天函数
// ============================================================

/**
 * 使用中间件调用内网大模型并返回回复
 *
 * 架构说明：
 * 1. 自定义中间件（5个）→ 通过 createAgent({ middleware: [...] }) 传递
 * 2. 官方内置中间件（6个）→ 同上，统一在 middleware 数组中
 * 3. 两者通过 createAgent() 统一编排，形成双层中间件架构
 *
 * @param {string} message - 用户输入的消息
 * @param {object} options - 配置选项
 * @param {number} options.temperature - 温度参数（0~2）
 * @param {string} options.model - 模型名称
 * @param {object} options.middleware - 中间件开关配置 { before, after, around, ... }
 * @returns {Promise<{content: string, logs: string[]}>}
 */
export async function chatWithMiddleware(message, options = {}) {
  const {
    temperature = 0.7,
    model = 'EB-DeepSeek-V4-Pro',
    middleware: middlewareConfig = {}
  } = options

  // 收集中间件日志（通过拦截 console.log）
  const logs = []
  const originalLog = console.log
  const logInterceptor = (...args) => {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
    logs.push(msg)
    originalLog(...args) // 仍然输出到控制台
  }

  try {
    // 第一步：创建 ChatOpenAI 实例
    const llm = new ChatOpenAI({
      model,
      apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
      temperature,
      configuration: {
        baseURL: window.location.origin + '/inner/'
      }
    })

    // 第二步：组装自定义中间件
    const customMiddlewares = buildCustomMiddlewares(middlewareConfig)

    // 第三步：组装官方内置中间件
    const officialMiddlewares = buildOfficialMiddlewares(llm, middlewareConfig)

    // 第四步：使用 createAgent 创建 Agent（统一编排两种中间件）
    // 拦截 console.log 以收集中间件日志
    console.log = logInterceptor

    const agent = createAgent({
      model: llm,
      middleware: [...customMiddlewares, ...officialMiddlewares],
      systemPrompt: '你是一个有用的AI助手，请用中文回答。'
    })

    // 第五步：调用 Agent
    const result = await agent.invoke({
      messages: [{ role: 'user', content: message }]
    })

    // 第六步：提取最终回复文本
    const messages = result.messages || []
    const lastMsg = messages[messages.length - 1]
    const content = lastMsg?.content || ''

    return { content, logs }
  } finally {
    // 恢复 console.log
    console.log = originalLog
  }
}
