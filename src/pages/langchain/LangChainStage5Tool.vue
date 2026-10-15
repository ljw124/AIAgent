<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-08-27 18:40:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-10-15 10:05:57
 * @Description: 阶段五：Tool Calling — 工具调用
 *   学习目标：让 LLM 调用外部函数获取实时数据
 *   核心 API：tool()、bindTools()、AIMessage.tool_calls、ToolMessage
 *   注意：这是手动处理 tool_calls 循环，阶段六 Agent 会自动处理
-->
<template>
  <div>
    <h1>阶段五：Tool Calling <span class="badge stage">LangChain</span></h1>
    <div class="info-box">
      <strong>学习目标：</strong>让 LLM 调用外部函数（计算器、天气查询等）<br />
      <strong>核心 API：</strong><code>tool()</code>、<code>bindTools()</code>、<code>ToolMessage</code><br />
      <strong>流程：</strong>用户问题 → LLM 决定调用工具 → 执行工具 → 返回结果 → LLM 生成最终回复
    </div>

    <div class="input-section">
      <textarea
        v-model="input"
        placeholder="试试问：北京今天天气怎么样？ / 当前时间？ / 计算 (123 + 456) * 789 / 10"
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
  name: 'LangChainStage5Tool',

  data() {
    return {
      input: '',
      messages: [],
      loading: false,
      error: null,
      toolCalls: [] // 展示最近一次工具调用详情
    }
  },

  watch: {
    messages: {
      deep: true,
      handler() { this.$nextTick(() => this.scrollToBottom()) }
    }
  },

  methods: {
    // ============================================================
    // 定义工具（Tool）
    // ============================================================

    /**
     * 工具1：计算器
     * 核心 API：tool(fn, options) — 将普通函数包装为 LangChain Tool
     *   - 参数1 fn：异步函数，接收 Zod schema 定义的参数，返回字符串结果
     *   - 参数2 options.name：工具唯一标识，LLM 通过此名称决定调用哪个工具
     *   - 参数2 options.description：工具用途描述，LLM 据此判断何时调用（关键！）
     *   - 参数2 options.schema：用 Zod 定义输入参数的类型和描述
     * 注意：description 是 LLM 判断是否调用的核心依据，需准确描述触发场景
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
            expression: z.string().describe('数学表达式，如 "(123 + 456) * 789 / 10"')
          })
        }
      )
    },

    /**
     * 工具2：获取当前时间
     * 无参数工具示例：schema 中字段设为 optional，LLM 可不传参数直接调用
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
            timezone: z.string().optional().describe('时区，如 Asia/Shanghai，默认为北京时间')
          })
        }
      )
    },

    /**
     * 工具3：模拟天气查询
     * 带必填参数的工具示例：city 为必填，LLM 必须从用户输入中提取城市名
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
            '杭州': { temp: 30, condition: '阴', humidity: '60%' }
          }
          const data = weatherData[city] || { temp: 25, condition: '未知', humidity: '50%' }
          return `${city}天气：${data.condition}，温度 ${data.temp}°C，湿度 ${data.humidity}`
        },
        {
          name: 'get_weather',
          description: '查询指定城市的天气信息。当用户询问天气时调用此工具。',
          schema: z.object({
            city: z.string().describe('城市名称，如 北京、上海、广州')
          })
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
        // 阶段五核心：Tool Calling 手动循环
        // 完整流程：
        //   ① tool(fn, options) → 定义工具（函数 + Zod schema + 描述）
        //   ② llm.bindTools(tools) → 将工具列表绑定到模型
        //   ③ llmWithTools.invoke() → LLM 返回 AIMessage（含 tool_calls 或纯文本）
        //   ④ response.tool_calls → 判断 LLM 是否要求调用工具
        //   ⑤ selectedTool.invoke(args) → 执行工具函数获取结果
        //   ⑥ new ToolMessage({...}) → 将结果包装为 ToolMessage 返回给 LLM
        //   ⑦ 循环 ③~⑥ 直到 LLM 不再要求调用工具，输出最终文本回复
        // 注意：这是手动循环方式，阶段六 Agent 会自动完成此流程
        // ============================================================

        // 1. 创建工具列表
        //    tool() 返回的是 StructuredTool 实例，包含 name/schema/invoke 等属性
        const tools = [
          this.createCalculatorTool(),
          this.createTimeTool(),
          this.createWeatherTool()
        ]

        // 2. 创建模型并绑定工具
        const llm = new ChatOpenAI({
          model: 'EB-DeepSeek-V4-Pro',
          apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
          temperature: 0,
          configuration: {
            baseURL: window.location.origin + '/inner/'
          }
        })

        // 核心 API：llm.bindTools(tools)
        //   将工具列表注入模型，模型会在每次 invoke 时自动判断是否需要调用工具
        //   返回一个新的 Runnable，其 invoke() 返回的 AIMessage 可能包含 tool_calls 数组
        //   内部原理：将工具的 name/description/schema 转为 OpenAI function calling 格式
        const llmWithTools = llm.bindTools(tools)

        // 3. 构造历史消息（不含空的 assistant 占位消息）
        const historyMessages = this.messages
          .slice(0, -1)
          .map((msg) => {
            if (msg.role === 'user') return new HumanMessage(msg.content)
            if (msg.role === 'assistant') return new AIMessage(msg.content)
            return null
          })
          .filter(Boolean)

        // 4. 第一次调用：LLM 根据用户问题决定是否需要调用工具
        //    返回的 response 可能是：
        //    - AIMessage { content: '...', tool_calls: [...] }  → 需要调用工具
        //    - AIMessage { content: '...' }                      → 直接文本回复
        let response = await llmWithTools.invoke(historyMessages)

        // 5. 手动处理 tool_calls 循环
        //    response.tool_calls 是数组，每个元素包含：
        //    { name: 'calculator', args: { expression: '1+1' }, id: 'call_xxx' }
        //    MAX_TOOL_ITERATIONS 防止无限循环（如工具返回结果后 LLM 又要求调用同一工具）
        const MAX_TOOL_ITERATIONS = 5
        let iteration = 0

        while (response.tool_calls && response.tool_calls.length > 0 && iteration < MAX_TOOL_ITERATIONS) {
          iteration++

          // 记录工具调用详情（用于 UI 展示）
          const callDetails = []

          // 遍历所有 tool_calls，逐一执行
          const toolMessages = []
          for (const toolCall of response.tool_calls) {
            // 根据 toolCall.name 匹配对应的工具实例
            const selectedTool = tools.find((t) => t.name === toolCall.name)
            if (selectedTool) {
              // 核心 API：selectedTool.invoke(toolCall.args)
              //   执行工具函数，传入 LLM 提取的参数（已按 Zod schema 解析）
              //   返回工具执行结果的字符串
              const result = await selectedTool.invoke(toolCall.args)
              // 核心 API：new ToolMessage({ content, tool_call_id })
              //   将工具执行结果包装为 ToolMessage，tool_call_id 必须与 AIMessage 中的 id 对应
              //   LLM 通过 tool_call_id 将结果与调用请求关联
              toolMessages.push(new ToolMessage({
                content: result,
                tool_call_id: toolCall.id
              }))
              callDetails.push({
                name: toolCall.name,
                args: toolCall.args,
                result: result
              })
            }
          }

          this.toolCalls = callDetails

          // 将工具结果追加到消息列表，再次调用 LLM
          // 消息顺序：...历史消息 → AIMessage(含 tool_calls) → ToolMessage(工具结果)...
          // LLM 收到 ToolMessage 后会基于工具结果生成最终文本回复
          const allMessages = [
            ...historyMessages,
            response,           // AIMessage（含 tool_calls）
            ...toolMessages    // ToolMessage（工具执行结果）
          ]

          // 再次调用：LLM 可能返回最终文本，也可能再次要求调用工具
          response = await llmWithTools.invoke(allMessages)
        }

        // 6. 最终回复：循环结束后 response.content 即为 LLM 的文本回复
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
    }
  }
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