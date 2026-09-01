<template>
  <div>
    <h1>AI Agent - useChat 方案</h1>
    <div class="code-stats usechat-stats">
      <span class="stat">⚡ ~30 行 JS 逻辑</span>
      <span class="stat">🎣 声明式 API (useChat)</span>
      <span class="stat">🔄 自动管理状态</span>
      <span class="stat">🛑 内置 stop/reload</span>
    </div>

    <div class="input-section">
      <textarea
        :value="useChatInput"
        @input="onUseChatInput"
        placeholder="请输入你的问题..."
        rows="4"
        @keydown.ctrl.enter="useChatHandleSubmit"
      ></textarea>
      <button @click="useChatHandleSubmit" :disabled="useChatLoading">
        {{ useChatLoading ? '请求中...' : '发送 (Ctrl+Enter)' }}
      </button>
      <button @click="useChatStop" :disabled="!useChatLoading" class="btn-stop">停止</button>
      <button @click="useChatReload" :disabled="useChatLoading || useChatMessages.length === 0" class="btn-reload">重新生成</button>
      <button @click="useChatClear" class="btn-clear">清空对话</button>
    </div>

    <div v-if="useChatError" class="error-msg">{{ useChatError }}</div>

    <div class="chat-history" ref="useChatHistory">
      <div
        v-for="(msg, index) in useChatMessages"
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
import { useAIChat } from '@/composables/useAIChat'

export default {
  name: 'UseChatDemo',

  data() {
    return {
      useChatMessages: [],
      useChatInput: '',
      useChatLoading: false,
      useChatError: null,
    }
  },

  created() {
    const chat = useAIChat()
    this._useChat = chat
    this._syncUseChat()
  },

  beforeDestroy() {
    if (this._syncTimer) {
      clearInterval(this._syncTimer)
    }
  },

  methods: {
    _syncUseChat() {
      const chat = this._useChat
      const sync = () => {
        this.useChatMessages = chat.messages
        this.useChatInput = chat.input
        this.useChatLoading = chat.isLoading
        this.useChatError = chat.error
      }
      sync()
      this._syncTimer = setInterval(sync, 100)
    },

    onUseChatInput(e) {
      this._useChat.handleInputChange(e)
    },
    useChatHandleSubmit(e) {
      this._useChat.handleSubmit(e)
    },
    useChatStop() {
      this._useChat.stop()
    },
    useChatReload() {
      this._useChat.reload()
    },
    useChatClear() {
      this._useChat.setMessages([])
    },
  },
}
</script>

<style scoped>
.code-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.stat {
  font-size: 12px;
  padding: 4px 12px;
  background: #ede9fe;
  color: #5b21b6;
  border-radius: 12px;
  border: 1px solid #c4b5fd;
}
</style>