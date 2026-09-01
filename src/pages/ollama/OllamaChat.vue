<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-08-28 10:50:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-08-28 11:01:12
 * @Description: 本地 Ollama 大模型调用 — 使用 LangChain.js ChatOpenAI
-->
<template>
  <div>
    <h1>本地 Ollama <span class="badge ollama">LangChain.js 调用</span></h1>
    <div class="info-box">
      <strong>调用方式：</strong>LangChain.js（ChatOpenAI）→ 本地 Ollama API（OpenAI 兼容模式）<br />
      <strong>模型：</strong>{{ model }}<br />
      <strong>说明：</strong>Ollama 默认运行在 <code>http://localhost:11434</code>，通过 <code>/ollama</code> 代理转发，无需 API Key
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
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'

export default {
  name: 'OllamaChat',

  data() {
    return {
      input: '',
      messages: [],
      loading: false,
      error: null,
      model: 'deepseek-r1:1.5b'
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
          .splice(0, -1) // 不含刚添加的空 assistant 占位
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
        // LangChain.js 调用 Ollama
        // Ollama 兼容 OpenAI API，无需 API Key
        // 通过 /ollama 代理转发到 localhost:11434
        // ============================================================
        const llm = new ChatOpenAI({
          model: this.model,
          apiKey: 'ollama', // Ollama 不需要真实 API Key，但 ChatOpenAI 要求非空
          temperature: 0.7,
          configuration: {
            baseURL: window.location.origin + '/ollama/v1/'
          }
        })
        const response = await llm.invoke(langChainMessages)
        this.messages[aiMsgIndex].content = response.content
      } catch (err) {
        console.error('[Ollama Error]', err)
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
.badge.ollama {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #fff;
}
</style>