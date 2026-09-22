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
    // 兼容多种 token 用量字段格式
    // 1. output.llmOutput?.usage（标准 OpenAI 格式）
    // 2. output.llmOutput?.tokenUsage（LangChain LLMResult 格式）
    // 3. output.usage_metadata（AIMessage 格式）
    // 4. output.llmOutput?.token_usage（部分 API 返回格式）
    const usage =
      output?.llmOutput?.usage ||
      output?.llmOutput?.tokenUsage ||
      output?.llmOutput?.token_usage ||
      output?.usage_metadata ||
      output?.generations?.[0]?.[0]?.message?.usage_metadata

    if (usage) {
      const promptTokens = usage.promptTokens || usage.prompt_tokens || usage.input_tokens || 0
      const completionTokens = usage.completionTokens || usage.completion_tokens || usage.output_tokens || 0
      this.totalPromptTokens += promptTokens
      this.totalCompletionTokens += completionTokens
    } else {
      // 回退方案：根据文本长度估算 token 数（1 个中文字 ≈ 2 token，1 个英文单词 ≈ 1.3 token）
      const text = output?.generations?.[0]?.[0]?.text ||
        output?.generations?.[0]?.[0]?.message?.content || ''
      if (text) {
        const estimatedTokens = Math.ceil(text.length * 1.5)
        this.totalCompletionTokens += estimatedTokens
      }
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