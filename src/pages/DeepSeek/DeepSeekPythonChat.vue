<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-18 16:40:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-18 16:44:39
 * @Description: DeepSeek 大模型 Python 调用
-->
<template>
  <div>
    <h1>DeepSeek 大模型 <span class="badge deepseek">Python 调用</span></h1>
    <div class="info-box">
      <strong>调用方式：</strong>Python 脚本（LangChain + OpenAI 兼容模式）→ DeepSeek API<br />
      <strong>模型：</strong>deepseek-chat / deepseek-reasoner<br />
      <strong>说明：</strong>Python 脚本位于 <code>src/composables/DeepSeekModel.py</code>，通过 LangChain 的 ChatOpenAI 调用 DeepSeek
    </div>

    <div class="config-section">
      <label>
        模型：
        <select v-model="config.model">
          <option value="deepseek-chat">deepseek-chat（通用对话）</option>
          <option value="deepseek-reasoner">deepseek-reasoner（推理增强）</option>
        </select>
      </label>
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
      <summary>📄 查看 Python 调用代码（DeepSeekModel.py）</summary>
      <pre class="code-content">{{ codeExample }}</pre>
    </details>
  </div>
</template>

<script>
export default {
  name: 'DeepSeekPythonChat',

  data() {
    return {
      input: '',
      messages: [],
      loading: false,
      error: null,
      config: {
        model: 'deepseek-chat',
        temperature: 0.7,
      },
      codeExample: `# DeepSeekModel.py — DeepSeek 大模型调用示例
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
    model="deepseek-chat",
    temperature=0.7,
    max_tokens=2048,
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url=os.getenv("DEEPSEEK_BASE_URL"),
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
# 方式二：原生 OpenAI SDK（DeepSeek 兼容模式）
# ============================================================
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url=os.getenv("DEEPSEEK_BASE_URL"),
)

completion = client.chat.completions.create(
    model="deepseek-chat",
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
        const response = await fetch('/api/deepseek/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.config.model,
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
        console.error('[DeepSeek Python API Error]', err)
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
.badge.deepseek {
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  color: #fff;
}
</style>