<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-23 12:00:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-24 09:52:57
 * @Description: 阶段六：Parallel & Map-Reduce — Send 并行执行
 *   学习目标：掌握 Send 的用法，理解 Map-Reduce 并行工作流
 *   核心 API：new Send(node, args)、addConditionalEdges 返回 Send[]、reducer 合并并行结果
 *   场景：对多个文档并行生成摘要 → 汇总为最终摘要
 *   ⚡ 真实 LLM：使用 ChatOpenAI 调用内网大模型并行生成摘要
-->
<template>
  <div>
    <h1>阶段六：Parallel & Map-Reduce — Send 并行执行 <span class="badge stage">LangGraph</span></h1>

    <!-- 学习目标 -->
    <div class="info-box">
      <strong>学习目标：</strong>掌握 <code>Send</code> 的用法，理解 Map-Reduce 并行工作流<br />
      <strong>核心 API：</strong><code>new Send(node, args)</code>、<code>addConditionalEdges</code> 返回 <code>Send[]</code>、reducer 合并并行结果<br />
      <strong>场景：</strong>对多个文档并行生成摘要 → 汇总为最终摘要<br />
      <strong>⚡ 真实 LLM：</strong>使用 <code>ChatOpenAI</code> 调用内网大模型并行生成摘要<br />
      <strong>⚠️ 关键点：</strong>条件边返回 <code>Send[]</code> 数组触发并行；reducer 自动合并多个并行实例的输出
    </div>

    <!-- 图结构可视化：左右并排 -->
    <div class="graph-viz-row">
      <!-- 左侧：当前图结构（手绘） -->
      <div class="graph-viz graph-viz-half">
        <div class="graph-viz-title">📐 当前图结构 — Send 并行执行（Map-Reduce）</div>
        <div class="graph-viz-diagram parallel-diagram">
          <div class="graph-node start-node">START</div>
          <div class="graph-arrow">↓</div>
          <div class="graph-node node-dispatcher">dispatcher<br /><small>分发任务<br />return Send[]</small></div>
          <div class="parallel-fanout">
            <div class="graph-arrow">↓</div>
            <div class="parallel-workers">
              <div class="graph-node node-worker">summarizer<br /><small>文档 1</small></div>
              <div class="graph-node node-worker">summarizer<br /><small>文档 2</small></div>
              <div class="graph-node node-worker">summarizer<br /><small>文档 N</small></div>
            </div>
            <div class="parallel-label">⚡ 并行执行（reducer 自动合并）</div>
          </div>
          <div class="graph-arrow">↓</div>
          <div class="graph-node node-aggregator">aggregator<br /><small>汇总摘要</small></div>
          <div class="graph-arrow">↓</div>
          <div class="graph-node end-node">END</div>
        </div>
        <div class="graph-viz-legend">
          <span>START → dispatcher（普通边）</span>
          <span>dispatcher 返回 Send[] → 触发 N 个 summarizer 并行实例</span>
          <span>所有 summarizer 完成后 → aggregator（reducer 合并 summaries）</span>
          <span>aggregator → END</span>
        </div>
      </div>

      <!-- 右侧：LangGraph 官方图结构（Mermaid） -->
      <div class="graph-viz graph-viz-half">
        <div class="graph-viz-title">
          📐 LangGraph 官方图结构（getGraphAsync + drawMermaid）
        </div>
        <div v-if="mermaidGraph" ref="mermaidContainer" class="mermaid-container"></div>
        <div v-else class="mermaid-placeholder">
          <p>启动并行工作流后将自动生成</p>
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
        文档数量：
        <select v-model="docCount">
          <option :value="2">2 个文档</option>
          <option :value="3">3 个文档</option>
          <option :value="4">4 个文档</option>
          <option :value="5">5 个文档</option>
        </select>
      </label>
    </div>

    <!-- 待处理文档预览 -->
    <div class="docs-preview">
      <div class="docs-preview-title">📄 待处理文档（{{ documents.length }} 个）</div>
      <div class="docs-list">
        <div v-for="(doc, index) in documents" :key="index" class="doc-item">
          <span class="doc-index">文档 {{ index + 1 }}</span>
          <span class="doc-content">{{ doc }}</span>
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="input-section">
      <button @click="runGraph" :disabled="loading">
        {{ loading ? '并行执行中...' : '▶ 启动 Map-Reduce 工作流' }}
      </button>
      <button @click="clearResult" class="btn-clear" :disabled="loading">清空结果</button>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- 执行结果 -->
    <div v-if="result" class="result-area">
      <!-- 最终摘要 -->
      <div class="result-box">
        <div class="result-label" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
          📤 最终汇总摘要
        </div>
        <div class="result-content">
          <div class="final-summary">{{ result.finalSummary }}</div>
        </div>
      </div>

      <!-- 并行摘要结果 -->
      <div class="result-box" style="margin-top: 12px;">
        <div class="result-label" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
          ⚡ 并行摘要结果（{{ result.summaries.length }} 个，reducer 自动合并）
        </div>
        <div class="result-content">
          <div
            v-for="(summary, index) in result.summaries"
            :key="index"
            class="summary-item"
          >
            <span class="summary-badge">摘要 {{ index + 1 }}</span>
            <span class="summary-text">{{ summary }}</span>
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
    </div>

    <!-- 代码展示：JS 版 -->
    <details class="code-block" style="margin-top: 16px;">
      <summary>📝 LangGraph.js 核心代码（Send 并行执行）</summary>
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
      ① JS 用 <code>new Send('node', args)</code>（构造函数），Python 用 <code>Send('node', args)</code>（直接实例化）<br />
      ② JS 条件边返回 <code>Send[]</code> 数组，Python 返回 <code>list[Send]</code><br />
      ③ 并行执行和结果合并机制<b>完全一致</b>，都基于 superstep 机制<br />
      ④ reducer 在并行场景下自动合并多个节点实例的输出<br />
      ⑤ 所有并行实例完成后，才会进入下一个节点（aggregator）
    </div>

    <!-- Send 工作原理 -->
    <div class="info-box" style="margin-top: 12px; background: #f0f9ff; border-color: #bae6fd; color: #0369a1;">
      <strong>⚙️ Send 工作原理：</strong><br />
      ① 条件边的路由函数返回 <code>Send[]</code> 数组（而非单个节点名字符串）<br />
      ② 图引擎为每个 <code>Send</code> 创建一个目标节点的并行实例<br />
      ③ 每个 <code>Send</code> 的 <code>args</code> 作为该实例的独立输入（不共享完整状态）<br />
      ④ 所有并行实例在同一个 superstep 中执行<br />
      ⑤ 各实例返回的部分更新通过 reducer 合并到共享状态<br />
      ⑥ 所有并行实例完成后，图进入下一个 superstep（如 aggregator）
    </div>
  </div>
