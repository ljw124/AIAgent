<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-10-16 15:56:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-10-16 17:47:19
 * @Description: 阶段十二：Streaming 流式模式 — 5 种 streamMode 全解析
 *   学习目标：掌握 LangGraph v1.x 的 5 种 streamMode（values/updates/messages/custom/debug），
 *            理解各模式的数据形态与选型，掌握 getWriter 自定义流与多模式组合
 *   核心 API：graph.stream(input, { streamMode })、getWriter()、subgraphs 透传
 *   场景：问题分析 → 回答生成 — 两节点图的流式执行全过程观察
 *   ⚡ 真实 LLM：使用 ChatOpenAI 调用内网大模型
 *   API 提示：
 *     - graph.stream(input, { streamMode: 'values' })   — 每个超步后输出完整状态
 *     - graph.stream(input, { streamMode: 'updates' })  — 每个超步只输出该节点的增量更新
 *     - graph.stream(input, { streamMode: 'messages' }) — LLM 令牌流（打字机效果核心），
 *       输出 [message, metadata] 元组，metadata.langgraph_node 标识令牌来源节点
 *     - graph.stream(input, { streamMode: 'custom' })   — 接收节点内 getWriter() 推送的自定义事件
 *     - graph.stream(input, { streamMode: 'debug' })    — 调试事件（任务调度/检查点写入全过程）
 *     - streamMode 传数组 — 多模式组合，输出 [mode, chunk] 元组
 *     - getWriter() — 节点内部获取自定义流写入器（返回可直接调用的函数），
 *       仅当 streamMode 包含 'custom' 时生效，否则为空操作
 *     - { subgraphs: true } — 子图流式透传，输出 [namespace, chunk] 元组
