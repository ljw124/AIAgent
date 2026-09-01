<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-08-27 18:55:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-08-27 18:34:03
 * @Description: 阶段六：Streaming — 流式输出
 *   学习目标：用 stream() 实现打字机效果
 *   核心 API：llm.stream()、for await...of、AIMessageChunk
 *   对比：invoke() 等待完整响应 vs stream() 逐 token 返回
-->
<template>
  <div>
    <h1>阶段六：Streaming 流式输出 <span class="badge stage">学习</span></h1>
    <div class="info-box">
      <strong>学习目标：</strong>用 <code>stream()</code> 实现打字机效果，逐 token 显示回复<br />
      <strong>核心 API：</strong><code>llm.stream()</code>、<code>for await...of</code>、<code>AIMessageChunk</code><br />
      <strong>对比：</strong><code>invoke()</code> 等待完整响应 vs <code>stream()</code> 逐 token 返回
    </div>

    <!-- 调用模式切换 -->
    <div class="config-section">
      <div class="config-row">
        <label>调用模式：</label>
        <label class="radio-label">
          <input type="radio" v-model="mode" value="stream" />
          <span>stream() 流式（打字机效果）</span>
        </label>
        <label class="radio-label">
          <input type="radio" v-model="mode" value="invoke" />
          <span>invoke() 一次性返回（对比）</span>
        </label>
      </div>
    </div>

    <div class="input-section">
      <textarea
        v-model="input"
        placeholder="输入一个需要较长回复的问题，如：请详细介绍 Vue.js 的响应式原理"
        rows="3"
        @keydown.ctrl.enter="send"
      ></textarea>
      <button @click="send" :disabled="loading">
        {{ loading ? '生成中...' : '发送 (Ctrl+Enter)' }}
      </button>
      <button @click="clear" class="btn-clear">清空对话</button>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- 流式统计 -->
    <div v-if="streamStats" class="stream-stats">
      <span>📊 流式统计：共 {{ streamStats.chunks }} 个 chunk，耗时 {{ streamStats.duration }}ms</span>
    </div>

    <div class="chat-history" ref="chatHistory">
      <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
        <div class="role-label">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
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

export default {
  name: 'LangChainStage6Stream',

  data() {
    return {
      input: '',
      messages: [],
      loading: false,
      error: null,
      mode: 'stream', // 'stream' | 'invoke'
      streamStats: null, // { chunks, duration }
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
      this.streamStats = null

      this.messages.push({ role: 'assistant', content: '' })
      const aiMsgIndex = this.messages.length - 1

      try {
        // 构造消息
        const historyMessages = this.messages
          .slice(0, -1)
          .map((msg) => {
            if (msg.role === 'user') return new HumanMessage(msg.content)
            if (msg.role === 'assistant') return new AIMessage(msg.content)
            return null
          })
          .filter(Boolean)

        const langChainMessages = [
          new SystemMessage('你是一个有用的AI助手，请用中文回答。回答要详细、有条理。'),
          ...historyMessages,
        ]

        const llm = new ChatOpenAI({
          model: 'EB-DeepSeek-V4-Pro',
          apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
          temperature: 0.7,
          configuration: {
            baseURL: window.location.origin + '/inner/',
          },
        })

        if (this.mode === 'stream') {
          // ============================================================
          // 阶段六核心：stream() 流式调用
          // ============================================================

          const startTime = Date.now()
          let chunkCount = 0

          // stream() 返回一个 AsyncIterable<AIMessageChunk>
          const stream = await llm.stream(langChainMessages)

          // for await...of 逐 chunk 消费
          for await (const chunk of stream) {
            chunkCount++
            // chunk.content 是当前 token 的文本
            if (chunk.content) {
              this.messages[aiMsgIndex].content += chunk.content
            }
          }

          const duration = Date.now() - startTime
          this.streamStats = { chunks: chunkCount, duration }
        } else {
          // ============================================================
          // 对比：invoke() 一次性返回
          // ============================================================
          const response = await llm.invoke(langChainMessages)
          this.messages[aiMsgIndex].content = response.content
        }
      } catch (err) {
        console.error('[Stage6 Error]', err)
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
      this.streamStats = null
      this.error = null
    },

    scrollToBottom() {
      const el = this.$refs.chatHistory
      if (el) el.scrollTop = el.scrollHeight
    },
  },
}
</script>

<style scoped>
.badge.stage {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #fff;
}

.config-section {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.config-row > label:first-child {
  font-weight: 600;
  font-size: 14px;
  color: #0369a1;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: #334155;
  cursor: pointer;
}

.radio-label input[type="radio"] {
  accent-color: #3b82f6;
}

.stream-stats {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 8px 16px;
  margin-bottom: 16px;
  font-size: 13px;
  color: #166534;
  font-weight: 600;
}

.cursor-blink {
  animation: blink 1s step-end infinite;
  color: #3b82f6;
  font-weight: 700;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
</style>