<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-08-27 12:55:58
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-08-27 12:56:07
 * @Description: 
-->
<template>
  <div>
    <h1>百炼大模型 <span class="badge bailian">JS 直接调用</span></h1>
    <div class="info-box">
      <strong>调用方式：</strong>前端 fetch → 百炼 DashScope API（OpenAI 兼容模式）<br />
      <strong>模型：</strong>qwen-plus<br />
      <strong>说明：</strong>通过本地代理访问百炼 API，单次请求，无对话历史
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
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <div v-if="result" class="result-box">
      <div class="result-label">AI 回复</div>
      <div class="result-content">{{ result }}</div>
    </div>
  </div>
</template>

<script>
const DASHSCOPE_PROXY = '/dashscope/compatible-mode/v1'

export default {
  name: 'BailianJSChat',

  data() {
    return {
      input: '',
      result: '',
      loading: false,
      error: null,
    }
  },

  methods: {
    async send() {
      const text = this.input.trim()
      if (!text || this.loading) return

      this.input = ''
      this.result = ''
      this.error = null
      this.loading = true

      try {
        const response = await fetch(`${DASHSCOPE_PROXY}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'qwen-plus',
            messages: [
              { role: 'system', content: '你是一个有用的AI助手，请用中文回答。' },
              { role: 'user', content: text },
            ],
          }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(
            `HTTP ${response.status}: ${errorData.error?.message || errorData.message || response.statusText}`
          )
        }

        const data = await response.json()
        this.result = data.choices?.[0]?.message?.content || '（空响应）'
      } catch (err) {
        console.error('[百炼 API Error]', err)
        this.error = `请求失败: ${err.message}`
      } finally {
        this.loading = false
      }
    },
  },
}
</script>

<style scoped>
.badge.bailian {
  background: linear-gradient(135deg, #f97316 0%, #ef4444 100%);
  color: #fff;
}
</style>