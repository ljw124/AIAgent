<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-10-13 11:00:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-10-20 18:42:55
 * @Description: 阶段十三：Functional API — entrypoint & task 函数式工作流
 *   学习目标：掌握 LangGraph v1.x 的 Functional API，理解函数式工作流与 StateGraph 的区别
 *   核心 API：entrypoint()、task()、getPreviousState()、entrypoint.final()、getWriter()
 *   场景：文档分析 — 并行执行情感分析、关键词提取、摘要生成
 *   ⚡ 真实 LLM：使用 ChatOpenAI 调用内网大模型
 *   API 提示：
 *     - entrypoint(options, func) — 定义函数式工作流入口，替代 StateGraph
 *       - options.name: 工作流名称
 *       - options.checkpointer: 检查点保存器（可选）
 *       - options.store: 长期存储（可选）
 *     - task(name, func) — 定义可并行执行的任务单元，调用返回 Promise
 *       - task(options, func) — 带配置：options.retry（RetryPolicy）、options.cachePolicy、options.timeout
 *     - getPreviousState() — 在 entrypoint 内部获取上一次通过 entrypoint.final 保存的状态
 *     - entrypoint.final({ value, save }) — 分离返回值（value）与持久化状态（save）
 *     - getWriter() — 获取自定义流式 writer，用于推送 streamMode='custom' 事件
 *     - workflow.invoke(input, config) — 同步执行
 *     - workflow.stream(input, { streamMode: 'custom' }) — 流式执行，接收 writer 自定义事件
