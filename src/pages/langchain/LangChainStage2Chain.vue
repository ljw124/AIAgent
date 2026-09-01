<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-08-27 18:35:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-08-27 18:29:31
 * @Description: 阶段二：Chain — 链式调用（LCEL 管道模式）
 *   学习目标：用 .pipe() 串联 PromptTemplate → ChatOpenAI → StringOutputParser
 *   核心 API：.pipe()、StringOutputParser、RunnableSequence
-->
<template>
  <div>
    <h1>阶段二：Chain 链式调用 <span class="badge stage">学习</span></h1>
    <div class="info-box">
      <strong>学习目标：</strong>用 LCEL <code>.pipe()</code> 管道模式串联组件<br />
      <strong>核心 API：</strong><code>.pipe()</code>、<code>StringOutputParser</code><br />
      <strong>对比阶段一：</strong>不再手动 formatMessages + invoke，而是创建可复用的链
    </div>

    <!-- 翻译模式选择 -->
    <div class="config-section">
      <div class="config-row">
        <label>翻译方向：</label>
        <select v-model="direction">
          <option value="中译英">中文 → 英文</option>
          <option value="英译中">英文 → 中文</option>
          <option value="中译日">中文 → 日文</option>
          <option value="中译法">中文 → 法文</option>
        </select>
        <label style="margin-left: 16px;">风格：</label>
        <select v-model="style">
          <option value="正式">正式</option>
          <option value="口语化">口语化</option>
          <option value="文学性">文学性</option>
        </select>
      </div>
    </div>

    <div class="input-section">
      <textarea
        v-model="input"
        placeholder="请输入要翻译的文本..."
        rows="3"
        @keydown.ctrl.enter="send"
      ></textarea>
      <button @click="send" :disabled="loading">
        {{ loading ? '请求中...' : '翻译 (Ctrl+Enter)' }}
      </button>
      <button @click="clear" class="btn-clear">清空</button>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <div class="chat-history" ref="chatHistory">
      <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
        <div class="role-label">{{ msg.role === 'user' ? '原文' : '译文' }}</div>
        <div class="content">{{ msg.content }}</div>
      </div>
    </div>
  </div>
</template>

<script>
/* global INNER_API_KEY */
import { ChatOpenAI } from '@langchain/openai'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers'

export default {
  name: 'LangChainStage2Chain',

  data() {
    return {
      input: '',
      messages: [],
      loading: false,
      error: null,
      direction: '中译英',
      style: '正式',
    }
  },

  watch: {
    messages: {
      deep: true,
      handler() { this.$nextTick(() => this.scrollToBottom()) },
    },
  },

  methods: {
    /**
     * 创建翻译链
     * 这是 LCEL 的核心模式：PromptTemplate.pipe(Model).pipe(Parser)
     * 链创建一次，可多次调用（复用）
     */
    createTranslationChain() {
      // 1. 创建提示词模板
      const promptTemplate = ChatPromptTemplate.fromMessages([
        ['system', '你是一个专业翻译助手。请将用户输入的文本翻译为{style}风格的{language}。只输出翻译结果，不要添加任何解释。'],
        ['human', '{input}'],
      ])

      // 2. 创建模型实例
      const llm = new ChatOpenAI({
        model: 'EB-DeepSeek-V4-Pro',
        apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
        temperature: 0.3, // 翻译任务用较低温度，保证一致性
        configuration: {
          baseURL: window.location.origin + '/inner/',
        },
      })

      // 3. 创建输出解析器（将 AIMessage 转为纯文本字符串）
      const parser = new StringOutputParser()

      // 4. 用 .pipe() 串联成链
      //    PromptTemplate → ChatOpenAI → StringOutputParser
      const chain = promptTemplate.pipe(llm).pipe(parser)

      return chain
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
        // ============================================================
        // 阶段二核心：使用 LCEL 链式调用
        // ============================================================

        // 创建链（实际项目中可以在 created() 中创建一次，复用）
        const chain = this.createTranslationChain()

        // 调用链：传入模板变量，直接得到字符串结果
        // 不再需要手动 formatMessages + invoke + .content
        const result = await chain.invoke({
          language: this.direction,
          style: this.style,
          input: text,
        })

        // result 已经是纯文本字符串（StringOutputParser 处理过了）
        this.messages[aiMsgIndex].content = result
      } catch (err) {
        console.error('[Stage2 Error]', err)
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