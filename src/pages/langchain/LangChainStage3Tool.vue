<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-08-27 18:40:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-08-27 18:40:00
 * @Description: 阶段三：Tool Calling — 工具调用
 *   学习目标：让 LLM 调用外部函数获取实时数据
 *   核心 API：tool()、bindTools()、AIMessage.tool_calls、ToolMessage
 *   注意：这是手动处理 tool_calls 循环，阶段四 Agent 会自动处理
-->
<template>
  <div>
    <h1>阶段三：Tool Calling <span class="badge stage">学习</span></h1>
    <div class="info-box">
      <strong>学习目标：</strong>让 LLM 调用外部函数（计算器、天气查询等）<br />
      <strong>核心 API：</strong><code>tool()</code>、<code>bindTools()</code>、<code>ToolMessage</code><br />
      <strong>流程：</strong>用户问题 → LLM 决定调用工具 → 执行工具 → 返回结果 → LLM 生成最终回复
    </div>

    <div class="input-section">
      <textarea
        v-model="input"
        placeholder="试试问：北京今天天气怎么样？ / 计算 (123 + 456) * 789 / 10"
        rows="3"
        @keydown.ctrl.enter="send"
      ></textarea>
      <button @click="send" :disabled="loading">
        {{ loading ? '请求中...' : '发送 (Ctrl+Enter)' }}
      </button>
      <button @click="clear" class="btn-clear">清空对话</button>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- 工具调用详情展示 -->
    <div v-if="toolCalls.length > 0" class="tool-calls-panel">
      <div class="tool-calls-title">🔧 工具调用详情（最近一次）</div>
      <div v-for="(tc, i) in toolCalls" :key="i" class="tool-call-item">
        <div class="tool-name">{{ tc.name }}</div>
        <div class="tool-args">参数: {{ JSON.stringify(tc.args) }}</div>
        <div class="tool-result">结果: {{ tc.result }}</div>
      </div>
    </div>

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
import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'