-->
<template>
  <div>
    <h1>阶段十三：Functional API — entrypoint & task 函数式工作流 <span class="badge stage">LangGraph</span></h1>

    <!-- 学习目标 -->
    <div class="info-box">
      <strong>学习目标：</strong>掌握 LangGraph v1.x 的 <code>Functional API</code>（<code>entrypoint</code> + <code>task</code>），理解函数式工作流与 <code>StateGraph</code> 的区别<br />
      <strong>核心 API：</strong><code>entrypoint()</code>（工作流入口）、<code>task()</code>（可并行任务）、<code>getPreviousState()</code>（获取历史状态）、<code>entrypoint.final()</code>（分离返回值与持久化状态）、<code>getWriter()</code>（自定义流式输出）<br />
      <strong>场景：</strong>文档分析 — 并行执行情感分析、关键词提取、摘要生成<br />
      <strong>⚡ 真实 LLM：</strong>使用 <code>ChatOpenAI</code> 调用内网大模型<br />
      <strong>⚠️ 关键点：</strong>Functional API 是 StateGraph 的替代方案，更接近编写普通 async 函数；task 调用返回 Promise，天然支持 Promise.all 并行
    </div>

    <!-- 图结构可视化：左右并排 -->
    <div class="graph-viz-row">
      <!-- 左侧：Functional API 工作流结构（手绘） -->
      <div class="graph-viz graph-viz-half">
        <div class="graph-viz-title">📐 Functional API 工作流结构 — 文档分析（并行执行）</div>
        <div class="graph-viz-diagram functional-diagram">
          <div class="graph-node start-node">INPUT<br /><small>文档文本</small></div>
          <div class="graph-arrow-h">→</div>
          <div class="parallel-group">
            <div class="parallel-label">entrypoint 入口</div>
            <div class="parallel-tasks">
              <div class="graph-node node-task">task A<br /><small>情感分析</small></div>
              <div class="graph-node node-task">task B<br /><small>关键词提取</small></div>
              <div class="graph-node node-task">task C<br /><small>摘要生成</small></div>
            </div>
            <div class="parallel-label-bottom">Promise.all 并行执行</div>
          </div>
          <div class="graph-arrow-h">→</div>
          <div class="graph-node end-node">OUTPUT<br /><small>合并结果</small></div>
        </div>
        <div class="graph-viz-legend">
          <span>INPUT → entrypoint 入口函数</span>
          <span>entrypoint 内部调用 3 个 task → Promise.all 自动并行</span>
          <span>所有 task 完成后 → 合并结果返回</span>
          <span>⚡ 无需手动构建图结构，像写普通 async 函数一样</span>
        </div>
      </div>

      <!-- 右侧：StateGraph 等价实现（对比） -->
      <div class="graph-viz graph-viz-half">
        <div class="graph-viz-title">📐 等价 StateGraph 实现（对比）</div>
        <div class="graph-viz-diagram functional-diagram">
          <div class="graph-node start-node">START</div>
          <div class="graph-arrow-h">→</div>
          <div class="graph-node node-dispatcher">dispatcher<br /><small>分发任务<br />return Send[]</small></div>
          <div class="parallel-fanout">
            <div class="fanout-arrow">↘ ↓ ↙</div>
          </div>
          <div class="parallel-tasks">
            <div class="graph-node node-task">analyzer<br /><small>分析节点</small></div>
          </div>
          <div class="parallel-fanout">
            <div class="fanout-arrow">↘ ↓ ↙</div>
          </div>
          <div class="graph-node node-aggregator">aggregator<br /><small>汇总结果</small></div>
          <div class="graph-arrow-h">→</div>
          <div class="graph-node end-node">END</div>
        </div>
        <div class="graph-viz-legend">
          <span>START → dispatcher（普通边）</span>
          <span>dispatcher 返回 Send[] → 触发 N 个 analyzer 并行实例</span>
          <span>所有 analyzer 完成后 → aggregator（reducer 合并结果）</span>
          <span>⚠️ 需要手动定义 Annotation、节点、边、Send、reducer</span>
        </div>
      </div>
    </div>

    <!-- 配置区域 -->
    <div class="config-section">
      <label>
        LLM 模型：
        <select v-model="modelName">
          <option value="EB-DeepSeek-Flash">EB-DeepSeek-Flash</option>
          <option value="EB-GLM-Flash">EB-GLM-Flash</option>
        </select>
      </label>
      <label>
        演示模式：
        <select v-model="demoMode">
          <option value="functional">⚡ Functional API（entrypoint + task）</option>
          <option value="stategraph">📋 StateGraph 等价实现（对比）</option>
        </select>
      </label>
      <label>
        <input type="checkbox" v-model="enableStream" />
        <span>启用 writer 自定义流式输出</span>
      </label>
      <label>
        <input type="checkbox" v-model="enableCheckpoint" />
        <span>启用 checkpointer（MemorySaver）</span>
      </label>
    </div>

    <!-- 输入区域 -->
    <div class="input-section">
      <textarea
        v-model="userInput"
        rows="3"
        placeholder="输入文本，如：LangGraph是LangChain团队推出的图编排框架，支持构建复杂的多节点LLM工作流..."
        @keydown.ctrl.enter="runWorkflow"
      />
      <div class="btn-row">
        <button @click="runWorkflow" :disabled="loading">
          {{ loading ? '执行中...' : '▶ 执行 (Ctrl+Enter)' }}
        </button>
        <button @click="clearResult" class="btn-clear">清空结果</button>
      </div>
    </div>

    <!-- 快捷测试按钮 -->
    <div class="quick-test-section">
      <span class="quick-test-label">快捷测试：</span>
      <button class="btn-quick" @click="quickTest('LangGraph是LangChain团队推出的图编排框架，支持构建复杂的多节点LLM工作流，包括条件路由、人机协同、并行执行等高级特性')" :disabled="loading">
        📝 技术文本
      </button>
      <button class="btn-quick" @click="quickTest('今天天气晴朗，适合户外活动。公园里有很多人在散步、跑步和野餐，孩子们在草地上追逐嬉戏，一片欢乐祥和的景象')" :disabled="loading">
        🌤️ 生活文本
      </button>
      <button class="btn-quick" @click="quickTest('AI正在改变世界')" :disabled="loading">
        ⚡ 短文本
      </button>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- 执行结果 -->
    <div v-if="result" class="result-area">
      <!-- 最终结果 -->
      <div class="result-box">
        <div class="result-label">📤 最终结果</div>
        <div class="result-content">
          <div class="result-field">
            <span class="field-key">输入文本：</span>
            <span class="field-value">{{ result.input }}</span>
          </div>
          <div class="result-field">
            <span class="field-key">😊 情感分析：</span>
            <span class="field-value highlight">{{ result.sentiment || '(无)' }}</span>
          </div>
          <div class="result-field">
            <span class="field-key">🔑 关键词：</span>
            <span class="field-value highlight">{{ result.keywords || '(无)' }}</span>
          </div>
          <div class="result-field">
            <span class="field-key">📝 摘要：</span>
            <span class="field-value highlight">{{ result.summary || '(无)' }}</span>
          </div>
          <div class="result-field">
            <span class="field-key">执行模式：</span>
            <span class="field-value">{{ demoMode === 'functional' ? '⚡ Functional API' : '📋 StateGraph' }}</span>
          </div>
          <div v-if="result.previousState !== undefined" class="result-field">
            <span class="field-key">📜 上次执行状态（getPreviousState）：</span>
            <span class="field-value">{{ result.previousState }}</span>
          </div>
        </div>
      </div>

      <!-- Task 执行详情 -->
      <div class="result-box" style="margin-top: 12px;">
        <div class="result-label" style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);">
          ⚡ Task 执行详情
        </div>
        <div class="result-content">
          <div
            v-for="(detail, index) in taskDetails"
            :key="index"
            class="execution-step"
          >
            <div class="step-header">
              <span class="step-number">Task {{ index + 1 }}</span>
              <span class="step-node">{{ detail.name }}</span>
              <span class="step-decision cmd-goto">{{ detail.status }}</span>
              <span v-if="detail.parallel" class="step-decision cmd-subgraph">🔀 并行</span>
            </div>
            <div class="step-detail">
              <div><strong>耗时：</strong>{{ detail.duration }}ms</div>
              <div v-if="detail.output" style="margin-top: 6px;">
                <strong>输出内容：</strong>
                <pre class="state-json">{{ detail.output }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 流式输出日志 -->
      <div v-if="streamLogs.length > 0" class="result-box" style="margin-top: 12px;">
        <div class="result-label" style="background: linear-gradient(135deg, #06b6d4 0%, #0891b2 100%);">
          📡 writer 自定义流式输出日志
        </div>
        <div class="result-content">
          <div
            v-for="(log, index) in streamLogs"
            :key="index"
            class="stream-log-item"
          >
            <span class="stream-time">{{ log.time }}</span>
            <span class="stream-source">[{{ log.source }}]</span>
            <span class="stream-content">{{ log.content }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 代码展示：JS 版 -->
    <details class="code-block" style="margin-top: 16px;">
      <summary>📝 LangGraph.js 核心代码（Functional API）</summary>
      <pre class="code-content">{{ jsCodeSample }}</pre>
    </details>

    <!-- 代码展示：Python 对比 -->
    <details class="code-block" style="margin-top: 8px;">
      <summary>🐍 LangGraph Python 对比代码</summary>
      <pre class="code-content">{{ pyCodeSample }}</pre>
    </details>

    <!-- Functional API 核心概念 -->
    <div class="info-box" style="margin-top: 12px; background: #f0f9ff; border-color: #bae6fd; color: #0369a1;">
      <strong>⚡ Functional API 核心概念：</strong><br />
      <table class="compare-table">
        <thead>
          <tr>
            <th>概念</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>entrypoint(name, fn)</strong></td>
            <td>定义工作流入口函数，类似 <code>StateGraph.compile()</code>，将函数包装为可执行的工作流</td>
          </tr>
          <tr>
            <td><strong>task(name, fn)</strong></td>
            <td>定义可并行执行的任务，调用后返回 Promise，天然支持 <code>Promise.all</code> 并行</td>
          </tr>
          <tr>
            <td><strong>task({ retry, cachePolicy, timeout }, fn)</strong></td>
            <td>带配置的 task：支持 RetryPolicy（重试）、CachePolicy（缓存）、TimeoutPolicy（超时）</td>
          </tr>
          <tr>
            <td><strong>getPreviousState()</strong></td>
            <td>获取上一次执行时通过 <code>entrypoint.final({ save })</code> 持久化的状态</td>
          </tr>
          <tr>
            <td><strong>entrypoint.final({ value, save })</strong></td>
            <td>分离「返回给调用方的值」和「持久化到 checkpoint 的状态」</td>
          </tr>
          <tr>
            <td><strong>getWriter(config)</strong></td>
            <td>在 <strong>entrypoint 内部</strong>获取自定义流式写入器（task 拿不到 config，需由 entrypoint 传入 writer）</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Functional API vs StateGraph 对比 -->
    <div class="info-box" style="margin-top: 12px; background: #fefce8; border-color: #fde68a; color: #92400e;">
      <strong>🔀 Functional API vs StateGraph：</strong><br />
      <table class="compare-table">
        <thead>
          <tr>
            <th>特性</th>
            <th>StateGraph</th>
            <th>Functional API</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>编程风格</strong></td>
            <td>声明式图构建（节点 + 边）</td>
            <td>函数式（像写普通 async 函数）</td>
          </tr>
          <tr>
            <td><strong>并行执行</strong></td>
            <td>需用 <code>Send</code> API 手动分发</td>
            <td><code>Promise.all</code> 自动并行</td>
          </tr>
          <tr>
            <td><strong>状态管理</strong></td>
            <td><code>Annotation</code> + reducer</td>
            <td><code>getPreviousState()</code> + <code>entrypoint.final()</code></td>
          </tr>
          <tr>
            <td><strong>代码量</strong></td>
            <td>较多（需定义状态、节点、边）</td>
            <td>较少（直接写函数逻辑）</td>
          </tr>
          <tr>
            <td><strong>适用场景</strong></td>
            <td>复杂分支、条件路由、多节点 DAG</td>
            <td>线性/并行任务流水线、数据处理管道</td>
          </tr>
          <tr>
            <td><strong>checkpointer</strong></td>
            <td><code>graph.compile({ checkpointer })</code></td>
            <td><code>entrypoint({ checkpointer }, fn)</code></td>
          </tr>
          <tr>
            <td><strong>interrupt</strong></td>
            <td>✅ 支持</td>
            <td>✅ 支持</td>
          </tr>
          <tr>
            <td><strong>writer 流式输出</strong></td>
            <td>✅ 支持（节点内 <code>getWriter(config)</code>，config 由框架注入）</td>
            <td>✅ 支持（<strong>仅 entrypoint 内</strong> <code>getWriter(config)</code>，task 内调用会抛错）</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- JS vs Python 关键差异 -->
    <div class="info-box" style="margin-top: 12px; background: #f0fdf4; border-color: #bbf7d0; color: #166534;">
      <strong>🔀 JS vs Python 关键差异：</strong><br />
      ① JS 用 <code>task('name', fn)</code> 函数调用，Python 用 <code>@task</code> 装饰器（也支持函数调用方式）<br />
      ② JS 用 <code>entrypoint('name', fn)</code>，Python 用 <code>@entrypoint()</code> 装饰器<br />
      ③ JS 并行用 <code>Promise.all([...])</code>，Python 用 <code>asyncio.gather(...)</code><br />
      ④ JS 执行用 <code>workflow.invoke()</code>，Python 用 <code>workflow.ainvoke()</code>（异步）或 <code>workflow.invoke()</code>（同步）<br />
      ⑤ 两者都支持 <code>checkpointer</code>、<code>interrupt</code>、<code>store</code>、<code>getWriter()</code><br />
      ⑥ Functional API 的 task 内置支持 <code>retry</code>、<code>cachePolicy</code>、<code>timeout</code> 配置
    </div>
  </div>
</template>

<script>
/* global INNER_API_KEY */
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
// @langchain/langgraph Functional API 核心导入：
// - entrypoint: 函数式入口点，替代 StateGraph 的图构建方式
// - task: 定义可并行执行的任务单元，自动支持重试/缓存/超时策略
// - getPreviousState: 在 entrypoint 内部获取上一次执行保存的状态（需配合 checkpointer）
// - getWriter: 获取自定义流式输出 writer，用于推送 streamMode='custom' 事件
// - MemorySaver: 内存检查点保存器，用于支持 getPreviousState 和 entrypoint.final
import { entrypoint, task, getPreviousState, getWriter, MemorySaver } from '@langchain/langgraph'
import { stage13JsCode, stage13PyCode } from '@/composables/langgraphSamples.js'

export default {
  name: 'LangGraphStage13Functional',

  data() {
    return {
      userInput: '',
      demoMode: 'functional',
      modelName: 'EB-DeepSeek-Flash',
      enableStream: true,
      enableCheckpoint: false,
      loading: false,
      error: null,
      result: null,
      taskDetails: [],
      streamLogs: [],
      jsCodeSample: '',
      pyCodeSample: '',
      // checkpoint 相关
      checkpointer: null,
      threadId: 'functional-demo-' + Date.now(),
      executionCount: 0
    }
  },

  created() {
    this.jsCodeSample = stage13JsCode
    this.pyCodeSample = stage13PyCode
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
      this.result = null
      this.taskDetails = []
      this.streamLogs = []
      this.error = null
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
     * 添加流式日志
     */
    addStreamLog(source, content) {
      const now = new Date()
      const time = now.toLocaleTimeString('zh-CN', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0')
      this.streamLogs.push({ time, source, content })
    },

    /**
     * 执行工作流
     *
     * 阶段十三核心：使用 Functional API（entrypoint + task）构建工作流
     *
     * Functional API 模式流程：
     *   INPUT → entrypoint 入口 → Promise.all([taskA, taskB, taskC]) → 合并结果 → OUTPUT
     *
     * StateGraph 模式流程（对比）：
     *   START → dispatcher → Send[] → [analyzer × 3 并行] → aggregator → END
     */
    async runWorkflow() {
      const text = this.userInput.trim()
      if (!text || this.loading) return

      this.loading = true
      this.error = null
      this.result = null
      this.taskDetails = []
      this.streamLogs = []

      try {
        const llm = new ChatOpenAI({
          model: this.modelName,
          temperature: 0.7,
          apiKey: INNER_API_KEY,
          configuration: {
            baseURL: window.location.origin + '/inner/'
          }
        })

        if (this.demoMode === 'functional') {
          await this.runFunctionalMode(llm, text)
        } else {
          await this.runStateGraphMode(llm, text)
        }
      } catch (e) {
        this.error = '执行失败：' + (e.message || e)
        console.error(e)
      } finally {
        this.loading = false
      }
    },

    /**
     * Functional API 模式：entrypoint + task
     */
    async runFunctionalMode(llm, text) {
      const self = this

      // ============================================================
      // 定义 task：情感分析
      // task(name, func) — 定义一个可并行执行的任务单元
      // - 第一个参数 'analyzeSentiment' 是任务名称（用于日志/追踪）
      // - 第二个参数是异步执行函数，接收 entrypoint 传入的参数
      // - task 支持 TaskOptions：retry（重试策略）、cachePolicy（缓存策略）、timeout（超时策略）
      // ============================================================
      // ⚠️ 重要：task 函数只会收到「调用时显式传入的参数」，LangGraph 不会给它注入 config
      //   （源码 @langchain/langgraph/dist/pregel/call.cjs：func: (input) => func(...input)）
      //   只有 entrypoint 的函数才会收到 config（func: (input, config) => func(input, config)）
      //   所以这里第二个参数是 writer —— 由 entrypoint 通过 getWriter(config) 取得后显式传进来
      const analyzeSentiment = task('analyzeSentiment', async (inputText, writer) => {
        const startTime = Date.now()

        // writer(chunk) — 向 streamMode='custom' 推送自定义事件
        // 未启用流式（或 streamMode 不含 'custom'）时 writer 为 undefined，需先判空
        if (typeof writer === 'function') {
          writer('🔍 开始情感分析...')
          self.addStreamLog('analyzeSentiment', '🔍 开始情感分析...')
        }

        const msg = await llm.invoke([
          new HumanMessage('请分析以下文本的情感倾向，只返回一个词（正面/负面/中性）和简短理由（不超过20字）：\n\n' + inputText)
        ])
        const result = msg.content.trim()

        if (typeof writer === 'function') {
          writer('✅ 情感分析完成：' + result)
          self.addStreamLog('analyzeSentiment', '✅ 情感分析完成：' + result)
        }

        const duration = Date.now() - startTime
        self.taskDetails.push({
          name: 'analyzeSentiment（情感分析）',
          status: '✅ 完成',
          parallel: true,
          duration,
          output: result
        })

        return { sentiment: result }
      })

      // ============================================================
      // 定义 task：关键词提取
      // 每个 task 独立定义，由 entrypoint 通过 Promise.all 统一调度并行执行
      // ============================================================
      const extractKeywords = task('extractKeywords', async (inputText, writer) => {
        const startTime = Date.now()

        if (typeof writer === 'function') {
          writer('🔑 开始关键词提取...')
          self.addStreamLog('extractKeywords', '🔑 开始关键词提取...')
        }

        const msg = await llm.invoke([
          new HumanMessage('请从以下文本中提取3-5个关键词，用逗号分隔，只返回关键词：\n\n' + inputText)
        ])
        const result = msg.content.trim()

        if (typeof writer === 'function') {
          writer('✅ 关键词提取完成：' + result)
          self.addStreamLog('extractKeywords', '✅ 关键词提取完成：' + result)
        }

        const duration = Date.now() - startTime
        self.taskDetails.push({
          name: 'extractKeywords（关键词提取）',
          status: '✅ 完成',
          parallel: true,
          duration,
          output: result
        })

        return { keywords: result }
      })

      // ============================================================
      // 定义 task：摘要生成
      // task 之间相互独立，无共享状态，天然支持并行
      // ============================================================
      const generateSummary = task('generateSummary', async (inputText, writer) => {
        const startTime = Date.now()

        if (typeof writer === 'function') {
          writer('📝 开始摘要生成...')
          self.addStreamLog('generateSummary', '📝 开始摘要生成...')
        }

        const msg = await llm.invoke([
          new HumanMessage('请用一句话总结以下内容（不超过50字）：\n\n' + inputText)
        ])
        const result = msg.content.trim()

        if (typeof writer === 'function') {
          writer('✅ 摘要生成完成：' + result)
          self.addStreamLog('generateSummary', '✅ 摘要生成完成：' + result)
        }

        const duration = Date.now() - startTime
        self.taskDetails.push({
          name: 'generateSummary（摘要生成）',
          status: '✅ 完成',
          parallel: true,
          duration,
          output: result
        })

        return { summary: result }
      })

      // ============================================================
      // 定义 entrypoint：文档分析工作流
      // entrypoint(options, func) — 函数式工作流入口，替代 StateGraph
      // - options.name: 工作流名称（用于日志/追踪）
      // - options.checkpointer: 检查点保存器（可选，用于支持 getPreviousState 和 entrypoint.final）
      // - options.store: 长期存储（可选，用于跨线程共享数据）
      // - func: 异步执行函数，内部可调用 task 和 getPreviousState
      // ============================================================
      const entrypointOptions = {
        name: 'documentAnalysis'
      }

      // MemorySaver — 内存检查点保存器
      // 用于在内存中保存每次 entrypoint 执行的状态快照
      // 生产环境可替换为 SqliteSaver 或其他持久化实现
      if (this.enableCheckpoint) {
        if (!this.checkpointer) {
          this.checkpointer = new MemorySaver()
        }
        entrypointOptions.checkpointer = this.checkpointer
      }

      // ⚠️ 关键：entrypoint 的第二个参数才是 config（LangGraph 会注入）
      //   在 entrypoint 内用 getWriter(config) 取到 writer，再显式传给各个 task
      //   这样即使在浏览器（无 AsyncLocalStorage）环境也不会触发
      //   "Config not retrievable" 错误
      const workflow = entrypoint(entrypointOptions, async (inputText, config) => {
        // writer 仅在 streamMode 包含 'custom' 时有值；未启用流式时为 undefined
        const writer = self.enableStream ? getWriter(config) : undefined
        self.addStreamLog('entrypoint', '🚀 工作流启动，输入文本长度：' + inputText.length + ' 字符')

        // getPreviousState() — 获取上一次执行通过 entrypoint.final 保存的状态
        // 仅在配置了 checkpointer 时可用；首次执行时返回 undefined（无历史状态）
        // ⚠️ getPreviousState() 没有 config 参数，内部依赖 AsyncLocalStorage
        //   浏览器（MockAsyncLocalStorage）下会抛 TypeError，所以必须 try/catch 兜底
        let previousState = undefined
        if (self.enableCheckpoint) {
          try {
            previousState = getPreviousState()
            if (previousState !== undefined) {
              self.addStreamLog('entrypoint', '📜 获取到上次执行状态：' + JSON.stringify(previousState))
            }
          } catch (e) {
            // 浏览器等无 AsyncLocalStorage 的环境无法读取历史状态（检查点仍会正常保存）
            self.addStreamLog('entrypoint', 'ℹ️ 当前环境无法读取历史状态，跳过 getPreviousState()')
          }
        }

        // ⚡ 核心：三个 task 通过 Promise.all 自动并行执行
        // 无需手动构建图、定义 Send、配置 reducer
        // 每个 task 调用返回 Promise，Promise.all 等待全部完成
        self.addStreamLog('entrypoint', '⚡ 启动 3 个 task 并行执行（Promise.all）...')

        const [sentimentResult, keywordsResult, summaryResult] = await Promise.all([
          analyzeSentiment(inputText, writer),
          extractKeywords(inputText, writer),
          generateSummary(inputText, writer)
        ])

        self.addStreamLog('entrypoint', '✅ 所有 task 执行完成，合并结果')

        self.executionCount++

        // entrypoint.final({ value, save }) — 分离返回值与持久化状态
        // - value: 返回给调用方的结果（invoke/stream 的返回值）
        // - save: 保存到 checkpointer 的状态（可通过 getPreviousState() 获取）
        // 不使用 entrypoint.final 时，返回值同时作为 value 和 save
        if (self.enableCheckpoint) {
          return entrypoint.final({
            value: {
              input: inputText,
              sentiment: sentimentResult.sentiment,
              keywords: keywordsResult.keywords,
              summary: summaryResult.summary,
              executionCount: self.executionCount
            },
            save: {
              lastInput: inputText.substring(0, 50),
              lastSentiment: sentimentResult.sentiment,
              executionCount: self.executionCount
            }
          })
        }

        // 不使用 checkpoint 时直接返回
        return {
          input: inputText,
          sentiment: sentimentResult.sentiment,
          keywords: keywordsResult.keywords,
          summary: summaryResult.summary
        }
      })

      // ============================================================
      // 执行工作流
      // ============================================================
      const config = this.enableCheckpoint
        ? { configurable: { thread_id: this.threadId } }
        : undefined

      let finalResult
      if (this.enableStream) {
        // workflow.stream(input, config) — 流式执行 entrypoint
        // streamMode 传数组可同时订阅多种事件，yield 出 [mode, payload]：
        //   'custom' — entrypoint / task 内通过 writer 推送的自定义事件
        //   'values' — 每步之后的完整状态值（用它取最终返回值）
        // 其他可选：'updates'（节点级增量）、'messages'（LLM 消息令牌）
        // ⚠️ 不要写成「先 stream() 再 invoke()」：那会让整个工作流执行两遍
        //    （LLM 调用翻倍、executionCount 异常递增），values 事件里已含最终结果
        this.addStreamLog('system', '📡 使用 stream() 执行（接收 writer 自定义事件）...')
        for await (const chunk of await workflow.stream(text, { ...config, streamMode: ['custom', 'values'] })) {
          const [mode, payload] = chunk
          if (mode === 'custom') {
            // writer 推送的自定义事件
            self.addStreamLog('stream', typeof payload === 'string' ? payload : JSON.stringify(payload))
          } else if (mode === 'values' && payload && typeof payload === 'object') {
            finalResult = payload
          }
        }
        finalResult = finalResult || {}
      } else {
        // 非流式模式直接 invoke 获取结果
        finalResult = await workflow.invoke(text, config)
      }

      // 获取 previousState（如果启用了 checkpoint）
      let previousStateDisplay = undefined
      if (this.enableCheckpoint && this.executionCount > 1) {
        previousStateDisplay = '第 ' + this.executionCount + ' 次执行（上次保存的状态可通过 getPreviousState() 获取）'
      }

      this.result = {
        input: finalResult.input || text,
        sentiment: finalResult.sentiment || '',
        keywords: finalResult.keywords || '',
        summary: finalResult.summary || '',
        previousState: previousStateDisplay
      }
    },

    /**
     * StateGraph 模式（对比）：等价实现
     */
    async runStateGraphMode(llm, text) {
      // 动态导入 @langchain/langgraph 的 StateGraph 模式 API（与 Functional API 对比）
      // StateGraph: 需要手动定义状态 Schema、节点、边、Send 分发
      // Annotation: 定义状态字段及其 reducer（归并策略）
      // START/END: 图的起始/结束标记
      // Send: 并行任务分发（Functional API 中用 Promise.all 替代）
      const { StateGraph, Annotation, START, END, Send } = await import('@langchain/langgraph')

      const self = this

      // ============================================================
      // Annotation.Root({...}) — 定义状态 Schema
      // 每个字段通过 Annotation({ reducer, default }) 定义：
      // - reducer: 状态更新时的归并函数（(prev, next) => merged）
      // - default: 状态初始值的工厂函数
      // 对比 Functional API：无需定义状态 Schema，task 返回值自动合并
      // ============================================================
      const AnalysisState = Annotation.Root({
        input: Annotation({
          reducer: (_, right) => right,
          default: () => ''
        }),
        sentiment: Annotation({
          reducer: (_, right) => right,
          default: () => ''
        }),
        keywords: Annotation({
          reducer: (_, right) => right,
          default: () => ''
        }),
        summary: Annotation({
          reducer: (_, right) => right,
          default: () => ''
        }),
        // 并行结果收集（需要 reducer 合并）
        partialResults: Annotation({
          reducer: (prev, next) => {
            if (Array.isArray(next)) return [...prev, ...next]
            return [...prev, next]
          },
          default: () => []
        })
      })

      // ============================================================
      // new StateGraph(stateSchema) — 构建状态图
      // 需要手动定义节点（addNode）、边（addEdge/addConditionalEdges）
      // 对比 Functional API：entrypoint 自动处理执行流程
      // ============================================================
      const graph = new StateGraph(AnalysisState)

      // 分发节点：为每个分析任务创建 Send
      graph.addNode('dispatcher', () => {
        self.addStreamLog('dispatcher', '📤 创建 3 个 Send 分发并行任务...')
        return {}
      })

      // 分析节点：根据 taskType 执行不同的分析
      graph.addNode('analyzer', async (state) => {
        const taskType = state.partialResults?.length
          ? ['sentiment', 'keywords', 'summary'][state.partialResults.length - 1]
          : 'unknown'

        const startTime = Date.now()
        let result = ''

        if (taskType === 'sentiment' || !state.sentiment) {
          const msg = await llm.invoke([
            new HumanMessage('请分析以下文本的情感倾向，只返回一个词（正面/负面/中性）和简短理由（不超过20字）：\n\n' + state.input)
          ])
          result = msg.content.trim()
          self.taskDetails.push({
            name: 'analyzer（情感分析）',
            status: '✅ 完成',
            parallel: true,
            duration: Date.now() - startTime,
            output: result
          })
          return { sentiment: result, partialResults: [{ type: 'sentiment', result }] }
        } else if (taskType === 'keywords' || !state.keywords) {
          const msg = await llm.invoke([
            new HumanMessage('请从以下文本中提取3-5个关键词，用逗号分隔，只返回关键词：\n\n' + state.input)
          ])
          result = msg.content.trim()
          self.taskDetails.push({
            name: 'analyzer（关键词提取）',
            status: '✅ 完成',
            parallel: true,
            duration: Date.now() - startTime,
            output: result
          })
          return { keywords: result, partialResults: [{ type: 'keywords', result }] }
        } else {
          const msg = await llm.invoke([
            new HumanMessage('请用一句话总结以下内容（不超过50字）：\n\n' + state.input)
          ])
          result = msg.content.trim()
          self.taskDetails.push({
            name: 'analyzer（摘要生成）',
            status: '✅ 完成',
            parallel: true,
            duration: Date.now() - startTime,
            output: result
          })
          return { summary: result, partialResults: [{ type: 'summary', result }] }
        }
      })

      // 汇总节点
      graph.addNode('aggregator', () => {
        self.addStreamLog('aggregator', '📥 汇总并行结果...')
        return {}
      })

      // addConditionalEdges + Send[] — 并行任务分发
      // Send(nodeName, args): 向目标节点发送一次执行，多个 Send 自动并行
      // 对比 Functional API：直接用 Promise.all([taskA(), taskB(), taskC()])
      graph.addConditionalEdges('dispatcher', () => {
        return [
          new Send('analyzer', { taskType: 'sentiment' }),
          new Send('analyzer', { taskType: 'keywords' }),
          new Send('analyzer', { taskType: 'summary' })
        ]
      })

      // addEdge — 添加固定边（无条件路由）
      graph.addEdge(START, 'dispatcher')
      graph.addEdge('analyzer', 'aggregator')
      graph.addEdge('aggregator', END)

      // graph.compile() — 编译状态图为可执行对象
      const compiledGraph = graph.compile()

      // compiledGraph.invoke(input) — 同步执行编译后的图
      const result = await compiledGraph.invoke({ input: text })

      this.result = {
        input: text,
        sentiment: result.sentiment || '',
        keywords: result.keywords || '',
        summary: result.summary || ''
      }
    }
  }
}
</script>

<style scoped>
.badge.stage {
  background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%);
  color: #fff;
}

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
  background: #7c3aed;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}

.input-section button:hover {
  background: #6d28d9;
}

.input-section button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Functional API 图结构 */
.functional-diagram {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 16px 0;
}

.parallel-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  border: 2px dashed #8b5cf6;
  border-radius: 12px;
  padding: 10px 14px;
  background: #faf5ff;
}

.parallel-label {
  font-size: 12px;
  font-weight: 600;
  color: #7c3aed;
}

.parallel-label-bottom {
  font-size: 11px;
  color: #6b7280;
  font-style: italic;
}

.parallel-tasks {
  display: flex;
  gap: 8px;
}

.node-task {
  background: #ede9fe;
  border: 2px solid #8b5cf6;
  color: #5b21b6;
}

/* 流式日志 */
.stream-log-item {
  display: flex;
  gap: 8px;
  padding: 4px 8px;
  font-size: 13px;
  font-family: 'Consolas', 'Monaco', monospace;
  border-bottom: 1px solid #f3f4f6;
}

.stream-log-item:last-child {
  border-bottom: none;
}

.stream-time {
  color: #9ca3af;
  white-space: nowrap;
  min-width: 80px;
}

.stream-source {
  color: #7c3aed;
  font-weight: 600;
  white-space: nowrap;
  min-width: 140px;
}

.stream-content {
  color: #374151;
  word-break: break-all;
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
  background: linear-gradient(135deg, #7c3aed 0%, #6366f1 100%);
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
  color: #7c3aed;
  font-weight: 600;
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
  color: #7c3aed;
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
  color: #7c3aed;
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

.node-dispatcher {
  background: #fef3c7;
  border: 2px solid #f59e0b;
  color: #92400e;
}

.node-aggregator {
  background: #dbeafe;
  border: 2px solid #3b82f6;
  color: #1e40af;
}

.graph-arrow-h {
  font-size: 18px;
  color: #9ca3af;
  font-weight: bold;
}

.parallel-fanout {
  display: flex;
  justify-content: center;
}

.fanout-arrow {
  font-size: 16px;
  color: #8b5cf6;
  font-weight: bold;
}

.mermaid-container {
  overflow-x: auto;
}

.mermaid-placeholder {
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
  padding: 20px;
}

@media (max-width: 768px) {
  .graph-viz-row {
    flex-direction: column;
  }
}
</style>