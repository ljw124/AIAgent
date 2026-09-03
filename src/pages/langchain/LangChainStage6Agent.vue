<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-08-27 18:45:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-03 10:45:41
 * @Description: 阶段六：Agent — 智能体（增强版）
 *   学习目标：用 createReactAgent 自动处理工具调用循环
 *   核心 API：createReactAgent()、Agent 自动循环
 *   增强特性：
 *     1. Agent 名称：name 选项
 *     2. 系统提示词：prompt 选项（替代已废弃的 messageModifier）
 *     3. 结构化输出：responseFormat + zod schema（structuredResponse 状态键）
 *     4. 流式输出：agent.stream(inputs, { streamMode: 'values' }) 逐步骤输出
 *   对比阶段五：不再手动 while 循环处理 tool_calls
-->
<template>
  <div>
    <h1>阶段六：Agent 智能体 <span class="badge stage">学习</span></h1>
    <div class="info-box">
      <strong>学习目标：</strong>用 <code>createReactAgent()</code> 自动处理工具调用循环<br />
      <strong>核心 API：</strong><code>createReactAgent()</code>、Agent 自动 Think→Act→Observe 循环<br />
      <strong>增强特性：</strong>Agent 名称、系统提示词、结构化输出、流式输出<br />
      <strong>对比阶段五：</strong>不再手动 <code>while</code> 循环处理 tool_calls，Agent 自动完成
    </div>

    <!-- 功能开关配置 -->
    <div class="config-section">
      <div class="config-row">
        <label>Agent 名称：</label>
        <input v-model="agentName" class="config-input" placeholder="如：天气助手" />
      </div>
      <div class="config-row">
        <label>系统提示词：</label>
        <textarea v-model="systemPrompt" class="config-textarea" rows="2"
          placeholder="定义 Agent 的角色、行为规范、回答风格"></textarea>
      </div>
      <div class="config-row">
        <label>功能开关：</label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="enableStructured" />
          <span>结构化输出（responseFormat）</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="enableStream" />
          <span>流式输出（stream）</span>
        </label>
      </div>
    </div>

    <div class="input-section">
      <textarea
        v-model="input"
        placeholder="试试问：北京和上海今天哪个更热？ 温差多少？ 现在是几点？ 100天后是几号？"
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
      <div class="agent-steps-title">🧠 Agent 思考过程（{{ agentName }}）</div>
      <div v-for="(step, i) in agentSteps" :key="i" class="agent-step-item">
        <div class="step-number">步骤 {{ i + 1 }}</div>
        <div v-if="step.thought" class="step-thought">💭 思考: {{ step.thought }}</div>
        <div v-if="step.action" class="step-action">🔧 行动: {{ step.action }}</div>
        <div v-if="step.observation" class="step-observation">👁️ 观察: {{ step.observation }}</div>
      </div>
    </div>

    <!-- 结构化输出展示 -->
    <div v-if="structuredResponse" class="structured-panel">
      <div class="structured-title">📋 结构化输出（structuredResponse）</div>
      <pre class="structured-json">{{ JSON.stringify(structuredResponse, null, 2) }}</pre>
    </div>

    <!-- 流式统计 -->
    <div v-if="streamStats" class="stream-stats">
      <span>📊 流式统计：共 {{ streamStats.steps }} 个步骤，{{ streamStats.tokens }} 个 token，耗时 {{ streamStats.duration }}ms</span>
    </div>

    <div class="chat-history" ref="chatHistory">
      <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
        <div class="role-label">{{ msg.role === 'user' ? '你' : agentName }}</div>
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
      structuredResponse: null, // 结构化输出结果
      streamStats: null, // 流式统计 { steps, tokens, duration }
      // 配置项
      agentName: 'AI助手',
      systemPrompt: '你是一个有用的AI助手，可以使用工具来回答问题。回答请用中文。',
      enableStructured: true,
      enableStream: true
    }
  },

  watch: {
    messages: {
      deep: true,
      handler() { this.$nextTick(() => this.scrollToBottom()) }
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
            expression: z.string().describe('数学表达式')
          })
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
            timezone: z.string().optional().describe('时区')
          })
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
            '杭州': { temp: 30, condition: '阴', humidity: '60%' }
          }
          const data = weatherData[city] || { temp: 25, condition: '未知', humidity: '50%' }
          return `${city}天气：${data.condition}，温度 ${data.temp}°C，湿度 ${data.humidity}`
        },
        {
          name: 'get_weather',
          description: '查询指定城市的天气信息。',
          schema: z.object({
            city: z.string().describe('城市名称')
          })
        }
      )
    },

    // ============================================================
    // 构建 Agent（含名称、系统提示词、结构化输出）
    // ============================================================
    buildAgent() {
      const tools = [
        this.createCalculatorTool(),
        this.createTimeTool(),
        this.createWeatherTool()
      ]

      const llm = new ChatOpenAI({
        model: 'EB-DeepSeek-V4-Pro',
        apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
        temperature: 0,
        configuration: {
          baseURL: window.location.origin + '/inner/'
        }
      })

      const params = {
        llm,
        tools,
        // 1. Agent 名称：name 选项。主要用于多 Agent 场景（supervisor），让 supervisor LLM 能识别这个 agent
        name: this.agentName || 'AI助手',
        includeAgentName: 'inline', // 单 Agent 下通常不需要显示名称
        // 2. 系统提示词：prompt 选项（替代已废弃的 messageModifier）
        //    prompt 接收完整图状态，返回 SystemMessage 列表
        prompt: this.systemPrompt || '你是一个有用的AI助手，可以使用工具来回答问题。回答请用中文。'
      }

      // 3. 结构化输出：responseFormat + zod schema
      //    会在 Agent 循环结束后额外调用一次 LLM，将最终回复格式化为 schema 结构
      if (this.enableStructured) {
        params.responseFormat = {
          schema: z.object({
            answer: z.string().describe('对用户问题的最终回答'),
            cities: z.array(z.string()).describe('涉及的城市列表'),
            temperatureDiff: z.number().nullable().describe('城市之间的温差，若无则为 null')
          }),
          prompt: '请将 Agent 的最终回复整理为结构化 JSON 输出。',
          // 显式指定结构化输出策略（ContentStrategy）为 jsonSchema。可选值：'jsonSchema' | 'functionCalling'(ToolStrategy) | 'jsonMode'
          method: 'jsonSchema'
        }
      }

      return createReactAgent(params)
    },

    async send() {
      const text = this.input.trim()
      if (!text || this.loading) return

      this.messages.push({ role: 'user', content: text })
      this.input = ''
      this.error = null
      this.loading = true
      this.agentSteps = []
      this.structuredResponse = null
      this.streamStats = null

      this.messages.push({ role: 'assistant', content: '' })
      const aiMsgIndex = this.messages.length - 1

      try {
        // ============================================================
        // 阶段六核心：使用 createReactAgent 自动处理工具循环
        // ============================================================
        const agent = this.buildAgent()

        const historyMessages = this.messages
          .slice(0, -1)
          .map((msg) => {
            if (msg.role === 'user') return new HumanMessage(msg.content)
            if (msg.role === 'assistant') return new AIMessage(msg.content)
            return null
          })
          .filter(Boolean)

        const inputs = { messages: historyMessages }

        if (this.enableStream) {
          // ============================================================
          // 4. 流式输出：agent.stream(inputs, { streamMode: 'values' })
          //    streamMode: 'values' 会在每个节点执行后返回完整状态（含 messages）
          //    这样既能实时展示思考过程，也能逐 token 展示最终回复
          // ============================================================
          const startTime = Date.now()
          let stepCount = 0
          let tokenCount = 0

          const stream = await agent.stream(inputs, { streamMode: 'values' })

          for await (const state of stream) {
            stepCount++
            const msgs = state.messages || []
            const lastMsg = msgs[msgs.length - 1]

            // 实时更新思考过程
            this.extractSteps(msgs)

            // 实时更新最终回复（打字机效果）
            if (lastMsg && lastMsg._getType && lastMsg._getType() === 'ai') {
              const content = typeof lastMsg.content === 'string' ? lastMsg.content : ''
              if (content) {
                this.messages[aiMsgIndex].content = content
                tokenCount = content.length
              }
            }

            // 结构化输出：流式结束后从最终状态读取
            if (state.structuredResponse) {
              this.structuredResponse = state.structuredResponse
            }
          }

          this.streamStats = {
            steps: stepCount,
            tokens: tokenCount,
            duration: Date.now() - startTime
          }
        } else {
          // ============================================================
          // 对比：invoke() 一次性返回
          // ============================================================
          const result = await agent.invoke(inputs)

          // 提取 Agent 的中间步骤（思考过程）
          this.extractSteps(result.messages || [])

          // 提取最终回复（最后一条 AIMessage）
          // 注意：不能用 m.constructor.name === 'AIMessage' 判断，
          // 因为 webpack 打包后类名可能被混淆（minify），导致判断失败。
          // 使用 LangChain 的 _getType() 方法更可靠，返回 'ai' / 'human' / 'tool' 等。
          const allMessages = result.messages || []
          const finalMessage = [...allMessages].reverse().find(
            (m) => m._getType && m._getType() === 'ai' && m.content
          )
          this.messages[aiMsgIndex].content = finalMessage
            ? finalMessage.content
            : '(Agent 未返回文本回复)'

          // 结构化输出
          if (result.structuredResponse) {
            this.structuredResponse = result.structuredResponse
          }
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

    // 从消息列表中提取 Agent 的思考过程（工具调用步骤）
    extractSteps(allMessages) {
      const steps = []
      for (let i = 0; i < allMessages.length; i++) {
        const msg = allMessages[i]
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          const toolResults = []
          for (let j = i + 1; j < allMessages.length; j++) {
            // 用 _getType() 判断消息类型，避免 constructor.name 被 webpack 混淆
            if (allMessages[j]._getType && allMessages[j]._getType() === 'tool') {
              toolResults.push(allMessages[j].content)
            } else {
              break
            }
          }
          steps.push({
            thought: msg.content || '(思考中...)',
            action: msg.tool_calls.map((tc) => `${tc.name}(${JSON.stringify(tc.args)})`).join(', '),
            observation: toolResults.join(' | ')
          })
        }
      }
      this.agentSteps = steps
    },

    clear() {
      this.messages = []
      this.agentSteps = []
      this.structuredResponse = null
      this.streamStats = null
      this.error = null
    },

    scrollToBottom() {
      const el = this.$refs.chatHistory
      if (el) el.scrollTop = el.scrollHeight
    }
  }
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
  gap: 12px;
  margin-bottom: 8px;
}

.config-row:last-child {
  margin-bottom: 0;
}

.config-row > label:first-child {
  font-weight: 600;
  font-size: 14px;
  color: #0369a1;
  min-width: 90px;
}

.config-input {
  flex: 1;
  max-width: 300px;
  padding: 6px 10px;
  border: 1px solid #bae6fd;
  border-radius: 6px;
  font-size: 13px;
}

.config-textarea {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid #bae6fd;
  border-radius: 6px;
  font-size: 13px;
  resize: vertical;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: #334155;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  accent-color: #3b82f6;
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

.structured-panel {
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.structured-title {
  font-weight: 700;
  font-size: 14px;
  color: #5b21b6;
  margin-bottom: 8px;
}

.structured-json {
  background: #1e1b4b;
  color: #c4b5fd;
  border-radius: 6px;
  padding: 12px;
  font-size: 12px;
  overflow-x: auto;
  margin: 0;
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