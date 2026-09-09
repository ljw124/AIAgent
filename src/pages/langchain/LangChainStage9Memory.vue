<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-09 10:00:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-09 14:25:04
 * @Description: 阶段九：短期记忆 Memory — LangChain.js MemorySaver 短期记忆演示
 *   学习目标：理解 LangGraph 的 MemorySaver Checkpoint 机制，实现多轮对话记忆
 *   核心 API：MemorySaver、createReactAgent(checkpointer)、thread_id 隔离
 *   对比阶段六：Agent 每次调用都重新构建，无记忆能力；本阶段注入 MemorySaver 实现上下文保持
-->
<template>
  <div>
    <h1>阶段九：短期记忆 Memory <span class="badge stage">学习</span></h1>
    <div class="info-box">
      <strong>学习目标：</strong>理解 LangGraph 的 <code>MemorySaver</code> Checkpoint 机制，实现多轮对话上下文记忆<br />
      <strong>核心 API：</strong><code>MemorySaver</code>（短期记忆）、<code>createReactAgent({ checkpointer })</code>（注入记忆）、<code>thread_id</code>（线程隔离）<br />
      <strong>对比阶段六：</strong>Agent 每次调用都重新构建，无记忆能力；本阶段注入 <code>MemorySaver</code> 实现上下文保持
    </div>

    <!-- 记忆配置 -->
    <div class="config-section">
      <div class="config-title">🧠 短期记忆配置</div>
      <div class="config-row">
        <label>当前线程 ID：</label>
        <input
          v-model="currentThreadId"
          class="config-input thread-id-input"
          placeholder="如：user-session-001"
        />
        <button @click="switchThread" class="btn-switch" :disabled="loading">
          🔄 切换线程
        </button>
        <button @click="deleteCurrentThread" class="btn-delete" :disabled="loading">
          🗑️ 删除当前线程
        </button>
        <label class="ml-24">线程列表：</label>
        <div class="thread-list">
          <span
            v-for="tid in threadIds"
            :key="tid"
            :class="['thread-tag', { active: tid === currentThreadId }]"
            @click="selectThread(tid)"
          >
            {{ tid }}
            <span class="thread-tag-msg-count">({{ getThreadMessageCount(tid) }})</span>
          </span>
          <span v-if="threadIds.length === 0" class="thread-empty">暂无线程，发送消息后自动创建</span>
        </div>
      </div>
      <div class="config-row">
        <label>功能开关：</label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="enableMemory" />
          <span>启用短期记忆（MemorySaver）</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="enableStream" />
          <span>流式输出（stream）</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="showCheckpoints" />
          <span>显示 Checkpoint 详情</span>
        </label>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-section">
      <textarea
        v-model="input"
        placeholder="试试多轮对话：先告诉 Agent 你的名字，再问它你叫什么名字 || 北京今天天气怎么样？ / 当前时间？ / 计算 (123 + 456) * 789 / 10"
        rows="3"
        @keydown.ctrl.enter="send"
      ></textarea>
      <button @click="send" :disabled="loading">
        {{ loading ? '请求中...' : '发送 (Ctrl+Enter)' }}
      </button>
      <button @click="clearAll" class="btn-clear">清空全部</button>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- 记忆状态提示 -->
    <div v-if="enableMemory && messages.length > 0" class="memory-status">
      <span>🧠 短期记忆已启用</span>
      <span class="memory-thread">线程：{{ currentThreadId }}</span>
      <span class="memory-rounds">对话轮次：{{ Math.floor(messages.length / 2) }}</span>
      <span class="memory-tokens" v-if="memoryTokens.total > 0" :title="`Prompt: ${memoryTokens.prompt} | Completion: ${memoryTokens.completion}`">
        🪙 累计 Token：{{ memoryTokens.total.toLocaleString() }}
      </span>
    </div>

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

    <!-- Checkpoint 详情面板 -->
    <div v-if="showCheckpoints && checkpointInfo.length > 0" class="checkpoint-panel">
      <div class="checkpoint-title">📋 Checkpoint 历史（线程：{{ currentThreadId }}）</div>
      <div v-for="(cp, i) in checkpointInfo" :key="i" class="checkpoint-item">
        <div class="cp-header">
          <span class="cp-id">#{{ i + 1 }} ID: {{ cp.id }}</span>
          <span class="cp-time">{{ cp.timestamp }}</span>
        </div>
        <div class="cp-detail">
          <span>消息数：{{ cp.messageCount }}</span>
          <span v-if="cp.parentId">父节点：{{ cp.parentId }}</span>
        </div>
      </div>
    </div>

    <!-- 流式统计 -->
    <div v-if="streamStats" class="stream-stats">
      <span>📊 流式统计：共 {{ streamStats.steps }} 个步骤，{{ streamStats.tokens }} 个 token，耗时 {{ streamStats.duration }}ms</span>
    </div>

    <!-- 对话历史 -->
    <div class="chat-history" ref="chatHistory">
      <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
        <div class="role-label">{{ msg.role === 'user' ? '你' : 'AI助手' }}</div>
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
import { MemorySaver } from '@langchain/langgraph'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { z } from 'zod'

