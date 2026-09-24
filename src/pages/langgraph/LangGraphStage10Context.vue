<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-24 14:00:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-24 16:05:44
 * @Description: 阶段十：运行时上下文 Context — runtime.context 注入与使用演示
 *   学习目标：理解 LangGraph 的 runtime.context 机制，实现运行时上下文注入
 *   核心 API：contextSchema（定义上下文结构）、config.context（传入上下文）、runtime.context（节点中访问）
 *   前置条件：已完成阶段七（MemorySaver），理解 StateGraph 基础
-->
<template>
  <div>
    <h1>阶段十：运行时上下文 Context <span class="badge stage">LangGraph</span></h1>
    <div class="info-box">
      <strong>学习目标：</strong>理解 LangGraph 的 <code>runtime.context</code> 机制，实现运行时上下文注入<br />
      <strong>核心 API：</strong><code>contextSchema</code>（定义上下文结构）、<code>config.context</code>（传入上下文）、<code>runtime.context</code>（节点中访问）<br />
      <strong>前置条件：</strong>已完成阶段七（MemorySaver），理解 StateGraph 基础
    </div>

    <!-- 上下文配置 -->
    <div class="config-section">
      <div class="config-title">🎯 运行时上下文配置</div>
      <div class="config-row">
        <label>用户名：</label>
        <input v-model="contextUser" class="config-input" placeholder="如：张三" style="width: 150px;" />
        <label style="margin-left: 16px;">会员等级：</label>
        <select v-model="contextLevel" class="config-input" style="width: 130px;">
          <option value="normal">普通用户</option>
          <option value="VIP">VIP 会员</option>
          <option value="SVIP">SVIP 至尊会员</option>
        </select>
        <label style="margin-left: 16px;">语言偏好：</label>
        <select v-model="contextLang" class="config-input" style="width: 100px;">
          <option value="zh-CN">中文</option>
          <option value="en">English</option>
        </select>
      </div>
      <div class="config-row">
        <label>线程 ID：</label>
        <input v-model="currentThreadId" class="config-input thread-id-input" placeholder="如：context-demo-001" />
        <button @click="switchThread" class="btn-switch" :disabled="loading">🔄 切换线程</button>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-section">
      <textarea
        v-model="input"
        placeholder="试试：你好，介绍一下你自己 || 我有什么特权？ || 用英文回复我"
        rows="3"
        @keydown.ctrl.enter="send"
      ></textarea>
      <div class="btn-row">
        <button @click="send" :disabled="loading || !input.trim()">
          {{ loading ? '请求中...' : '发送 (Ctrl+Enter)' }}
        </button>
        <button @click="clearAll" class="btn-clear">清空全部</button>
      </div>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- 上下文状态提示 -->
    <div v-if="messages.length > 0" class="context-status">
      <span>🎯 当前上下文：</span>
      <span class="context-item">👤 {{ contextUser || '(未设置)' }}</span>
      <span class="context-item">⭐ {{ contextLevel === 'VIP' ? 'VIP 会员' : contextLevel === 'SVIP' ? 'SVIP 至尊会员' : '普通用户' }}</span>
      <span class="context-item">🌐 {{ contextLang === 'en' ? 'English' : '中文' }}</span>
      <span class="context-thread">线程：{{ currentThreadId }}</span>
    </div>

    <!-- 上下文注入说明 -->
    <div class="info-panel">
      <div class="info-title">💡 runtime.context 工作原理</div>
      <div class="info-flow">
        <div class="flow-step">
          <div class="flow-num">1</div>
          <div class="flow-text">
            <strong>定义上下文结构</strong>
            <code>contextSchema: Annotation.Root({ username, level, lang })</code>
          </div>
        </div>
        <div class="flow-arrow">→</div>
        <div class="flow-step">
          <div class="flow-num">2</div>
          <div class="flow-text">
            <strong>调用时传入上下文</strong>
            <code>config.context = {{ '{' }} username, level, lang {{ '}' }}</code>
          </div>
        </div>
        <div class="flow-arrow">→</div>
        <div class="flow-step">
          <div class="flow-num">3</div>
          <div class="flow-text">
            <strong>节点中访问上下文</strong>
            <code>runtime.context.username</code>
          </div>
        </div>
      </div>
    </div>

    <!-- 对话历史 -->
    <div class="chat-history" ref="chatHistory">
      <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
        <div class="role-label">{{ msg.role === 'user' ? '你' : 'AI助手' }}</div>
        <div class="content">
          {{ msg.content }}
          <span v-if="msg.role === 'assistant' && index === messages.length - 1 && loading" class="cursor-blink">▌</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
