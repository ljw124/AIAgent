<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-08-27 18:45:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-02 17:15:23
 * @Description: 阶段六：Agent — 智能体
 *   学习目标：用 createReactAgent 自动处理工具调用循环
 *   核心 API：createReactAgent()、Agent 自动循环
 *   对比阶段五：不再手动 while 循环处理 tool_calls
-->
<template>
  <div>
    <h1>阶段六：Agent 智能体 <span class="badge stage">学习</span></h1>
    <div class="info-box">
      <strong>学习目标：</strong>用 <code>createReactAgent()</code> 自动处理工具调用循环<br />
      <strong>核心 API：</strong><code>createReactAgent()</code>、Agent 自动 Think→Act→Observe 循环<br />
      <strong>对比阶段五：</strong>不再手动 <code>while</code> 循环处理 tool_calls，Agent 自动完成
    </div>

    <div class="input-section">
      <textarea
        v-model="input"
        placeholder="试试问：北京和上海今天哪个更热？温差多少？ / 现在是几点？100天后是几号？"
        rows="3"
        @keydown.ctrl.enter="send"
      ></textarea>
      <button @click="send" :disabled="loading">
        {{ loading ? '请求中...' : '发送 (Ctrl+Enter)' }}
      </button>
      <button @click="clear" class="btn-clear">清空对话</button>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- Agent 思考过程展示 -->
    <div v-if="agentSteps.length > 0" class="agent-steps-panel">
      <div class="agent-steps-title">🧠 Agent 思考过程</div>
      <div v-for="(step, i) in agentSteps" :key="i" class="agent-step-item">
        <div class="step-number">步骤 {{ i + 1 }}</div>
        <div v-if="step.thought" class="step-thought">💭 思考: {{ step.thought }}</div>
        <div v-if="step.action" class="step-action">🔧 行动: {{ step.action }}</div>
        <div v-if="step.observation" class="step-observation">👁️ 观察: {{ step.observation }}</div>
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
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { z } from 'zod'

export default {
  name: 'LangChainStage6Agent',

  data() {
    return {
      input: '',
      messages: [],
      loading: false,
      error: null,
      agentSteps: [], // 展示 Agent 的思考过程
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
    // 定义工具（与阶段五相同的工具）
    // ============================================================

    createCalculatorTool() {
      return tool(
        async ({ expression }) => {
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
          description: '执行数学计算。支持加减乘除、括号、百分比。',
          schema: z.object({
            expression: z.string().describe('数学表达式'),
          }),
        }
      )
    },

    createTimeTool() {
      return tool(
        async ({ timezone }) => {
          const now = new Date()
          const timeStr = now.toLocaleString('zh-CN', { timeZone: timezone || 'Asia/Shanghai' })
          return `当前时间（${timezone || 'Asia/Shanghai'}）: ${timeStr}`
        },
        {
          name: 'get_current_time',
          description: '获取当前日期和时间。',
          schema: z.object({
            timezone: z.string().optional().describe('时区'),
          }),
        }
      )
    },

    createWeatherTool() {
      return tool(
        async ({ city }) => {
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
          description: '查询指定城市的天气信息。',
          schema: z.object({
            city: z.string().describe('城市名称'),
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
      this.agentSteps = []

      this.messages.push({ role: 'assistant', content: '' })
      const aiMsgIndex = this.messages.length - 1

      try {
        // ============================================================
        // 阶段六核心：使用 createReactAgent 自动处理工具循环
        // ============================================================

        const tools = [
          this.createCalculatorTool(),
          this.createTimeTool(),
          this.createWeatherTool(),
        ]

        const llm = new ChatOpenAI({
          model: 'EB-DeepSeek-V4-Pro',
          apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
          temperature: 0,
          configuration: {
            baseURL: window.location.origin + '/inner/',
          },
        })

        // createReactAgent：自动处理 Think → Act → Observe 循环
        // 不需要手动 while 循环！Agent 内部自动完成
        const agent = createReactAgent({
          llm,
          tools,
          // System Prompt 直接传入字符串
          messageModifier: '你是一个有用的AI助手，可以使用工具来回答问题。当需要计算、查询时间或天气时，请使用相应的工具。回答请用中文。',
        })

        // 调用 Agent
        const historyMessages = this.messages
          .slice(0, -1)
          .map((msg) => {
            if (msg.role === 'user') return new HumanMessage(msg.content)
            if (msg.role === 'assistant') return new AIMessage(msg.content)
            return null
          })
          .filter(Boolean)

        const result = await agent.invoke({
          messages: historyMessages,
        })

        // 提取 Agent 的中间步骤（思考过程）
        const allMessages = result.messages || []
        const steps = []
        for (let i = 0; i < allMessages.length; i++) {
          const msg = allMessages[i]
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            const toolResults = []
            for (let j = i + 1; j < allMessages.length; j++) {
              if (allMessages[j].constructor.name === 'ToolMessage') {
                toolResults.push(allMessages[j].content)
              } else {
                break
              }
            }
            steps.push({
              thought: msg.content || '(思考中...)',
              action: msg.tool_calls.map((tc) => `${tc.name}(${JSON.stringify(tc.args)})`).join(', '),
              observation: toolResults.join(' | '),
            })
          }
        }
        this.agentSteps = steps

        // 提取最终回复（最后一条 AIMessage）
        const finalMessage = [...allMessages].reverse().find(
          (m) => m.constructor.name === 'AIMessage' && m.content && !m.tool_calls
        )
        this.messages[aiMsgIndex].content = finalMessage
          ? finalMessage.content
          : '(Agent 未返回文本回复)'
      } catch (err) {
        console.error('[Stage4 Error]', err)
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
      this.agentSteps = []
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

.agent-steps-panel {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.agent-steps-title {
  font-weight: 700;
  font-size: 14px;
  color: #166534;
  margin-bottom: 8px;
}

.agent-step-item {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 6px;
  font-size: 13px;
}

.step-number {
  font-weight: 700;
  color: #15803d;
  margin-bottom: 4px;
}

.step-thought {
  color: #6366f1;
  margin-bottom: 2px;
}

.step-action {
  color: #d97706;
  margin-bottom: 2px;
  font-family: monospace;
}

.step-observation {
  color: #065f46;
}
</style>