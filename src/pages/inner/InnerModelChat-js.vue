<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-08-27 12:55:30
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-08-27 15:22:00
 * @Description: 
-->
<template>
  <div>
    <h1>内网大模型 <span class="badge inner">JS 直接调用</span></h1>
    <div class="info-box">
      <strong>调用方式：</strong>前端 fetch → 内网大模型 API（OpenAI 兼容模式）<br />
      <strong>模型：</strong>Qwen3-Coder-Flash<br />
      <strong>说明：</strong>通过内网代理访问，支持多轮对话历史
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
const INNER_PROXY = '/inner'

export default {
  name: 'InnerModelChat',

  data() {
    return {
      input: '',
      messages: [],
      loading: false,
      error: null,
    }
  },

  watch: {
    messages: {
      deep: true,
      handler() { this.$nextTick(() => this.scrollToBottom()) },
    },
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
        // 构建包含历史记录的 messages 数组
        const apiMessages = [
          { role: 'system', content: '你是一个有用的AI助手，请用中文回答。' },
          ...this.messages.slice(0, -1), // 包含所有历史消息（不含刚添加的空 assistant 占位）
        ]

        const response = await fetch(`${INNER_PROXY}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            // model: 'Qwen3-Coder-Flash',
            model: 'EB-DeepSeek-V4-Pro',
            messages: apiMessages,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(
            `HTTP ${response.status}: ${errorData.error?.message || errorData.message || response.statusText}`
          )
        }

        const data = await response.json()
        this.messages[aiMsgIndex].content = data.choices?.[0]?.message?.content || '（空响应）'
      } catch (err) {
        console.error('[内网 API Error]', err)
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