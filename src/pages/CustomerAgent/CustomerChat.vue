<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-14 10:00:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-22 19:13:42
 * @Description: 智能客服 Agent — LangChain 10 阶段综合实战
 *   融合全部 10 阶段知识：
 *     Stage1:  Prompt 模板（多租户 System Prompt）
 *     Stage2:  LCEL 链（RAG 检索链）
 *     Stage3:  流式输出（SSE streaming）
 *     Stage4:  结构化输出（responseFormat + zod）
 *     Stage5:  工具调用（calculator / weather / knowledge_search）
 *     Stage6:  ReAct Agent（createReactAgent）
 *     Stage7:  RAG 知识库（文档→分片→向量→检索）
 *     Stage8:  中间件（日志 + Token 统计）
 *     Stage9:  短期记忆（MemorySaver，thread_id 隔离）
 *     Stage10: 长期记忆（InMemoryStore，namespace 隔离）
 *   架构：纯前端 Vue 2，与现有 Stage1-Stage10 完全一致
-->
<template>
  <div class="customer-agent-container">
    <h1>🤖 智能客服 Agent <span class="badge stage">综合实战</span></h1>
    <div class="info-box">
      <strong>学习目标：</strong>用智能客服场景串联 LangChain 全部 10 个阶段知识点<br />
      <strong>核心 API：</strong><code>createReactAgent()</code> + <code>MemorySaver</code> + <code>InMemoryStore</code> + <code>MemoryVectorStore</code><br />
    </div>

    <!-- ============================================================ -->
    <!-- 租户与线程选择 -->
    <!-- ============================================================ -->
    <div class="top-bar">
      <div class="top-bar-left">
        <label class="top-label">🏢 租户：</label>
        <select v-model="currentTenantId" @change="onTenantChange" class="top-select">
          <option v-for="t in tenants" :key="t.id" :value="t.id">
            {{ t.icon }} {{ t.name }}
          </option>
        </select>
        <span class="top-desc">{{ currentTenant.description }}</span>
      </div>
      <div class="top-bar-right">
        <label class="top-label">💬 线程：</label>
        <select v-model="currentThreadId" @change="onThreadChange" class="top-select thread-select">
          <option v-for="tid in threadIds" :key="tid" :value="tid">
            {{ tid }} ({{ getThreadRounds(tid) }} 轮)
          </option>
        </select>
        <button @click="newThread" class="btn-sm">🔄 新建</button>
        <button
          v-if="threadIds.length > 1"
          @click="deleteCurrentThread"
          class="btn-sm btn-danger-sm"
        >🗑️</button>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- 功能开关 -->
    <!-- ============================================================ -->
    <div class="config-section">
      <div class="config-row">
        <label>功能开关：</label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="features.enableStream" />
          <span>流式</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="features.enableStructured" @change="onStructuredToggle" />
          <span>结构化</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="features.enableMemory" />
          <span>短期记忆</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="features.enableStore" />
          <span>长期记忆</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="features.showThinking" />
          <span>思考过程</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="features.showRetrieved" />
          <span>检索结果</span>
        </label>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- 知识库管理（Stage7） -->
    <!-- ============================================================ -->
    <div class="knowledge-section">
      <div class="knowledge-header">
        <span class="knowledge-title">📚 知识库（RAG）</span>
        <span v-if="knowledgeReady" class="knowledge-status ready">✅ 已就绪 ({{ docCount }} 个文档片段)</span>
        <span v-else class="knowledge-status not-ready">⚠️ 未初始化</span>
      </div>
      <div class="knowledge-actions">
        <button @click="initKnowledge" :disabled="knowledgeLoading" class="btn-kb">
          {{ knowledgeLoading ? '⏳ 初始化中...' : '🚀 初始化内置知识库' }}
        </button>
        <label class="btn-kb btn-upload">
          📎 上传文件(.txt/.md)
          <input type="file" accept=".txt,.md" @change="onFileUpload" style="display:none" />
        </label>
      </div>
      <div v-if="knowledgePreview.length > 0" class="knowledge-preview">
        <span class="preview-label">内置文档：</span>
        <span v-for="(title, i) in knowledgePreview" :key="i" class="preview-tag">{{ title }}</span>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- 错误提示 -->
    <!-- ============================================================ -->
    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- ============================================================ -->
    <!-- 对话区域 -->
    <!-- ============================================================ -->
    <div class="chat-history" ref="chatHistory">
      <div v-if="messages.length === 0" class="empty-chat">
        <div class="empty-icon">💬</div>
        <div class="empty-text">开始对话吧！试试问：</div>
        <div class="empty-hints">
          <span @click="quickAsk('LangChain 的 RAG 流程是怎样的？')">"LangChain 的 RAG 流程是怎样的？"</span>
          <span @click="quickAsk('什么是 ReAct Agent 模式？')">"什么是 ReAct Agent 模式？"</span>
          <span @click="quickAsk('MemorySaver 和 InMemoryStore 有什么区别？')">"MemorySaver 和 InMemoryStore 有什么区别？"</span>
          <span @click="quickAsk('计算 (123 + 456) * 789 / 10')">"计算 (123 + 456) * 789 / 10"</span>
          <span @click="quickAsk('北京今天天气怎么样？')">"北京今天天气怎么样？"</span>
        </div>
      </div>

      <div v-for="(msg, index) in messages" :key="index" :class="['message-wrapper', msg.role]">
        <!-- 用户消息 -->
        <template v-if="msg.role === 'user'">
          <div class="message user-msg">
            <div class="msg-avatar">👤</div>
            <div class="msg-bubble user-bubble">{{ msg.content }}</div>
          </div>
        </template>

        <!-- AI 消息（含多段 segments） -->
        <template v-if="msg.role === 'assistant'">
          <div class="message ai-msg">
            <div class="msg-avatar">🤖</div>
            <div class="msg-content">
              <!-- 遍历 segments -->
              <div v-for="(seg, si) in msg.segments" :key="si">
                <!-- Stage6: 思考过程 -->
                <div v-if="seg.type === 'thinking'" class="segment thinking-seg">
                  <div class="seg-header" @click="toggleSegment(msg, si)">
                    <span class="seg-icon">🧠</span>
                    <span class="seg-label">思考过程</span>
                    <span class="seg-toggle">{{ seg.collapsed ? '▶' : '▼' }}</span>
                  </div>
                  <div v-if="!seg.collapsed" class="seg-body">{{ seg.content }}</div>
                </div>

                <!-- Stage5: 工具调用 -->
                <div v-if="seg.type === 'tool_use'" class="segment tool-use-seg">
                  <div class="seg-header" @click="toggleSegment(msg, si)">
                    <span class="seg-icon">🔧</span>
                    <span class="seg-label">调用工具：{{ seg.toolName }}</span>
                    <span class="seg-toggle">{{ seg.collapsed ? '▶' : '▼' }}</span>
                  </div>
                  <div v-if="!seg.collapsed" class="seg-body">
                    <pre class="seg-json">{{ JSON.stringify(seg.toolInput, null, 2) }}</pre>
                  </div>
                </div>

                <!-- Stage5: 工具返回 -->
                <div v-if="seg.type === 'tool_result'" class="segment tool-result-seg">
                  <div class="seg-header" @click="toggleSegment(msg, si)">
                    <span class="seg-icon">✅</span>
                    <span class="seg-label">工具返回：{{ seg.toolName }}</span>
                    <span class="seg-toggle">{{ seg.collapsed ? '▶' : '▼' }}</span>
                  </div>
                  <div v-if="!seg.collapsed" class="seg-body">{{ seg.toolOutput }}</div>
                </div>

                <!-- Stage7: 检索结果 -->
                <div v-if="seg.type === 'retrieved'" class="segment retrieved-seg">
                  <div class="seg-header" @click="toggleSegment(msg, si)">
                    <span class="seg-icon">📎</span>
                    <span class="seg-label">检索到 {{ seg.sources.length }} 个相关文档</span>
                    <span class="seg-toggle">{{ seg.collapsed ? '▶' : '▼' }}</span>
                  </div>
                  <div v-if="!seg.collapsed" class="seg-body">
                    <div v-for="(src, sri) in seg.sources" :key="sri" class="retrieved-item">
                      <div class="retrieved-source">📄 {{ src.source }} (相似度: {{ src.score }})</div>
                      <div class="retrieved-content">{{ src.content }}</div>
                    </div>
                  </div>
                </div>

                <!-- Stage4: 结构化输出 -->
                <div v-if="seg.type === 'structured'" class="segment structured-seg">
                  <div class="seg-header" @click="toggleSegment(msg, si)">
                    <span class="seg-icon">📋</span>
                    <span class="seg-label">结构化输出（Stage4）</span>
                    <span class="seg-toggle">{{ seg.collapsed ? '▶' : '▼' }}</span>
                  </div>
                  <div v-if="!seg.collapsed" class="seg-body">
                    <pre class="seg-json">{{ JSON.stringify(seg.data, null, 2) }}</pre>
                  </div>
                </div>

                <!-- Stage3: 文本回复（Markdown 渲染） -->
                <div v-if="seg.type === 'text'" class="segment text-seg">
                  <div class="msg-bubble ai-bubble markdown-body" v-html="renderMarkdown(seg.content)"></div>
                </div>

                <!-- 错误 -->
                <div v-if="seg.type === 'error'" class="segment error-seg">
                  <span class="seg-icon">❌</span>
                  <span>{{ seg.message }}</span>
                </div>
              </div>

              <!-- 加载光标 -->
              <span
                v-if="index === messages.length - 1 && loading"
                class="cursor-blink"
              >▌</span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- ============================================================ -->
    <!-- 状态栏 -->
    <!-- ============================================================ -->
    <div class="status-bar">
      <span>🧠 短期记忆: {{ stats.rounds }} 轮</span>
      <span>🗄️ 长期记忆: {{ features.enableStore ? '已启用' : '已禁用' }}</span>
      <span>🔢 Token: {{ stats.tokens.total || 0 }}</span>
      <span>📚 知识库: {{ knowledgeReady ? docCount + ' 片段' : '未初始化' }}</span>
    </div>

    <!-- ============================================================ -->
    <!-- 输入区 -->
    <!-- ============================================================ -->
    <div class="input-section">
      <textarea
        v-model="input"
        placeholder="💬 输入您的问题... (Ctrl+Enter 发送)"
        rows="3"
        @keydown.ctrl.enter="send"
        :disabled="loading"
      ></textarea>
      <div class="input-actions">
        <button @click="send" :disabled="loading || !input.trim()" class="btn-send">
          {{ loading ? '⏳ 思考中...' : '📤 发送 (Ctrl+Enter)' }}
        </button>
        <button @click="clearChat" class="btn-clear">🗑️ 清空对话</button>
      </div>
    </div>
  </div>