</template>

<script>
/* global INNER_API_KEY */
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
import { StateGraph, Annotation, START, END, Send } from '@langchain/langgraph'
import mermaid from 'mermaid'
import { stage6JsCode, stage6PyCode } from '@/composables/langgraphSamples.js'

export default {
  name: 'LangGraphStage6Send',

  data() {
    return {
      modelName: 'EB-DeepSeek-V4-Pro',
      docCount: 3,
      loading: false,
      error: null,
      result: null,
      executionSteps: [],
      mermaidGraph: '',
      jsCodeSample: '',
      pyCodeSample: ''
    }
  },

  computed: {
    /**
     * 根据选择的文档数量生成待处理文档列表
     */
    documents() {
      const allDocs = [
        'LangGraph 是一个用于构建状态图工作流的框架，它允许开发者通过节点和边来定义复杂的 LLM 应用流程，支持条件路由、人机协同和并行执行等高级特性。',
        'Send 是 LangGraph 中实现并行的核心 API，它允许条件边返回一个 Send 数组，图引擎会为每个 Send 创建一个目标节点的并行实例，各实例独立执行后通过 reducer 合并结果。',
        'Reducer 是 LangGraph 状态管理的关键机制，它定义了如何合并多个节点实例的输出。在并行场景下，reducer 自动将各实例返回的部分更新合并到共享状态中。',
        'Map-Reduce 是一种经典的并行计算模式，LangGraph 通过 Send + reducer 实现了这一模式：dispatcher 分发任务，多个 worker 并行处理，aggregator 汇总结果。',
        'Superstep 是 LangGraph 的执行单元，图引擎按 superstep 推进执行。一个 superstep 中的所有并行节点完成后，才会进入下一个 superstep，保证了数据依赖的正确性。'
      ]
      return allDocs.slice(0, this.docCount)
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
    this.jsCodeSample = stage6JsCode
    this.pyCodeSample = stage6PyCode
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
      this.mermaidGraph = ''
    },

    /** 渲染 Mermaid 图 */
    async renderMermaid() {
      if (!this.mermaidGraph) return
      const container = this.$refs.mermaidContainer
      if (!container) return
      try {
        const { svg } = await mermaid.render('mermaid-graph-stage6', this.mermaidGraph)
        container.innerHTML = svg
      } catch (err) {
        console.warn('[LangGraph Stage6] Mermaid 渲染失败:', err)
        container.innerHTML = '<p style="color:#999;">图结构渲染失败</p>'
      }
    },

    /**
     * 启动 Map-Reduce 并行工作流
     *
     * 阶段六核心：使用 Send 在条件边中返回 Send[] 数组，触发并行执行
     * 流程：START → dispatcher(分发) → [summarizer × N 并行] → aggregator(汇总) → END
     */
    async runGraph() {
      if (this.loading) return

      this.loading = true
      this.error = null
      this.result = null
      this.executionSteps = []
      this.mermaidGraph = ''

      try {
        // ============================================================
        // 1. 定义状态
        // ============================================================
        const ParallelState = Annotation.Root({
          // 待处理的文档列表（覆盖式）
          documents: Annotation({
            reducer: (_, right) => right,
            default: () => []
          }),
          // 并行摘要结果（追加式：多个 summarizer 实例的输出自动合并）
          summaries: Annotation({
            reducer: (left, right) => left.concat(right),
            default: () => []
          }),
          // 最终汇总摘要（覆盖式）
          finalSummary: Annotation({
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
          temperature: 0.3,
          configuration: {
            baseURL: window.location.origin + '/inner/'
          }
        })

        // ============================================================
        // 3. 定义节点函数
        // ============================================================
        const self = this

        // 节点1：分发节点 — 记录日志，不做实际分发
        const dispatcher = (state) => {
          self.executionSteps.push({
            node: 'dispatcher',
            type: 'dispatch',
            typeLabel: '📤 分发任务',
            description: `dispatcher 收到 ${state.documents.length} 个文档，准备通过条件边路由函数创建 Send[]`,
            data: { documentCount: state.documents.length }
          })
          // 节点只返回状态更新，不返回 Send[]
          return {}
        }

        // 条件边路由函数：为每个文档创建一个 Send，返回 Send[] 触发并行
        const dispatchRouter = (state) => {
          self.executionSteps.push({
            node: 'dispatcher',
            type: 'dispatch',
            typeLabel: '📤 分发任务',
            description: `条件边路由函数为 ${state.documents.length} 个文档创建 Send[]，触发并行执行`,
            data: { documentCount: state.documents.length }
          })

          // 为每个文档创建一个并行任务
          // Send 的 args 作为该实例的独立输入（docIndex, content）
          return state.documents.map((doc, i) =>
            new Send('summarizer', { docIndex: i, content: doc })
          )
        }

        // 节点2：并行摘要节点（每个文档一个实例，自动并行执行）
        const summarizer = async (state) => {
          const docIndex = state.docIndex
          const content = state.content

          self.executionSteps.push({
            node: 'summarizer',
            type: 'parallel',
            typeLabel: `⚡ 并行摘要 #${docIndex + 1}`,
            description: `summarizer 实例 #${docIndex + 1} 正在调用 LLM 生成摘要`,
            data: { docIndex, contentPreview: content.substring(0, 60) + '...' }
          })

          const prompt = `请用一句话（不超过 50 字）摘要以下内容，只返回摘要文本：${content}`

          const response = await llm.invoke([new HumanMessage(prompt)])
          const summary = response.content || '摘要生成失败'

          self.executionSteps[self.executionSteps.length - 1].data = {
            docIndex,
            summary
          }

          // 返回部分更新，reducer 自动合并多个实例的输出
          return { summaries: [`[文档${docIndex + 1}] ${summary}`] }
        }

        // 节点3：汇总节点 — 合并所有摘要
        const aggregator = async (state) => {
          self.executionSteps.push({
            node: 'aggregator',
            type: 'aggregate',
            typeLabel: '📥 汇总摘要',
            description: `aggregator 收到 ${state.summaries.length} 条并行摘要，调用 LLM 合并为最终摘要`,
            data: { summaryCount: state.summaries.length }
          })

          const prompt = `请将以下 ${state.summaries.length} 条摘要合并为一段连贯的总结（不超过 150 字），只返回总结文本：${state.summaries.join('\n')}`

          const response = await llm.invoke([new HumanMessage(prompt)])
          const finalSummary = response.content || '汇总失败'

          self.executionSteps[self.executionSteps.length - 1].data = {
            summaryCount: state.summaries.length,
            finalSummary
          }

          return { finalSummary }
        }

        // ============================================================
        // 4. 构建图
        // ============================================================
        const graph = new StateGraph(ParallelState)
          .addNode('dispatcher', dispatcher)
          .addNode('summarizer', summarizer)
          .addNode('aggregator', aggregator)
          .addEdge(START, 'dispatcher')
          .addConditionalEdges('dispatcher', dispatchRouter) // 条件边路由函数返回 Send[] 触发并行
          .addEdge('summarizer', 'aggregator')               // 所有并行实例完成后进入汇总
          .addEdge('aggregator', END)

        const app = graph.compile()

        // ============================================================
        // 5. 执行图（Map-Reduce：分发 → 并行摘要 → 汇总）
        // ============================================================
        const result = await app.invoke({
          documents: this.documents
        })

        this.result = {
          summaries: result.summaries || [],
          finalSummary: result.finalSummary || ''
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
          console.warn('[LangGraph Stage6] 获取图结构失败:', graphErr)
        }

        this.loading = false
      } catch (err) {
        console.error('执行失败:', err)
        this.error = `执行失败: ${err.message || err}`
        this.loading = false
      }
    }
  }
}
</script>

<style scoped>
/* ============================================================
  通用样式（与 Stage5 保持一致）
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

/* 并行图结构特殊布局 */
.parallel-diagram {
  flex-direction: column;
  align-items: center;
}

.parallel-fanout {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.parallel-workers {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

.parallel-label {
  font-size: 12px;
  color: #8b5cf6;
  font-weight: 600;
  background: #ede9fe;
  padding: 2px 10px;
  border-radius: 4px;
  margin-top: 4px;
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

.node-dispatcher {
  background: #fef3c7;
  color: #92400e;
  border: 2px solid #fcd34d;
}

.node-worker {
  background: #d1fae5;
  color: #065f46;
  border: 2px solid #6ee7b7;
}

.node-aggregator {
  background: #ede9fe;
  color: #5b21b6;
  border: 2px solid #c4b5fd;
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

/* 文档预览 */
.docs-preview {
  margin: 12px 0;
  padding: 12px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.docs-preview-title {
  font-weight: 600;
  font-size: 14px;
  color: #334155;
  margin-bottom: 10px;
}

.docs-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.doc-item {
  display: flex;
  gap: 10px;
  padding: 8px 12px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.6;
}

.doc-index {
  background: #667eea;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  height: fit-content;
}

.doc-content {
  color: #475569;
  flex: 1;
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
  color: white;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 600;
}

.result-content {
  padding: 12px 16px;
}

.final-summary {
  font-size: 15px;
  line-height: 1.8;
  color: #1e293b;
  white-space: pre-wrap;
  background: white;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

/* 摘要项 */
.summary-item {
  display: flex;
  gap: 10px;
  padding: 8px 12px;
  margin: 6px 0;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.6;
  align-items: flex-start;
}

.summary-badge {
  background: #10b981;
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  height: fit-content;
}

.summary-text {
  color: #374151;
  flex: 1;
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

.step-badge.dispatch {
  background: #fef3c7;
  color: #92400e;
}

.step-badge.parallel {
  background: #d1fae5;
  color: #065f46;
}

.step-badge.aggregate {
  background: #ede9fe;
  color: #5b21b6;
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

/* 响应式：小屏幕时图结构上下堆叠 */
@media (max-width: 900px) {
  .graph-viz-row {
    flex-direction: column;
  }
}
</style>
