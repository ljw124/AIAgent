<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-08-27 11:48:57
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-08-27 11:55:33
 * @Description: 
-->
<template>
  <div>
    <h1>魔塔大模型 <span class="badge modelscope">JS 直接调用</span></h1>
    <div class="info-box">
      <strong>调用方式：</strong>前端 fetch → 魔塔 ModelScope API（OpenAI 兼容模式）<br />
      <strong>模型：</strong>deepseek-ai/DeepSeek-V4-Flash-0731<br />
      <strong>说明：</strong>最简单的 API 调用示例，单次请求，无对话历史
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
const MODELSCOPE_PROXY = '/modelscope/v1'

export default {
  name: 'ModelScopeChat',

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
        const response = await fetch(`${MODELSCOPE_PROXY}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'deepseek-ai/DeepSeek-V4-Flash-0731',
            messages: [
              { role: 'system', content: '你是一个有用的AI助手，请用中文回答。' },
              { role: 'user', content: text },
            ],
            max_tokens: 2048,
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
        console.error('[ModelScope API Error]', err)
        this.error = `请求失败: ${err.message}`
      } finally {
        this.loading = false
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