/* global INNER_API_KEY */
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import { StateGraph, Annotation, START, END } from '@langchain/langgraph'
import { MemorySaver } from '@langchain/langgraph'

export default {
  name: 'LangGraphStage10Context',

  data() {
    return {
      input: '',
      messages: [],
      loading: false,
      error: null,
      // 上下文配置
      contextUser: '张三',
      contextLevel: 'VIP',
      contextLang: 'zh-CN',
      // 线程管理
      currentThreadId: 'context-demo-001',
      threadMessages: {},
      threadIds: ['context-demo-001'],
      // MemorySaver 实例
      memorySaver: null,
      // 编译后的图缓存
      compiledGraph: null
    }
  },

  watch: {
    messages: {
      deep: true,
      handler() {
        this.$nextTick(() => this.scrollToBottom())
      }
    }
  },

  created() {
    this.memorySaver = new MemorySaver()
    this.threadMessages[this.currentThreadId] = []
  },

  methods: {
    // ============================================================
    // 构建带 contextSchema 的 StateGraph
    // ============================================================
    buildGraph() {
      if (this.compiledGraph) return this.compiledGraph

      // 定义上下文结构（contextSchema）
      const ContextSchema = Annotation.Root({
        username: Annotation(),
        level: Annotation(),
        lang: Annotation()
      })

      // 定义图状态
      const GraphState = Annotation.Root({
        messages: Annotation({
          reducer: (prev, next) => prev.concat(next),
          default: () => []
        })
      })

      const llm = new ChatOpenAI({
        model: 'EB-DeepSeek-V4-Pro',
        apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
        temperature: 0,
        configuration: {
          baseURL: window.location.origin + '/inner/'
        }
      })

      // 节点：通过 runtime.context 访问上下文
      const chatNode = async (state, runtime) => {
        const ctx = runtime.context || {}
        const username = ctx.username || '用户'
        const level = ctx.level || 'normal'
        const lang = ctx.lang || 'zh-CN'

        // 根据上下文构建系统提示
        let systemPrompt = ''
        if (lang === 'en') {
          systemPrompt = `You are a helpful AI assistant. The current user is ${username}, membership level: ${level}. Please respond in English.`
          if (level === 'VIP') {
            systemPrompt += ' Treat this user as a VIP member with priority service.'
          } else if (level === 'SVIP') {
            systemPrompt += ' Treat this user as a Super VIP member with the highest priority service. Use honorifics.'
          }
        } else {
          systemPrompt = `你是一个有用的AI助手。当前用户是${username}，会员等级：${level === 'VIP' ? 'VIP会员' : level === 'SVIP' ? 'SVIP至尊会员' : '普通用户'}。请用中文回复。`
          if (level === 'VIP') {
            systemPrompt += ' 请以VIP会员的规格提供服务，语气热情周到。'
          } else if (level === 'SVIP') {
            systemPrompt += ' 请以最高规格的SVIP至尊会员服务标准回复，使用尊称，语气极其恭敬。'
          }
        }

        const messages = state.messages || []
        const systemMsg = new SystemMessage(systemPrompt)
        const response = await llm.invoke([systemMsg, ...messages])

        return { messages: [response] }
      }

      // 构建图（传入 contextSchema）
      const graph = new StateGraph(GraphState, ContextSchema)
        .addNode('chat', chatNode)
        .addEdge(START, 'chat')
        .addEdge('chat', END)

      this.compiledGraph = graph.compile({ checkpointer: this.memorySaver })
      return this.compiledGraph
    },

    // ============================================================
    // 发送消息
    // ============================================================
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
        const graph = this.buildGraph()

        const historyMessages = this.messages
          .slice(0, -1)
          .map((msg) => {
            if (msg.role === 'user') return new HumanMessage(msg.content)
            if (msg.role === 'assistant') return new AIMessage(msg.content)
            return null
          })
          .filter(Boolean)

        // 核心：通过 config.context 传入运行时上下文
        const config = {
          configurable: {
            thread_id: this.currentThreadId
          },
          context: {
            username: this.contextUser,
            level: this.contextLevel,
            lang: this.contextLang
          }
        }

        const stream = await graph.stream(
          { messages: historyMessages },
          { ...config, streamMode: 'values' }
        )

        for await (const state of stream) {
          const msgs = state.messages || []
          const lastMsg = msgs[msgs.length - 1]
          if (lastMsg && lastMsg._getType && lastMsg._getType() === 'ai') {
            const content = typeof lastMsg.content === 'string' ? lastMsg.content : ''
            if (content) {
              this.messages[aiMsgIndex].content = content
            }
          }
        }

        this.saveThreadMessages()
      } catch (err) {
        console.error('[Stage10 Error]', err)
        this.error = `请求失败: ${err.message}`
        if (!this.messages[aiMsgIndex].content) {
          this.messages.splice(aiMsgIndex, 1)
        }
      } finally {
        this.loading = false
      }
    },

    // ============================================================
    // 线程管理
    // ============================================================
    saveThreadMessages() {
      this.threadMessages[this.currentThreadId] = [...this.messages]
    },

    switchThread() {
      this.saveThreadMessages()
      const newId = `context-demo-${Date.now()}`
      this.currentThreadId = newId
      this.threadMessages[newId] = []
      if (!this.threadIds.includes(newId)) {
        this.threadIds.push(newId)
      }
      this.messages = []
      this.error = null
    },

    selectThread(threadId) {
      if (threadId === this.currentThreadId || this.loading) return
      this.saveThreadMessages()
      this.currentThreadId = threadId
      this.messages = this.threadMessages[threadId] || []
      this.error = null
    },

    async deleteCurrentThread() {
      if (this.loading) return
      const tid = this.currentThreadId
      if (this.memorySaver) {
        try {
          await this.memorySaver.deleteThread(tid)
        } catch (err) {
          console.error('[MemorySaver] 删除线程失败:', err)
        }
      }
      delete this.threadMessages[tid]
      this.threadIds = this.threadIds.filter((id) => id !== tid)
      if (this.threadIds.length > 0) {
        this.selectThread(this.threadIds[0])
      } else {
        const newId = `context-demo-${Date.now()}`
        this.currentThreadId = newId
        this.threadMessages[newId] = []
        this.threadIds.push(newId)
        this.messages = []
      }
    },

    getThreadMessageCount(threadId) {
      const msgs = this.threadMessages[threadId] || []
      return msgs.length
    },

    clearAll() {
      this.messages = []
      this.error = null
      this.threadMessages[this.currentThreadId] = []
      if (this.memorySaver) {
        this.memorySaver.deleteThread(this.currentThreadId).catch((err) => {
          console.error('[MemorySaver] 清空线程失败:', err)
        })
      }
    },

    scrollToBottom() {
      const el = this.$refs.chatHistory
      if (el) el.scrollTop = el.scrollHeight
    }
  }
}
</script>

