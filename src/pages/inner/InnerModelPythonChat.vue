<template>
  <div>
    <h1>内网大模型 <span class="badge inner">Python 调用</span></h1>
    <div class="info-box">
      <strong>调用方式：</strong>Python 脚本（LangChain + OpenAI 兼容模式）→ 内网大模型 API<br />
      <strong>模型：</strong>Qwen3-Coder-Flash<br />
      <strong>说明：</strong>Python 脚本位于 <code>src/composables/InnerModel.py</code>，通过 LangChain 的 ChatOpenAI 调用内网大模型
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
      <summary>📄 查看 Python 调用代码（InnerModel.py）</summary>
      <pre class="code-content">{{ codeExample }}</pre>
    </details>
  </div>
</template>

<script>
export default {
  name: 'InnerModelPythonChat',

  data() {
    return {
      input: '',
      messages: [],
      loading: false,
      error: null,
      config: {
        temperature: 0.7,
      },
      codeExample: `# InnerModel.py — 内网大模型调用示例
# 安装依赖：pip install langchain langchain-openai python-dotenv

import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

load_dotenv()

# ============================================================
# 方式一：LangChain ChatOpenAI（推荐）
# ============================================================
model = ChatOpenAI(
    model="Qwen3-Coder-Flash",
    temperature=0.7,
    max_tokens=2048,
    api_key=os.getenv("INNER_API_KEY"),
    base_url=os.getenv("INNER_BASE_URL"),
)

# 简单调用
response = model.invoke("你好，请介绍一下你自己")
print(response.content)

# LCEL 链式调用
prompt = ChatPromptTemplate.from_template(
    "你是一个{role}。请回答：{question}"
)
chain = prompt | model | StrOutputParser()
result = chain.invoke({
    "role": "Python 专家",
    "question": "解释什么是装饰器"
})
print(result)

# ============================================================
# 方式二：原生 OpenAI SDK
# ============================================================
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("INNER_API_KEY"),
    base_url=os.getenv("INNER_BASE_URL"),
)

completion = client.chat.completions.create(
    model="Qwen3-Coder-Flash",
    messages=[
        {"role": "system", "content": "你是一个有用的助手"},
        {"role": "user", "content": "你好"}
    ],
    temperature=0.7,
    max_tokens=2048,
)

print(completion.choices[0].message.content)

# ============================================================
# 方式三：流式输出
# ============================================================
for chunk in model.stream("用中文讲一个笑话"):
    print(chunk.content, end="", flush=True)
print()  # 换行`,
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
        // 通过后端 API 调用 Python 脚本 InnerModel.py
        const response = await fetch('/api/inner/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            temperature: this.config.temperature,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(`HTTP ${response.status}: ${errorData.error || response.statusText}`)
        }

        const data = await response.json()
        this.messages[aiMsgIndex].content = data.content || data.message || '（空响应）'
      } catch (err) {
        console.error('[Inner Python API Error]', err)
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