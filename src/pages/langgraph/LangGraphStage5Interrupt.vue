<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-21 12:00:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-22 16:27:54
 * @Description: 阶段五：Human-in-the-Loop — interrupt 人机协同
 *   学习目标：掌握 interrupt() 的用法，理解人机协同工作流
 *   核心 API：interrupt()、new Command({ resume })、MemorySaver、checkpointer
 *   场景：AI 生成方案 → interrupt 暂停等待人工审批 → 审批后继续执行
 *   ⚡ 真实 LLM：使用 ChatOpenAI 调用内网大模型生成方案
-->
<template>
  <div>
    <h1>阶段五：Human-in-the-Loop — interrupt 人机协同 <span class="badge stage">LangGraph</span></h1>

    <!-- 学习目标 -->
    <div class="info-box">
      <strong>学习目标：</strong>掌握 <code>interrupt()</code> 的用法，理解人机协同工作流<br />
      <strong>核心 API：</strong><code>interrupt()</code>、<code>new Command({ resume })</code>、<code>MemorySaver</code>、<code>checkpointer</code><br />
      <strong>场景：</strong>AI 生成方案 → interrupt 暂停等待人工审批 → 审批后继续执行<br />
      <strong>⚡ 真实 LLM：</strong>使用 <code>ChatOpenAI</code> 调用内网大模型生成方案<br />
      <strong>⚠️ 前提：</strong>interrupt 必须配合 <code>checkpointer</code>（如 <code>MemorySaver</code>）使用
    </div>

    <!-- 图结构可视化：左右并排 -->
    <div class="graph-viz-row">
      <!-- 左侧：当前图结构（手绘） -->
      <div class="graph-viz graph-viz-half">
        <div class="graph-viz-title">📐 当前图结构 — interrupt 人机协同（条件路由审批工作流）</div>
        <div class="graph-viz-diagram">
          <div class="graph-node start-node">START</div>
          <div class="graph-arrow">→</div>
          <div class="graph-node node-generate">generate<br /><small>LLM 生成方案</small></div>
          <div class="graph-arrow">→</div>
          <div class="graph-node node-interrupt">approval<br /><small>⏸️ interrupt<br />等待人工审批</small></div>
          <div class="graph-arrow">→</div>
          <div class="graph-node node-condition">条件路由<br /><small>approved?</small></div>
          <div class="graph-arrow">→</div>
          <!-- 分支连接线 + 两个分支 -->
          <div class="branch-container">
            <div class="branch-split">
              <div class="branch-item branch-approve">
                <span class="branch-label approve">✅ 批准</span>
                <div class="graph-arrow">→</div>
                <div class="graph-node node-execute">execute<br /><small>执行方案</small></div>
                <div class="graph-arrow">→</div>
                <div class="graph-node end-node">END</div>
              </div>
              <div class="branch-item branch-reject">
                <span class="branch-label reject">❌ 拒绝</span>
                <div class="graph-arrow">→</div>
                <div class="graph-node node-revise">revisePlan<br /><small>LLM 重新生成</small></div>
                <div class="graph-arrow">→</div>
                <span class="loop-back">↻ 循环回 approval</span>
              </div>
            </div>
          </div>
        </div>
        <div class="graph-viz-legend">
          <span>START → generate（普通边）</span>
          <span>generate → approval（普通边）</span>
          <span>approval 内部调用 interrupt() 暂停，等待人工通过 Command({ resume }) 恢复</span>
          <span>approval → 条件路由：批准 → execute → END</span>
          <span>approval → 条件路由：拒绝 → revisePlan（LLM 重新生成）→ approval（循环审批）</span>
        </div>
      </div>

      <!-- 右侧：LangGraph 官方图结构（Mermaid） -->
      <div class="graph-viz graph-viz-half">
        <div class="graph-viz-title">
          📐 LangGraph 官方图结构（getGraphAsync + drawMermaid）
        </div>
        <div v-if="mermaidGraph" ref="mermaidContainer" class="mermaid-container"></div>
        <div v-else class="mermaid-placeholder">
          <p>启动审批工作流后将自动生成</p>
        </div>
      </div>
    </div>

    <!-- 配置区域 -->
    <div class="config-section">
      <label>
        方案主题：
        <input
          v-model="planTopic"
          type="text"
          placeholder="输入方案主题，如：双十一促销活动方案"
          style="width: 280px;"
        />
      </label>
      <label>
        LLM 模型：
        <select v-model="modelName">
          <option value="EB-DeepSeek-V4-Pro">EB-DeepSeek-V4-Pro</option>
          <option value="EB-GLM-5.2">EB-GLM-5.2</option>
        </select>
      </label>
    </div>

    <!-- 操作按钮 -->
    <div class="input-section">
      <button @click="runGraph" :disabled="loading || waitingApproval">
        {{ loading ? '工作流执行中...' : '▶ 启动审批工作流' }}
      </button>
      <button @click="clearResult" class="btn-clear" :disabled="loading">清空结果</button>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- 等待审批状态 -->
    <div v-if="waitingApproval" class="approval-panel">
      <div class="approval-header">
        <span class="approval-icon">⏸️</span>
        <span>
          等待人工审批 — 图已暂停在
          <code>approval</code> 节点
          <span v-if="revisionCount > 0" style="color: #f11100;">（第 {{ revisionCount }} 轮重新审批）</span>
        </span>
      </div>
      <div class="approval-body">
        <div class="approval-plan">
          <strong>📋 AI 生成的方案：</strong>
          <div class="plan-content">{{ generatedPlan }}</div>
        </div>
        <div class="approval-actions">
          <label>
            审批意见（拒绝时必填）：
            <input
              v-model="approvalComment"
              type="text"
              placeholder="输入审批意见"
              style="width: 300px;"
            />
          </label>
          <div class="approval-buttons">
            <button class="btn-approve" @click="approve" :disabled="resuming">
              ✅ 批准方案
            </button>
            <button class="btn-reject" @click="reject" :disabled="resuming || !approvalComment.trim()">
              ❌ 拒绝方案
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 执行结果 -->
    <div v-if="result" class="result-area">
      <!-- 最终状态 -->
      <div class="result-box">
        <div class="result-label">📤 最终状态</div>
        <div class="result-content">
          <div class="result-field">
            <span class="field-key">审批结果：</span>
            <span class="field-value" :class="result.approved ? 'text-success' : 'text-danger'">
              {{ result.approved ? '✅ 已批准' : '❌ 已拒绝' }}
            </span>
          </div>
          <div class="result-field">
            <span class="field-key">执行结果：</span>
            <span class="field-value">{{ result.result }}</span>
          </div>
          <div v-if="result.revisionCount > 0" class="result-field">
            <span class="field-key">修改轮次：</span>
            <span class="field-value" style="color: #d97706;">{{ result.revisionCount }} 轮</span>
          </div>
          <div class="result-field">
            <span class="field-key">线程 ID：</span>
            <span class="field-value"><code>{{ threadId }}</code></span>
          </div>
        </div>
      </div>

      <!-- Interrupt 流程详情 -->
      <div class="result-box" style="margin-top: 12px;">
        <div class="result-label" style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);">
          🔄 Interrupt 流程详情
        </div>
        <div class="result-content">
          <div
            v-for="(step, index) in interruptFlow"
            :key="index"
            class="execution-step"
          >
            <div class="step-header">
              <span class="step-number">步骤 {{ index + 1 }}</span>
              <span class="step-node">阶段：{{ step.phase }}</span>
              <span :class="'step-badge ' + step.type">{{ step.typeLabel }}</span>
            </div>
            <div class="step-detail">
              <div><strong>说明：</strong>{{ step.description }}</div>
              <div v-if="step.data" style="margin-top: 6px;">
                <strong>数据：</strong>
                <pre class="state-json">{{ formatJSON(step.data) }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 执行步骤详情 -->
      <div class="result-box" style="margin-top: 12px;">
        <div class="result-label" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
          🔍 执行步骤详情
        </div>
        <div class="result-content">
          <div
            v-for="(step, index) in executionSteps"
            :key="index"
            class="execution-step"
          >
            <div class="step-header">
              <span class="step-number">步骤 {{ index + 1 }}</span>
              <span class="step-node">节点：{{ step.node }}</span>
            </div>
            <div class="step-detail">
              <div><strong>输入状态：</strong></div>
              <pre class="state-json">{{ step.input }}</pre>
              <div><strong>节点输出：</strong></div>
              <pre class="state-json">{{ step.output }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 代码展示：JS 版 -->
    <details class="code-block" style="margin-top: 16px;">
      <summary>📝 LangGraph.js 核心代码（interrupt 人机协同）</summary>
      <pre class="code-content">{{ jsCodeSample }}</pre>
    </details>

    <!-- 代码展示：Python 对比 -->
    <details class="code-block" style="margin-top: 8px;">
      <summary>🐍 LangGraph Python 对比代码</summary>
      <pre class="code-content">{{ pyCodeSample }}</pre>
    </details>

    <!-- JS vs Python 关键差异 -->
    <div class="info-box" style="margin-top: 12px; background: #fefce8; border-color: #fde68a; color: #92400e;">
      <strong>🔀 JS vs Python 关键差异：</strong><br />
      ① <code>interrupt()</code> 函数在两个版本中签名和行为<b>完全一致</b><br />
      ② JS 用 <code>new Command({ resume: {...} })</code>（构造函数），Python 用 <code>Command(resume={...})</code>（直接实例化）<br />
      ③ JS 用 <code>graph.compile({ checkpointer })</code>（对象参数），Python 用 <code>graph.compile(checkpointer=checkpointer)</code>（关键字参数）<br />
      ④ 线程配置格式一致：<code>{ configurable: { thread_id: '...' } }</code><br />
      ⑤ interrupt 必须配合 <code>checkpointer</code>（如 <code>MemorySaver</code>）使用，否则会报错<br />
      ⑥ interrupt 的返回值是 <code>resume</code> 传入的值，可以在节点中直接使用
    </div>

    <!-- Interrupt 工作原理 -->
    <div class="info-box" style="margin-top: 12px; background: #f0f9ff; border-color: #bae6fd; color: #0369a1;">
      <strong>⚙️ interrupt() 工作原理：</strong><br />
      ① 节点中调用 <code>interrupt(value)</code> 时，LangGraph 抛出 <code>GraphInterrupt</code> 异常<br />
      ② 图引擎捕获异常，将当前状态保存到 <code>checkpointer</code>（如 <code>MemorySaver</code>）<br />
      ③ 前端检测到中断状态，展示「等待审批」UI<br />
      ④ 用户做出决策后，调用 <code>app.invoke(new Command({ resume: decision }), config)</code><br />
      ⑤ 图引擎从 checkpointer 恢复状态，将 <code>resume</code> 值作为 <code>interrupt()</code> 的返回值<br />
      ⑥ 节点继续执行后续逻辑
    </div>
  </div>
</template>

<script>
/* global INNER_API_KEY */
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
import { StateGraph, Annotation, START, END, Command, interrupt, MemorySaver, isInterrupted, INTERRUPT, isGraphInterrupt } from '@langchain/langgraph'
import mermaid from 'mermaid'
import { stage5JsCode, stage5PyCode } from '@/composables/langgraphSamples.js'

export default {
  name: 'LangGraphStage5Interrupt',

  data() {
    return {
      planTopic: '双十一促销活动方案',
      modelName: 'EB-DeepSeek-V4-Pro',
      loading: false,
      resuming: false, // 是否正在恢复执行
      waitingApproval: false,
      revisionCount: 0, // 方案被拒绝后重新生成的次数计数器
      error: null,
      result: null, // 最终执行结果
      generatedPlan: '', // 当前生成的方案内容
      approvalComment: '', // 用户输入的审批意见
      threadId: '',
      executionSteps: [], // 执行步骤日志数组，记录每个节点的执行状态（节点名、耗时、输出摘要）
      interruptFlow: [], // 中断流程记录数组，记录每次 interrupt() 被触发时的信息（中断 ID、问题、方案内容）
      mermaidGraph: '', // Mermaid 流程图
      currentConfig: null, // 当前图的运行时配置（包含 thread_id、checkpoint_ns 等）
      jsCodeSample: '',
      pyCodeSample: ''
    }
  },

  mounted() {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose'
    })
  },

  created() {
    this.jsCodeSample = stage5JsCode
    this.pyCodeSample = stage5PyCode
    // 使用非响应式属性存储图实例和 checkpointer，避免 Vue 响应式系统干扰 AsyncLocalStorage 上下文传播
    this._compiledGraph = null
    this._checkpointer = null
  },

  methods: {
    /**
     * 格式化 JSON
     */
    formatJSON(obj) {
      if (typeof obj === 'string') return obj
      try {
        return JSON.stringify(obj, null, 2)
      } catch {
        return String(obj)
      }
    },

    /**
     * 清空结果
     */
    clearResult() {
      this.result = null
      this.error = null
      this.executionSteps = []
      this.interruptFlow = []
      this.waitingApproval = false
      this.revisionCount = 0
      this.generatedPlan = ''
      this.approvalComment = ''
      this.threadId = ''
      this.mermaidGraph = ''
      this._compiledGraph = null
      this._checkpointer = null
      this.currentConfig = null
    },

    /** 渲染 Mermaid 图 */
    async renderMermaid() {
      if (!this.mermaidGraph) return
      const container = this.$refs.mermaidContainer
      if (!container) return
      try {
        const { svg } = await mermaid.render('mermaid-graph-stage5', this.mermaidGraph)
        container.innerHTML = svg
      } catch (err) {
        console.warn('[LangGraph Stage5] Mermaid 渲染失败:', err)
        container.innerHTML = '<p style="color:#999;">图结构渲染失败</p>'
      }
    },

    /**
     * 启动审批工作流（第一次调用）
     *
     * 阶段五核心：使用 interrupt() 在节点中暂停执行，等待人工审批
     * 流程：START → generate(LLM生成方案) → approval(interrupt暂停) → [人工审批]
     *         ├─ 批准 → execute → END
     *         └─ 拒绝 → revisePlan(LLM重新生成) → approval(循环审批)
     */
    async runGraph() {
      if (!this.planTopic.trim() || this.loading) return

      this.loading = true
      this.error = null
      this.result = null
      this.executionSteps = []
      this.interruptFlow = []
      this.waitingApproval = false
      this.revisionCount = 0
      this.generatedPlan = ''
      this.threadId = ''

      try {
        // ============================================================
        // 1. 定义状态
        // ============================================================
        const ApprovalState = Annotation.Root({
          plan: Annotation({
            reducer: (_, right) => right,
            default: () => ''
          }),
          approved: Annotation({
            reducer: (_, right) => right,
            default: () => false
          }),
          result: Annotation({
            reducer: (_, right) => right,
            default: () => ''
          })
        })

        // ============================================================
        // 2. 创建 LLM 实例
        // ============================================================
        const llm = new ChatOpenAI({
          model: this.modelName,
          apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
          temperature: 0.7,
          configuration: {
            baseURL: window.location.origin + '/inner/'
          }
        })

        // ============================================================
        // 3. 定义节点函数
        // ============================================================
        const self = this

        // 节点1：LLM 生成方案
        const generatePlan = async () => {
          const topic = self.planTopic
          self.executionSteps.push({
            node: 'generate',
            input: `planTopic: "${topic}"`,
            output: '正在调用 LLM 生成方案...'
          })

          const prompt = `你是一个专业的方案策划师。请为以下主题生成一个详细的执行方案：

            主题：${topic}

            要求：
            1. 方案需要包含：背景分析、目标、执行步骤（至少3步）、预期效果
            2. 用中文输出
            3. 控制在 300 字以内
            4. 格式清晰，分点列出`

          const response = await llm.invoke([new HumanMessage(prompt)])
          const planContent = response.content || '方案生成失败'

          self.executionSteps[self.executionSteps.length - 1].output =
            `plan: "${planContent.substring(0, 100)}..."`

          self.interruptFlow.push({
            phase: 'generate',
            type: 'llm',
            typeLabel: '🤖 LLM 生成',
            description: `LLM 根据主题"${topic}"生成了执行方案`,
            data: { plan: planContent.substring(0, 200) + '...' }
          })

          return { plan: planContent }
        }

        // 节点2：等待人工审批（interrupt 暂停）
        const waitApproval = (state) => {
          self.executionSteps.push({
            node: 'approval',
            input: `plan: "${state.plan.substring(0, 80)}..."`,
            output: '⏸️ 调用 interrupt()，等待人工审批...'
          })

          self.interruptFlow.push({
            phase: 'approval',
            type: 'interrupt',
            typeLabel: '⏸️ interrupt 暂停',
            description: '图执行到 approval 节点，调用 interrupt() 暂停，等待人工审批',
            data: {
              question: '请审批以下方案：',
              plan: state.plan.substring(0, 200) + '...'
            }
          })

          // interrupt() 抛出 GraphInterrupt，暂停图执行
          // 返回值是用户通过 Command({ resume }) 传入的值
          const decision = interrupt({
            question: '请审批以下方案：',
            plan: state.plan
          })

          self.interruptFlow.push({
            phase: 'approval-resume',
            type: 'resume',
            typeLabel: '▶️ 恢复执行',
            description: `人工审批完成，interrupt() 返回: ${JSON.stringify(decision)}`,
            data: decision
          })

          self.executionSteps[self.executionSteps.length - 1].output =
            `interrupt 返回: approved=${decision.approved}, comment="${decision.comment || ''}"`

          return { approved: decision.approved }
        }

        // 节点3：执行方案（仅批准后到达此节点，模拟执行并生成摘要）
        const executePlan = () => {
          const execSummary = `方案已执行，完成以下步骤：
            1. 资源调配已完成
            2. 任务分配已下发
            3. 执行监控已启动
            执行状态：进行中`

          self.executionSteps.push({
            node: 'execute',
            input: `approved: true`,
            output: execSummary
          })

          self.interruptFlow.push({
            phase: 'execute',
            type: 'success',
            typeLabel: '✅ 执行方案',
            description: '方案已批准，模拟执行完成，生成执行摘要',
            data: { summary: execSummary }
          })

          return { result: execSummary }
        }

        // 节点4：方案被拒绝后，LLM 根据反馈重新生成方案
        const revisePlan = async (state) => {
          self.executionSteps.push({
            node: 'revisePlan',
            input: `原方案被拒绝，根据反馈重新生成...`,
            output: '正在调用 LLM 重新生成方案...'
          })

          self.interruptFlow.push({
            phase: 'revise',
            type: 'llm',
            typeLabel: '🔄 LLM 重新生成',
            description: '方案被拒绝，LLM 根据审批意见重新生成方案',
            data: { rejectedPlan: state.plan.substring(0, 100) + '...' }
          })

          const prompt = `你是一个专业的方案策划师。你之前为以下主题生成的方案被拒绝了，请根据反馈重新生成一个更好的方案：

            主题：${self.planTopic}
            之前的方案：${state.plan}
            审批意见：${self.approvalComment || '方案不可行，请重新设计'}

            要求：
            1. 方案需要包含：背景分析、目标、执行步骤（至少3步）、预期效果
            2. 用中文输出
            3. 控制在 300 字以内
            4. 格式清晰，分点列出
            5. 请根据审批意见进行针对性改进`

          const response = await llm.invoke([new HumanMessage(prompt)])
          const newPlan = response.content || '方案重新生成失败'

          self.executionSteps[self.executionSteps.length - 1].output =
            `newPlan: "${newPlan.substring(0, 100)}..."`

          self.interruptFlow.push({
            phase: 'revise-done',
            type: 'llm',
            typeLabel: '✅ 新方案已生成',
            description: 'LLM 已根据反馈重新生成方案，将返回 approval 节点重新审批',
            data: { newPlan: newPlan.substring(0, 200) + '...' }
          })

          // 返回新方案，重置 approved 状态，进入 approval 节点重新审批
          return { plan: newPlan, approved: false }
        }

        // 条件路由：根据审批结果决定下一步
        const routeAfterApproval = (state) => {
          if (state.approved) {
            return 'execute'
          }
          return 'revisePlan'
        }

        // ============================================================
        // 4. 构建图（必须配置 checkpointer，使用条件路由）
        // ============================================================
        const checkpointer = new MemorySaver()
        const graph = new StateGraph(ApprovalState)
          .addNode('generate', generatePlan)
          .addNode('approval', waitApproval)
          .addNode('execute', executePlan)
          .addNode('revisePlan', revisePlan)
          .addEdge(START, 'generate')
          .addEdge('generate', 'approval')
          .addConditionalEdges('approval', routeAfterApproval, {
            execute: 'execute',
            revisePlan: 'revisePlan'
          })
          .addEdge('revisePlan', 'approval') // 循环路径
          .addEdge('execute', END)

        // 编译图时传入检查点
        const app = graph.compile({ checkpointer })

        // 保存图实例引用和 checkpointer，用于后续恢复，使用非响应式属性避免 Vue 响应式系统干扰 AsyncLocalStorage
        this._compiledGraph = app
        this._checkpointer = checkpointer

        // ============================================================
        // 5. 第一次调用：执行到 interrupt 处暂停
        // ============================================================
        this.threadId = 'thread-' + Date.now()
        const config = { configurable:
          {
            thread_id: this.threadId
          }
        }
        this.currentConfig = config

        // 使用 invoke() 执行图——invoke() 内部通过 isInterrupted() 检测中断状态
        // stream() 在非嵌套图中会 suppress GraphInterrupt（_suppressInterrupt 返回 true），导致 for await 正常结束而不抛出异常，无法检测到中断。
        // invoke() 会检查每个 chunk 是否包含 __interrupt__ 标记，正确返回中断信息。
        const result = await app.invoke({ plan: '' }, config) // 执行图时传入配置（threadId）

        // 检查是否被中断
        if (isInterrupted(result)) {
          const interrupts = result[INTERRUPT]
          const interruptValue = interrupts[0]?.value
          self.interruptFlow.push({
            phase: 'interrupted',
            type: 'interrupt',
            typeLabel: '⏸️ 图已暂停',
            description: `图已暂停在 approval 节点，interrupt 值: ${JSON.stringify(interruptValue)}`,
            data: { threadId: self.threadId, interrupts }
          })
          // 从 interruptValue 中获取完整方案
          const planContent = interruptValue?.plan || '方案已生成'
          // 设置等待审批状态
          this.waitingApproval = true
          this.generatedPlan = planContent
        } else {
          // 没有 interrupt，流程正常结束
          this.waitingApproval = false
          this.result = result
        }

        // 获取 Mermaid 图结构
        try {
          const graphObj = await app.getGraphAsync()
          this.mermaidGraph = graphObj.drawMermaid({
            withStyles: true,
            curveStyle: 'basis'
          })
          this.$nextTick(() => {
            this.renderMermaid()
          })
        } catch (graphErr) {
          console.warn('[LangGraph Stage5] 获取图结构失败:', graphErr)
        }

        this.loading = false
      } catch (err) {
        // 检测是否为 GraphInterrupt 异常——invoke() 在某些运行时条件下可能抛出而非返回中断结果
        if (isGraphInterrupt(err) && err.interrupts?.length > 0) {
          const interruptValue = err.interrupts[0]?.value
          this.interruptFlow.push({
            phase: 'interrupted',
            type: 'interrupt',
            typeLabel: '⏸️ 图已暂停',
            description: `图已暂停在 approval 节点，interrupt 值: ${JSON.stringify(interruptValue)}`,
            data: { threadId: this.threadId, interrupts: err.interrupts }
          })
          const planContent = interruptValue?.plan || '方案已生成'
          this.waitingApproval = true
          this.generatedPlan = planContent
        } else {
          console.error('执行失败:', err)
          this.error = `执行失败: ${err.message || err}`
        }
        this.loading = false
      }
    },

    /**
     * 批准方案（恢复执行）
     */
    async approve() {
      await this.resumeExecution(true)
    },

    /**
     * 拒绝方案（恢复执行，审批意见必填）
     */
    async reject() {
      if (!this.approvalComment.trim()) {
        this.error = '拒绝方案时审批意见为必填项'
        return
      }
      await this.resumeExecution(false)
    },

    /**
     * 恢复执行
     * 使用 Command({ resume }) 传入审批结果
     *
     * 条件路由逻辑：
     * - 批准 → approval 返回 approved=true → 条件路由到 execute → END
     * - 拒绝 → approval 返回 approved=false → 条件路由到 revisePlan（LLM 重新生成）→ approval（再次 interrupt）
     */
    async resumeExecution(approved) {
      if (!this._compiledGraph || !this.currentConfig || this.resuming) return

      this.resuming = true
      this.error = null

      try {
        const resumeValue = {
          approved,
          comment: this.approvalComment || (approved ? '同意执行' : '方案不可行，请重新设计')
        }

        this.interruptFlow.push({
          phase: 'resume-call',
          type: 'resume',
          typeLabel: '📤 发送 resume',
          description: `调用 app.invoke(new Command({ resume: ${JSON.stringify(resumeValue)} }), config)`,
          data: resumeValue
        })

        // 使用与 runGraph 相同的 thread_id 确保从 checkpointer 恢复状态
        const resumeConfig = {
          configurable: {
            thread_id: this.currentConfig.configurable?.thread_id || this.threadId
          }
        }

        // 使用 invoke() 恢复执行
        const result = await this._compiledGraph.invoke(
          new Command({ resume: resumeValue }),
          resumeConfig
        )

        // 检查是否再次被中断（拒绝后 → revisePlan → approval 循环 interrupt）
        if (isInterrupted(result)) {
          const interrupts = result[INTERRUPT]
          const interruptValue = interrupts[0]?.value
          this.revisionCount++
          this.interruptFlow.push({
            phase: 'interrupted-again',
            type: 'interrupt',
            typeLabel: `⏸️ 图再次暂停（第 ${this.revisionCount} 轮重新审批）`,
            description: `方案被拒绝，LLM 已重新生成方案，图暂停在 approval 节点等待再次审批。interrupt 值: ${JSON.stringify(interruptValue)}`,
            data: { interrupts, revisionCount: this.revisionCount }
          })
          this.waitingApproval = true
          // 从 interruptValue 中获取新生成的方案
          this.generatedPlan = interruptValue?.plan || '新方案已生成'
          // 清空审批意见，准备下一轮
          this.approvalComment = ''
        } else {
          // 批准后 → execute → END，流程正常结束
          const executeStep = this.executionSteps.find(s => s.node === 'execute')
          this.result = {
            approved: true,
            revisionCount: this.revisionCount,
            result: executeStep?.output || '方案已执行'
          }

          this.waitingApproval = false
          this.revisionCount = 0
        }

        this.resuming = false
      } catch (err) {
        // 检测是否为 GraphInterrupt 异常（循环 interrupt 场景）
        if (isGraphInterrupt(err) && err.interrupts?.length > 0) {
          const interruptValue = err.interrupts[0]?.value
          this.revisionCount++
          this.interruptFlow.push({
            phase: 'interrupted-again',
            type: 'interrupt',
            typeLabel: `⏸️ 图再次暂停（第 ${this.revisionCount} 轮重新审批）`,
            description: `方案被拒绝，LLM 已重新生成方案，图暂停在 approval 节点等待再次审批。interrupt 值: ${JSON.stringify(interruptValue)}`,
            data: { interrupts: err.interrupts, revisionCount: this.revisionCount }
          })
          this.waitingApproval = true
          this.generatedPlan = interruptValue?.plan || '新方案已生成'
          this.approvalComment = ''
        } else {
          console.error('恢复执行失败:', err)
          this.error = `恢复执行失败: ${err.message || err}`
        }
        this.resuming = false
      }
    }
  }
}
</script>