export default {
  name: 'LangChainStage9Memory',

  data() {
    return {
      input: '',
      messages: [],
      loading: false,
      error: null,
      agentSteps: [],
      checkpointInfo: [],
      streamStats: null,
      // 配置项
      currentThreadId: 'user-session-001',
      enableMemory: true,
      enableStream: true,
      showCheckpoints: false,
      // 线程管理：threadId → messages 数组
      threadMessages: {},
      // 全局 MemorySaver 实例（所有线程共享同一个实例）
      memorySaver: null,
      // 线程 ID 列表
      threadIds: ['user-session-001'],
      // Token 统计：当前线程累计消耗
      memoryTokens: { prompt: 0, completion: 0, total: 0 },
      // 线程 Token 统计：threadId → { prompt, completion, total }
      threadTokens: {},
    }
  },

  watch: {
    messages: {
      deep: true,
      handler() { this.$nextTick(() => this.scrollToBottom()) }
    },
  },

  created() {
    // 创建全局 MemorySaver 实例
    this.memorySaver = new MemorySaver()
    // 初始化当前线程的消息
    this.threadMessages[this.currentThreadId] = []
    // 初始化当前线程的 Token 统计
    this.threadTokens[this.currentThreadId] = { prompt: 0, completion: 0, total: 0 }
  },

  methods: {
    // ============================================================
    // 获取 MemorySaver 实例（根据开关决定是否启用）
    // ============================================================
    getMemorySaver() {
      return this.enableMemory ? this.memorySaver : undefined
    },

    // ============================================================
    // 定义工具
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
    // 构建 Agent（注入 MemorySaver）
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
        name: 'AI助手',
        prompt: '你是一个有用的AI助手，可以使用工具来回答问题。请记住对话历史中的上下文信息（如用户的名字、偏好等）。回答请用中文。'
      }

      // 注入 MemorySaver（核心：短期记忆）
      const memory = this.getMemorySaver()
      if (memory) {
        params.checkpointer = memory
      }

      return createReactAgent(params)
    },

    // ============================================================
    // 发送消息
    // ============================================================
    async send() {
      const text = this.input.trim()
      if (!text || this.loading) return

      this.messages.push({ role: 'user', content: text })
      this.input = ''
      this.error = null
      this.loading = true
      this.agentSteps = []
      this.checkpointInfo = []
      this.streamStats = null

      this.messages.push({ role: 'assistant', content: '' })
      const aiMsgIndex = this.messages.length - 1

      try {
        const agent = this.buildAgent()

        // 构建历史消息（LangChain 格式）
        const historyMessages = this.messages
          .slice(0, -1)
          .map((msg) => {
            if (msg.role === 'user') return new HumanMessage(msg.content)
            if (msg.role === 'assistant') return new AIMessage(msg.content)
            return null
          })
          .filter(Boolean)

        const inputs = { messages: historyMessages }

        // thread_id 配置（核心：线程隔离）
        const config = {
          configurable: { thread_id: this.currentThreadId }
        }

        if (this.enableStream) {
          // 流式输出 + 记忆
          const startTime = Date.now()
          let stepCount = 0
          let tokenCount = 0
          let lastState = null

          const stream = await agent.stream(inputs, {
            ...config,
            streamMode: 'values'
          })

          for await (const state of stream) {
            stepCount++
            lastState = state
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
          }

          this.streamStats = {
            steps: stepCount,
            tokens: tokenCount,
            duration: Date.now() - startTime
          }

          // 从最终 state 的 messages 中提取 token 使用量
          if (lastState) {
            this.accumulateTokens(lastState.messages || [])
          }
        } else {
          // 非流式调用
          const result = await agent.invoke(inputs, config)

          this.extractSteps(result.messages || [])

          const allMessages = result.messages || []
          const finalMessage = [...allMessages].reverse().find(
            (m) => m._getType && m._getType() === 'ai' && m.content
          )
          this.messages[aiMsgIndex].content = finalMessage
            ? finalMessage.content
            : '(Agent 未返回文本回复)'

          // 从 result 的 messages 中提取 token 使用量
          this.accumulateTokens(allMessages)
        }

        // 保存当前线程消息
        this.saveThreadMessages()

        // 更新 Checkpoint 信息
        if (this.showCheckpoints && this.enableMemory) {
          await this.loadCheckpointInfo()
        }
      } catch (err) {
        console.error('[Stage9 Error]', err)
        this.error = `请求失败: ${err.message}`
        if (!this.messages[aiMsgIndex].content) {
          this.messages.splice(aiMsgIndex, 1)
        }
      } finally {
        this.loading = false
      }
    },

    // ============================================================
    // 从 LangChain messages 中提取并累加 token 使用量
    // ============================================================
    accumulateTokens(messages) {
      let promptTokens = 0
      let completionTokens = 0

      for (const msg of messages) {
        // AIMessage 的 response_metadata 中包含 tokenUsage
        // 结构: { tokenUsage: { promptTokens, completionTokens, totalTokens } }
        const meta = msg.response_metadata || {}
        const usage = meta.tokenUsage || meta.token_usage || {}
        if (usage.promptTokens) promptTokens += usage.promptTokens
        if (usage.completionTokens) completionTokens += usage.completionTokens

        // 兼容：某些模型将 token 信息放在 additional_kwargs 中
        const addKwargs = msg.additional_kwargs || {}
        const addUsage = addKwargs.tokenUsage || addKwargs.token_usage || addKwargs.usage || {}
        if (addUsage.promptTokens && !usage.promptTokens) promptTokens += addUsage.promptTokens
        if (addUsage.completionTokens && !usage.completionTokens) completionTokens += addUsage.completionTokens
      }

      if (promptTokens > 0 || completionTokens > 0) {
        this.memoryTokens.prompt += promptTokens
        this.memoryTokens.completion += completionTokens
        this.memoryTokens.total += promptTokens + completionTokens
        // 同步保存到线程 token 统计
        this.threadTokens[this.currentThreadId] = { ...this.memoryTokens }
      }
    },

    // ============================================================
    // 从消息列表中提取 Agent 的思考过程
    // ============================================================
    extractSteps(allMessages) {
      const steps = []
      for (let i = 0; i < allMessages.length; i++) {
        const msg = allMessages[i]
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          const toolResults = []
          for (let j = i + 1; j < allMessages.length; j++) {
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

    // ============================================================
    // 加载 Checkpoint 信息
    // ============================================================
    async loadCheckpointInfo() {
      if (!this.memorySaver) return

      try {
        const config = { configurable: { thread_id: this.currentThreadId } }
        const cpList = []

        for await (const tuple of this.memorySaver.list(config, { limit: 20 })) {
          cpList.push({
            id: tuple.checkpoint.id ? tuple.checkpoint.id.substring(0, 8) : '?',
            timestamp: tuple.checkpoint.ts
              ? new Date(tuple.checkpoint.ts).toLocaleString('zh-CN')
              : '?',
            messageCount: tuple.checkpoint.channel_values?.messages?.length || 0,
            parentId: tuple.parentConfig?.configurable?.checkpoint_id
              ? tuple.parentConfig.configurable.checkpoint_id.substring(0, 8)
              : null
          })
        }

        this.checkpointInfo = cpList.reverse()
      } catch (err) {
        console.error('[Checkpoint] 加载失败:', err)
      }
    },

    // ============================================================
    // 线程管理
    // ============================================================
    saveThreadMessages() {
      this.threadMessages[this.currentThreadId] = [...this.messages]
      // 同步保存当前线程的 Token 统计
      this.threadTokens[this.currentThreadId] = { ...this.memoryTokens }
    },

    switchThread() {
      // 保存当前线程消息和 Token
      this.saveThreadMessages()

      // 生成新线程 ID
      const newId = `user-session-${Date.now()}`
      this.currentThreadId = newId
      this.threadMessages[newId] = []
      this.threadTokens[newId] = { prompt: 0, completion: 0, total: 0 }
      if (!this.threadIds.includes(newId)) {
        this.threadIds.push(newId)
      }

      // 切换到新线程
      this.messages = []
      this.memoryTokens = { prompt: 0, completion: 0, total: 0 }
      this.agentSteps = []
      this.checkpointInfo = []
      this.streamStats = null
      this.error = null
    },

    selectThread(threadId) {
      if (threadId === this.currentThreadId || this.loading) return

      // 保存当前线程消息和 Token
      this.saveThreadMessages()

      // 切换到目标线程
      this.currentThreadId = threadId
      this.messages = this.threadMessages[threadId] || []
      this.memoryTokens = this.threadTokens[threadId] || { prompt: 0, completion: 0, total: 0 }
      this.agentSteps = []
      this.checkpointInfo = []
      this.streamStats = null
      this.error = null

      // 加载 Checkpoint 信息
      if (this.showCheckpoints && this.enableMemory) {
        this.loadCheckpointInfo()
      }
    },

    async deleteCurrentThread() {
      if (this.loading) return

      const tid = this.currentThreadId

      // 删除 MemorySaver 中的线程数据
      if (this.memorySaver) {
        try {
          await this.memorySaver.deleteThread(tid)
        } catch (err) {
          console.error('[MemorySaver] 删除线程失败:', err)
        }
      }

      // 删除本地线程数据
      delete this.threadMessages[tid]
      delete this.threadTokens[tid]
      this.threadIds = this.threadIds.filter((id) => id !== tid)

      // 如果还有其他线程，切换到第一个；否则创建新线程
      if (this.threadIds.length > 0) {
        this.selectThread(this.threadIds[0])
      } else {
        const newId = `user-session-${Date.now()}`
        this.currentThreadId = newId
        this.threadMessages[newId] = []
        this.threadTokens[newId] = { prompt: 0, completion: 0, total: 0 }
        this.threadIds.push(newId)
        this.messages = []
        this.memoryTokens = { prompt: 0, completion: 0, total: 0 }
        this.agentSteps = []
        this.checkpointInfo = []
        this.streamStats = null
      }
    },

    getThreadMessageCount(threadId) {
      const msgs = this.threadMessages[threadId] || []
      return msgs.length
    },

    // ============================================================
    // 清空全部
    // ============================================================
    clearAll() {
      this.messages = []
      this.memoryTokens = { prompt: 0, completion: 0, total: 0 }
      this.agentSteps = []
      this.checkpointInfo = []
      this.streamStats = null
      this.error = null

      // 清空当前线程的本地消息和 Token
      this.threadMessages[this.currentThreadId] = []
      this.threadTokens[this.currentThreadId] = { prompt: 0, completion: 0, total: 0 }

      // 删除 MemorySaver 中当前线程的数据
      if (this.memorySaver) {
        this.memorySaver.deleteThread(this.currentThreadId).catch((err) => {
          console.error('[MemorySaver] 清空线程失败:', err)
        })
      }
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
  background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%);
  color: #fff;
}

.config-section {
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
}

.config-title {
  font-weight: 700;
  font-size: 14px;
  color: #5b21b6;
  margin-bottom: 10px;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.config-row:last-child {
  margin-bottom: 0;
}

.config-row > label:first-child {
  font-weight: 600;
  font-size: 14px;
  color: #6d28d9;
  min-width: 90px;
}

.config-input {
  padding: 6px 10px;
  border: 1px solid #ddd6fe;
  border-radius: 6px;
  font-size: 13px;
}

.thread-id-input {
  flex: 1;
  max-width: 260px;
  font-family: monospace;
}

.btn-switch {
  padding: 6px 14px;
  background: #8b5cf6;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.btn-switch:hover {
  background: #7c3aed;
}

.btn-switch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-delete {
  padding: 6px 14px;
  background: #ef4444;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.btn-delete:hover {
  background: #dc2626;
}

.btn-delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.thread-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.ml-24 {
  margin-left: 24px;
}

.thread-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #ede9fe;
  border: 1px solid #c4b5fd;
  border-radius: 20px;
  font-size: 12px;
  font-family: monospace;
  color: #5b21b6;
  cursor: pointer;
  transition: all 0.2s;
}

.thread-tag:hover {
  background: #ddd6fe;
  border-color: #8b5cf6;
}

.thread-tag.active {
  background: #8b5cf6;
  color: #fff;
  border-color: #7c3aed;
}

.thread-tag-msg-count {
  font-size: 11px;
  opacity: 0.8;
}

.thread-empty {
  font-size: 13px;
  color: #9ca3af;
  font-style: italic;
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
  accent-color: #8b5cf6;
}

.memory-status {
  display: flex;
  align-items: center;
  gap: 16px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 8px;
  padding: 8px 16px;
  margin-bottom: 16px;
  font-size: 13px;
  color: #065f46;
  font-weight: 600;
}

.memory-thread {
  font-family: monospace;
  font-size: 12px;
  color: #047857;
}

.memory-rounds {
  color: #059669;
}

.memory-tokens {
  margin-left: auto;
  color: #b45309;
  cursor: help;
  font-family: monospace;
  font-size: 12px;
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

.checkpoint-panel {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.checkpoint-title {
  font-weight: 700;
  font-size: 14px;
  color: #92400e;
  margin-bottom: 8px;
}

.checkpoint-item {
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 6px;
  font-size: 12px;
}

.cp-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.cp-id {
  font-family: monospace;
  font-weight: 600;
  color: #92400e;
}

.cp-time {
  color: #a16207;
}

.cp-detail {
  display: flex;
  gap: 16px;
  color: #b45309;
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
  color: #8b5cf6;
  font-weight: 700;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
</style>