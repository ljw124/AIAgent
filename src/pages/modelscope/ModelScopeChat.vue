<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-08-27 11:48:57
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-02 10:05:53
 * @Description: 魔搭大模型 LangChain.js 调用（适配 API 不稳定）
-->
<template>
  <div>
    <h1>魔搭大模型 <span class="badge modelscope">LangChain.js 调用</span></h1>
    <div class="info-box">
      <strong>调用方式：</strong>LangChain.js（ChatOpenAI）→ 魔搭 ModelScope API<br />
      <strong>模型：</strong>deepseek-ai/DeepSeek-V4-Flash-0731<br />
      <strong>说明：</strong>使用 <code>@langchain/openai</code> 的 ChatOpenAI 类调用，支持多轮对话历史，并内置重试机制适配 API 不稳定
    </div>

    <div class="input-section">
      <textarea
        v-model="input"
        placeholder="请输入你的问题..."
        rows="4"
        @keydown.ctrl.enter="send"
      ></textarea>
      <button @click="send" :disabled="loading">
        {{ loading ? '请求中...' : '发送 (Ctrl+Enter)' }}
      </button>
      <button @click="clear" class="btn-clear">清空对话</button>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <div class="chat-history" ref="chatHistory">
      <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
        <div class="role-label">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
        <div class="content">{{ msg.content }}</div>
      </div>
    </div>
  </div>
</template>

<script>
/* global MODELSCOPE_API_KEY */
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'

const MODELSCOPE_MODEL = 'deepseek-ai/DeepSeek-V4-Flash-0731'
// 魔搭 API 间歇性不稳定，返回空响应（choices: null），需要重试
const MAX_RETRIES = 5

export default {
  name: 'ModelScopeChat',

  data() {
    return {
      input: '',
      messages: [],
      loading: false,
      error: null,
      model: MODELSCOPE_MODEL
    }
  },

  watch: {
    messages: {
      deep: true,
      handler() { this.$nextTick(() => this.scrollToBottom()) }
    }
  },

  methods: {
    // 递增退避重试：2s / 4s / 8s / 16s
    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms))
    },

    async send() {
      const text = this.input.trim()
      if (!text || this.loading) return

      this.messages.push({ role: 'user', content: text })
      this.input = ''
      this.error = null
      this.loading = true

      this.messages.push({ role: 'assistant', content: '' })
      const aiMsgIndex = this.messages.length - 1

      try {
        // 将历史消息转换为 LangChain 消息类型
        const historyMessages = this.messages
          .slice(0, -1) // 不含刚添加的空 assistant 占位
          .map((msg) => {
            if (msg.role === 'user') return new HumanMessage(msg.content)
            if (msg.role === 'assistant') return new AIMessage(msg.content)
            return null
          })
          .filter(Boolean)

        const langChainMessages = [
          new SystemMessage('你是一个有用的AI助手，请用中文回答。'),
          ...historyMessages
        ]

        // ============================================================
        // LangChain.js 调用方式
        // ChatOpenAI 通过 configuration.baseURL 走 /modelscope 代理
        // API Key 由 vue.config.js 的 onProxyReq 自动注入 Authorization 头
        // LangSmith 追踪由 DefinePlugin 注入的 process.env.LANGSMITH_* 自动启用
        // ============================================================
        const llm = new ChatOpenAI({
          model: this.model,
          // ChatOpenAI 客户端会校验 apiKey 必须存在，否则报 Missing credentials，这里传入真实 key 仅用于通过客户端校验
          apiKey: typeof MODELSCOPE_API_KEY !== 'undefined' ? MODELSCOPE_API_KEY : undefined,
          temperature: 0.7,
          configuration: {
            // OpenAI SDK 内部用 new URL(baseURL + path) 构造请求地址，
            // 要求 baseURL 必须是绝对 URL，所以这里要获取当前页面的协议+域名+端口
            baseURL: window.location.origin + '/modelscope/v1/'
          }
        })

        // 适配 API 不稳定：空响应时递增退避重试
        let response = null
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            response = await llm.invoke(langChainMessages)
            // 校验响应是否有效（魔搭 API 不稳定时可能返回空 choices）
            if (response && response.content) {
              break
            }
            console.warn(`[ModelScope] 第 ${attempt} 次请求返回空响应`)
          } catch (err) {
            // 空响应异常（choices 为 null）走重试逻辑，其他错误直接抛出
            const errMsg = err && err.message ? String(err.message) : String(err || '')
            // 魔搭 API 不稳定时，OpenAI SDK 解析空响应会抛出
            // "Cannot read properties of undefined (reading 'message')" 等 TypeError，
            // 这类错误同样视为空响应，走重试逻辑
            if (/choices|null value|Cannot read properties of undefined/i.test(errMsg)) {
              console.warn(`[ModelScope] 第 ${attempt} 次请求返回空响应: ${errMsg}`)
            } else {
              throw err
            }
          }

          if (attempt < MAX_RETRIES) {
            const backoff = 2 ** attempt // 2s / 4s / 8s / 16s
            console.warn(`[ModelScope] ${backoff} 秒后重试...`)
            await this.sleep(backoff * 1000)
          }
        }

        if (!response || !response.content) {
          throw new Error('魔搭 API 多次返回空响应，请稍后重试')
        }

        this.messages[aiMsgIndex].content = response.content
      } catch (err) {
        console.error('[LangChain Error]', err)
        // err 可能为 undefined（Promise reject 未传值），需做兜底
        const errMsg = err && err.message ? err.message : String(err || '未知错误')
        this.error = `请求失败: ${errMsg}`
        if (!this.messages[aiMsgIndex].content) {
          this.messages.splice(aiMsgIndex, 1)
        }
      } finally {
        this.loading = false
      }
    },

    clear() {
      this.messages = []
      this.error = null
    },

    scrollToBottom() {
      const el = this.$refs.chatHistory
      if (el) {
        el.scrollTop = el.scrollHeight
      }
    },
  },
}
</script>

<style scoped>
.badge.modelscope {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: #fff;
}
</style>