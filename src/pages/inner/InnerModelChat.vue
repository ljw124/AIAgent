<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-08-27 12:55:30
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-01 09:33:26
 * @Description: src\pages\inner\InnerModelChat.vue
-->
<template>
  <div>
    <h1>内网大模型 <span class="badge inner">LangChain.js 调用</span></h1>
    <div class="info-box">
      <strong>调用方式：</strong>LangChain.js（ChatOpenAI）→ 内网大模型 API（OpenAI 兼容模式）<br />
      <strong>模型：</strong>{{ model }}<br />
      <strong>说明：</strong>使用 <code>@langchain/openai</code> 的 ChatOpenAI 类调用，支持多轮对话历史
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
/* global INNER_API_KEY */
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'

export default {
  name: 'InnerModelChat',

  data() {
    return {
      input: '',
      messages: [],
      loading: false,
      error: null,
      model: 'EB-DeepSeek-V4-Pro'
    }
  },

  watch: {
    messages: {
      deep: true,
      handler() { this.$nextTick(() => this.scrollToBottom()) }
    }
  },

  methods: {
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
        // ChatOpenAI 通过 configuration.baseURL 走 /inner 代理
        // API Key 由 vue.config.js 的 DefinePlugin 注入
        // LangSmith 追踪由 DefinePlugin 注入的 process.env.LANGSMITH_* 自动启用
        // ============================================================

        const llm = new ChatOpenAI({
          model: this.model,
          apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
          temperature: 0.7,
          configuration: {
            // 因为 OpenAI SDK 内部用 new URL(baseURL + path) 构造请求地址，要求 baseURL 必须是绝对 URL，所以这里要获取当前页面的协议+域名+端口
            baseURL: window.location.origin + '/inner/'
          }
        })
        const response = await llm.invoke(langChainMessages)
        this.messages[aiMsgIndex].content = response.content
      } catch (err) {
        console.error('[LangChain Error]', err)
        this.error = `请求失败: ${err.message}`
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
.badge.inner {
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  color: #fff;
}
</style>