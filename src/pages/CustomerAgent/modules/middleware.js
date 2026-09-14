/**
 * 智能客服 Agent — 中间件模块（Stage8: Middleware）
 *
 * 精简版：日志 + Token 统计
 * 通过 BaseCallbackHandler 实现
 */

import { BaseCallbackHandler } from '@langchain/core/callbacks/base'

// ============================================================
// 中间件 1：请求日志
// ============================================================
export class LoggingCallback extends BaseCallbackHandler {
  name = 'LoggingCallback'

  constructor() {
    super()
    this.startTime = null
    this.callCount = 0
  }

  async handleLLMStart(_llm, prompts) {
    this.startTime = Date.now()
    this.callCount++
    console.log(
      `[Agent] LLM 调用 #${this.callCount} 开始，Prompt 长度: ${prompts[0]?.length || 0} 字符`
    )
  }

  async handleLLMEnd() {
    const elapsed = Date.now() - (this.startTime || Date.now())
    console.log(`[Agent] LLM 调用 #${this.callCount} 完成，耗时 ${elapsed}ms`)
  }

  async handleLLMError(error) {
    console.error(`[Agent] LLM 调用 #${this.callCount} 失败:`, error.message)
  }

  async handleToolStart(tool, input) {
    console.log(`[Agent] 🔧 工具调用: ${tool.name}(${input})`)
  }

  async handleToolEnd(output) {
    const preview = typeof output === 'string' ? output.substring(0, 100) : JSON.stringify(output).substring(0, 100)
    console.log(`[Agent] ✅ 工具返回: ${preview}...`)
  }

  async handleChainStart(chain) {
    console.log(`[Agent] 链调用开始: ${chain.name || 'unnamed'}`)
  }

  async handleChainEnd() {
    console.log(`[Agent] 链调用完成`)
  }
}

// ============================================================
// 中间件 2：Token 统计
// ============================================================
export class TokenMetricsCallback extends BaseCallbackHandler {
  name = 'TokenMetricsCallback'

  constructor() {
    super()
    this.totalPromptTokens = 0
    this.totalCompletionTokens = 0
  }

  async handleLLMEnd(output) {
    const usage = output.llmOutput?.usage || output.usage_metadata
    if (usage) {
      const promptTokens = usage.promptTokens || usage.input_tokens || 0
      const completionTokens = usage.completionTokens || usage.output_tokens || 0
      this.totalPromptTokens += promptTokens
      this.totalCompletionTokens += completionTokens
      console.log(
        `[Agent] 🪙 Token: prompt=${promptTokens}, completion=${completionTokens}`
      )
    }
  }

  getStats() {
    return {
      promptTokens: this.totalPromptTokens,
      completionTokens: this.totalCompletionTokens,
      total: this.totalPromptTokens + this.totalCompletionTokens,
    }
  }

  reset() {
    this.totalPromptTokens = 0
    this.totalCompletionTokens = 0
  }
}

// ============================================================
// 创建中间件列表
// ============================================================
export function createCallbacks() {
  const logging = new LoggingCallback()
  const tokenMetrics = new TokenMetricsCallback()
  return { logging, tokenMetrics, list: [logging, tokenMetrics] }
}