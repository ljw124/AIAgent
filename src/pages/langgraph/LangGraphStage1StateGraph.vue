<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-16 10:58:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-18 16:09:07
 * @Description: 阶段一：StateGraph 入门 — 构建第一个状态图
 *   学习目标：掌握 StateGraph 的基本结构（定义状态 → 添加节点 → 添加边 → 编译 → 执行）
 *   核心 API：StateGraph、Annotation.Root、addNode、addEdge、START、END、compile、invoke
 *   对比：createReactAgent（预构建图） vs StateGraph（自定义图）
-->
<template>
  <div>
    <h1>阶段一：StateGraph 入门 <span class="badge stage">LangGraph</span></h1>

    <!-- 学习目标 -->
    <div class="info-box">
      <strong>学习目标：</strong>掌握 <code>StateGraph</code> 的基本结构：定义状态 → 添加节点 → 添加边 → 编译 → 执行<br />
      <strong>核心 API：</strong><code>StateGraph</code>、<code>Annotation.Root</code>、<code>addNode</code>、<code>addEdge</code>、<code>START</code>、<code>END</code>、<code>compile</code>、<code>invoke</code><br />
      <strong>对比：</strong><code>createReactAgent</code>（预构建黑盒） vs <code>StateGraph</code>（自定义图，打开黑盒）
    </div>

    <!-- 图结构可视化 -->
    <div class="graph-viz">
      <div class="graph-viz-title">📐 当前图结构</div>
      <div class="graph-viz-diagram">
        <div class="graph-node start-node">START</div>
        <div class="graph-arrow">→</div>
        <div class="graph-node node-a">nodeA<br /><small>文本处理</small></div>
        <div class="graph-arrow">→</div>
        <div class="graph-node node-b">nodeB<br /><small>文本追加</small></div>
        <div class="graph-arrow">→</div>
        <div class="graph-node end-node">END</div>
      </div>
      <div class="graph-viz-legend">
        <span>START → nodeA（普通边）</span>
        <span>nodeA → nodeB（普通边）</span>
        <span>nodeB → END（普通边）</span>
      </div>
    </div>

    <!-- Mermaid 图结构（等价于 Python display(graph)） -->
    <div v-if="mermaidGraph" class="graph-viz" style="margin-top: 12px;">
      <div class="graph-viz-title">
        📐 LangGraph 官方图结构（getGraphAsync + drawMermaid）
      </div>
      <div ref="mermaidContainer" class="mermaid-container"></div>
    </div>

    <!-- 配置区域 -->
    <div class="config-section">
      <label>
        输入文本：
        <input
          v-model="inputText"
          type="text"
          placeholder="输入要处理的文本..."
          style="width: 300px;"
          @keydown.enter="runGraph"
        />
      </label>
      <label>
        执行模式：
        <select v-model="runMode">
          <option value="invoke">invoke（一次性执行）</option>
          <option value="stream">stream（流式执行）</option>
        </select>
      </label>
    </div>

    <!-- 操作按钮 -->
    <div class="input-section">
      <button @click="runGraph" :disabled="loading">
        {{ loading ? '执行中...' : '▶ 执行 StateGraph' }}
      </button>
      <button @click="clearResult" class="btn-clear">清空结果</button>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- 执行结果 -->
    <div v-if="result" class="result-area">
      <!-- 最终状态 -->
      <div class="result-box">
        <div class="result-label">📤 最终状态（invoke 返回值）</div>
        <div class="result-content">
          <div class="result-field">
            <span class="field-key">text：</span>
            <span class="field-value">{{ result.text }}</span>
          </div>
          <div class="result-field">
            <span class="field-key">step：</span>
            <span class="field-value">{{ result.step }}</span>
          </div>
        </div>
      </div>

      <!-- 执行步骤详情 -->
      <div class="result-box" style="margin-top: 12px;">
        <div class="result-label" style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);">
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
              <pre class="state-json">{{ formatJSON(step.input) }}</pre>
              <div><strong>节点返回：</strong></div>
              <pre class="state-json">{{ formatJSON(step.output) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 代码展示：JS 版 -->
    <details class="code-block" style="margin-top: 16px;">
      <summary>📝 LangGraph.js 核心代码</summary>
      <pre class="code-content">{{ jsCodeSample }}</pre>
    </details>

    <!-- 代码展示：Python 对比 -->
    <details class="code-block" style="margin-top: 8px;">
      <summary>🐍 LangGraph Python 对比代码</summary>
      <pre class="code-content">{{ pyCodeSample }}</pre>
    </details>

    <!-- 关键差异说明 -->
    <div class="info-box" style="margin-top: 12px; background: #fefce8; border-color: #fde68a; color: #92400e;">
      <strong>🔀 JS vs Python 关键差异：</strong><br />
      ① JS 用 <code>Annotation.Root</code> 定义状态，Python 用 <code>TypedDict</code> 类<br />
      ② JS 用 <code>addEdge(START, 'node')</code> 设置入口，Python 用 <code>add_edge(START, 'node')</code><br />
      ③ JS 节点函数返回 {{ partialStateText }}，Python 返回 <code>dict</code><br />
      ④ JS 方法名用驼峰（<code>addNode</code>），Python 用蛇形（<code>add_node</code>）
    </div>
  </div>
</template>

<script>
import { StateGraph, Annotation, START, END } from '@langchain/langgraph'
import mermaid from 'mermaid'

export default {
  name: 'LangGraphStage1StateGraph',

  data() {
    return {
      inputText: 'Hello LangGraph',
      runMode: 'invoke',
      loading: false,
      error: null,
      result: null,
      executionSteps: [],
      mermaidGraph: '',
      jsCodeSample: '',
      pyCodeSample: '',
      partialStateText: 'Partial<State>'
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
    this.jsCodeSample = [
      "import { StateGraph, Annotation, START, END } from '@langchain/langgraph'",
      '',
      '// 1. 定义状态（JS 版：用 Annotation.Root）',
      'const stateDefinition = Annotation.Root({',
      '  text: Annotation(),',
      '  step: Annotation(),',
      '})',
      '',
      '// 2. 定义节点函数（返回 Partial<State>）',
      'const nodeA = (state) => ({',
      '  text: `[A处理] ${state.text}`,',
      "  step: 'A',",
      '})',
      '',
      'const nodeB = (state) => ({',
      '  text: `${state.text} → [B追加]`,',
      "  step: 'B',",
      '})',
      '',
      '// 3. 构建图（链式调用）',
      'const graph = new StateGraph(stateDefinition)',
      "  .addNode('nodeA', nodeA)",
      "  .addNode('nodeB', nodeB)",
      "  .addEdge(START, 'nodeA')   // JS 版：用 addEdge 设置入口",
      "  .addEdge('nodeA', 'nodeB')",
      "  .addEdge('nodeB', END)",
      '',
      '// 4. 编译图',
      'const app = graph.compile()',
      '',
      '// 5. 执行图',
      "const result = await app.invoke({ text: '输入文本' })",
      'console.log(result) // { text: \'...\', step: \'B\' }',
    ].join('\n')

    this.pyCodeSample = [
      'from langgraph.graph import StateGraph, START, END',
      'from typing import TypedDict',
      '',
      '# 1. 定义状态（Python 版：用 TypedDict 类）',
      'class State(TypedDict):',
      '    text: str',
      '    step: str',
      '',
      '# 2. 定义节点函数（返回 dict）',
      'def node_a(state: State) -> dict:',
      '    return {\'text\': f\'[A处理] {state["text"]}\', \'step\': \'A\'}',
      '',
      'def node_b(state: State) -> dict:',
      '    return {\'text\': f\'{state["text"]} → [B追加]\', \'step\': \'B\'}',
      '',
      '# 3. 构建图（链式调用）',
      'graph = StateGraph(State)',
      "graph.add_node('node_a', node_a)",
      "graph.add_node('node_b', node_b)",
      "graph.add_edge(START, 'node_a')  # Python 版：也可用 add_edge",
      "graph.add_edge('node_a', 'node_b')",
      "graph.add_edge('node_b', END)",
      '',
      '# 4. 编译图',
      'app = graph.compile()',
      '',
      '# 5. 执行图',
      "result = app.invoke({'text': '输入文本'})",
      'print(result)  # {\'text\': \'...\', \'step\': \'B\'}',
    ].join('\n')
  },

  methods: {
    /**
     * 执行 StateGraph
     *
     * 这是阶段一的核心：构建一个简单的两节点状态图并执行
     * 流程：START → nodeA（文本处理） → nodeB（文本追加） → END
     */
    async runGraph() {
      if (!this.inputText.trim() || this.loading) return

      this.loading = true
      this.error = null
      this.result = null
      this.executionSteps = []

      try {
        // ============================================================
        // 阶段一核心：StateGraph 的完整生命周期
        // ============================================================

        // 1. 定义状态（使用 Annotation.Root — v1.x 新 API）
        //    - Annotation.Root 替代了旧的 channels 对象
        //    - 每个字段用 Annotation() 声明，默认 reducer 为 LastValue
        const stateDefinition = Annotation.Root({
          text: Annotation(),
          step: Annotation()
        })

        // 2. 定义节点函数
        //    - 每个节点接收完整的 state，返回 Partial<State>（只返回需要更新的字段）
        //    - 返回值会通过 reducer 与当前状态合并
        const nodeA = (state) => {
          const result = {
            text: `[A处理] ${state.text}`,
            step: 'A'
          }
          // 记录执行步骤（用于前端展示）
          this.executionSteps.push({
            node: 'nodeA',
            input: { ...state },
            output: { ...result }
          })
          return result
        }

        const nodeB = (state) => {
          const result = {
            text: `${state.text} → [B追加]`,
            step: 'B'
          }
          this.executionSteps.push({
            node: 'nodeB',
            input: { ...state },
            output: { ...result }
          })
          return result
        }

        // 3. 构建图
        //    - StateGraph(stateDefinition): 创建图，传入 Annotation.Root 定义的状态
        //    - addNode(name, fn): 添加节点
        //    - addEdge(from, to): 添加普通边（固定路由）
        //    - START: 特殊常量，表示图的入口
        //    - END: 特殊常量，表示图的出口
        const graph = new StateGraph(stateDefinition)
          .addNode('nodeA', nodeA)
          .addNode('nodeB', nodeB)
          .addEdge(START, 'nodeA')   // JS 版：用 addEdge 设置入口
          .addEdge('nodeA', 'nodeB')
          .addEdge('nodeB', END)

        // 4. 编译图
        //    - compile() 将图编译为可执行的 Pregel 应用
        const app = graph.compile()

        // 5. 执行图
        if (this.runMode === 'stream') {
          // 流式执行：逐步获取每个节点的输出
          const stream = await app.stream({ text: this.inputText })
          for await (const chunk of stream) {
            // chunk 是每个 superstep 的状态更新
            if (!this.result) {
              this.result = { text: '', step: '' }
            }
            // 合并流式结果
            if (chunk.text !== undefined) this.result.text = chunk.text
            if (chunk.step !== undefined) this.result.step = chunk.step
          }
        } else {
          // 一次性执行：invoke 返回最终状态
          this.result = await app.invoke({ text: this.inputText })
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
          console.warn('[LangGraph Stage1] 获取图结构失败:', graphErr)
        }
      } catch (err) {
        console.error('[LangGraph Stage1 Error]', err)
        this.error = `执行失败: ${err.message}`
      } finally {
        this.loading = false
      }
    },

    /** 清空结果 */
    clearResult() {
      this.result = null
      this.executionSteps = []
      this.mermaidGraph = ''
      this.error = null
    },

    /** 渲染 Mermaid 图 */
    async renderMermaid() {
      if (!this.mermaidGraph) return
      const container = this.$refs.mermaidContainer
      if (!container) return
      try {
        const { svg } = await mermaid.render('mermaid-graph-stage1', this.mermaidGraph)
        container.innerHTML = svg
      } catch (err) {
        console.warn('[LangGraph Stage1] Mermaid 渲染失败:', err)
        container.innerHTML = '<p style="color:#999;">图结构渲染失败</p>'
      }
    },

    /** 格式化 JSON 展示 */
    formatJSON(obj) {
      try {
        return JSON.stringify(obj, null, 2)
      } catch {
        return String(obj)
      }
    }
  }
}
</script>

<style scoped>
/* ============================================================
  阶段标签
  ============================================================ */
.badge.stage {
  background: linear-gradient(135deg, #f97316 0%, #ef4444 100%);
  color: #fff;
}

/* ============================================================
  图结构可视化
  ============================================================ */
.graph-viz {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 16px;
}

.graph-viz-title {
  font-size: 14px;
  font-weight: 600;
  color: #334155;
  margin-bottom: 16px;
}

.graph-viz-diagram {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.graph-node {
  padding: 12px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  min-width: 80px;
}

.graph-node small {
  display: block;
  font-size: 11px;
  font-weight: 400;
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

.node-a {
  background: #d1fae5;
  color: #065f46;
  border: 2px solid #6ee7b7;
}

.node-b {
  background: #fef3c7;
  color: #92400e;
  border: 2px solid #fcd34d;
}

.graph-arrow {
  font-size: 24px;
  color: #94a3b8;
  font-weight: 700;
}

.graph-viz-legend {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  justify-content: center;
  font-size: 12px;
  color: #64748b;
}

.graph-viz-legend span {
  background: #f1f5f9;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

/* ============================================================
  执行结果区域
  ============================================================ */
.result-area {
  margin-top: 16px;
}

.result-field {
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 1.6;
}

.field-key {
  font-weight: 600;
  color: #6b7280;
}

.field-value {
  color: #1f2937;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  background: #f3f4f6;
  padding: 2px 8px;
  border-radius: 4px;
}

/* ============================================================
  执行步骤详情
  ============================================================ */
.execution-step {
  margin-bottom: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.execution-step:last-child {
  margin-bottom: 0;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}

.step-number {
  font-size: 12px;
  font-weight: 700;
  color: #6366f1;
  background: #eef2ff;
  padding: 2px 8px;
  border-radius: 4px;
}

.step-node {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
}

.step-detail {
  padding: 12px;
  font-size: 13px;
  line-height: 1.6;
  color: #4b5563;
}

.step-detail strong {
  color: #374151;
}

.state-json {
  background: #1e293b;
  color: #e2e8f0;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  margin: 6px 0 12px;
  overflow-x: auto;
  white-space: pre;
}

/* ============================================================
  Mermaid 图结构容器
  ============================================================ */
.mermaid-container {
  display: flex;
  justify-content: center;
  padding: 12px 0;
  overflow-x: auto;
}

.mermaid-container :deep(svg) {
  max-width: 100%;
  height: auto;
}
</style>
