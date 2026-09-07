<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-07 10:00:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-07 19:37:48
 * @Description: 阶段七：中间件 Middleware — LangChain Python 中间件演示
 *   学习目标：理解 LangChain Python 的中间件机制（Before/After/Around）
 *   核心 API：BaseCallbackHandler、callbacks 参数
 *   注意：LangChain.js 无中间件 API，本页面通过 Python 脚本演示
-->
<template>
  <div>
    <h1>阶段七：中间件 Middleware <span class="badge stage">Python 演示</span></h1>
    <div class="info-box">
      <strong>学习目标：</strong>理解 LangChain Python 的中间件机制，实现横切关注点（日志、缓存、限流、重试）<br />
      <strong>核心 API：</strong><code>BaseCallbackHandler</code>、<code>callbacks</code> 参数<br />
      <strong>说明：</strong>LangChain.js 无中间件 API，本页面通过 Python 脚本（<code>MiddlewareModel.py</code>）调用百炼模型演示
    </div>

    <!-- 中间件与模型配置 -->
    <div class="config-section">
      <div class="config-title">🧩 中间件开关配置</div>
      <!-- 下拉多选组件 -->
      <div class="multi-select" ref="multiSelect">
        <div class="multi-select-trigger" @click="toggleDropdown">
          <span class="multi-select-label">
            {{ selectedMiddleware.length === 0 ? '请选择中间件' : `已选择 ${selectedMiddleware.length} 个中间件` }}
          </span>
          <span class="multi-select-arrow" :class="{ open: dropdownOpen }">▾</span>
        </div>
        <div v-if="dropdownOpen" class="multi-select-dropdown">
          <div class="multi-select-actions">
            <button type="button" class="ms-action" @click="selectAll">全选</button>
            <button type="button" class="ms-action" @click="clearAll">清空</button>
          </div>
          <label
            v-for="opt in middlewareOptions"
            :key="opt.value"
            class="multi-select-option"
          >
            <div class="ms-option-row">
              <input
                type="checkbox"
                :value="opt.value"
                v-model="selectedMiddleware"
              />
              <span class="ms-option-name">{{ opt.label }}</span>
            </div>
            <span class="ms-option-desc">{{ opt.desc }}</span>
          </label>
        </div>
      </div>
      <!-- 已选中间件标签展示 -->
      <div v-if="selectedMiddleware.length > 0" class="selected-tags">
        <span
          v-for="opt in selectedMiddlewareOptions"
          :key="opt.value"
          class="selected-tag"
        >
          {{ opt.label }}
        </span>
      </div>

      <div class="config-divider"></div>

      <div class="config-title">⚙️ 模型与参数配置</div>
      <div class="config-row">
        <label>
          模型：
          <select v-model="config.model">
            <option value="qwen-plus">qwen-plus（性价比）</option>
            <option value="qwen-max">qwen-max（最强）</option>
            <option value="qwen-turbo">qwen-turbo（最快）</option>
          </select>
        </label>
        <label class="ml-24">
          Temperature：
          <input type="range" v-model.number="config.temperature" min="0" max="2" step="0.1" />
          {{ config.temperature }}
        </label>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-section">
      <textarea
        v-model="input"
        placeholder="请输入你的问题，如：请介绍一下 LangChain 的中间件机制"
        rows="3"
        @keydown.ctrl.enter="send"
      ></textarea>
      <button @click="send" :disabled="loading">
        {{ loading ? '调用中...' : '发送 (Ctrl+Enter)' }}
      </button>
      <button @click="clear" class="btn-clear">清空对话</button>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <div class="chat-history" ref="chatHistory">
      <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
        <div class="role-label">{{ msg.role === 'user' ? '你' : 'AI（中间件）' }}</div>
        <div class="content">{{ msg.content }}</div>
        <!-- 中间件日志展示 -->
        <div v-if="msg.logs && msg.logs.length > 0" class="middleware-logs">
          <details>
            <summary class="logs-summary">🔍 中间件执行日志（{{ msg.logs.length }} 条）</summary>
            <div class="logs-content">
              <div v-for="(log, li) in msg.logs" :key="li" class="log-line">{{ log }}</div>
            </div>
          </details>
        </div>
      </div>
    </div>

    <details class="code-block">
      <summary>📄 查看 Python 中间件代码（MiddlewareModel.py）</summary>
      <pre class="code-content">{{ codeExample }}</pre>
    </details>
  </div>
