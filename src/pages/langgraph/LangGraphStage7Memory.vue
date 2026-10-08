<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-09 10:00:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-10-08 19:34:05
 * @Description: 阶段七：短期记忆 MemorySaver — LangGraph Checkpoint 短期记忆演示
 *   学习目标：理解 LangGraph 的 MemorySaver Checkpoint 机制，实现多轮对话记忆
 *   核心 API：MemorySaver、createReactAgent({ checkpointer })、thread_id/checkpoint_ns 隔离
 *            graph.getState()（状态快照）、graph.getStateHistory()（历史检查点）、graph.updateState()（状态回退）
 *   对比阶段六：Agent 每次调用都重新构建，无记忆能力；本阶段注入 MemorySaver 实现上下文保持
 *   关联阶段：MemorySaver 是 interrupt（阶段五）和 Time Travel（阶段九）的基础设施
-->
<template>
  <div>
    <h1>阶段七：短期记忆 MemorySaver <span class="badge stage">LangGraph</span></h1>
    <div class="info-box">
      <strong>学习目标：</strong>理解 LangGraph 的 <code>MemorySaver</code> Checkpoint 机制，实现多轮对话上下文记忆<br />
      <strong>核心 API：</strong><code>MemorySaver</code>（短期记忆）、<code>createReactAgent({ checkpointer })</code>（注入记忆，别名 <code>checkpointSaver</code>）、<code>thread_id</code> + <code>checkpoint_ns</code>（双层隔离）<br />
      <strong>状态管理：</strong><code>graph.getState(config)</code>（查看状态快照）、<code>graph.getStateHistory(config)</code>（遍历历史检查点）、<code>graph.updateState(config, values)</code>（回退/修改状态）<br />
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
        <label>命名空间 NS：</label>
        <input
          v-model="currentCheckpointNs"
          class="config-input ns-input"
          placeholder="如：subtask-1（可选，用于同一线程内进一步隔离 checkpoint）"
        />
        <span class="ns-hint" title="checkpoint_ns 允许在同一 thread_id 内进一步隔离不同子任务的 checkpoint，实现双层隔离">ℹ️ thread_id + checkpoint_ns 双层隔离</span>
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
          <input type="checkbox" v-model="showStateSnapshot" />
          <span>显示状态快照（getState/getStateHistory）</span>
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

    <!-- getState — 当前状态快照面板 -->
    <div v-if="showStateSnapshot && enableMemory" class="state-snapshot-panel">
      <div class="snapshot-title">
        📋 当前状态快照（graph.getState）
        <button @click="refreshStateSnapshot" class="btn-refresh-sm" :disabled="loading">🔄 刷新</button>
      </div>
      <div v-if="stateSnapshot" class="snapshot-body">
        <div class="snapshot-row">
          <span class="snapshot-label">Checkpoint ID：</span>
          <span class="snapshot-value">{{ stateSnapshot.checkpointId }}</span>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">下一步节点：</span>
          <span class="snapshot-value">{{ stateSnapshot.nextNodes.join(', ') || '(无/已结束)' }}</span>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">消息数量：</span>
          <span class="snapshot-value">{{ stateSnapshot.messageCount }}</span>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">创建时间：</span>
          <span class="snapshot-value">{{ stateSnapshot.createdAt }}</span>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">父检查点：</span>
          <span class="snapshot-value">{{ stateSnapshot.parentCheckpointId || '(根检查点)' }}</span>
        </div>
      </div>
      <div v-else class="snapshot-empty">
        暂无状态快照，请先发送消息后刷新
      </div>
    </div>

    <!-- getStateHistory — 检查点历史列表 -->
    <div v-if="showStateSnapshot && enableMemory" class="history-panel">
      <div class="snapshot-title">
        📜 检查点历史（graph.getStateHistory）
        <button @click="refreshStateHistory" class="btn-refresh-sm" :disabled="loading">🔄 刷新</button>
      </div>
      <div v-if="stateHistory.length > 0" class="history-list">
        <div
          v-for="(cp, i) in stateHistory"
          :key="i"
          :class="['history-item', { selected: cp.checkpointId === selectedHistoryCpId }]"
          @click="selectHistoryCp(cp)"
        >
          <div class="cp-header">
            <span class="cp-id">#{{ stateHistory.length - i }} ID: {{ cp.checkpointId }}</span>
            <span class="cp-time">{{ cp.createdAt }}</span>
          </div>
          <div class="cp-detail">
            <span>消息数：{{ cp.messageCount }}</span>
            <span>步骤：{{ cp.step }}</span>
            <span>下一步：{{ cp.nextNodes && cp.nextNodes.length > 0 ? cp.nextNodes.join(', ') : '(已结束)' }}</span>
            <span v-if="cp.parentCheckpointId">父节点：{{ cp.parentCheckpointId }}</span>
          </div>
        </div>
      </div>
      <div v-else class="snapshot-empty">
        暂无检查点历史，请先发送消息后刷新
      </div>
    </div>

    <!-- updateState — 状态回退操作区 -->
    <div v-if="showStateSnapshot && enableMemory && selectedHistoryCpId" class="update-state-panel">
      <div class="snapshot-title">✏️ 状态回退（graph.updateState）— 已选中检查点：<code>{{ selectedHistoryCpId }}</code></div>
      <div class="update-state-desc">
        选择一个历史检查点后，可以<strong>回退状态</strong>（修改该检查点的状态值）或<strong>分叉执行</strong>（从该检查点继续执行新输入）。
      </div>
      <div class="update-state-actions">
        <button
          @click="replayFromHistoryCp"
          class="btn-replay"
          :disabled="loading || !selectedHistoryCpId"
        >
          🔁 回放（Replay）— 从选中检查点重新执行
        </button>
        <button
          @click="forkFromHistoryCp"
          class="btn-fork"
          :disabled="loading || !selectedHistoryCpId || !forkInput.trim()"
        >
          🔀 分叉（Fork）— 从选中检查点继续执行新输入
        </button>
      </div>
      <div v-if="selectedHistoryCpId" class="fork-input-area">
        <label>分叉输入（从选中检查点继续执行的新消息）：</label>
        <input
          v-model="forkInput"
          class="config-input"
          placeholder="输入要追加的新消息内容"
          style="width: 100%; margin-top: 4px;"
        />
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
  name: 'LangGraphStage7Memory',

  data() {
    return {
      input: '',
      messages: [],
      loading: false,
      error: null,
      agentSteps: [],
      streamStats: null,
      // 配置项
      currentThreadId: 'user-session-001',
      currentCheckpointNs: '',
      enableMemory: true,
      enableStream: true,
      showStateSnapshot: false,
      // 线程管理：threadId → messages 数组
      threadMessages: {},
      // 全局 MemorySaver 实例（所有线程共享同一个实例）
      memorySaver: null,
      // Agent 实例缓存
      agentCache: null,
      // 线程 ID 列表
      threadIds: ['user-session-001'],
      // Token 统计：当前线程累计消耗
      memoryTokens: { prompt: 0, completion: 0, total: 0 },
      // 线程 Token 统计：threadId → { prompt, completion, total }
      threadTokens: {},
      // getState 状态快照
      stateSnapshot: null,
      // getStateHistory 检查点历史
      stateHistory: [],
      // updateState 操作
      selectedHistoryCpId: null,
      forkInput: ''
    }
  },

  watch: {
    messages: {
      deep: true,
      handler() { this.$nextTick(() => this.scrollToBottom()) }
    }
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
            '上海': { temp: 22, condition: '多云', humidity: '65%' },
            '广州': { temp: 30, condition: '雷阵雨', humidity: '80%' },
            '深圳': { temp: 33, condition: '阵雨', humidity: '75%' },
            '杭州': { temp: 24, condition: '晴', humidity: '60%' }
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
    // 构建 Agent（注入 MemorySaver，带缓存）
    // ============================================================
    buildAgent() {
      // Agent 实例缓存：避免每次 send 都重新创建 Agent
      if (this.agentCache) return this.agentCache

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
      // 注意：checkpointer 和 checkpointSaver 是等价的参数别名
      const memory = this.getMemorySaver()
      if (memory) {
        params.checkpointer = memory
      }

      this.agentCache = createReactAgent(params)
      return this.agentCache
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

        // thread_id + checkpoint_ns 配置（核心：双层隔离）
        const config = {
          configurable: {
            thread_id: this.currentThreadId,
            ...(this.currentCheckpointNs ? { checkpoint_ns: this.currentCheckpointNs } : {})
          }
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

        // 自动刷新状态快照和检查点历史
        if (this.showStateSnapshot && this.enableMemory) {
          await this.refreshStateSnapshot()
          await this.refreshStateHistory()
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
    // getState — 查看当前状态快照
    // ============================================================
    async refreshStateSnapshot() {
      try {
        const agent = this.buildAgent()
        const config = {
          configurable: {
            thread_id: this.currentThreadId,
            ...(this.currentCheckpointNs ? { checkpoint_ns: this.currentCheckpointNs } : {})
          }
        }
        const snapshot = await agent.getState(config)

        if (snapshot && snapshot.values) {
          const msgs = snapshot.values.messages || []
          this.stateSnapshot = {
            checkpointId: snapshot.config?.configurable?.checkpoint_id
              ? snapshot.config.configurable.checkpoint_id.substring(0, 8)
              : '?',
            nextNodes: snapshot.next || [],
            messageCount: msgs.length,
            createdAt: this.formatTime(snapshot.createdAt),
            parentCheckpointId: snapshot.parentConfig?.configurable?.checkpoint_id
              ? snapshot.parentConfig.configurable.checkpoint_id.substring(0, 8)
              : null
          }
        } else {
          this.stateSnapshot = null
        }
      } catch (err) {
        console.error('[getState] 获取状态快照失败:', err)
        this.stateSnapshot = null
      }
    },

    // ============================================================
    // getStateHistory — 遍历历史检查点
    // ============================================================
    async refreshStateHistory() {
      try {
        const agent = this.buildAgent()
        const config = {
          configurable: {
            thread_id: this.currentThreadId,
            ...(this.currentCheckpointNs ? { checkpoint_ns: this.currentCheckpointNs } : {})
          }
        }
        const history = []

        for await (const snapshot of agent.getStateHistory(config)) {
          const msgs = snapshot.values?.messages || []
          history.push({
            checkpointId: snapshot.config?.configurable?.checkpoint_id
              ? snapshot.config.configurable.checkpoint_id.substring(0, 8)
              : '?',
            fullCheckpointId: snapshot.config?.configurable?.checkpoint_id || null,
            config: snapshot.config,
            parentConfig: snapshot.parentConfig,
            messageCount: msgs.length,
            step: snapshot.metadata?.step || '?',
            createdAt: this.formatTime(snapshot.createdAt),
            parentCheckpointId: snapshot.parentConfig?.configurable?.checkpoint_id
              ? snapshot.parentConfig.configurable.checkpoint_id.substring(0, 8)
              : null,
            nextNodes: snapshot.next || []
          })
        }

        this.stateHistory = history
      } catch (err) {
        console.error('[getStateHistory] 获取检查点历史失败:', err)
      }
    },

    // ============================================================
    // 选中历史检查点
    // ============================================================
    selectHistoryCp(cp) {
      if (cp.checkpointId === this.selectedHistoryCpId) {
        this.selectedHistoryCpId = null
        this.forkInput = ''
      } else {
        this.selectedHistoryCpId = cp.checkpointId
      }
    },

    // ============================================================
    // Time Travel: 回放（Replay）— 从选中检查点重新执行
    // ============================================================
    async replayFromHistoryCp() {
      if (!this.selectedHistoryCpId || this.loading) return

      const cp = this.stateHistory.find(
        (c) => c.checkpointId === this.selectedHistoryCpId
      )
      if (!cp || !cp.config) {
        this.error = '未找到选中的检查点配置'
        return
      }

      this.loading = true
      this.error = null

      try {
        const agent = this.buildAgent()

        // 使用历史检查点的 config 重新 invoke（传入 null 表示不追加新输入，仅重放）
        const result = await agent.invoke(null, cp.config)

        // 更新消息列表
        const resultMsgs = result.messages || []
        this.messages = resultMsgs.map((m) => {
          const type = m._getType ? m._getType() : ''
          if (type === 'human') return { role: 'user', content: m.content }
          if (type === 'ai') return { role: 'assistant', content: m.content }
          return null
        }).filter(Boolean)

        this.saveThreadMessages()
        await this.refreshStateSnapshot()
        await this.refreshStateHistory()
        this.selectedHistoryCpId = null
      } catch (err) {
        console.error('[Replay] 回放失败:', err)
        this.error = `回放失败: ${err.message}`
      } finally {
        this.loading = false
      }
    },

    // ============================================================
    // Time Travel: 分叉（Fork）— 从选中检查点继续执行新输入
    // ============================================================
    async forkFromHistoryCp() {
      if (!this.selectedHistoryCpId || this.loading) return

      const cp = this.stateHistory.find(
        (c) => c.checkpointId === this.selectedHistoryCpId
      )
      if (!cp || !cp.config) {
        this.error = '未找到选中的检查点配置'
        return
      }

      const forkMsg = this.forkInput.trim()
      if (!forkMsg) {
        this.error = '请输入分叉时要追加的消息内容'
        return
      }

      this.loading = true
      this.error = null

      try {
        const agent = this.buildAgent()

        // 从历史检查点分叉：使用历史 config 继续执行，传入新消息
        const result = await agent.invoke(
          { messages: [new HumanMessage(forkMsg)] },
          cp.config
        )

        // 更新消息列表
        const resultMsgs = result.messages || []
        this.messages = resultMsgs.map((m) => {
          const type = m._getType ? m._getType() : ''
          if (type === 'human') return { role: 'user', content: m.content }
          if (type === 'ai') return { role: 'assistant', content: m.content }
          return null
        }).filter(Boolean)

        this.forkInput = ''
        this.saveThreadMessages()
        await this.refreshStateSnapshot()
        await this.refreshStateHistory()
        this.selectedHistoryCpId = null
      } catch (err) {
        console.error('[Fork] 分叉失败:', err)
        this.error = `分叉失败: ${err.message}`
      } finally {
        this.loading = false
      }
    },

    // ============================================================
    // 格式化时间
    // ============================================================
    formatTime(isoString) {
      if (!isoString) return '?'
      try {
        const d = new Date(isoString)
        if (isNaN(d.getTime())) return '?'
        const pad = (n) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      } catch {
        return '?'
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
      this.stateSnapshot = null
      this.stateHistory = []
      this.selectedHistoryCpId = null
      this.forkInput = ''
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
      this.stateSnapshot = null
      this.stateHistory = []
      this.selectedHistoryCpId = null
      this.forkInput = ''
      this.streamStats = null
      this.error = null

      // 加载 Checkpoint 信息和状态快照
      if (this.showStateSnapshot && this.enableMemory) {
        this.refreshStateSnapshot()
        this.refreshStateHistory()
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
        this.stateSnapshot = null
        this.stateHistory = []
        this.selectedHistoryCpId = null
        this.forkInput = ''
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
      this.stateSnapshot = null
      this.stateHistory = []
      this.selectedHistoryCpId = null
      this.forkInput = ''
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

/* ============================================================
  checkpoint_ns 命名空间样式
  ============================================================ */
.ns-input {
  flex: 1;
  max-width: 420px;
  font-family: monospace;
}

.ns-hint {
  font-size: 12px;
  color: #7c3aed;
  cursor: help;
  white-space: nowrap;
}

/* ============================================================
  getState 状态快照面板
  ============================================================ */
.state-snapshot-panel {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.snapshot-title {
  font-weight: 700;
  font-size: 14px;
  color: #1e40af;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.snapshot-title code {
  font-size: 12px;
  background: #dbeafe;
  padding: 2px 6px;
  border-radius: 4px;
}

.btn-refresh-sm {
  padding: 2px 10px;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.btn-refresh-sm:hover {
  background: #2563eb;
}

.btn-refresh-sm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.snapshot-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.snapshot-row {
  display: flex;
  gap: 8px;
  font-size: 13px;
}

.snapshot-label {
  color: #1e40af;
  font-weight: 600;
  min-width: 100px;
}

.snapshot-value {
  color: #1e293b;
  font-family: monospace;
}

.snapshot-empty {
  font-size: 13px;
  color: #9ca3af;
  font-style: italic;
}

/* ============================================================
  getStateHistory 检查点历史面板
  ============================================================ */
.history-panel {
  background: #fefce8;
  border: 1px solid #fef08a;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 300px;
  overflow-y: auto;
}

.history-item {
  background: #fef9c3;
  border: 1px solid #fde047;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.history-item:hover {
  background: #fef08a;
  border-color: #eab308;
}

.history-item.selected {
  background: #fde047;
  border-color: #ca8a04;
  box-shadow: 0 0 0 2px rgba(202, 138, 4, 0.3);
}

/* ============================================================
  updateState 状态回退面板
  ============================================================ */
.update-state-panel {
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.update-state-desc {
  font-size: 13px;
  color: #991b1b;
  margin-bottom: 10px;
  line-height: 1.5;
}

.update-state-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.btn-replay {
  padding: 6px 16px;
  background: #f59e0b;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.btn-replay:hover {
  background: #d97706;
}

.btn-replay:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-fork {
  padding: 6px 16px;
  background: #8b5cf6;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.btn-fork:hover {
  background: #7c3aed;
}

.btn-fork:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.fork-input-area {
  margin-top: 8px;
}

.fork-input-area label {
  font-size: 13px;
  color: #991b1b;
  font-weight: 600;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
</style>