-->
<template>
  <div>
    <h1>阶段十二：Streaming 流式模式 — 5 种 streamMode 全解析 <span class="badge stage">LangGraph</span></h1>

    <!-- 学习目标 -->
    <div class="info-box">
      <strong>学习目标：</strong>掌握 LangGraph v1.x 的 <code>Streaming</code> 流式模式，理解 5 种 <code>streamMode</code> 的数据形态差异与选型<br />
      <strong>核心 API：</strong><code>graph.stream(input, { streamMode })</code>（流式执行）、<code>getWriter()</code>（节点内自定义流）、<code>streamMode</code> 数组（多模式组合）、<code>subgraphs: true</code>（子图透传）<br />
      <strong>场景：</strong>问题分析 → 回答生成 — 两节点图的流式执行全过程观察<br />
      <strong>⚡ 真实 LLM：</strong>使用 <code>ChatOpenAI</code> 调用内网大模型<br />
      <strong>⚠️ 关键点：</strong><code>messages</code> 模式是前端打字机效果的核心（LLM 令牌流）；<code>custom</code> 模式配合 <code>getWriter()</code> 可推送任意业务事件；多模式组合一次执行同时拿多种事件
    </div>

    <!-- 图结构可视化：左右并排 -->
    <div class="graph-viz-row">
      <!-- 左侧：图执行 + 流事件 -->
      <div class="graph-viz graph-viz-half">
        <div class="graph-viz-title">📐 示例图结构 — 问题分析 → 回答生成</div>
        <div class="graph-viz-diagram streaming-diagram">
          <div class="graph-node start-node">START</div>
          <div class="graph-arrow-h">→</div>
          <div class="graph-node node-analyze">analyze<br /><small>拆解问题步骤<br />📡 writer 自定义流</small></div>
          <div class="graph-arrow-h">→</div>
          <div class="graph-node node-answer">respond<br /><small>生成最终回答<br />⌨️ LLM 令牌流</small></div>
          <div class="graph-arrow-h">→</div>
          <div class="graph-node end-node">END</div>
        </div>
        <div class="graph-viz-legend">
          <span>analyze 节点：调用 LLM 拆解步骤 + getWriter() 推送进度事件</span>
          <span>respond 节点：调用 LLM 生成回答 → 令牌被 messages 模式捕获</span>
          <span>每个节点完成后 → updates 模式输出增量 / values 模式输出完整状态</span>
          <span>⚡ 一次 stream() 执行，5 种模式可任意组合观察</span>
        </div>
      </div>

      <!-- 右侧：5 种模式输出形态对比 -->
      <div class="graph-viz graph-viz-half">
        <div class="graph-viz-title">📊 5 种 streamMode 输出形态对比</div>
        <div class="mode-cards">
          <div class="mode-card mode-values">
            <div class="mode-name">values</div>
            <div class="mode-desc">完整状态快照<br /><code>{ question, steps, answer }</code></div>
          </div>
          <div class="mode-card mode-updates">
            <div class="mode-name">updates</div>
            <div class="mode-desc">节点增量<br /><code>{ analyze: { steps } }</code></div>
          </div>
          <div class="mode-card mode-messages">
            <div class="mode-name">messages</div>
            <div class="mode-desc">LLM 令牌流<br /><code>[chunk, metadata]</code> ⭐打字机</div>
          </div>
          <div class="mode-card mode-custom">
            <div class="mode-name">custom</div>
            <div class="mode-desc">自定义事件<br /><code>writer('任意内容')</code></div>
          </div>
          <div class="mode-card mode-debug">
            <div class="mode-name">debug</div>
            <div class="mode-desc">调试事件<br /><code>{ type: 'task'|'checkpoint' }</code></div>
          </div>
        </div>
        <div class="graph-viz-legend">
          <span>values/updates → 图状态视角（节点级粒度）</span>
          <span>messages → LLM 视角（令牌级粒度，最细）</span>
          <span>custom → 业务视角（完全自定义）</span>
          <span>debug → 引擎视角（事件量最大，调试用）</span>
        </div>
      </div>
    </div>

    <!-- 配置区域 -->
    <div class="config-section">
      <label>
        LLM 模型：
        <select v-model="modelName">
          <option value="EB-DeepSeek-V4-Pro">EB-DeepSeek-V4-Pro</option>
          <option value="EB-GLM-5.2">EB-GLM-5.2</option>
        </select>
      </label>
      <label>
        streamMode：
        <select v-model="streamMode">
          <option value="messages">⌨️ messages — LLM 令牌流（打字机）</option>
          <option value="updates">📦 updates — 节点增量更新</option>
          <option value="values">🗂️ values — 完整状态快照</option>
          <option value="custom">📡 custom — writer 自定义事件</option>
          <option value="debug">🐞 debug — 调试事件</option>
          <option value="combo">🔀 组合 — updates + custom + messages</option>
        </select>
      </label>
      <label>
        <input type="checkbox" v-model="enableWriter" />
        <span>analyze 节点启用 getWriter() 自定义流</span>
      </label>
    </div>

    <!-- 输入区域 -->
    <div class="input-section">
      <textarea
        v-model="userInput"
        rows="3"
        placeholder="输入问题，如：为什么天空是蓝色的？"
        @keydown.ctrl.enter="runWorkflow"
      />
      <div class="btn-row">
        <button @click="runWorkflow" :disabled="loading">
          {{ loading ? '流式执行中...' : '▶ 流式执行 (Ctrl+Enter)' }}
        </button>
        <button @click="clearResult" class="btn-clear">清空结果</button>
      </div>
    </div>

    <!-- 快捷测试按钮 -->
    <div class="quick-test-section">
      <span class="quick-test-label">快捷测试：</span>
      <button class="btn-quick" @click="quickTest('为什么天空是蓝色的？')" :disabled="loading">
        🌊 科学问题
      </button>
      <button class="btn-quick" @click="quickTest('如何向一个10岁的孩子解释什么是人工智能？')" :disabled="loading">
        🤖 科普问题
      </button>
      <button class="btn-quick" @click="quickTest('用一句话说明 LangGraph 和 LangChain 的关系')" :disabled="loading">
        ⚡ 短问题
      </button>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- 执行结果 -->
    <div v-if="hasResult" class="result-area">
      <!-- 打字机答案（messages 模式） -->
      <div v-if="typewriterText || modeIncludes('messages')" class="result-box">
        <div class="result-label" style="background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);">
          ⌨️ messages 模式 — LLM 令牌流（打字机效果，仅渲染 respond 节点的令牌）
        </div>
        <div class="result-content">
          <div class="typewriter-box">{{ typewriterText }}<span v-if="loading" class="cursor">▌</span></div>
        </div>
      </div>

      <!-- 最终答案（从 updates 累积） -->
      <div v-if="finalAnswer" class="result-box" style="margin-top: 12px;">
        <div class="result-label">
          📤 最终答案（updates/values 累积的状态；messages 模式下来自令牌流）
        </div>
        <div class="result-content">
          <div class="result-field">
            <span class="field-key">问题：</span>
            <span class="field-value">{{ resultQuestion }}</span>
          </div>
          <div class="result-field">
            <span class="field-key">🔑 分析步骤：</span>
            <span v-if="finalSteps.length" class="field-value">{{ finalSteps.join(' / ') }}</span>
            <span v-else-if="!modeIncludes('updates') && !modeIncludes('values')" class="field-value muted">
              （当前模式不产生状态事件 — messages 只输出 LLM 令牌流；切到 updates / values / 组合模式可查看）
            </span>
            <span v-else class="field-value">(无)</span>
          </div>
          <div class="result-field">
            <span class="field-key">📝 回答：</span>
            <span class="field-value highlight">{{ finalAnswer }}</span>
          </div>
        </div>
      </div>

      <!-- 节点更新日志（updates 模式） -->
      <div v-if="updateLogs.length > 0" class="result-box" style="margin-top: 12px;">
        <div class="result-label" style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);">
          📦 updates 模式 — 节点增量更新（{{ updateLogs.length }} 条）
        </div>
        <div class="result-content">
          <div
            v-for="(log, index) in updateLogs"
            :key="index"
            class="execution-step"
          >
            <div class="step-header">
              <span class="step-number">超步 {{ index + 1 }}</span>
              <span class="step-node">节点：{{ log.node }}</span>
              <span class="step-decision cmd-goto">增量更新</span>
            </div>
            <div class="step-detail">
              <pre class="state-json">{{ log.update }}</pre>
            </div>
          </div>
        </div>
      </div>

      <!-- 状态快照（values 模式） -->
      <div v-if="valueSnapshots.length > 0" class="result-box" style="margin-top: 12px;">
        <div class="result-label" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);">
          🗂️ values 模式 — 完整状态快照（{{ valueSnapshots.length }} 个超步，每步都是全量状态）
        </div>
        <div class="result-content">
          <div
            v-for="(snap, index) in valueSnapshots"
            :key="index"
            class="execution-step"
          >
            <div class="step-header">
              <span class="step-number">快照 {{ snap.seq }}</span>
              <span class="step-decision cmd-subgraph">全量状态</span>
            </div>
            <div class="step-detail">
              <pre class="state-json">{{ snap.state }}</pre>
            </div>
          </div>
        </div>
      </div>

      <!-- 自定义事件日志（custom 模式） -->
      <div v-if="customLogs.length > 0" class="result-box" style="margin-top: 12px;">
        <div class="result-label" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
          📡 custom 模式 — getWriter() 自定义事件（{{ customLogs.length }} 条）
        </div>
        <div class="result-content">
          <div
            v-for="(log, index) in customLogs"
            :key="index"
            class="stream-log-item"
          >
            <span class="stream-time">{{ log.time }}</span>
            <span class="stream-source">[{{ log.source }}]</span>
            <span class="stream-content">{{ log.content }}</span>
          </div>
        </div>
      </div>

      <!-- 调试事件（debug 模式） -->
      <div v-if="debugStats.total > 0" class="result-box" style="margin-top: 12px;">
        <div class="result-label" style="background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);">
          🐞 debug 模式 — 调试事件（共 {{ debugStats.total }} 条：task {{ debugStats.task }} / checkpoint {{ debugStats.checkpoint }} / 其他 {{ debugStats.other }}）
        </div>
        <div class="result-content">
          <div
            v-for="(log, index) in debugLogs"
            :key="index"
            class="stream-log-item"
          >
            <span class="stream-time">{{ log.time }}</span>
            <span class="stream-source">[{{ log.type }}]</span>
            <span class="stream-content">{{ log.payload }}</span>
          </div>
          <div v-if="debugStats.total > debugLogs.length" class="debug-more">
            ... 其余 {{ debugStats.total - debugLogs.length }} 条已省略（debug 事件量最大，生产环境慎用）
          </div>
        </div>
      </div>
    </div>

    <!-- 代码展示：JS 版 -->
    <details class="code-block" style="margin-top: 16px;">
      <summary>📝 LangGraph.js 核心代码（5 种 streamMode + getWriter + 多模式组合）</summary>
      <pre class="code-content">{{ jsCodeSample }}</pre>
    </details>

    <!-- 代码展示：Python 对比 -->
    <details class="code-block" style="margin-top: 8px;">
      <summary>🐍 LangGraph Python 对比代码</summary>
      <pre class="code-content">{{ pyCodeSample }}</pre>
    </details>

    <!-- 5 种 streamMode 对比表 -->
    <div class="info-box" style="margin-top: 12px; background: #f0f9ff; border-color: #bae6fd; color: #0369a1;">
      <strong>📡 5 种 streamMode 对比：</strong><br />
      <table class="compare-table">
        <thead>
          <tr>
            <th>streamMode</th>
            <th>输出内容</th>
            <th>数据形态</th>
            <th>粒度</th>
            <th>典型场景</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>values</strong></td>
            <td>每个超步后的<strong>完整状态</strong></td>
            <td><code>State</code> 对象</td>
            <td>节点级</td>
            <td>状态面板、调试状态演变</td>
          </tr>
          <tr>
            <td><strong>updates</strong></td>
            <td>每个超步的<strong>节点增量</strong></td>
            <td><code>{ nodeName: partialState }</code></td>
            <td>节点级</td>
            <td>节点进度展示（哪个节点完成了）</td>
          </tr>
          <tr>
            <td><strong>messages</strong></td>
            <td>LLM 输出的<strong>令牌流</strong>（含中间节点）</td>
            <td><code>[messageChunk, metadata]</code> 元组</td>
            <td>令牌级 ⭐最细</td>
            <td>前端打字机效果、实时对话</td>
          </tr>
          <tr>
            <td><strong>custom</strong></td>
            <td>节点内 <code>writer()</code> 推送的<strong>自定义事件</strong></td>
            <td>任意（writer 参数原样透传）</td>
            <td>事件级</td>
            <td>进度百分比、阶段提示、业务事件</td>
          </tr>
          <tr>
            <td><strong>debug</strong></td>
            <td>引擎调试事件（任务调度/检查点写入）</td>
            <td><code>{ type, payload }</code></td>
            <td>引擎级</td>
            <td>排查图执行细节（事件量最大，生产慎用）</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- JS vs Python 关键差异 -->
    <div class="info-box" style="margin-top: 12px; background: #f0fdf4; border-color: #bbf7d0; color: #166534;">
      <strong>🔀 JS vs Python 关键差异：</strong><br />
      ① JS 自定义流用 <code>getWriter()</code>（返回可直接调用的函数），Python 用 <code>get_stream_writer()</code><br />
      ② JS 多模式组合 <code>streamMode: ['updates', 'custom']</code>，Python <code>stream_mode=['updates', 'custom']</code>（蛇形命名）<br />
      ③ 两者 messages 模式都输出 <code>[message, metadata]</code> 元组，<code>metadata.langgraph_node</code> 标识令牌来源节点<br />
      ④ JS 子图透传 <code>{ subgraphs: true }</code>，Python <code>subgraphs=True</code>，输出都变为 <code>[namespace, chunk]</code><br />
      ⑤ JS 消费用 <code>for await (const chunk of await graph.stream(...))</code>，Python 用 <code>for chunk in graph.stream(...)</code> 或异步 <code>astream(...)</code>
    </div>
  </div>
