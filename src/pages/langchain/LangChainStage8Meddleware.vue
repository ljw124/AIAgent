<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-07 10:00:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-08 12:38:26
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
      <strong>核心 API：</strong><code>BaseCallbackHandler</code>（自定义中间件）、<code>create_agent(middleware=)</code>（官方内置中间件）<br />
      <strong>说明：</strong>LangChain.js 无中间件 API，本页面通过 Python 脚本（<code>MiddlewareModel.py</code>）调用内网大模型演示
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
              <span v-if="opt.className" class="ms-option-class">{{ opt.className }}</span>
              <span class="ms-option-type" :class="opt.type">{{ opt.type === 'custom' ? '自定义' : '官方内置' }}</span>
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
          :class="opt.type"
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
            <option value="EB-DeepSeek-V4-Pro">EB-DeepSeek-V4-Pro（推荐）</option>
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
        model: 'EB-DeepSeek-V4-Pro',
        temperature: 0.7,
      },
      // 下拉多选：选中的中间件 key 数组
      selectedMiddleware: ['before', 'after', 'around', 'sensitive', 'metrics', 'retry', 'summarization', 'human_in_the_loop', 'pii', 'todo', 'call_limit'],
      // 中间件选项列表
      middlewareOptions: [
        { value: 'before', label: 'Before 中间件', desc: '调用前：参数校验、鉴权、注入上下文', type: 'custom', className: 'BeforeMiddleware' },
        { value: 'after', label: 'After 中间件', desc: '调用后：结果处理、缓存写入、指标采集', type: 'custom', className: 'AfterMiddleware' },
        { value: 'around', label: 'Around 中间件', desc: '环绕：统一计时、统一异常处理', type: 'custom', className: 'AroundMiddleware' },
        { value: 'sensitive', label: '脱敏中间件', desc: '敏感数据脱敏，防止信息泄露', type: 'custom', className: 'SensitiveDataMiddleware' },
        { value: 'metrics', label: '指标中间件', desc: '统计调用次数与平均耗时', type: 'custom', className: 'MetricsMiddleware' },
        { value: 'retry', label: '重试中间件', desc: '调用失败自动重试', type: 'custom', className: 'RetryMiddleware' },
        { value: 'summarization', label: '摘要中间件', desc: '长文本自动摘要，便于快速阅读', type: 'official', className: 'SummarizationMiddleware' },
        { value: 'human_in_the_loop', label: '人机协同中间件', desc: '关键节点人工审核确认', type: 'official', className: 'HumanInTheLoopMiddleware' },
        { value: 'pii', label: 'PII 中间件', desc: '检测过滤身份证/手机号/邮箱等敏感信息', type: 'official', className: 'PIIMiddleware' },
        { value: 'todo', label: '待办列表中间件', desc: '从回复中自动提取行动项/待办事项', type: 'official', className: 'TodoListMiddleware' },
        { value: 'call_limit', label: '调用限制中间件', desc: '限制调用次数，防止滥用超配额', type: 'official', className: 'ModelCallLimitMiddleware' },
      ],
      dropdownOpen: false,
      codeExample: `# MiddlewareModel.py — LangChain Python 中间件演示（重构版）
      # 安装依赖：pip install langchain langchain-openai langchain-core python-dotenv

      from langchain_core.callbacks import BaseCallbackHandler
      from langchain_openai import ChatOpenAI
      from langchain.agents import create_agent
      from langchain.agents.middleware import (
          SummarizationMiddleware, HumanInTheLoopMiddleware,
          PIIMiddleware, TodoListMiddleware, ModelCallLimitMiddleware,
      )

      # ============================================================
      # 一、自定义中间件（继承 BaseCallbackHandler，通过 callbacks= 传递）
      # ============================================================
      class BeforeMiddleware(BaseCallbackHandler):
          """调用前：参数校验、鉴权、注入上下文"""
          def on_llm_start(self, serialized, prompts, **kwargs):
              print(f"[Before] LLM 调用开始，输入消息数: {len(prompts)}")

      class AfterMiddleware(BaseCallbackHandler):
          """调用后：结果处理、缓存写入、指标采集"""
          def on_llm_end(self, response, **kwargs):
              text = response.generations[0][0].text
              print(f"[After] LLM 调用结束，输出长度: {len(text)} 字符")

      class AroundMiddleware(BaseCallbackHandler):
          """环绕：统一计时/异常处理"""
          def on_llm_start(self, serialized, prompts, **kwargs):
              self.start_time = time.time()
          def on_llm_end(self, response, **kwargs):
              print(f"[Around] 调用耗时: {time.time() - self.start_time:.2f} 秒")

      # ============================================================
      # 二、双层中间件架构：自定义 + 官方内置
      # ============================================================
      # 1. 自定义中间件 → ChatOpenAI(callbacks=)
      llm = ChatOpenAI(
          model="EB-DeepSeek-V4-Pro",
          api_key=API_KEY,
          base_url=BASE_URL,
          callbacks=[BeforeMiddleware(), AfterMiddleware(), AroundMiddleware()],
      )

      # 2. 官方内置中间件 → create_agent(middleware=)
      agent = create_agent(
          model=llm,  # 已配置自定义中间件的 LLM 实例
          middleware=[
              SummarizationMiddleware(model=llm, trigger=('tokens', 4000)),
              TodoListMiddleware(),
              ModelCallLimitMiddleware(run_limit=10),
              PIIMiddleware(pii_type='email', strategy='redact'),
              HumanInTheLoopMiddleware(interrupt_on={'tool_use': True}),
          ],
          system_prompt="你是一个有用的AI助手，请用中文回答。",
      )

      # 3. 调用 Agent（两种中间件协同工作）
      result = agent.invoke({"messages": [HumanMessage(content=message)]})
      print(result["messages"][-1].content)`,
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
  max-width: 520px;
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
  z-index: 100;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  max-height: 320px;
  overflow-y: auto;
  padding: 8px;
  width: 100%;
  min-width: 400px;
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
  align-items: flex-start;
  gap: 4px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  text-align: left;
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
  flex: 1;
}

/* 中间件类型标签 */
.ms-option-type {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;
  flex-shrink: 0;
}

.ms-option-type.custom {
  background: #ede9fe;
  color: #6d28d9;
}

.ms-option-type.official {
  background: #dbeafe;
  color: #1d4ed8;
}

/* 中间件英文类名 */
.ms-option-class {
  font-size: 11px;
  color: #94a3b8;
  font-family: 'Consolas', 'Courier New', monospace;
  flex-shrink: 0;
}

.ms-option-desc {
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
  padding-left: 24px;
  text-align: left;
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
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}

/* 自定义中间件标签：紫色 */
.selected-tag.custom {
  background: #f5f3ff;
  color: #6d28d9;
  border: 1px solid #ede9fe;
}

/* 官方内置中间件标签：蓝色 */
.selected-tag.official {
  background: #dbeafe;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
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