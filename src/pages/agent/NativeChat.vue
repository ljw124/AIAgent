<template>
  <div>
    <h1>AI Agent - 原生 fetch + 手动 SSE 解析</h1>
    <div class="code-stats">
      <span class="stat">📝 ~200 行 JS 逻辑</span>
      <span class="stat">🔧 手动管理 ReadableStream</span>
      <span class="stat">📊 手动解析 SSE data: 行</span>
      <span class="stat">🔄 手动管理 segments 状态</span>
    </div>

    <div class="input-section">
      <textarea
        v-model="userInput"
        placeholder="请输入你的问题..."
        rows="4"
        @keydown.ctrl.enter="sendMessage"
      ></textarea>
      <button @click="sendMessage" :disabled="loading">
        {{ loading ? '请求中...' : '发送 (Ctrl+Enter)' }}
      </button>
      <button @click="clearChat" class="btn-clear">清空对话</button>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <div class="chat-history" ref="chatHistory">
      <div
        v-for="(msg, index) in messages"
        :key="index"
        :class="['message', msg.role]"
      >
        <div class="role-label">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
        <div v-if="msg.role === 'user'" class="content">{{ msg.content }}</div>
        <div v-else class="segments">
          <div
            v-for="(seg, si) in msg.segments"
            :key="si"
            :class="['segment', 'segment-' + seg.type]"
          >
            <details v-if="seg.type === 'thinking'" class="thinking-block" :open="seg.collapsed !== true">
              <summary class="thinking-summary">
                <span class="thinking-icon">💭</span> 思考过程
                <span v-if="seg.done" class="done-badge">✓</span>
                <span v-else class="loading-dot">...</span>
              </summary>
              <pre class="thinking-content">{{ seg.content }}</pre>
            </details>
            <div v-else-if="seg.type === 'tool_use'" class="tool-use-block">
              <div class="tool-use-header">
                <span class="tool-icon">🔧</span>
                <span class="tool-name">{{ seg.toolName || '调用工具' }}</span>
                <span v-if="seg.done" class="done-badge">✓</span>
                <span v-else class="loading-dot">...</span>
              </div>
              <pre v-if="seg.toolInput" class="tool-input">{{ seg.toolInput }}</pre>
            </div>
            <div v-else-if="seg.type === 'tool_result'" class="tool-result-block">
              <div class="tool-result-header">
                <span class="tool-icon">📋</span> 工具结果
              </div>
              <div class="tool-result-content">{{ seg.content }}</div>
            </div>
            <div v-else-if="seg.type === 'text'" class="text-content">{{ seg.content }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
const API_CONFIG = {
  baseURL: '',
  endpoint: '/api/text2db/chatbi/chatbot/dataAnalysis',
  convId: '1787626439941',
  username: 'admin',
  extra: {
    relatedModelId: '1776826577318',
    agentType: 1
  }
}

export default {
  name: 'NativeChat',

  data() {
    return {
      userInput: '',
      messages: [],
      loading: false,
      error: null,
    }
  },

  methods: {
    _getOrCreateSegment(type) {
      const lastMsg = this.messages[this.messages.length - 1]
      if (!lastMsg || lastMsg.role !== 'assistant') return null
      const segments = lastMsg.segments
      const lastSeg = segments[segments.length - 1]
      if (lastSeg && lastSeg.type === type && !lastSeg.done) {
        return lastSeg
      }
      const newSeg = { type, content: '', done: false }
      segments.push(newSeg)
      return newSeg
    },

    async callModelAPI(userMessage) {
      const url = `${API_CONFIG.baseURL}${API_CONFIG.endpoint}`
      const body = {
        messages: userMessage,
        convId: API_CONFIG.convId,
        username: API_CONFIG.username,
        extra: API_CONFIG.extra
      }
      console.log('[API Request]', url, body)

      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith(':')) continue
          if (trimmed.startsWith('data:')) {
            const jsonStr = trimmed.substring(5).trim()
            if (jsonStr === '[DONE]') continue
            try {
              const chunk = JSON.parse(jsonStr)
              this._processSSEChunk(chunk)
              this.$nextTick(() => this.scrollToBottom())
            } catch (e) {
              console.warn('[SSE Parse Error]', e, 'line:', trimmed)
            }
          }
        }
      }

      const lastMsg = this.messages[this.messages.length - 1]
      if (lastMsg && lastMsg.role === 'assistant') {
        lastMsg.segments.forEach(seg => { seg.done = true })
      }
      console.log('[API Response] Done')
    },

    _processSSEChunk(chunk) {
      const msgType = chunk.messageType
      const isLast = chunk.last === true
      switch (msgType) {
        case 'thinking': {
          const seg = this._getOrCreateSegment('thinking')
          if (seg) { seg.content = chunk.thinking || ''; seg.done = isLast }
          break
        }
        case 'tool_use': {
          const seg = this._getOrCreateSegment('tool_use')
          if (seg && chunk.toolUseList && chunk.toolUseList.length > 0) {
            const tool = chunk.toolUseList[0]
            seg.toolName = tool.toolName || ''
            seg.toolInput = tool.toolInput || ''
            seg.done = isLast
          }
          break
        }
        case 'tool_result': {
          const seg = this._getOrCreateSegment('tool_result')
          if (seg && chunk.toolResult) {
            const outputs = chunk.toolResult.toolOutputList || []
            seg.content = outputs.map(o => o.text || '').join('\n')
            seg.done = isLast
          }
          break
        }
        case 'text': {
          const seg = this._getOrCreateSegment('text')
          if (seg) { seg.content = chunk.content || chunk.text || ''; seg.done = isLast }
          break
        }
        default:
          console.log('[SSE] Unknown messageType:', msgType, chunk)
      }
    },

    async sendMessage() {
      const input = this.userInput.trim()
      if (!input || this.loading) return
      this.messages.push({ role: 'user', content: input })
      this.userInput = ''
      this.error = null
      this.loading = true
      this.messages.push({ role: 'assistant', segments: [] })
      try {
        await this.callModelAPI(input)
      } catch (err) {
        console.error('[API Error]', err)
        this.error = `请求失败: ${err.message}`
        const lastMsg = this.messages[this.messages.length - 1]
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.segments.length === 0) {
          this.messages.pop()
        }
      } finally {
        this.loading = false
        this.$nextTick(() => this.scrollToBottom())
      }
    },

    clearChat() {
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
/* 代码统计标签 */
.code-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.stat {
  font-size: 12px;
  padding: 4px 12px;
  background: #fef3c7;
  color: #92400e;
  border-radius: 12px;
  border: 1px solid #fde68a;
}
</style>