<style scoped>
.badge.stage {
  background: linear-gradient(135deg, #0891b2 0%, #0e7490 100%);
  color: #fff;
}

.config-section {
  background: #ecfeff;
  border: 1px solid #a5f3fc;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
}

.config-title {
  font-weight: 700;
  font-size: 14px;
  color: #0e7490;
  margin-bottom: 10px;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.config-row:last-child {
  margin-bottom: 0;
}

.config-row > label:first-child {
  font-weight: 600;
  font-size: 14px;
  color: #0e7490;
  min-width: 70px;
}

.config-input {
  padding: 6px 10px;
  border: 1px solid #a5f3fc;
  border-radius: 6px;
  font-size: 13px;
}

.thread-id-input {
  flex: 1;
  max-width: 260px;
  font-family: monospace;
}

.btn-switch {
  padding: 6px 14px;
  background: #0891b2;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.btn-switch:hover {
  background: #0e7490;
}

.btn-switch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-delete {
  padding: 6px 14px;
  background: #ef4444;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.btn-delete:hover {
  background: #dc2626;
}

.btn-delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.thread-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.thread-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #cffafe;
  border: 1px solid #67e8f9;
  border-radius: 20px;
  font-size: 12px;
  font-family: monospace;
  color: #0e7490;
  cursor: pointer;
  transition: all 0.2s;
}

.thread-tag:hover {
  background: #a5f3fc;
  border-color: #06b6d4;
}

.thread-tag.active {
  background: #0891b2;
  color: #fff;
  border-color: #0e7490;
}

.thread-tag-msg-count {
  font-size: 11px;
  opacity: 0.8;
}

.thread-empty {
  font-size: 13px;
  color: #9ca3af;
  font-style: italic;
}

.context-status {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #ecfeff;
  border: 1px solid #a5f3fc;
  border-radius: 8px;
  padding: 8px 16px;
  margin-bottom: 16px;
  font-size: 13px;
  color: #0e7490;
  font-weight: 600;
  flex-wrap: wrap;
}

.context-item {
  background: #cffafe;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.context-thread {
  font-family: monospace;
  font-size: 12px;
  color: #0891b2;
  margin-left: auto;
}

/* 工作原理面板 */
.info-panel {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.info-title {
  font-weight: 700;
  font-size: 14px;
  color: #166534;
  margin-bottom: 10px;
}

.info-flow {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.flow-step {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #dcfce7;
  border: 1px solid #86efac;
  border-radius: 8px;
  padding: 8px 12px;
  flex: 1;
  min-width: 200px;
}

.flow-num {
  width: 24px;
  height: 24px;
  background: #16a34a;
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.flow-text {
  font-size: 12px;
  color: #166534;
  line-height: 1.5;
}

.flow-text strong {
  display: block;
  margin-bottom: 2px;
}

.flow-text code {
  background: #bbf7d0;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
  word-break: break-all;
}

.flow-arrow {
  font-size: 20px;
  color: #16a34a;
  font-weight: 700;
  flex-shrink: 0;
}

/* 输入区域 */
.input-section {
  margin-bottom: 16px;
}

.input-section textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  resize: vertical;
  font-family: inherit;
  box-sizing: border-box;
  margin-bottom: 10px;
}

.input-section .btn-row {
  display: flex;
  gap: 10px;
}

.input-section button {
  padding: 10px 20px;
  background: #0891b2;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}

.input-section button:hover {
  background: #0e7490;
}

.input-section button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-clear {
  background: #e5e7eb !important;
  color: #374151 !important;
}

.btn-clear:hover {
  background: #d1d5db !important;
}

.error-msg {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 10px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
}

/* 对话历史 */
.chat-history {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  background: #f9fafb;
}

.message {
  margin-bottom: 12px;
  padding: 10px 14px;
  border-radius: 8px;
}

.message.user {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}

.message.assistant {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
}

.role-label {
  font-weight: 700;
  font-size: 12px;
  margin-bottom: 4px;
  color: #6b7280;
}

.content {
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.cursor-blink {
  animation: blink 1s step-end infinite;
  color: #0891b2;
  font-weight: 700;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
</style>