<style scoped>
/* ============================================================
  通用样式（与 Stage4 保持一致）
  ============================================================ */
.badge.stage {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 14px;
  margin-left: 8px;
}

.info-box {
  background: #e8f4fd;
  border: 1px solid #b6d4fe;
  border-radius: 8px;
  padding: 12px 16px;
  margin: 12px 0;
  font-size: 14px;
  line-height: 1.8;
  color: #1e40af;
}

.info-box code {
  background: #dbeafe;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 13px;
}

/* 图结构可视化 */
.graph-viz-row {
  display: flex;
  gap: 16px;
  margin: 12px 0;
}

.graph-viz-half {
  flex: 1;
  min-width: 0;
  margin: 0;
}

.graph-viz-half:last-child {
  flex: 0 0 38%;
}

.graph-viz {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 16px;
  margin: 12px 0;
}

/* Mermaid 占位提示 */
.mermaid-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  color: #94a3b8;
  font-size: 13px;
  background: white;
  border-radius: 6px;
  border: 1px dashed #cbd5e1;
}

.graph-viz-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 12px;
  color: #334155;
}

.graph-viz-diagram {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px;
  background: white;
  border-radius: 6px;
  border: 1px dashed #cbd5e1;
}

.graph-node {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  min-width: 80px;
}