</template>

<script>
/* global INNER_API_KEY */
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
// @langchain/langgraph Streaming 核心导入：
// - StateGraph/Annotation/START/END: 构建两节点示例图（analyze → respond）
// - getWriter: 节点内部获取自定义流写入器（返回可直接调用的函数），
//   推送 streamMode='custom' 事件；仅当 stream 配置含 'custom' 时事件才进入流，否则为空操作
import { StateGraph, Annotation, START, END, getWriter } from '@langchain/langgraph'
import { stage12StreamingJsCode, stage12StreamingPyCode } from '@/composables/langgraphSamples.js'

export default {
  name: 'LangGraphStage12Streaming',

  data() {
    return {
      userInput: '',
      modelName: 'EB-DeepSeek-V4-Pro',
      streamMode: 'messages',
      enableWriter: true,
      loading: false,
      error: null,
      hasResult: false,
      // messages 模式：打字机文本（仅 answer 节点的令牌）
      typewriterText: '',
      // 最终状态（从 updates/values 事件累积）
      resultQuestion: '',
      finalSteps: [],
      finalAnswer: '',
      // 各模式日志
      updateLogs: [],
      valueSnapshots: [],
      customLogs: [],
      debugLogs: [],
      debugStats: { total: 0, task: 0, checkpoint: 0, other: 0 },
      // 代码示例
      jsCodeSample: '',
      pyCodeSample: ''
    }
  },

  created() {
    this.jsCodeSample = stage12StreamingJsCode
    this.pyCodeSample = stage12StreamingPyCode
  },

  methods: {
    /**
     * 快捷测试
     */
    quickTest(text) {
      this.userInput = text
      this.$nextTick(() => this.runWorkflow())
    },

    /**
     * 清空结果
     */
    clearResult() {
      this.hasResult = false
      this.typewriterText = ''
      this.resultQuestion = ''
      this.finalSteps = []
      this.finalAnswer = ''
      this.updateLogs = []
      this.valueSnapshots = []
      this.customLogs = []
      this.debugLogs = []
      this.debugStats = { total: 0, task: 0, checkpoint: 0, other: 0 }
      this.error = null
    },

    /**
     * 当前 streamMode 是否包含指定模式
     * combo = ['updates', 'custom', 'messages']
     */
    modeIncludes(mode) {
      if (this.streamMode === 'combo') {
        return ['updates', 'custom', 'messages'].includes(mode)
      }
      return this.streamMode === mode
    },

    /**
     * 添加自定义事件日志（UI 展示用）
     * 注意：writer() 推送的事件只有 streamMode 含 'custom' 时才真正进入流；
     * 这里同步 push 到组件状态，保证任何模式下都能看到 writer 推送了什么
     */
    addCustomLog(source, content) {
      const now = new Date()
      const time = now.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0')
      this.customLogs.push({ time, source, content })
    },

    /**
     * 添加调试事件日志（全部计数，最多展示 30 条）
     */
    addDebugLog(type, payload) {
      this.debugStats.total++
      if (type === 'task') this.debugStats.task++
      else if (type === 'checkpoint') this.debugStats.checkpoint++
      else this.debugStats.other++
      if (this.debugLogs.length < 30) {
        const now = new Date()
        const time = now.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0')
        this.debugLogs.push({ time, type, payload })
      }
    },

    /**
     * 分发处理单个流事件（按模式路由到对应的 UI 区域）
     */
    handleChunk(mode, chunk) {
      if (mode === 'values') {
        // values：chunk 是完整状态快照
        this.valueSnapshots.push({
          seq: this.valueSnapshots.length + 1,
          state: this.formatJSON(chunk)
        })
        this.mergeFinalState(chunk)
      } else if (mode === 'updates') {
        // updates：chunk 形如 { nodeName: partialState }
        const names = Object.keys(chunk)
        for (const nodeName of names) {
          if (nodeName.startsWith('__')) continue // 跳过 __interrupt__ 等内部键
          this.updateLogs.push({
            node: nodeName,
            update: this.formatJSON(chunk[nodeName])
          })
          this.mergeFinalState(chunk[nodeName])
        }
      } else if (mode === 'messages') {
        // messages：chunk 是 [messageChunk, metadata] 元组
        const [message, metadata] = chunk
        const node = metadata && metadata.langgraph_node
        const text = typeof message.content === 'string' ? message.content : ''
        if (text && node === 'respond') {
          // 只渲染 respond 节点的令牌 → 打字机效果
          // （analyze 节点的令牌被过滤，避免中间输出混入最终答案）
          // ⚠️ 节点名不能与状态字段同名：状态字段是 answer，节点名用 respond
          this.typewriterText += text
        }
      } else if (mode === 'custom') {
        // custom：chunk 是 writer() 推送的原始内容
        this.addCustomLog('stream', typeof chunk === 'string' ? chunk : this.formatJSON(chunk))
      } else if (mode === 'debug') {
        // debug：chunk 形如 { type: 'task'|'checkpoint', payload: {...} }
        this.addDebugLog(chunk.type, this.formatJSON(chunk.payload || chunk).substring(0, 200))
      }
    },

    /**
     * 将增量合并到最终状态（用于「最终答案」展示区）
     */
    mergeFinalState(partial) {
      if (!partial || typeof partial !== 'object') return
      if (partial.question !== undefined) this.resultQuestion = partial.question
      if (partial.steps !== undefined) this.finalSteps = partial.steps
      if (partial.answer !== undefined) this.finalAnswer = partial.answer
    },

    /**
     * 格式化 JSON
     */
    formatJSON(obj) {
      try {
        return JSON.stringify(obj, null, 2)
      } catch {
        return String(obj)
      }
    },

    /**
     * 流式执行工作流
     *
     * 阶段十二核心：graph.stream(input, { streamMode }) 的 5 种模式
     *
     * 执行流程：
     *   START → analyze（拆解步骤 + writer 自定义流）→ respond（生成回答，令牌流）→ END
     */
    async runWorkflow() {
      const question = this.userInput.trim()
      if (!question || this.loading) return

      this.clearResult()
      this.loading = true
      this.hasResult = true
      this.resultQuestion = question

      try {
        const llm = new ChatOpenAI({
          model: this.modelName,
          temperature: 0.7,
          apiKey: INNER_API_KEY,
          configuration: {
            baseURL: window.location.origin + '/inner/'
          }
        })

        const self = this

        // ============================================================
        // 节点 A：analyze — 拆解问题步骤 + getWriter() 自定义流
        // ============================================================
        const analyzeNode = async (state, config) => {
          // getWriter(config) — 获取自定义流写入器（返回可直接调用的函数）
          // ⚠️ 浏览器环境不支持 AsyncLocalStorage，必须把节点函数第二参数 config 传入
          // 仅当 stream 配置包含 'custom' 时事件才真正进入流，否则为空操作
          if (self.enableWriter) {
            const writer = getWriter(config)
            if (writer) {
              writer('🔍 正在分析问题：' + state.question)
            }
            // UI 同步展示（任何模式下都能看到 writer 推送了什么）
            self.addCustomLog('analyze', '🔍 正在分析问题：' + state.question)
          }

          const msg = await llm.invoke([
            new HumanMessage('把下面的问题拆解为1-2个分析步骤，每行一个步骤，只返回步骤列表：\n\n' + state.question)
          ])
          const steps = msg.content.split('\n').map(s => s.trim()).filter(Boolean)

          if (self.enableWriter) {
            const writer = getWriter(config)
            if (writer) {
              writer('✅ 分析完成，共 ' + steps.length + ' 个步骤')
            }
            self.addCustomLog('analyze', '✅ 分析完成，共 ' + steps.length + ' 个步骤')
          }

          return { steps }
        }

        // ============================================================
        // 节点 B：respond — 生成最终回答
        // 该节点的 LLM 输出会被 streamMode: 'messages' 捕获为令牌流
        // ⚠️ 节点名不能与状态字段（channel）同名，状态字段是 answer，故节点名为 respond
        // ============================================================
        const respondNode = async (state) => {
          const msg = await llm.invoke([
            new HumanMessage(
              '请回答以下问题（控制在150字以内）：\n\n' + state.question +
              '\n\n参考分析步骤：\n' + state.steps.join('\n')
            )
          ])
          return { answer: msg.content }
        }

        // ============================================================
        // 组装图：START → analyze → respond → END
        // Annotation.Root 定义状态 Schema，每个字段用「覆盖式」reducer
        // ============================================================
        const AgentState = Annotation.Root({
          question: Annotation({ reducer: (_, b) => b, default: () => '' }),
          steps: Annotation({ reducer: (_, b) => b, default: () => [] }),
          answer: Annotation({ reducer: (_, b) => b, default: () => '' })
        })

        const graph = new StateGraph(AgentState)
          .addNode('analyze', analyzeNode)
          .addNode('respond', respondNode)
          .addEdge(START, 'analyze')
          .addEdge('analyze', 'respond')
          .addEdge('respond', END)
          .compile()

        // ============================================================
        // 流式执行：streamMode 决定输出的事件类型
        // - 单模式（字符串）：chunk 就是该模式的数据
        // - 多模式（数组）：chunk 是 [mode, data] 元组
        // ============================================================
        const isCombo = this.streamMode === 'combo'
        const streamMode = isCombo ? ['updates', 'custom', 'messages'] : this.streamMode

        for await (const chunk of await graph.stream({ question }, { streamMode })) {
          if (isCombo) {
            const [mode, data] = chunk
            this.handleChunk(mode, data)
          } else {
            this.handleChunk(this.streamMode, chunk)
          }
        }

        // messages 模式下没有状态事件，用打字机文本补全最终答案
        if (!this.finalAnswer && this.typewriterText) {
          this.finalAnswer = this.typewriterText
        }
      } catch (e) {
        this.error = '执行失败：' + (e.message || e)
        console.error(e)
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style scoped>
.badge.stage {
  background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%);
  color: #fff;
}

/* 流式模式卡片 */
.mode-cards {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0;
}

.mode-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid;
  font-size: 12px;
}

.mode-name {
  font-weight: 700;
  font-family: 'Consolas', 'Monaco', monospace;
  min-width: 70px;
}

.mode-desc {
  color: #4b5563;
  line-height: 1.4;
}

.mode-values {
  background: #dbeafe;
  border-color: #3b82f6;
}

.mode-values .mode-name {
  color: #1e40af;
}

.mode-updates {
  background: #ede9fe;
  border-color: #8b5cf6;
}

.mode-updates .mode-name {
  color: #5b21b6;
}

.mode-messages {
  background: #cffafe;
  border-color: #06b6d4;
}

.mode-messages .mode-name {
  color: #0e7490;
}

.mode-custom {
  background: #fef3c7;
  border-color: #f59e0b;
}

.mode-custom .mode-name {
  color: #92400e;
}

.mode-debug {
  background: #f3f4f6;
  border-color: #6b7280;
}

.mode-debug .mode-name {
  color: #374151;
}

/* 打字机效果 */
.typewriter-box {
  background: #1f2937;
  color: #e5e7eb;
  padding: 12px 14px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.8;
  min-height: 60px;
  white-space: pre-wrap;
  word-break: break-all;
}

.cursor {
  display: inline-block;
  color: #06b6d4;
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.debug-more {
  font-size: 12px;
  color: #9ca3af;
  font-style: italic;
  padding: 6px 8px;
}

/* 图结构 */
.streaming-diagram {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 16px 0;
}

.node-analyze {
  background: #fef3c7;
  border: 2px solid #f59e0b;
  color: #92400e;
}

.node-answer {
  background: #dbeafe;
  border: 2px solid #3b82f6;
  color: #1e40af;
}

/* 输入区域 */
.input-section {
  display: flex;
  flex-direction: column;
}

.input-section textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  box-sizing: border-box;
  resize: vertical;
}

.input-section .btn-row {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.input-section button {
  padding: 10px 20px;
  background: #0891b2;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}

.input-section button:hover {
  background: #0e7490;
}

.input-section button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-clear {
  background: #6b7280 !important;
}

.btn-clear:hover {
  background: #4b5563 !important;
}

/* 通用样式（与现有组件保持一致） */
.info-box {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
  font-size: 14px;
  line-height: 1.8;
  color: #374151;
}

.config-section {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  font-size: 14px;
}

.config-section label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.config-section select {
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
}

.quick-test-section {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.quick-test-label {
  font-size: 13px;
  color: #6b7280;
}

.btn-quick {
  padding: 6px 12px;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.btn-quick:hover {
  background: #e5e7eb;
}

.btn-quick:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-msg {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 10px 14px;
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 14px;
}

.result-area {
  margin-top: 12px;
}

.result-box {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.result-label {
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%);
}

.result-content {
  padding: 12px 14px;
  font-size: 14px;
}

.result-field {
  margin-bottom: 6px;
}

.result-field:last-child {
  margin-bottom: 0;
}

.field-key {
  color: #6b7280;
  font-weight: 500;
}

.field-value {
  color: #1f2937;
}

.field-value.highlight {
  color: #0e7490;
  font-weight: 600;
}

.field-value.muted {
  color: #9ca3af;
  font-size: 11px;
}

.execution-step {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  margin-bottom: 8px;
  overflow: hidden;
}

.execution-step:last-child {
  margin-bottom: 0;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #f3f4f6;
  font-size: 13px;
}

.step-number {
  font-weight: 600;
  color: #0891b2;
}

.step-node {
  color: #374151;
}

.step-decision {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.step-decision.cmd-goto {
  background: #d1fae5;
  color: #065f46;
}

.step-decision.cmd-subgraph {
  background: #ede9fe;
  color: #5b21b6;
}

.step-detail {
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.6;
}

.state-json {
  background: #1f2937;
  color: #e5e7eb;
  padding: 8px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  overflow-x: auto;
  max-height: 200px;
  overflow-y: auto;
  margin: 4px 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.code-block {
  margin-bottom: 8px;
}

.code-block summary {
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: #0891b2;
  padding: 8px 0;
}

.code-content {
  background: #1f2937;
  color: #e5e7eb;
  padding: 14px;
  border-radius: 8px;
  font-size: 13px;
  font-family: 'Consolas', 'Monaco', monospace;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.6;
}

.compare-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
  font-size: 13px;
}

.compare-table th,
.compare-table td {
  border: 1px solid #e5e7eb;
  padding: 6px 10px;
  text-align: left;
}

.compare-table th {
  background: #f3f4f6;
  font-weight: 600;
}

/* 图结构可视化 */
.graph-viz-row {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}

.graph-viz {
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
}

.graph-viz-half {
  flex: 1;
  min-width: 0;
}

.graph-viz-title {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
  text-align: center;
}

.graph-viz-diagram {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 16px 0;
}

.graph-viz-legend {
  font-size: 12px;
  color: #6b7280;
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.graph-node {
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
}

.start-node {
  background: #d1fae5;
  border: 2px solid #10b981;
  color: #065f46;
}

.end-node {
  background: #fee2e2;
  border: 2px solid #ef4444;
  color: #991b1b;
}

.graph-arrow-h {
  font-size: 18px;
  color: #9ca3af;
  font-weight: bold;
}

@media (max-width: 768px) {
  .graph-viz-row {
    flex-direction: column;
  }
}
</style>