</template>

<script>
import { marked } from 'marked'
import { BUILTIN_TENANTS, getTenantById, getTenantDefaultFeatures } from './modules/tenants'
import { useCustomerAgent } from '@/composables/useCustomerAgent'

// 配置 marked
marked.setOptions({
  breaks: true, // 换行符转为 <br>
  gfm: true,    // 启用 GitHub Flavored Markdown
})

export default {
  name: 'CustomerChat',

  data() {
    return {
      // === 输入 ===
      input: '',

      // === 对话消息 ===
      // 格式: [{ role: 'user'|'assistant', content: '...', segments: [...] }]
      messages: [],

      // === 加载状态 ===
      loading: false,
      error: null,

      // === 租户 ===
      tenants: BUILTIN_TENANTS,
      currentTenantId: 'tech-doc',

      // === 线程 ===
      currentThreadId: 'thread-001',
      threadIds: ['thread-001'],

      // === 功能开关 ===
      features: getTenantDefaultFeatures('tech-doc'),

      // === 知识库 ===
      knowledgeReady: false,
      knowledgeLoading: false,
      docCount: 0,
      knowledgePreview: [],

      // === 统计 ===
      stats: {
        rounds: 0,
        tokens: { promptTokens: 0, completionTokens: 0, total: 0 },
      },

      // === Agent 服务实例 ===
      agentService: null
    }
  },

  computed: {
    currentTenant() {
      return getTenantById(this.currentTenantId)
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

  async created() {
    // 初始化 Agent 服务
    const { create } = useCustomerAgent()
    this.agentService = create(this)

    // 同步功能开关到服务
    this.syncFeatures()

    // 自动初始化 LLM + 知识库
    try {
      const result = await this.agentService.fullInit()
      this.knowledgeReady = result.ragReady
      this.docCount = this.agentService.getKnowledgeStats().docCount
      this.knowledgePreview = this.agentService.getKnowledgePreview()
    } catch (err) {
      console.error('[CustomerChat] 初始化失败:', err)
      this.error = `初始化失败: ${err.message}`
    }
  },

  beforeDestroy() {
    if (this.agentService) {
      this.agentService.destroy()
    }
  },

  methods: {
    // ============================================================
    // Markdown 渲染
    // ============================================================
    renderMarkdown(content) {
      if (!content) return ''
      try {
        return marked.parse(content)
      } catch {
        return content
      }
    },

    // ============================================================
    // 同步功能开关
    // ============================================================
    syncFeatures() {
      if (!this.agentService) return
      this.agentService.features = { ...this.features }
    },

    // ============================================================
    // 发送消息
    // ============================================================
    async send() {
      const text = this.input.trim()
      if (!text || this.loading) return

      // 添加用户消息
      this.messages.push({ role: 'user', content: text })
      this.input = ''
      this.error = null

      // 创建 AI 消息占位（含空 segments 数组）
      const aiMsg = { role: 'assistant', content: '', segments: [] }
      this.messages.push(aiMsg)
      const aiMsgIndex = this.messages.length - 1

      this.loading = true

      // 同步功能开关
      this.syncFeatures()

      // 构建历史消息（不含当前 AI 占位）
      const historyMessages = this.messages.slice(0, -1)

      try {
        await this.agentService.sendMessage(
          text,
          historyMessages,
          (segment) => {
            this.handleSegment(aiMsgIndex, segment)
          }
        )
      } catch (err) {
        console.error('[CustomerChat] 发送失败:', err)
        this.error = `请求失败: ${err.message}`
      } finally {
        this.loading = false
        this.updateStats()
      }
    },

    /**
     * 处理流式消息段
     */
    handleSegment(aiMsgIndex, segment) {
      const msg = this.messages[aiMsgIndex]
      if (!msg) return

      switch (segment.type) {
        case 'thinking':
          // Stage6: 思考过程 — 追加新 segment
          msg.segments.push({
            type: 'thinking',
            content: segment.content,
            collapsed: false,
          })
          break

        case 'tool_use':
          // Stage5: 工具调用
          msg.segments.push({
            type: 'tool_use',
            toolName: segment.toolName,
            toolInput: segment.toolInput,
            collapsed: true,
          })
          break

        case 'tool_result':
          // Stage5: 工具返回
          msg.segments.push({
            type: 'tool_result',
            toolName: segment.toolName,
            toolOutput: segment.toolOutput,
            collapsed: true
          })
          break

        case 'retrieved':
          // Stage7: 检索结果
          msg.segments.push({
            type: 'retrieved',
            sources: segment.sources,
            collapsed: false
          })
          break

        case 'text':
          // Stage3: 文本回复 — 更新最后一个 text segment 或创建新的
          {
            const lastSeg = msg.segments[msg.segments.length - 1]
            if (lastSeg && lastSeg.type === 'text') {
              // 流式更新：替换最后一个 text segment 的内容
              lastSeg.content = segment.content
            } else {
              msg.segments.push({
                type: 'text',
                content: segment.content
              })
            }
            // 同步 content 字段（兼容简单展示）
            msg.content = segment.content
          }
          break

        case 'structured':
          // Stage4: 结构化输出
          msg.segments.push({
            type: 'structured',
            data: segment.data,
            collapsed: false
          })
          break

        case 'error':
          msg.segments.push({
            type: 'error',
            message: segment.message
          })
          this.error = segment.message
          break

        case 'done':
          // 流式完成
          break

        default:
          break
      }

      // 强制触发响应式更新
      this.$forceUpdate()
    },

    // ============================================================
    // Segment 折叠/展开
    // ============================================================
    toggleSegment(msg, segIndex) {
      if (msg.segments[segIndex]) {
        msg.segments[segIndex].collapsed = !msg.segments[segIndex].collapsed
        this.$forceUpdate()
      }
    },

    // ============================================================
    // 租户切换
    // ============================================================
    onTenantChange() {
      this.features = getTenantDefaultFeatures(this.currentTenantId)
      this.agentService.switchTenant(this.currentTenantId)
      this.syncFeatures()
    },

    // ============================================================
    // 线程管理
    // ============================================================
    onThreadChange() {
      this.agentService.switchThread(this.currentThreadId)
      // 切换线程时清空消息展示（短期记忆仍在 MemorySaver 中）
      this.messages = []
      this.updateStats()
    },

    newThread() {
      const newId = this.agentService.newThread()
      this.threadIds = this.agentService.getThreadIds()
      this.currentThreadId = newId
      this.messages = []
      this.updateStats()
    },

    async deleteCurrentThread() {
      if (this.threadIds.length <= 1) return
      await this.agentService.deleteThread(this.currentThreadId)
      this.threadIds = this.agentService.getThreadIds()
      this.currentThreadId = this.threadIds[0]
      this.messages = []
      this.updateStats()
    },

    getThreadRounds(threadId) {
      return this.agentService?.memoryManager?.getRounds(threadId) || 0
    },

    // ============================================================
    // 知识库操作
    // ============================================================
    async initKnowledge() {
      this.knowledgeLoading = true
      try {
        const result = await this.agentService.initKnowledgeBase()
        this.knowledgeReady = result.ready
        this.docCount = result.docCount
        this.knowledgePreview = this.agentService.getKnowledgePreview()
      } catch (err) {
        this.error = `知识库初始化失败: ${err.message}`
      } finally {
        this.knowledgeLoading = false
      }
    },

    async onFileUpload(event) {
      const file = event.target.files[0]
      if (!file) return

      try {
        const content = await this.readFileAsText(file)
        const chunkCount = await this.agentService.uploadFile(file.name, content)
        this.docCount = this.agentService.getKnowledgeStats().docCount
        this.$forceUpdate()
        // eslint-disable-next-line no-alert
        alert(`文件 "${file.name}" 上传成功，新增 ${chunkCount} 个文档片段`)
      } catch (err) {
        this.error = `文件上传失败: ${err.message}`
      } finally {
        // 重置 file input
        event.target.value = ''
      }
    },

    readFileAsText(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => resolve(e.target.result)
        reader.onerror = () => reject(new Error('文件读取失败'))
        reader.readAsText(file)
      })
    },

    // ============================================================
    // 快捷提问
    // ============================================================
    quickAsk(question) {
      this.input = question
      this.send()
    },

    // ============================================================
    // 结构化输出开关
    // ============================================================
    onStructuredToggle() {
      this.agentService.toggleFeature('enableStructured', this.features.enableStructured)
    },

    // ============================================================
    // 统计更新
    // ============================================================
    updateStats() {
      if (!this.agentService) return
      const s = this.agentService.getStats()
      this.stats.rounds = s.rounds
      this.stats.tokens = { ...s.tokens }
    },

    // ============================================================
    // 清空对话
    // ============================================================
    clearChat() {
      this.messages = []
      this.error = null
      this.agentService?.resetTokenStats()
      this.updateStats()
    },

    // ============================================================
    // 滚动到底部
    // ============================================================
    scrollToBottom() {
      const el = this.$refs.chatHistory
      if (el) {
        el.scrollTop = el.scrollHeight
      }
    }
  }
}
</script>

