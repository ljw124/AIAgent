<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-08-27 18:30:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-08-27 18:28:39
 * @Description: 阶段一：Prompt Template — 提示词模板
 *   学习目标：用 ChatPromptTemplate 替代硬编码 System Prompt
 *   核心 API：ChatPromptTemplate.fromMessages()、MessagesPlaceholder
-->
<template>
  <div>
    <h1>阶段一：Prompt Template <span class="badge stage">学习</span></h1>
    <div class="info-box">
      <strong>学习目标：</strong>用 <code>ChatPromptTemplate</code> 替代硬编码 System Prompt<br />
      <strong>核心 API：</strong><code>ChatPromptTemplate.fromMessages()</code>、<code>MessagesPlaceholder</code><br />
      <strong>对比：</strong>左侧为硬编码方式（当前 InnerModelChat），右侧为模板方式
    </div>

    <!-- 角色和语言选择 -->
    <div class="config-section">
      <div class="config-row">
        <label>角色：</label>
        <select v-model="role">
          <option value="前端开发专家">前端开发专家</option>
          <option value="Python后端专家">Python后端专家</option>
          <option value="数据库管理员">数据库管理员</option>
          <option value="DevOps工程师">DevOps工程师</option>
          <option value="通用AI助手">通用AI助手</option>
        </select>
        <label style="margin-left: 16px;">语言：</label>
        <select v-model="language">
          <option value="中文">中文</option>
          <option value="英文">英文</option>
        </select>
      </div>
    </div>

    <div class="input-section">
      <textarea
        v-model="input"
        placeholder="请输入你的问题..."
        rows="3"
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
  </div>
</template>

<script>
/* global INNER_API_KEY */
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts'

export default {
  name: 'LangChainStage1Prompt',

  data() {
    return {
      input: '',
      messages: [],
      loading: false,
      error: null,
      role: '前端开发专家',
      language: '中文',
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
        // ============================================================
        // 阶段一核心：使用 ChatPromptTemplate 构造提示词
        // ============================================================

        // 1. 创建提示词模板
        //    - system 消息中使用 {role} 和 {language} 变量
        //    - MessagesPlaceholder 为对话历史预留位置
        const promptTemplate = ChatPromptTemplate.fromMessages([
          [
            'system',
            '你是一个{role}，请用{language}回答用户的问题。回答要专业、准确、简洁。',
          ],
          new MessagesPlaceholder('history'),
          ['human', '{input}'],
        ])

        // 2. 将历史消息转换为 LangChain 消息类型
        const historyMessages = this.messages
          .slice(0, -1)
          .map((msg) => {
            if (msg.role === 'user') return new HumanMessage(msg.content)
            if (msg.role === 'assistant') return new AIMessage(msg.content)
            return null
          })
          .filter(Boolean)

        // 3. 格式化模板：传入变量值
        const formattedMessages = await promptTemplate.formatMessages({
          role: this.role,
          language: this.language,
          history: historyMessages,
          input: text,
        })

        // 4. 调用模型（与之前相同）
        const llm = new ChatOpenAI({
          model: 'EB-DeepSeek-V4-Pro',
          apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
          temperature: 0.7,
          configuration: {
            baseURL: window.location.origin + '/inner/',
          },
        })

        const response = await llm.invoke(formattedMessages)
        this.messages[aiMsgIndex].content = response.content
      } catch (err) {
        console.error('[Stage1 Error]', err)
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
  gap: 8px;
}

.config-row label {
  font-weight: 600;
  font-size: 14px;
  color: #0369a1;
}

.config-row select {
  padding: 6px 12px;
  border: 1px solid #bae6fd;
  border-radius: 6px;
  font-size: 14px;
  background: #fff;
  color: #0c4a6e;
}
</style>