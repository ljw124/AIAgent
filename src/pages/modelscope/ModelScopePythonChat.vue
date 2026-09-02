<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-01 12:45:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-02 09:37:33
 * @Description: 魔塔 ModelScope 大模型 Python 调用
-->
<template>
  <div>
    <h1>魔塔大模型 <span class="badge modelscope">Python 调用</span></h1>
    <div class="info-box">
      <strong>调用方式：</strong>Python 脚本（LangChain + OpenAI 兼容模式）→ 魔塔 ModelScope API<br />
      <strong>模型：</strong>deepseek-ai/DeepSeek-V4-Flash-0731<br />
      <strong>说明：</strong>Python 脚本位于 <code>src/composables/ModelScopeModel.py</code>，通过 LangChain 的 ChatOpenAI 调用魔塔社区 API
    </div>

    <div class="config-section">
      <label>
        Temperature：
        <input type="range" v-model.number="config.temperature" min="0" max="2" step="0.1" />
        {{ config.temperature }}
      </label>
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

    <details class="code-block">
      <summary>📄 查看 Python 调用代码（ModelScopeModel.py）</summary>
      <pre class="code-content">{{ codeExample }}</pre>
    </details>
  </div>
</template>

<script>
export default {
  name: 'ModelScopePythonChat',

  data() {
    return {
      input: '',
      messages: [],
      loading: false,
      error: null,
      config: {
        temperature: 0.7,
      },
      codeExample: `# ModelScopeModel.py — 魔塔社区大模型调用示例
        # 安装依赖：pip install langchain langchain-openai langchain-core python-dotenv

        import os
        from dotenv import load_dotenv
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import HumanMessage, SystemMessage

        # 加载 .env 文件（包含 MODELSCOPE_API_KEY 和 LangSmith 配置）
        load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

        MODELSCOPE_API_KEY = os.getenv("MODELSCOPE_API_KEY")
        MODELSCOPE_BASE_URL = os.getenv("MODELSCOPE_BASE_URL", "https://api-inference.modelscope.cn/v1")
        MODELSCOPE_MODEL = "deepseek-ai/DeepSeek-V4-Flash-0731"

        def chat(message, temperature=0.7):
            # 使用 LangChain 的 ChatOpenAI 调用魔塔 API（OpenAI 兼容模式）
            # LangSmith 会自动追踪每次调用（无需额外代码）
            llm = ChatOpenAI(
                model=MODELSCOPE_MODEL,
                api_key=MODELSCOPE_API_KEY,
                base_url=MODELSCOPE_BASE_URL,
                temperature=temperature,
            )
            response = llm.invoke([
                SystemMessage(content="你是一个有用的AI助手，请用中文回答。"),
                HumanMessage(content=message),
            ])
            return response.content

        # 调用示例
        result = chat("你好，请介绍一下你自己")
        print(result)`,
    }
  },

  watch: {
    messages: {
      deep: true,
      handler() { this.$nextTick(() => this.scrollToBottom()) }
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
        // 通过后端 API 调用 Python 脚本 ModelScopeModel.py
        const response = await fetch('/api/modelscope/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            temperature: this.config.temperature,
          })
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`)
        }

        const data = await response.json()
        this.messages[aiMsgIndex].content = data.content || data.message || '（空响应）'
      } catch (err) {
        console.error('[ModelScope Python API Error]', err)
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
.badge.modelscope {
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: #fff;
}
</style>