.graph-node small {
  display: block;
  font-weight: 400;
  font-size: 11px;
  opacity: 0.8;
  margin-top: 2px;
}

.start-node {
  background: #dbeafe;
  color: #1e40af;
  border: 2px solid #93c5fd;
}

.end-node {
  background: #fce7f3;
  color: #9d174d;
  border: 2px solid #f9a8d4;
}

.node-generate {
  background: #d1fae5;
  color: #065f46;
  border: 2px solid #6ee7b7;
}

.node-interrupt {
  background: #fef3c7;
  color: #92400e;
  border: 2px solid #fcd34d;
  animation: pulse-border 2s infinite;
}

.node-execute {
  background: #ede9fe;
  color: #5b21b6;
  border: 2px solid #c4b5fd;
}

@keyframes pulse-border {
  0%, 100% { border-color: #fcd34d; }
  50% { border-color: #f59e0b; box-shadow: 0 0 8px rgba(245, 158, 11, 0.4); }
}

.graph-arrow {
  font-size: 20px;
  color: #94a3b8;
  font-weight: bold;
}

.graph-viz-legend {
  margin-top: 10px;
  font-size: 12px;
  color: #64748b;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.graph-viz-legend span {
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 4px;
}

/* 分支连接线 */
.branch-container {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.branch-split {
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: relative;
  padding-left: 20px;
}

/* 分支竖线：连接两个分支横线的垂直线 */
.branch-split::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  height: 68px;
  width: 2px;
  background: #cbd5e1;
  transform: translateY(-50%);
}

.branch-item {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

/* 分支横线：从竖线水平连接到分支标签 */
.branch-item::before {
  content: '';
  position: absolute;
  left: -20px;
  top: 50%;
  width: 20px;
  height: 2px;
  background: #cbd5e1;
  transform: translateY(-50%);
}

.branch-label {
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  min-width: 56px;
  text-align: right;
}

.branch-label.approve {
  color: #16a34a;
}

.branch-label.reject {
  color: #dc2626;
}

.loop-back {
  color: #8b5cf6;
  font-weight: 700;
  font-size: 12px;
  white-space: nowrap;
}

/* Mermaid 容器 */
.mermaid-container {
  padding: 12px;
  background: white;
  border-radius: 6px;
  border: 1px dashed #cbd5e1;
  overflow-x: auto;
}

/* 配置区域 */
.config-section {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin: 12px 0;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.config-section label {
  font-size: 14px;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 6px;
}

.config-section select,
.config-section input {
  padding: 4px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 13px;
}

/* 输入区域 */
.input-section {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}

.input-section button {
  padding: 8px 20px;
  background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}

.input-section button:hover:not(:disabled) {
  opacity: 0.9;
}

.input-section button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-clear {
  background: #e2e8f0 !important;
  color: #475569 !important;
}

/* 错误提示 */
.error-msg {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 10px 16px;
  border-radius: 6px;
  margin: 12px 0;
  font-size: 14px;
}

/* 审批面板 */
.approval-panel {
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
  border: 2px solid #f59e0b;
  border-radius: 10px;
  margin: 16px 0;
  overflow: hidden;
  animation: slide-in 0.3s ease-out;
}

@keyframes slide-in {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.approval-header {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  padding: 12px 16px;
  font-size: 15px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.approval-header code {
  background: rgba(255,255,255,0.2);
  padding: 1px 6px;
  border-radius: 4px;
}

.approval-icon {
  font-size: 20px;
}

.approval-body {
  padding: 16px;
}

.approval-plan {
  margin-bottom: 16px;
}

.plan-content {
  background: white;
  border: 1px solid #fcd34d;
  border-radius: 6px;
  padding: 12px;
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.8;
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
  color: #374151;
}

.approval-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.approval-actions label {
  font-size: 14px;
  color: #475569;
}

.approval-actions input {
  padding: 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  font-size: 13px;
  margin-left: 8px;
}

.approval-buttons {
  display: flex;
  gap: 12px;
}

.btn-approve {
  padding: 10px 24px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
}

.btn-approve:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-approve:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-reject {
  padding: 10px 24px;
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 15px;
  font-weight: 600;
}

.btn-reject:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-reject:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 结果区域 */
.result-area {
  margin-top: 16px;
}

.result-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.result-label {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 600;
}

.result-content {
  padding: 12px 16px;
}

.result-field {
  margin: 6px 0;
  font-size: 14px;
}

.field-key {
  color: #64748b;
  font-weight: 600;
}

.field-value {
  color: #1e293b;
}

.text-success {
  color: #059669;
  font-weight: 600;
}

.text-danger {
  color: #dc2626;
  font-weight: 600;
}

/* 执行步骤 */
.execution-step {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 12px;
  margin: 8px 0;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.step-number {
  background: #667eea;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.step-node {
  font-weight: 600;
  color: #334155;
  font-size: 13px;
}

.step-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  margin-left: auto;
}

.step-badge.llm {
  background: #d1fae5;
  color: #065f46;
}

.step-badge.interrupt {
  background: #fef3c7;
  color: #92400e;
}

.step-badge.resume {
  background: #dbeafe;
  color: #1e40af;
}

.step-badge.success {
  background: #d1fae5;
  color: #065f46;
}

.step-badge.rejected {
  background: #fee2e2;
  color: #991b1b;
}

.step-detail {
  font-size: 13px;
  color: #475569;
  line-height: 1.6;
}

.state-json {
  background: #1e293b;
  color: #e2e8f0;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}

/* 代码块 */
.code-block {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.code-block summary {
  padding: 10px 16px;
  background: #f1f5f9;
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
  color: #334155;
  user-select: none;
}

.code-block summary:hover {
  background: #e2e8f0;
}

.code-content {
  background: #1e293b;
  color: #e2e8f0;
  padding: 16px;
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  overflow-x: auto;
  white-space: pre;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
}

/* 对比表格 */
.compare-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
  font-size: 13px;
}

.compare-table th {
  background: #e0f2fe;
  padding: 8px 12px;
  text-align: left;
  font-weight: 600;
  border: 1px solid #bae6fd;
}

.compare-table td {
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
}

.compare-table code {
  background: #f1f5f9;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 12px;
}

/* 响应式：小屏幕时图结构上下堆叠 */
@media (max-width: 900px) {
  .graph-viz-row {
    flex-direction: column;
  }
}
</style>