<style scoped>
/* ============================================================ */
/* 基础样式 */
/* ============================================================ */
.customer-agent-container {
  max-width: 960px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

h1 {
  font-size: 24px;
  margin-bottom: 12px;
  color: #1e293b;
}

.badge.stage {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  color: #fff;
  vertical-align: middle;
  margin-left: 8px;
}

.info-box {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  font-size: 13px;
  line-height: 1.8;
  color: #334155;
}

.info-box code {
  background: #e0f2fe;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: #0369a1;
}

/* ============================================================ */
/* 顶部栏：租户 + 线程 */
/* ============================================================ */
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 16px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.top-bar-left,
.top-bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.top-label {
  font-weight: 600;
  font-size: 13px;
  color: #475569;
  white-space: nowrap;
}

.top-select {
  padding: 4px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
  cursor: pointer;
}

.thread-select {
  max-width: 200px;
}

.top-desc {
  font-size: 12px;
  color: #94a3b8;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-sm {
  padding: 4px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.btn-sm:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}

.btn-danger-sm {
  color: #ef4444;
  border-color: #fecaca;
}

.btn-danger-sm:hover {
  background: #fef2f2;
  border-color: #ef4444;
}

/* ============================================================ */
/* 功能开关 */
/* ============================================================ */
.config-section {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  padding: 10px 16px;
  margin-bottom: 12px;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.config-row > label:first-child {
  font-weight: 600;
  font-size: 13px;
  color: #0369a1;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #334155;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  accent-color: #3b82f6;
}

/* ============================================================ */
/* 知识库 */
/* ============================================================ */
.knowledge-section {
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
}

.knowledge-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.knowledge-title {
  font-weight: 700;
  font-size: 14px;
  color: #5b21b6;
}

.knowledge-status {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
}

.knowledge-status.ready {
  background: #dcfce7;
  color: #166534;
}

.knowledge-status.not-ready {
  background: #fef3c7;
  color: #92400e;
}

.knowledge-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.btn-kb {
  padding: 6px 14px;
  border: 1px solid #c4b5fd;
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  color: #5b21b6;
}

.btn-kb:hover {
  background: #f5f3ff;
  border-color: #8b5cf6;
}

.btn-kb:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-upload {
  display: inline-block;
}

.knowledge-preview {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.preview-label {
  font-size: 12px;
  color: #7c3aed;
  font-weight: 600;
}

.preview-tag {
  display: inline-block;
  padding: 2px 8px;
  background: #ede9fe;
  border-radius: 10px;
  font-size: 11px;
  color: #5b21b6;
}

/* ============================================================ */
/* 错误提示 */
/* ============================================================ */
.error-msg {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 16px;
  margin-bottom: 12px;
  color: #dc2626;
  font-size: 13px;
}

/* ============================================================ */
/* 对话区域 */
/* ============================================================ */
.chat-history {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  min-height: 300px;
  max-height: 500px;
  overflow-y: auto;
}

.empty-chat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 250px;
  color: #94a3b8;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 14px;
  margin-bottom: 12px;
}

.empty-hints {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.empty-hints span {
  display: inline-block;
  padding: 6px 12px;
  background: #e0f2fe;
  border-radius: 16px;
  font-size: 13px;
  color: #0369a1;
  cursor: pointer;
  transition: all 0.2s;
}

.empty-hints span:hover {
  background: #bae6fd;
  color: #0284c7;
}

/* ============================================================ */
/* 消息样式 */
/* ============================================================ */
.message-wrapper {
  margin-bottom: 16px;
}

.message {
  display: flex;
  gap: 10px;
}

.user-msg {
  justify-content: flex-end;
}

.msg-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
  background: #f1f5f9;
}

.msg-bubble {
  max-width: 75%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}

.user-bubble {
  background: #3b82f6;
  color: #fff;
  border-bottom-right-radius: 4px;
}

.ai-bubble {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-bottom-left-radius: 4px;
  color: #1e293b;
}

/* Markdown 渲染样式 */
.markdown-body {
  line-height: 1.8;
  word-wrap: break-word;
}
.markdown-body h1,
.markdown-body h2,
.markdown-body h3,
.markdown-body h4 {
  margin: 12px 0 6px;
  font-weight: 600;
  line-height: 1.4;
}
.markdown-body h1 { font-size: 18px; }
.markdown-body h2 { font-size: 16px; }
.markdown-body h3 { font-size: 15px; }
.markdown-body h4 { font-size: 14px; }
.markdown-body p {
  margin: 6px 0;
}
.markdown-body ul,
.markdown-body ol {
  margin: 6px 0;
  padding-left: 20px;
}
.markdown-body li {
  margin: 3px 0;
}
.markdown-body code {
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  color: #d6336c;
}
.markdown-body pre {
  background: #1e293b;
  color: #e2e8f0;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 8px 0;
  font-size: 13px;
}
.markdown-body pre code {
  background: transparent;
  color: inherit;
  padding: 0;
}
.markdown-body blockquote {
  border-left: 3px solid #cbd5e1;
  padding-left: 12px;
  margin: 8px 0;
  color: #64748b;
}
.markdown-body table {
  border-collapse: collapse;
  margin: 8px 0;
  width: 100%;
}
.markdown-body th,
.markdown-body td {
  border: 1px solid #e2e8f0;
  padding: 6px 10px;
  text-align: left;
}
.markdown-body th {
  background: #f8fafc;
  font-weight: 600;
}
.markdown-body strong {
  font-weight: 600;
  color: #0f172a;
}
.markdown-body a {
  color: #3b82f6;
  text-decoration: none;
}
.markdown-body a:hover {
  text-decoration: underline;
}

.msg-content {
  flex: 1;
  min-width: 0;
}

/* ============================================================ */
/* Segment 样式 */
/* ============================================================ */
.segment {
  margin-bottom: 8px;
  border-radius: 8px;
  overflow: hidden;
}

.seg-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 13px;
  user-select: none;
  transition: background 0.15s;
}

.seg-header:hover {
  filter: brightness(0.95);
}

.seg-icon {
  font-size: 14px;
}

.seg-label {
  flex: 1;
  font-weight: 600;
}

.seg-toggle {
  font-size: 10px;
  color: inherit;
  opacity: 0.6;
}

.seg-body {
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.6;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.seg-json {
  background: #1e293b;
  color: #94a3b8;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  overflow-x: auto;
  margin: 0;
}

/* 思考过程 */
.thinking-seg {
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
}

.thinking-seg .seg-header {
  color: #7c3aed;
}

.thinking-seg .seg-body {
  color: #5b21b6;
  font-style: italic;
}

/* 工具调用 */
.tool-use-seg {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}

.tool-use-seg .seg-header {
  color: #2563eb;
}

/* 工具返回 */
.tool-result-seg {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
}

.tool-result-seg .seg-header {
  color: #16a34a;
}

/* 检索结果 */
.retrieved-seg {
  background: #fffbeb;
  border: 1px solid #fde68a;
}

.retrieved-seg .seg-header {
  color: #d97706;
}

.retrieved-item {
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #fde68a;
}

.retrieved-item:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.retrieved-source {
  font-weight: 600;
  font-size: 12px;
  color: #92400e;
  margin-bottom: 4px;
}

.retrieved-content {
  font-size: 12px;
  color: #78716c;
  line-height: 1.5;
}

/* 结构化输出 */
.structured-seg {
  background: #fdf2f8;
  border: 1px solid #fbcfe8;
}

.structured-seg .seg-header {
  color: #db2777;
}

/* 文本回复 */
.text-seg {
  margin-bottom: 4px;
}

/* 错误 */
.error-seg {
  background: #fef2f2;
  border: 1px solid #fecaca;
  padding: 8px 12px;
  border-radius: 8px;
  color: #dc2626;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ============================================================ */
/* 加载光标 */
/* ============================================================ */
.cursor-blink {
  animation: blink 1s step-end infinite;
  color: #3b82f6;
  font-weight: 700;
  font-size: 16px;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* ============================================================ */
/* 状态栏 */
/* ============================================================ */
.status-bar {
  display: flex;
  gap: 20px;
  padding: 8px 16px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #64748b;
  flex-wrap: wrap;
}

/* ============================================================ */
/* 输入区 */
/* ============================================================ */
.input-section {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px;
}

.input-section textarea {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  resize: vertical;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.input-section textarea:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.input-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.btn-send {
  padding: 8px 20px;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-send:hover:not(:disabled) {
  background: #2563eb;
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-clear {
  padding: 8px 16px;
  background: #fff;
  color: #64748b;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-clear:hover {
  background: #f1f5f9;
  color: #ef4444;
  border-color: #fecaca;
}
</style>