</template>

<script>
export default {
  name: 'LangChainStage8Meddleware',

  data() {
    return {
      input: '',
      messages: [],
      loading: false,
      error: null,
      config: {
        model: 'qwen-plus',
        temperature: 0.7,
      },
      // 下拉多选：选中的中间件 key 数组
      selectedMiddleware: ['before', 'after', 'around', 'sensitive', 'metrics', 'retry'],
      // 中间件选项列表
      middlewareOptions: [
        { value: 'before', label: 'Before 中间件', desc: '调用前：参数校验、鉴权、注入上下文' },
        { value: 'after', label: 'After 中间件', desc: '调用后：结果处理、缓存写入、指标采集' },
        { value: 'around', label: 'Around 中间件', desc: '环绕：统一计时、统一异常处理' },
        { value: 'sensitive', label: '脱敏中间件', desc: '敏感数据脱敏，防止信息泄露' },
        { value: 'metrics', label: '指标中间件', desc: '统计调用次数与平均耗时' },
        { value: 'retry', label: '重试中间件', desc: '调用失败自动重试' },
      ],
      dropdownOpen: false,
      codeExample: `# MiddlewareModel.py — LangChain Python 中间件演示
      # 安装依赖：pip install langchain langchain-openai langchain-core python-dotenv

      from langchain_core.callbacks import BaseCallbackHandler
      from langchain_openai import ChatOpenAI

      # ============================================================
      # 一、Before 中间件：调用前执行
      # ============================================================
      class BeforeMiddleware(BaseCallbackHandler):
          """调用前：参数校验、鉴权、注入上下文"""
          def on_llm_start(self, serialized, prompts, **kwargs):
              print(f"[Before] LLM 调用开始，输入消息数: {len(prompts)}")

      # ============================================================
      # 二、After 中间件：调用后执行
      # ============================================================
      class AfterMiddleware(BaseCallbackHandler):
          """调用后：结果处理、缓存写入、指标采集"""
          def on_llm_end(self, response, **kwargs):
              text = response.generations[0][0].text
              print(f"[After] LLM 调用结束，输出长度: {len(text)} 字符")

      # ============================================================
      # 三、Around 中间件：环绕执行（统一计时/异常处理）
      # ============================================================
      class AroundMiddleware(BaseCallbackHandler):
          def on_llm_start(self, serialized, prompts, **kwargs):
              self.start_time = time.time()
          def on_llm_end(self, response, **kwargs):
              print(f"[Around] 调用耗时: {time.time() - self.start_time:.2f} 秒")

      # ============================================================
      # 四、组合中间件并调用模型
      # ============================================================
      middlewares = [BeforeMiddleware(), AfterMiddleware(), AroundMiddleware()]

      llm = ChatOpenAI(
          model="qwen-plus",
          api_key=API_KEY,
          base_url=BASE_URL,
          callbacks=middlewares,  # 关键：将中间件作为 callbacks 传入
      )

      response = llm.invoke([
          SystemMessage(content="你是一个有用的AI助手"),
          HumanMessage(content=message),
      ])
      print(response.content)`,
    }
  },

  computed: {
    // 已选中间件的完整选项信息（用于标签展示）
    selectedMiddlewareOptions() {
      return this.middlewareOptions.filter((opt) => this.selectedMiddleware.includes(opt.value))
    },
    // 转换为后端期望的 { key: boolean } 对象格式
    middlewareConfig() {
      const config = {}
      this.middlewareOptions.forEach((opt) => {
        config[opt.value] = this.selectedMiddleware.includes(opt.value)
      })
      return config
    },
  },

  watch: {
    messages: {
      deep: true,
      handler() { this.$nextTick(() => this.scrollToBottom()) },
    },
  },

  methods: {
    // 切换下拉面板
    toggleDropdown() {
      this.dropdownOpen = !this.dropdownOpen
    },
    // 全选
    selectAll() {
      this.selectedMiddleware = this.middlewareOptions.map((opt) => opt.value)
    },
    // 清空
    clearAll() {
      this.selectedMiddleware = []
    },
    // 点击外部关闭下拉
    handleClickOutside(e) {
      const el = this.$refs.multiSelect
      if (el && !el.contains(e.target)) {
        this.dropdownOpen = false
      }
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
        const response = await fetch('/api/middleware/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            temperature: this.config.temperature,
            model: this.config.model,
            middleware: this.middlewareConfig,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`)
        }

        const data = await response.json()
        this.messages[aiMsgIndex].content = data.content || data.message || '（空响应）'
        this.messages[aiMsgIndex].logs = data.logs || []
      } catch (err) {
        console.error('[Middleware API Error]', err)
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

  mounted() {
    // 点击页面其他区域时关闭下拉面板
    document.addEventListener('click', this.handleClickOutside)
  },

  beforeDestroy() {
    document.removeEventListener('click', this.handleClickOutside)
  },
}
</script>

<style scoped>
.badge.stage {
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  color: #fff;
}

.config-section {
  display: block;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.config-title {
  font-weight: 600;
  margin-bottom: 12px;
  color: #334155;
}

.config-divider {
  height: 1px;
  background: #e2e8f0;
  margin: 16px 0;
}

/* 下拉多选组件 */
.multi-select {
  position: relative;
  margin-bottom: 12px;
}

.multi-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.2s;
  user-select: none;
}

.multi-select-trigger:hover {
  border-color: #8b5cf6;
}

.multi-select-label {
  font-size: 14px;
  color: #334155;
}

.multi-select-arrow {
  font-size: 12px;
  color: #64748b;
  transition: transform 0.2s;
}

.multi-select-arrow.open {
  transform: rotate(180deg);
}

.multi-select-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 100;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  max-height: 280px;
  overflow-y: auto;
  padding: 8px;
}

.multi-select-actions {
  display: flex;
  gap: 8px;
  padding: 4px 4px 8px;
  border-bottom: 1px solid #f1f5f9;
  margin-bottom: 4px;
}

.ms-action {
  padding: 4px 12px;
  font-size: 12px;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.ms-action:hover {
  background: #e2e8f0;
}

.multi-select-option {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.multi-select-option:hover {
  background: #f5f3ff;
}

.ms-option-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.multi-select-option input[type="checkbox"] {
  accent-color: #8b5cf6;
  flex-shrink: 0;
}

.ms-option-name {
  font-weight: 600;
  color: #1e293b;
  font-size: 14px;
}

.ms-option-desc {
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
  padding-left: 24px;
}

/* 已选中间件标签 */
.selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.selected-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  background: #f5f3ff;
  color: #6d28d9;
  border: 1px solid #ede9fe;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}

.config-row {
  display: flex;
  gap: 12px;
}

.config-row label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #334155;
}

.config-row select {
  padding: 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
}

.config-row input[type="range"] {
  accent-color: #8b5cf6;
}

/* 覆盖全局按钮颜色为紫色渐变主题 */
.input-section button {
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
}

.input-section button:hover:not(:disabled) {
  background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
}

.input-section button:disabled {
  background: linear-gradient(135deg, #c4b5fd 0%, #a5b4fc 100%);
}

.btn-clear {
  background: #f1f5f9 !important;
  color: #475569 !important;
}

.btn-clear:hover {
  background: #e2e8f0 !important;
}

.error-msg {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  font-size: 14px;
}

.chat-history {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  background: #fff;
}

.message {
  margin-bottom: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  max-width: 85%;
}

.message.user {
  background: #f3f4f6;
  margin-left: auto;
}

.message.assistant {
  background: #f5f3ff;
  border: 1px solid #ede9fe;
}

.role-label {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 4px;
}

.content {
  font-size: 14px;
  line-height: 1.6;
  color: #1e293b;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 中间件日志 */
.middleware-logs {
  margin-top: 10px;
}

.middleware-logs details {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  overflow: hidden;
}

.logs-summary {
  padding: 6px 12px;
  background: #f1f5f9;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: #475569;
  user-select: none;
}

.logs-summary:hover {
  background: #e2e8f0;
}

.logs-content {
  background: #0f172a;
  padding: 8px 12px;
  max-height: 200px;
  overflow-y: auto;
}

.log-line {
  font-size: 11px;
  font-family: 'Consolas', 'Courier New', monospace;
  color: #a5f3fc;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-all;
}

.code-block {
  margin-top: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.code-block summary {
  padding: 12px 16px;
  background: #f8fafc;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: #334155;
}

.code-content {
  background: #0f172a;
  color: #e2e8f0;
  padding: 16px;
  font-size: 13px;
  line-height: 1.6;
  overflow-x: auto;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.ml-24 {
  margin-left: 24px;
}
</style>