<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-24 10:00:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-24 14:20:14
 * @Description: 阶段九：Checkpoint 检查点 — getState/getStateHistory + Time Travel 回溯演示
 *   学习目标：掌握 LangGraph 的 getState/getStateHistory API，实现 Time Travel（回放/分叉）
 *   核心 API：graph.getState()、graph.getStateHistory()、graph.updateState()、StateSnapshot
 *   前置条件：已完成阶段七（MemorySaver 短期记忆），理解 thread_id 和 Checkpoint 概念
-->
<template>
  <div>
    <h1>阶段九：Checkpoint 检查点 <span class="badge stage">LangGraph</span></h1>
    <div class="info-box">
      <strong>学习目标：</strong>掌握 LangGraph 的 <code>getState()</code> / <code>getStateHistory()</code> API，实现 Time Travel（回放/分叉）<br />
      <strong>核心 API：</strong><code>graph.getState(config)</code>（查看状态快照）、<code>graph.getStateHistory(config)</code>（遍历历史检查点）、<code>graph.updateState(config, values)</code>（回退状态）<br />
      <strong>前置条件：</strong>已完成阶段七（MemorySaver 短期记忆），理解 <code>thread_id</code> 和 Checkpoint 概念
    </div>

    <!-- 配置区 -->
    <div class="config-section">
      <div class="config-title">⏱️ Checkpoint 检查点配置</div>
      <div class="config-row">
        <label>当前线程 ID：</label>
        <input
          v-model="currentThreadId"
          class="config-input thread-id-input"
          placeholder="如：checkpoint-demo-001"
        />
        <button @click="switchThread" class="btn-switch" :disabled="loading">
          🔄 切换线程
        </button>
        <button @click="deleteCurrentThread" class="btn-delete" :disabled="loading">
          🗑️ 删除当前线程
        </button>
      </div>
      <div class="config-row">
        <label>线程列表：</label>
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
          <span v-if="threadIds.length === 0" class="thread-empty">暂无线程</span>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-section">
      <textarea
        v-model="input"
        placeholder="试试多轮对话：我叫张三 || 我喜欢吃火锅 || 我叫什么名字？喜欢吃什么？ || 计算 100 + 200"
        rows="3"
        @keydown.ctrl.enter="send"
      ></textarea>
      <div class="btn-row">
        <button @click="send" :disabled="loading">
          {{ loading ? '请求中...' : '发送 (Ctrl+Enter)' }}
        </button>
        <button @click="clearAll" class="btn-clear">清空全部</button>
      </div>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- 记忆状态提示 -->
    <div v-if="messages.length > 0" class="memory-status">
      <span>🧠 短期记忆已启用</span>
      <span class="memory-thread">线程：{{ currentThreadId }}</span>
      <span class="memory-rounds">对话轮次：{{ Math.floor(messages.length / 2) }}</span>
    </div>

    <!-- ============================================================
        Checkpoint 状态快照面板（getState）
        ============================================================ -->
    <div class="checkpoint-panel">
      <div class="checkpoint-title">
        📋 当前状态快照（getState）
        <button @click="refreshState" class="btn-refresh" :disabled="loading">🔄 刷新</button>
      </div>
      <div v-if="currentState" class="state-snapshot">
        <div class="snapshot-row">
          <span class="snapshot-label">Checkpoint ID：</span>
          <span class="snapshot-value">{{ currentState.checkpointId }}</span>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">下一步节点：</span>
          <span class="snapshot-value">{{ currentState.nextNodes.join(', ') || '(无/已结束)' }}</span>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">消息数量：</span>
          <span class="snapshot-value">{{ currentState.messageCount }}</span>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">创建时间：</span>
          <span class="snapshot-value">{{ currentState.createdAt }}</span>
        </div>
        <div class="snapshot-row">
          <span class="snapshot-label">父检查点：</span>
          <span class="snapshot-value">{{ currentState.parentCheckpointId || '(根检查点)' }}</span>
        </div>
      </div>
      <div v-else class="checkpoint-empty">
        暂无状态快照，请先发送消息
      </div>
    </div>

    <!-- ============================================================
        Checkpoint 历史列表（getStateHistory）
        ============================================================ -->
    <div class="checkpoint-panel history-panel">
      <div class="checkpoint-title">
        📜 检查点历史（getStateHistory）
        <button @click="refreshHistory" class="btn-refresh" :disabled="loading">🔄 刷新</button>
      </div>
      <div v-if="checkpointHistory.length > 0" class="history-list">
        <div
          v-for="(cp, i) in checkpointHistory"
          :key="i"
          :class="['history-item', { selected: cp.checkpointId === selectedCheckpointId }]"
          @click="selectCheckpoint(cp)"
        >
          <div class="cp-header">
            <span class="cp-id">#{{ checkpointHistory.length - i }} ID: {{ cp.checkpointId }}</span>
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
      <div v-else class="checkpoint-empty">
        暂无检查点历史，请先发送消息
      </div>
    </div>

    <!-- ============================================================
        Time Travel 操作区
        ============================================================ -->
    <div class="timetravel-panel">
      <div class="timetravel-title">⏰ Time Travel 回溯操作</div>
      <div class="timetravel-desc">
        选择一个历史检查点，可以<strong>回放（Replay）</strong>或<strong>分叉（Fork）</strong>执行。
        回放会从该检查点重新执行；分叉会创建新的执行分支。
      </div>
      <div class="timetravel-actions">
        <button
          @click="replayFromCheckpoint"
          class="btn-replay"
          :disabled="loading || !selectedCheckpointId"
        >
          🔁 回放（Replay）— 从选中检查点重新执行
        </button>
        <button
          @click="forkFromCheckpoint"
          class="btn-fork"
          :disabled="loading || !selectedCheckpointId || !forkInput.trim()"
          :title="!selectedCheckpointId ? '请先选择一个历史检查点' : !forkInput.trim() ? '请先输入分叉内容' : '从选中检查点分叉执行'"
        >
          🔀 分叉（Fork）— 修改状态后从选中检查点继续
        </button>
      </div>
      <div v-if="selectedCheckpointId" class="timetravel-info">
        已选中检查点：<code>{{ selectedCheckpointId }}</code>
      </div>
      <div v-if="selectedCheckpointId" class="fork-input-area">
        <label>分叉输入（修改状态后继续执行）：</label>
        <input
          v-model="forkInput"
          class="config-input"
          placeholder="输入要追加到状态的消息内容"
          style="width: 100%; margin-top: 4px;"
        />
      </div>
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
import { HumanMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { MemorySaver } from '@langchain/langgraph'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { z } from 'zod'

export default {
  name: 'LangGraphStage9Checkpoint',

  data() {
    return {
      input: '',
      messages: [],
      loading: false,
      error: null,
      // 配置项
      currentThreadId: 'checkpoint-demo-001',
      // 线程管理
      threadMessages: {},
      threadIds: ['checkpoint-demo-001'],
      // MemorySaver 实例
      memorySaver: null,
      // Agent 实例缓存
      agentCache: null,
      // getState 快照
      currentState: null,
      // getStateHistory 历史
      checkpointHistory: [],
      // Time Travel
      selectedCheckpointId: null,
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
    this.memorySaver = new MemorySaver()
    this.threadMessages[this.currentThreadId] = []
  },

  methods: {
    // ============================================================
    // 构建 Agent
    // ============================================================
    buildAgent() {
      if (this.agentCache) return this.agentCache

      const calculatorTool = tool(
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

      const llm = new ChatOpenAI({
        model: 'EB-DeepSeek-V4-Pro',
        apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
        temperature: 0,
        configuration: {
          baseURL: window.location.origin + '/inner/'
        }
      })

      this.agentCache = createReactAgent({
        llm,
        tools: [calculatorTool],
        checkpointer: this.memorySaver,
        name: 'AI助手',
        prompt: '你是一个有用的AI助手，可以使用计算器工具。请记住对话历史中的上下文信息（如用户的名字、偏好等）。回答请用中文。'
      })

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

      this.messages.push({ role: 'assistant', content: '' })
      const aiMsgIndex = this.messages.length - 1

      try {
        const agent = this.buildAgent()

        const config = {
          configurable: { thread_id: this.currentThreadId }
        }

        // 只传入最新的用户消息，让 checkpointer 自动从上次 checkpoint 恢复并追加
        const stream = await agent.stream(
          { messages: [new HumanMessage(text)] },
          { ...config, streamMode: 'values' }
        )

        for await (const state of stream) {
          const msgs = state.messages || []
          const lastMsg = msgs[msgs.length - 1]
          if (lastMsg && lastMsg._getType && lastMsg._getType() === 'ai') {
            const content = typeof lastMsg.content === 'string' ? lastMsg.content : ''
            if (content) {
              this.messages[aiMsgIndex].content = content
            }
          }
        }

        this.saveThreadMessages()

        // 自动刷新状态快照和检查点历史
        await this.refreshState()
        await this.refreshHistory()
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
    // getState — 查看当前状态快照
    // ============================================================
    async refreshState() {
      try {
        const agent = this.buildAgent()
        const config = { configurable: { thread_id: this.currentThreadId } }
        const snapshot = await agent.getState(config)

        if (snapshot && snapshot.values) {
          const msgs = snapshot.values.messages || []
          this.currentState = {
            // 检查点id
            checkpointId: snapshot.config?.configurable?.checkpoint_id
              ? snapshot.config.configurable.checkpoint_id.substring(0, 8)
              : '?',
            nextNodes: snapshot.next || [],
            messageCount: msgs.length,
            createdAt: this.formatTime(snapshot.createdAt),
            // 父检查点id
            parentCheckpointId: snapshot.parentConfig?.configurable?.checkpoint_id
              ? snapshot.parentConfig.configurable.checkpoint_id.substring(0, 8)
              : null,
          }
        } else {
          this.currentState = null
        }
      } catch (err) {
        console.error('[getState] 获取状态快照失败:', err)
        this.currentState = null
      }
    },

    // ============================================================
    // getStateHistory — 遍历历史检查点
    // ============================================================
    async refreshHistory() {
      try {
        const agent = this.buildAgent()
        const config = { configurable: { thread_id: this.currentThreadId } }
        const history = []

        for await (const snapshot of agent.getStateHistory(config)) {
          console.log(123, snapshot)
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
            nextNodes: snapshot.next || [],
          })
        }

        this.checkpointHistory = history
      } catch (err) {
        console.error('[getStateHistory] 获取检查点历史失败:', err)
      }
    },

    // ============================================================
    // 选中检查点
    // ============================================================
    selectCheckpoint(cp) {
      if (cp.checkpointId === this.selectedCheckpointId) {
        this.selectedCheckpointId = null
        this.forkInput = ''
      } else {
        this.selectedCheckpointId = cp.checkpointId
      }
    },

    // ============================================================
    // Time Travel: 回放（Replay）
    // ============================================================
    async replayFromCheckpoint() {
      if (!this.selectedCheckpointId || this.loading) return

      const cp = this.checkpointHistory.find(
        (c) => c.checkpointId === this.selectedCheckpointId
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
        await this.refreshState()
        await this.refreshHistory()
        this.selectedCheckpointId = null
      } catch (err) {
        console.error('[Replay] 回放失败:', err)
        this.error = `回放失败: ${err.message}`
      } finally {
        this.loading = false
      }
    },

    // ============================================================
    // Time Travel: 分叉（Fork）
    // ============================================================
    async forkFromCheckpoint() {
      if (!this.selectedCheckpointId || this.loading) return

      const cp = this.checkpointHistory.find(
        (c) => c.checkpointId === this.selectedCheckpointId
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
        await this.refreshState()
        await this.refreshHistory()
        this.selectedCheckpointId = null
      } catch (err) {
        console.error('[Fork] 分叉失败:', err)
        this.error = `分叉失败: ${err.message}`
      } finally {
        this.loading = false
      }
    },

    // ============================================================
    // 线程管理
    // ============================================================
    saveThreadMessages() {
      this.threadMessages[this.currentThreadId] = [...this.messages]
    },

    switchThread() {
      this.saveThreadMessages()
      const newId = `checkpoint-demo-${Date.now()}`
      this.currentThreadId = newId
      this.threadMessages[newId] = []
      if (!this.threadIds.includes(newId)) {
        this.threadIds.push(newId)
      }
      this.messages = []
      this.currentState = null
      this.checkpointHistory = []
      this.selectedCheckpointId = null
      this.forkInput = ''
      this.error = null
    },

    selectThread(threadId) {
      if (threadId === this.currentThreadId || this.loading) return
      this.saveThreadMessages()
      this.currentThreadId = threadId
      this.messages = this.threadMessages[threadId] || []
      this.currentState = null
      this.checkpointHistory = []
      this.selectedCheckpointId = null
      this.forkInput = ''
      this.error = null
      this.refreshState()
      this.refreshHistory()
    },

    async deleteCurrentThread() {
      if (this.loading) return
      const tid = this.currentThreadId
      if (this.memorySaver) {
        try {
          await this.memorySaver.deleteThread(tid)
        } catch (err) {
          console.error('[MemorySaver] 删除线程失败:', err)
        }
      }
      delete this.threadMessages[tid]
      this.threadIds = this.threadIds.filter((id) => id !== tid)
      if (this.threadIds.length > 0) {
        this.selectThread(this.threadIds[0])
      } else {
        const newId = `checkpoint-demo-${Date.now()}`
        this.currentThreadId = newId
        this.threadMessages[newId] = []
        this.threadIds.push(newId)
        this.messages = []
        this.currentState = null
        this.checkpointHistory = []
        this.selectedCheckpointId = null
        this.forkInput = ''
      }
    },

    getThreadMessageCount(threadId) {
      const msgs = this.threadMessages[threadId] || []
      return msgs.length
    },

    clearAll() {
      this.messages = []
      this.currentState = null
      this.checkpointHistory = []
      this.selectedCheckpointId = null
      this.forkInput = ''
      this.error = null
      this.threadMessages[this.currentThreadId] = []
      if (this.memorySaver) {
        this.memorySaver.deleteThread(this.currentThreadId).catch((err) => {
          console.error('[MemorySaver] 清空线程失败:', err)
        })
      }
    },

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
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
}

.config-title {
  font-weight: 700;
  font-size: 14px;
  color: #92400e;
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
  color: #92400e;
  min-width: 90px;
}

.config-input {
  padding: 6px 10px;
  border: 1px solid #fde68a;
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
  background: #f59e0b;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.btn-switch:hover {
  background: #d97706;
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

.btn-refresh {
  padding: 4px 10px;
  background: #f59e0b;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  margin-left: 8px;
}

.btn-refresh:hover {
  background: #d97706;
}

.btn-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.thread-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.thread-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 20px;
  font-size: 12px;
  font-family: monospace;
  color: #92400e;
  cursor: pointer;
  transition: all 0.2s;
}

.thread-tag:hover {
  background: #fde68a;
  border-color: #f59e0b;
}

.thread-tag.active {
  background: #f59e0b;
  color: #fff;
  border-color: #d97706;
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

/* Checkpoint 面板 */
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
  display: flex;
  align-items: center;
}

.checkpoint-empty {
  font-size: 13px;
  color: #9ca3af;
  font-style: italic;
}

/* 状态快照 */
.state-snapshot {
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 6px;
  padding: 10px 14px;
}

.snapshot-row {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 13px;
}

.snapshot-row:last-child {
  margin-bottom: 0;
}

.snapshot-label {
  font-weight: 600;
  color: #92400e;
  min-width: 100px;
}

.snapshot-value {
  font-family: monospace;
  color: #78350f;
}

/* 检查点历史列表 */
.history-panel {
  background: #fef2f2;
  border: 1px solid #fecaca;
}

.history-panel .checkpoint-title {
  color: #991b1b;
}

.history-list {
  max-height: 300px;
  overflow-y: auto;
}

.history-item {
  background: #fee2e2;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.history-item:hover {
  background: #fecaca;
  border-color: #f87171;
}

.history-item.selected {
  background: #fca5a5;
  border-color: #ef4444;
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.3);
}

.cp-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}

.cp-id {
  font-family: monospace;
  font-weight: 600;
  color: #991b1b;
}

.cp-time {
  color: #b45309;
}

.cp-detail {
  display: flex;
  gap: 16px;
  color: #b45309;
}

/* Time Travel 操作区 */
.timetravel-panel {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.timetravel-title {
  font-weight: 700;
  font-size: 14px;
  color: #0369a1;
  margin-bottom: 6px;
}

.timetravel-desc {
  font-size: 13px;
  color: #0c4a6e;
  margin-bottom: 10px;
  line-height: 1.5;
}

.timetravel-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.btn-replay {
  padding: 8px 16px;
  background: #0284c7;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.btn-replay:hover {
  background: #0369a1;
}

.btn-replay:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-fork {
  padding: 8px 16px;
  background: #7c3aed;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.btn-fork:hover {
  background: #6d28d9;
}

.btn-fork:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.timetravel-info {
  font-size: 13px;
  color: #0369a1;
  margin-top: 4px;
}

.timetravel-info code {
  background: #e0f2fe;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.fork-input-area {
  margin-top: 8px;
}

.fork-input-area label {
  font-size: 13px;
  font-weight: 600;
  color: #6d28d9;
}

/* 输入区域 */
.input-section {
  margin-bottom: 16px;
}

.input-section textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  resize: vertical;
  font-family: inherit;
  box-sizing: border-box;
  margin-bottom: 10px;
}

.input-section .btn-row {
  display: flex;
  gap: 10px;
}

.input-section button {
  padding: 10px 20px;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}

.input-section button:hover {
  background: #1d4ed8;
}

.input-section button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-c.btn-clear {
  background: #e5e7eb !important;
  color: #374151 !important;
}

.btn-clear:hover {
  background: #d1d5db !important;
}

.error-msg {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 10px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
}

/* 对话历史 */
.chat-history {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  background: #f9fafb;
}

.message {
  margin-bottom: 12px;
  padding: 10px 14px;
  border-radius: 8px;
}

.message.user {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}

.message.assistant {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
}

.role-label {
  font-weight: 700;
  font-size: 12px;
  margin-bottom: 4px;
  color: #6b7280;
}

.content {
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.cursor-blink {
  animation: blink 1s step-end infinite;
  color: #f59e0b;
  font-weight: 700;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
</style>
