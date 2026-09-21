<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-17 11:02:22
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-21 18:42:44
 * @Description: 
-->
<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-17 10:58:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-17 18:33:13
 * @Description: 阶段二：Annotation 状态定义 — 深入理解状态管理
 *   学习目标：掌握 Annotation.Root 的高级用法（reducer、默认值、类型推导、MessagesAnnotation）
 *   核心 API：Annotation.Root、Annotation&lt;Type&gt;()、Annotation&lt;Type&gt;({ reducer, default })、MessagesAnnotation、messagesStateReducer
 *   对比：LastValue（覆盖） vs 自定义 reducer（追加/累加） vs MessagesAnnotation（预构建） vs messagesStateReducer（官方推荐）
-->
<template>
  <div>
    <h1>阶段二：Annotation 状态定义 <span class="badge stage">LangGraph</span></h1>

    <!-- 学习目标 -->
    <div class="info-box">
      <strong>学习目标：</strong>深入理解 <code>Annotation</code> 状态定义，掌握 reducer（状态合并逻辑）、默认值、类型推导、预构建状态<br />
      <strong>核心 API：</strong><code>Annotation.Root</code>、<code>Annotation&lt;Type&gt;()</code>、<code>Annotation&lt;Type&gt;({ reducer, default })</code>、<code>MessagesAnnotation</code>、<code>messagesStateReducer</code><br />
      <strong>对比：</strong>LastValue（覆盖） vs 自定义 reducer（追加/累加） vs MessagesAnnotation（预构建） vs messagesStateReducer（官方推荐）
    </div>

    <!-- 图结构可视化 -->
    <div class="graph-viz">
      <div class="graph-viz-title">📐 当前图结构</div>
      <div class="graph-viz-diagram">
        <div class="graph-node start-node">START</div>
        <div class="graph-arrow">→</div>
        <div class="graph-node node-a">nodeA<br /><small>发送消息<br />+ 计数器 +1</small></div>
        <div class="graph-arrow">→</div>
        <div class="graph-node node-b">nodeB<br /><small>追加消息<br />+ 计数器 +1</small></div>
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

    <!-- 状态定义展示 -->
    <div class="state-def-section">
      <div class="state-def-title">📋 当前状态定义（Annotation.Root）</div>
      <table class="state-def-table">
        <thead>
          <tr>
            <th>字段名</th>
            <th>类型</th>
            <th>Reducer</th>
            <th>默认值</th>
            <th>行为说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>messages</code></td>
            <td><code>string[]</code></td>
            <td><span class="reducer-badge concat">concat（追加）</span></td>
            <td><code>[]</code></td>
            <td>新消息追加到列表末尾，不覆盖旧消息</td>
          </tr>
          <tr>
            <td><code>counter</code></td>
            <td><code>number</code></td>
            <td><span class="reducer-badge add">add（累加）</span></td>
            <td><code>0</code></td>
            <td>每次节点返回的 counter 值会累加到当前值</td>
          </tr>
          <tr>
            <td><code>currentStep</code></td>
            <td><code>string</code></td>
            <td><span class="reducer-badge last">LastValue（覆盖）</span></td>
            <td><code>'未开始'</code></td>
            <td>新值直接覆盖旧值（默认行为）</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 配置区域 -->
    <div class="config-section">
      <label>
        输入消息：
        <input
          v-model="inputText"
          type="text"
          placeholder="输入要发送的消息..."
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
            <span class="field-key">messages：</span>
            <span class="field-value">[{{ result.messages.join(', ') }}]</span>
          </div>
          <div class="result-field">
            <span class="field-key">counter：</span>
            <span class="field-value">{{ result.counter }}</span>
          </div>
          <div class="result-field">
            <span class="field-key">currentStep：</span>
            <span class="field-value">{{ result.currentStep }}</span>
          </div>
        </div>
      </div>

      <!-- Reducer 行为对比 -->
      <div class="result-box" style="margin-top: 12px;">
        <div class="result-label" style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);">
          🔍 Reducer 行为对比
        </div>
        <div class="result-content">
          <div class="reducer-compare">
            <div class="reducer-item">
              <div class="reducer-item-header">
                <span class="reducer-badge concat">messages（concat reducer）</span>
              </div>
              <div class="reducer-item-body">
                <div class="reducer-row">
                  <span class="reducer-label">初始值：</span>
                  <code>[]</code>
                </div>
                <div class="reducer-row">
                  <span class="reducer-label">nodeA 返回：</span>
                  <code>['{{ reducerTrace.nodeA.messages }}']</code>
                </div>
                <div class="reducer-row">
                  <span class="reducer-label">合并后：</span>
                  <code>[{{ reducerTrace.afterA.messages.join(', ') }}]</code>
                </div>
                <div class="reducer-row">
                  <span class="reducer-label">nodeB 返回：</span>
                  <code>['{{ reducerTrace.nodeB.messages }}']</code>
                </div>
                <div class="reducer-row">
                  <span class="reducer-label">最终：</span>
                  <code>[{{ reducerTrace.final.messages.join(', ') }}]</code>
                </div>
                <div class="reducer-explain">
                  ✅ <strong>追加行为：</strong>新消息被追加到列表末尾，历史消息保留
                </div>
              </div>
            </div>

            <div class="reducer-item">
              <div class="reducer-item-header">
                <span class="reducer-badge add">counter（add reducer）</span>
              </div>
              <div class="reducer-item-body">
                <div class="reducer-row">
                  <span class="reducer-label">初始值：</span>
                  <code>0</code>
                </div>
                <div class="reducer-row">
                  <span class="reducer-label">nodeA 返回：</span>
                  <code>1</code>
                </div>
                <div class="reducer-row">
                  <span class="reducer-label">合并后：</span>
                  <code>0 + 1 = {{ reducerTrace.afterA.counter }}</code>
                </div>
                <div class="reducer-row">
                  <span class="reducer-label">nodeB 返回：</span>
                  <code>1</code>
                </div>
                <div class="reducer-row">
                  <span class="reducer-label">最终：</span>
                  <code>{{ reducerTrace.afterA.counter }} + 1 = {{ reducerTrace.final.counter }}</code>
                </div>
                <div class="reducer-explain">
                  ✅ <strong>累加行为：</strong>每次返回的值与当前值相加，而非覆盖
                </div>
              </div>
            </div>

            <div class="reducer-item">
              <div class="reducer-item-header">
                <span class="reducer-badge last">currentStep（LastValue）</span>
              </div>
              <div class="reducer-item-body">
                <div class="reducer-row">
                  <span class="reducer-label">初始值：</span>
                  <code>'未开始'</code>
                </div>
                <div class="reducer-row">
                  <span class="reducer-label">nodeA 返回：</span>
                  <code>'nodeA'</code>
                </div>
                <div class="reducer-row">
                  <span class="reducer-label">合并后：</span>
                  <code>'nodeA'</code>（覆盖）
                </div>
                <div class="reducer-row">
                  <span class="reducer-label">nodeB 返回：</span>
                  <code>'nodeB'</code>
                </div>
                <div class="reducer-row">
                  <span class="reducer-label">最终：</span>
                  <code>'nodeB'</code>（覆盖）
                </div>
                <div class="reducer-explain">
                  ✅ <strong>覆盖行为：</strong>新值直接替换旧值（默认 reducer）
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 执行步骤详情 -->
      <div class="result-box" style="margin-top: 12px;">
        <div class="result-label" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
          📝 执行步骤详情
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
              <div><strong>节点返回（Partial&lt;State&gt;）：</strong></div>
              <pre class="state-json">{{ formatJSON(step.output) }}</pre>
              <div><strong>Reducer 合并说明：</strong></div>
              <div class="reducer-note">{{ step.reducerNote }}</div>
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
      ① JS 用 <code>Annotation&lt;Type&gt;({ reducer, default })</code> 定义 reducer，Python 用 <code>Annotated[Type, reducer_fn]</code><br />
      ② JS 的 reducer 是函数 <code>(left, right) => ...</code>，Python 用 <code>operator.add</code> 等标准库函数<br />
      ③ JS 的 <code>Annotation</code> 内置 <code>default</code> 支持，Python 的 <code>TypedDict</code> 不直接支持默认值<br />
      ④ JS 有 <code>MessagesAnnotation</code>（预构建），Python 有 <code>MessagesState</code>（预构建），功能等价<br />
      ⑤ JS 类型推导：<code>AnnotationRoot.State</code> / <code>.Update</code> / <code>.Node</code>，Python 直接用 <code>State</code> 类<br />
      ⑥ JS 官方推荐用 <code>messagesStateReducer</code> 处理消息列表（支持 RemoveMessage、ID 去重），而非手写 concat
    </div>
  </div>