export default {
  name: 'LangChainStage3Tool',

  data() {
    return {
      input: '',
      messages: [],
      loading: false,
      error: null,
      toolCalls: [], // 展示最近一次工具调用详情
    }
  },

  watch: {
    messages: {
      deep: true,
      handler() { this.$nextTick(() => this.scrollToBottom()) },
    },
  },

  methods: {
    // ============================================================
    // 定义工具（Tool）
    // ============================================================

    /**
     * 工具1：计算器
     * 用 Zod schema 定义参数类型和描述，LLM 会根据描述决定何时调用
     */
    createCalculatorTool() {
      return tool(
        async ({ expression }) => {
          // 安全计算：只允许数字和基本运算符
          const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '')
          try {
            // eslint-disable-next-line no-eval
            const result = eval(sanitized)
            return `计算结果: ${expression} = ${result}`
          } catch (e) {
            return `计算错误: ${e.message}`
          }
        },
        {
          name: 'calculator',
          description: '执行数学计算。支持加减乘除、括号、百分比。当用户需要进行数学计算时调用此工具。',
          schema: z.object({
            expression: z.string().describe('数学表达式，如 "(123 + 456) * 789 / 10"'),
          }),
        }
      )
    },

    /**
     * 工具2：获取当前时间
     */
    createTimeTool() {
      return tool(
        async ({ timezone }) => {
          const now = new Date()
          const timeStr = now.toLocaleString('zh-CN', { timeZone: timezone || 'Asia/Shanghai' })
          return `当前时间（${timezone || 'Asia/Shanghai'}）: ${timeStr}`
        },
        {
          name: 'get_current_time',
          description: '获取当前日期和时间。当用户询问现在几点、今天日期时调用。',
          schema: z.object({
            timezone: z.string().optional().describe('时区，如 Asia/Shanghai，默认为北京时间'),
          }),
        }
      )
    },

    /**
     * 工具3：模拟天气查询
     */
    createWeatherTool() {
      return tool(
        async ({ city }) => {
          // 模拟天气数据（实际项目中应调用真实天气 API）
          const weatherData = {
            '北京': { temp: 28, condition: '晴', humidity: '45%' },
            '上海': { temp: 32, condition: '多云', humidity: '65%' },
            '广州': { temp: 35, condition: '雷阵雨', humidity: '80%' },
            '深圳': { temp: 33, condition: '阵雨', humidity: '75%' },
            '杭州': { temp: 30, condition: '阴', humidity: '60%' },
          }
          const data = weatherData[city] || { temp: 25, condition: '未知', humidity: '50%' }
          return `${city}天气：${data.condition}，温度 ${data.temp}°C，湿度 ${data.humidity}`
        },
        {
          name: 'get_weather',
          description: '查询指定城市的天气信息。当用户询问天气时调用此工具。',
          schema: z.object({
            city: z.string().describe('城市名称，如 北京、上海、广州'),
          }),
        }
      )
    },

    async send() {
      const text = this.input.trim()
      if (!text || this.loading) return

      this.messages.push({ role: 'user', content: text })
      this.input = ''
      this.error = null
      this.loading = true
      this.toolCalls = []

      this.messages.push({ role: 'assistant', content: '' })
      const aiMsgIndex = this.messages.length - 1

      try {
        // ============================================================
        // 阶段三核心：Tool Calling 手动循环
        // ============================================================

        // 1. 创建工具列表
        const tools = [
          this.createCalculatorTool(),
          this.createTimeTool(),
          this.createWeatherTool(),
        ]

        // 2. 创建模型并绑定工具
        const llm = new ChatOpenAI({
          model: 'EB-DeepSeek-V4-Pro',
          apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
          temperature: 0,
          configuration: {
            baseURL: window.location.origin + '/inner/',
          },
        })

        // bindTools 让模型知道有哪些工具可用
        const llmWithTools = llm.bindTools(tools)

        // 3. 构造消息（不含空的 assistant 占位）
        const historyMessages = this.messages
          .slice(0, -1)
          .map((msg) => {
            if (msg.role === 'user') return new HumanMessage(msg.content)
            if (msg.role === 'assistant') return new AIMessage(msg.content)
            return null
          })
          .filter(Boolean)

        // 4. 第一次调用：LLM 决定是否需要调用工具
        let response = await llmWithTools.invoke(historyMessages)

        // 5. 手动处理 tool_calls 循环
        //    如果 LLM 返回了 tool_calls，执行工具并将结果返回
        const MAX_TOOL_ITERATIONS = 5
        let iteration = 0

        while (response.tool_calls && response.tool_calls.length > 0 && iteration < MAX_TOOL_ITERATIONS) {
          iteration++

          // 记录工具调用详情（用于 UI 展示）
          const callDetails = []

          // 执行每个工具调用
          const toolMessages = []
          for (const toolCall of response.tool_calls) {
            const selectedTool = tools.find((t) => t.name === toolCall.name)
            if (selectedTool) {
              const result = await selectedTool.invoke(toolCall.args)
              toolMessages.push(new ToolMessage({
                content: result,
                tool_call_id: toolCall.id,
              }))
              callDetails.push({
                name: toolCall.name,
                args: toolCall.args,
                result: result,
              })
            }
          }

          this.toolCalls = callDetails

          // 将工具结果追加到消息列表，再次调用 LLM
          const allMessages = [
            ...historyMessages,
            response,           // AIMessage（含 tool_calls）
            ...toolMessages,    // ToolMessage（工具执行结果）
          ]

          response = await llmWithTools.invoke(allMessages)
        }

        // 6. 最终回复
        this.messages[aiMsgIndex].content = response.content || '(模型未返回文本内容)'
      } catch (err) {
        console.error('[Stage3 Error]', err)
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
      this.toolCalls = []
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

.tool-calls-panel {
  background: #fefce8;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.tool-calls-title {
  font-weight: 700;
  font-size: 14px;
  color: #92400e;
  margin-bottom: 8px;
}

.tool-call-item {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 6px;
  font-size: 13px;
}

.tool-name {
  font-weight: 700;
  color: #b45309;
  margin-bottom: 4px;
}

.tool-args {
  color: #78716c;
  font-family: monospace;
  margin-bottom: 2px;
}

.tool-result {
  color: #065f46;
}
</style>