</template>

<script>
import { StateGraph, Annotation, START, END } from '@langchain/langgraph'
import mermaid from 'mermaid'
import { stage2JsCode, stage2PyCode } from '@/composables/langgraphSamples.js'

export default {
  name: 'LangGraphStage2Annotation',

  data() {
    return {
      inputText: 'Hello Annotation',
      runMode: 'invoke',
      loading: false,
      error: null,
      result: null,
      executionSteps: [],
      mermaidGraph: '',
      reducerTrace: {
        nodeA: { messages: '', counter: 0 },
        afterA: { messages: [], counter: 0 },
        nodeB: { messages: '', counter: 0 },
        final: { messages: [], counter: 0 }
      },
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
    this.jsCodeSample = stage2JsCode
    this.pyCodeSample = stage2PyCode
  },

  methods: {
    /**
     * 执行 StateGraph
     *
     * 阶段二核心：演示三种不同的 Reducer 行为
     * - messages: concat reducer（追加）
     * - counter: add reducer（累加）
     * - currentStep: LastValue（覆盖，默认行为）
     */
    async runGraph() {
      if (!this.inputText.trim() || this.loading) return

      this.loading = true
      this.error = null
      this.result = null
      this.executionSteps = []
      this.reducerTrace = {
        nodeA: { messages: '', counter: 0 },
        afterA: { messages: [], counter: 0 },
        nodeB: { messages: '', counter: 0 },
        final: { messages: [], counter: 0 }
      }

      try {
        // 1. 定义状态（使用 Annotation.Root + 三种 reducer）
        //    ① messages: concat reducer — 新消息追加到列表末尾
        //    ② counter: add reducer — 新值与当前值相加
        //    ③ currentStep: LastValue（默认）— 新值覆盖旧值
        const stateDefinition = Annotation.Root({
          messages: Annotation({
            reducer: (left, right) => left.concat(right),
            default: () => []
          }),
          counter: Annotation({
            reducer: (left, right) => left + right,
            default: () => 0
          }),
          currentStep: Annotation({
            default: () => '未开始'
          })
        })

        // 2. 定义节点函数
        //    - 每个节点返回 Partial<State>
        //    - 返回值通过各自的 reducer 与当前状态合并
        const nodeA = (state) => {
          const msgA = `[A] ${new Date().toLocaleTimeString()} 收到: ${this.inputText}`
          const result = {
            messages: [msgA],
            counter: 1,
            currentStep: 'nodeA'
          }

          // 追踪 reducer 行为
          this.reducerTrace.nodeA.messages = msgA
          this.reducerTrace.nodeA.counter = 1

          this.executionSteps.push({
            node: 'nodeA',
            input: { ...state },
            output: { ...result },
            reducerNote: 'messages: concat 追加 → 消息列表新增 1 条\ncounter: add 累加 → 0 + 1 = 1\ncurrentStep: LastValue 覆盖 → 替换为 "nodeA"'
          })
          return result
        }

        const nodeB = (state) => {
          const msgB = `[B] 处理完成，共 ${state.messages.length + 1} 条消息`
          const result = {
            messages: [msgB],
            counter: 1,
            currentStep: 'nodeB'
          }

          // 追踪 reducer 行为
          this.reducerTrace.nodeB.messages = msgB
          this.reducerTrace.nodeB.counter = 1
          this.reducerTrace.afterA.messages = [...state.messages]
          this.reducerTrace.afterA.counter = state.counter

          this.executionSteps.push({
            node: 'nodeB',
            input: { ...state },
            output: { ...result },
            reducerNote: 'messages: concat 追加 → 消息列表新增 1 条（共 2 条）\ncounter: add 累加 → 1 + 1 = 2\ncurrentStep: LastValue 覆盖 → 替换为 "nodeB"'
          })
          return result
        }

        // 3. 构建图
        const graph = new StateGraph(stateDefinition)
          .addNode('nodeA', nodeA)
          .addNode('nodeB', nodeB)
          .addEdge(START, 'nodeA')
          .addEdge('nodeA', 'nodeB')
          .addEdge('nodeB', END)

        // 4. 编译图
        const app = graph.compile()

        // 5. 执行图
        if (this.runMode === 'stream') {
          const stream = await app.stream({ input: this.inputText })
          for await (const chunk of stream) {
            if (!this.result) {
              this.result = { messages: [], counter: 0, currentStep: '' }
            }
            if (chunk.messages !== undefined) {
              this.result.messages = [...this.result.messages, ...chunk.messages]
            }
            if (chunk.counter !== undefined) {
              this.result.counter += chunk.counter
            }
            if (chunk.currentStep !== undefined) {
              this.result.currentStep = chunk.currentStep
            }
          }
        } else {
          this.result = await app.invoke({ input: this.inputText })
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
          console.warn('[LangGraph Stage2] 获取图结构失败:', graphErr)
        }

        // 记录最终状态用于 reducer 追踪展示
        this.reducerTrace.final.messages = [...this.result.messages]
        this.reducerTrace.final.counter = this.result.counter
      } catch (err) {
        console.error('[LangGraph Stage2 Error]', err)
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
      this.reducerTrace = {
        nodeA: { messages: '', counter: 0 },
        afterA: { messages: [], counter: 0 },
        nodeB: { messages: '', counter: 0 },
        final: { messages: [], counter: 0 }
      }
    },

    /** 渲染 Mermaid 图 */
    async renderMermaid() {
      if (!this.mermaidGraph) return
      const container = this.$refs.mermaidContainer
      if (!container) return
      try {
        const { svg } = await mermaid.render('mermaid-graph-stage2', this.mermaidGraph)
        container.innerHTML = svg
      } catch (err) {
        console.warn('[LangGraph Stage2] Mermaid 渲染失败:', err)
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
  min-width: 100px;
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
  状态定义表格
  ============================================================ */
.state-def-section {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 10px;
  padding: 16px 20px;
  margin-bottom: 16px;
}

.state-def-title {
  font-size: 14px;
  font-weight: 600;
  color: #0c4a6e;
  margin-bottom: 12px;
}

.state-def-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.state-def-table th {
  background: #e0f2fe;
  color: #0c4a6e;
  padding: 8px 12px;
  text-align: left;
  font-weight: 600;
  border-bottom: 2px solid #bae6fd;
}

.state-def-table td {
  padding: 8px 12px;
  border-bottom: 1px solid #e0f2fe;
  color: #334155;
}

.state-def-table code {
  background: #e0f2fe;
  color: #0369a1;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 12px;
}

/* ============================================================
  Reducer 标签
  ============================================================ */
.reducer-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.reducer-badge.concat {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #86efac;
}

.reducer-badge.add {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
}

.reducer-badge.last {
  background: #f3e8ff;
  color: #6b21a8;
  border: 1px solid #d8b4fe;
}

/* ============================================================
  Reducer 行为对比
  ============================================================ */
.reducer-compare {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.reducer-item {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.reducer-item-header {
  padding: 8px 12px;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
}

.reducer-item-body {
  padding: 12px;
}

.reducer-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 13px;
}

.reducer-row:last-of-type {
  margin-bottom: 0;
}

.reducer-label {
  color: #6b7280;
  font-weight: 500;
  min-width: 90px;
}

.reducer-row code {
  background: #f3f4f6;
  color: #374151;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 12px;
}

.reducer-explain {
  margin-top: 8px;
  padding: 8px 10px;
  background: #f0fdf4;
  border-radius: 6px;
  font-size: 12px;
  color: #166534;
  border: 1px solid #bbf7d0;
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

.reducer-note {
  background: #fefce8;
  border: 1px solid #fde68a;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  color: #92400e;
  white-space: pre-line;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
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