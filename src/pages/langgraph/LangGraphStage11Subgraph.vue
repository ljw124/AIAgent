<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-10-10 10:00:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-10-10 11:46:43
 * @Description: 阶段十一：Subgraph — 子图嵌套与复用
 *   学习目标：掌握子图机制，理解如何将已编译的图作为另一个图的节点使用
 *   核心 API：StateGraph.addNode(name, compiledSubgraph)、子图状态隔离、状态映射
 *   场景：多 Agent 协作 — 摘要 Agent（子图A）+ 翻译 Agent（子图B）→ 父图编排
 *   ⚡ 真实 LLM：使用 ChatOpenAI 调用内网大模型
-->
<template>
  <div>
    <h1>阶段十一：Subgraph 子图嵌套与复用 <span class="badge stage">LangGraph</span></h1>

    <!-- 学习目标 -->
    <div class="info-box">
      <strong>学习目标：</strong>掌握子图（Subgraph）机制，理解如何将已编译的图作为另一个图的节点使用<br />
      <strong>核心 API：</strong><code>StateGraph.addNode(name, compiledSubgraph)</code>、子图状态隔离、状态映射<br />
      <strong>场景：</strong>多 Agent 协作 — 摘要 Agent（子图A）+ 翻译 Agent（子图B）→ 父图编排<br />
      <strong>⚡ 真实 LLM：</strong>使用 <code>ChatOpenAI</code> 调用内网大模型<br />
      <strong>⚠️ 关键点：</strong>子图必须先 <code>.compile()</code> 再作为节点添加；子图有独立状态空间；父图通过键名匹配自动映射状态
    </div>

    <!-- 图结构可视化：左右并排 -->
    <div class="graph-viz-row">
      <!-- 左侧：当前图结构（手绘） -->
      <div class="graph-viz graph-viz-half">
        <div class="graph-viz-title">📐 当前图结构 — Subgraph 多 Agent 协作（Supervisor 模式）</div>
        <div class="graph-viz-diagram subgraph-diagram-h">
          <div class="graph-node start-node">START</div>
          <div class="graph-arrow-h">→</div>
          <div class="subgraph-box">
            <div class="subgraph-label">📦 子图 A：summaryAgent</div>
            <div class="subgraph-inner">
              <div class="graph-node node-sub">summarize<br /><small>LLM 摘要</small></div>
            </div>
          </div>
          <div class="graph-arrow-h">→</div>
          <div class="subgraph-box">
            <div class="subgraph-label">📦 子图 B：translateAgent</div>
            <div class="subgraph-inner">
              <div class="graph-node node-sub">translate<br /><small>LLM 翻译</small></div>
            </div>
          </div>
          <div class="graph-arrow-h">→</div>
          <div class="graph-node end-node">END</div>
        </div>
        <div class="graph-viz-legend">
          <span>START → summaryAgent（子图A：内部 summarize 节点）</span>
          <span>summaryAgent → translateAgent（子图B：内部 translate 节点）</span>
          <span>translateAgent → END</span>
          <span>📦 每个子图有独立状态空间，父图通过键名匹配自动映射</span>
        </div>
      </div>

      <!-- 右侧：LangGraph 官方图结构（Mermaid） -->
      <div class="graph-viz graph-viz-half">
        <div class="graph-viz-title">
          📐 LangGraph 官方图结构（getGraphAsync + drawMermaid）
        </div>
        <div v-if="mermaidGraph" ref="mermaidContainer" class="mermaid-container"></div>
        <div v-else class="mermaid-placeholder">
          <p>执行 StateGraph 后将自动生成</p>
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
        演示模式：
        <select v-model="demoMode">
          <option value="subgraph">🔀 子图模式（多 Agent 协作）</option>
          <option value="single">📋 单图模式（对比：无子图）</option>
        </select>
      </label>
    </div>

    <!-- 输入区域 -->
    <div class="input-section">
      <textarea
        v-model="userInput"
        rows="3"
        placeholder="输入文本，如：LangGraph是LangChain团队推出的图编排框架，支持构建复杂的多节点LLM工作流..."
        @keydown.ctrl.enter="runGraph"
      />
      <div class="btn-row">
        <button @click="runGraph" :disabled="loading">
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
      <!-- 最终状态 -->
      <div class="result-box">
        <div class="result-label">📤 最终状态</div>
        <div class="result-content">
          <div class="result-field">
            <span class="field-key">输入文本：</span>
            <span class="field-value">{{ result.input }}</span>
          </div>
          <div class="result-field">
            <span class="field-key">📝 摘要结果（子图A输出）：</span>
            <span class="field-value highlight">{{ result.summaryResult || '(无)' }}</span>
          </div>
          <div class="result-field">
            <span class="field-key">🌐 翻译结果（子图B输出）：</span>
            <span class="field-value highlight">{{ result.translateResult || '(无)' }}</span>
          </div>
          <div class="result-field">
            <span class="field-key">执行模式：</span>
            <span class="field-value">{{ demoMode === 'subgraph' ? '🔀 子图模式（多 Agent 协作）' : '📋 单图模式（对比）' }}</span>
          </div>
        </div>
      </div>

      <!-- 子图执行详情 -->
      <div class="result-box" style="margin-top: 12px;">
        <div class="result-label" style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);">
          📦 子图执行详情
        </div>
        <div class="result-content">
          <div
            v-for="(detail, index) in subgraphDetails"
            :key="index"
            class="execution-step"
          >
            <div class="step-header">
              <span class="step-number">子图 {{ index + 1 }}</span>
              <span class="step-node">{{ detail.name }}</span>
              <span class="step-decision cmd-goto">{{ detail.status }}</span>
            </div>
            <div class="step-detail">
              <div><strong>内部节点：</strong>{{ detail.internalNodes.join(' → ') }}</div>
              <div><strong>输入状态键：</strong>{{ detail.inputKeys.join(', ') }}</div>
              <div><strong>输出状态键：</strong>{{ detail.outputKeys.join(', ') }}</div>
              <div v-if="detail.output" style="margin-top: 6px;">
                <strong>输出内容：</strong>
                <pre class="state-json">{{ detail.output }}</pre>
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
              <span v-if="step.isSubgraph" class="step-decision cmd-subgraph">📦 子图</span>
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
      <summary>📝 LangGraph.js 核心代码（Subgraph 子图嵌套）</summary>
      <pre class="code-content">{{ jsCodeSample }}</pre>
    </details>

    <!-- 代码展示：Python 对比 -->
    <details class="code-block" style="margin-top: 8px;">
      <summary>🐍 LangGraph Python 对比代码</summary>
      <pre class="code-content">{{ pyCodeSample }}</pre>
    </details>

    <!-- Subgraph 核心概念 -->
    <div class="info-box" style="margin-top: 12px; background: #f0f9ff; border-color: #bae6fd; color: #0369a1;">
      <strong>📦 Subgraph 核心概念：</strong><br />
      <table class="compare-table">
        <thead>
          <tr>
            <th>概念</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>子图定义</strong></td>
            <td>将一个已编译的 <code>StateGraph</code> 作为另一个图的节点使用</td>
          </tr>
          <tr>
            <td><strong>编译顺序</strong></td>
            <td>子图必须先 <code>.compile()</code>，再通过 <code>addNode(name, compiledSubgraph)</code> 添加到父图</td>
          </tr>
          <tr>
            <td><strong>状态隔离</strong></td>
            <td>子图有独立的状态空间（自己的 <code>Annotation.Root</code>），与父图状态分离</td>
          </tr>
          <tr>
            <td><strong>状态映射</strong></td>
            <td>父图通过状态键名匹配自动将状态映射到子图输入（同名键自动传递）</td>
          </tr>
          <tr>
            <td><strong>子图复用</strong></td>
            <td>同一个已编译子图可以被多个父图引用，实现真正的模块化</td>
          </tr>
          <tr>
            <td><strong>典型场景</strong></td>
            <td>多 Agent 协作、可复用组件封装、复杂工作流拆分、分层架构</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 子图模式对比 -->
    <div class="info-box" style="margin-top: 12px; background: #fefce8; border-color: #fde68a; color: #92400e;">
      <strong>🔀 子图模式 vs 单图模式：</strong><br />
      <table class="compare-table">
        <thead>
          <tr>
            <th>特性</th>
            <th>单图模式</th>
            <th>子图模式</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>结构</strong></td>
            <td>所有节点在一个图中</td>
            <td>父图 + 多个子图，层次化结构</td>
          </tr>
          <tr>
            <td><strong>状态管理</strong></td>
            <td>全局共享状态</td>
            <td>子图独立状态 + 父图编排状态</td>
          </tr>
          <tr>
            <td><strong>可复用性</strong></td>
            <td>节点函数可复用，但图结构不可复用</td>
            <td>整个子图（含内部结构）可复用</td>
          </tr>
          <tr>
            <td><strong>可测试性</strong></td>
            <td>只能整体测试</td>
            <td>每个子图可独立测试</td>
          </tr>
          <tr>
            <td><strong>适用场景</strong></td>
            <td>简单线性工作流</td>
            <td>复杂多 Agent 系统、需要模块化拆分</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- JS vs Python 关键差异 -->
    <div class="info-box" style="margin-top: 12px; background: #f0fdf4; border-color: #bbf7d0; color: #166534;">
      <strong>🔀 JS vs Python 关键差异：</strong><br />
      ① 子图机制在两个版本中几乎完全一致，都是先 <code>compile()</code> 再 <code>addNode()</code><br />
      ② JS 用 <code>Annotation.Root</code> 定义子图状态，Python 用 <code>TypedDict</code><br />
      ③ 父图通过状态键名匹配自动映射到子图输入（同名键自动传递）<br />
      ④ 子图执行完毕后，输出状态通过键名匹配写回父图<br />
      ⑤ 同一个已编译子图实例可被多个父图引用，实现真正的模块复用
    </div>
  </div>
</template>

<script>
/* global INNER_API_KEY */
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
import { StateGraph, Annotation, START, END } from '@langchain/langgraph'
import mermaid from 'mermaid'
import { stage11JsCode, stage11PyCode } from '@/composables/langgraphSamples.js'

export default {
  name: 'LangGraphStage11Subgraph',

  data() {
    return {
      userInput: '',
      demoMode: 'subgraph',
      modelName: 'EB-DeepSeek-V4-Pro',
      loading: false,
      error: null,
      result: null,
      executionSteps: [],
      subgraphDetails: [],
      mermaidGraph: '',
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
    this.jsCodeSample = stage11JsCode
    this.pyCodeSample = stage11PyCode
  },

  methods: {
    /**
     * 快捷测试
     */
    quickTest(text) {
      this.userInput = text
      this.$nextTick(() => this.runGraph())
    },

    /**
     * 清空结果
     */
    clearResult() {
      this.result = null
      this.executionSteps = []
      this.subgraphDetails = []
      this.mermaidGraph = ''
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
     * 渲染 Mermaid 图
     */
    async renderMermaid(graph) {
      try {
        const drawableGraph = await graph.getGraphAsync()
        const mermaidCode = await drawableGraph.drawMermaid()
        this.mermaidGraph = mermaidCode
        this.$nextTick(async () => {
          const container = this.$refs.mermaidContainer
          if (container && mermaidCode) {
            try {
              const id = 'mermaid-' + Date.now()
              const { svg } = await mermaid.render(id, mermaidCode)
              container.innerHTML = svg
            } catch (e) {
              console.warn('Mermaid render error:', e)
            }
          }
        })
      } catch (e) {
        console.warn('getGraphAsync error:', e)
      }
    },

    /**
     * 执行子图工作流
     *
     * 阶段十一核心：使用子图（Subgraph）实现多 Agent 协作
     * 子图模式流程：
     *   START → summaryAgent（子图A：内部 summarize 节点）→ translateAgent（子图B：内部 translate 节点）→ END
     *
     * 单图模式流程（对比）：
     *   START → summarize → translate → END
     */
    async runGraph() {
      const text = this.userInput.trim()
      if (!text || this.loading) return

      this.loading = true
      this.error = null
      this.result = null
      this.executionSteps = []
      this.subgraphDetails = []

      try {
        const llm = new ChatOpenAI({
          model: this.modelName,
          temperature: 0.7,
          apiKey: INNER_API_KEY,
          configuration: {
            baseURL: window.location.origin + '/inner/'
          }
        })

        if (this.demoMode === 'subgraph') {
          await this.runSubgraphMode(llm, text)
        } else {
          await this.runSingleMode(llm, text)
        }
      } catch (e) {
        this.error = '执行失败：' + (e.message || e)
        console.error(e)
      } finally {
        this.loading = false
      }
    },

    /**
     * 子图模式：多 Agent 协作
     */
    async runSubgraphMode(llm, text) {
      // ============================================================
      // 子图 A：文本摘要 Agent
      // ⚠️ 关键：子图状态键名必须与父图匹配，LangGraph 按同名键自动映射状态
      // 父图 → 子图：input 自动传入，子图读取 state.input
      // 子图 → 父图：summaryResult 自动传出，父图读取 result.summaryResult
      // ============================================================
      const SummaryState = Annotation.Root({
        input: Annotation({
          reducer: (_, right) => right,
          default: () => ''
        }),
        summaryResult: Annotation({
          reducer: (_, right) => right,
          default: () => ''
        })
      })

      const summaryGraph = new StateGraph(SummaryState)
        .addNode('summarize', async (state) => {
          console.log('state', state)
          const msg = await llm.invoke([new HumanMessage('请用一句话总结以下内容（不超过50字）：\n\n' + state.input)])
          const summary = msg.content
          this.executionSteps.push({
            node: 'summaryAgent.summarize',
            isSubgraph: true,
            input: 'input: "' + state.input.substring(0, 80) + '..."',
            output: 'summaryResult: "' + summary + '"'
          })
          console.log(111, summary)
          return { summaryResult: summary }
        })
        .addEdge(START, 'summarize')
        .addEdge('summarize', END)
        .compile()  // ⚠️ 先编译子图

      // ============================================================
      // 子图 B：翻译 Agent
      // ⚠️ 关键：子图状态键名必须与父图匹配
      // 父图 → 子图：summaryResult 自动传入（作为翻译的输入文本）
      // 子图 → 父图：translateResult 自动传出
      // ============================================================
      const TranslateState = Annotation.Root({
        summaryResult: Annotation({
          reducer: (_, right) => right,
          default: () => ''
        }),
        translateResult: Annotation({
          reducer: (_, right) => right,
          default: () => ''
        })
      })

      const translateGraph = new StateGraph(TranslateState)
        .addNode('translate', async (state) => {
          const msg = await llm.invoke([new HumanMessage('请将以下内容翻译成英文：\n\n' + state.summaryResult)])
          const translated = msg.content
          this.executionSteps.push({
            node: 'translateAgent.translate',
            isSubgraph: true,
            input: 'summaryResult: "' + state.summaryResult.substring(0, 80) + '..."',
            output: 'translateResult: "' + translated + '"'
          })
          console.log(222, translated)
          return { translateResult: translated }
        })
        .addEdge(START, 'translate')
        .addEdge('translate', END)
        .compile()  // ⚠️ 先编译子图

      // ============================================================
      // 父图：编排多 Agent（Supervisor 模式）
      // ============================================================
      const SupervisorState = Annotation.Root({
        input: Annotation({
          reducer: (_, right) => right,
          default: () => ''
        }),
        summaryResult: Annotation({
          reducer: (_, right) => right,
          default: () => ''
        }),
        translateResult: Annotation({
          reducer: (_, right) => right,
          default: () => ''
        })
      })

      const supervisorGraph = new StateGraph(SupervisorState)
        .addNode('summaryAgent', summaryGraph)      // 子图作为节点
        .addNode('translateAgent', translateGraph)  // 子图作为节点
        .addEdge(START, 'summaryAgent')
        .addEdge('summaryAgent', 'translateAgent')
        .addEdge('translateAgent', END)
        .compile()

      // 渲染 Mermaid 图
      await this.renderMermaid(supervisorGraph)

      // 执行
      const result = await supervisorGraph.invoke({ input: text })

      // 记录子图详情
      this.subgraphDetails = [
        {
          name: 'summaryAgent（子图A：文本摘要）',
          status: '✅ 完成',
          internalNodes: ['summarize'],
          inputKeys: ['input'],
          outputKeys: ['summaryResult'],
          output: result.summaryResult
        },
        {
          name: 'translateAgent（子图B：翻译）',
          status: '✅ 完成',
          internalNodes: ['translate'],
          inputKeys: ['summaryResult'],
          outputKeys: ['translateResult'],
          output: result.translateResult
        }
      ]

      this.result = {
        input: text,
        summaryResult: result.summaryResult,
        translateResult: result.translateResult
      }
    },

    /**
     * 单图模式（对比）：所有节点在一个图中
     */
    async runSingleMode(llm, text) {
      const SingleState = Annotation.Root({
        input: Annotation({
          reducer: (_, right) => right,
          default: () => ''
        }),
        summaryResult: Annotation({
          reducer: (_, right) => right,
          default: () => ''
        }),
        translateResult: Annotation({
          reducer: (_, right) => right,
          default: () => ''
        })
      })

      const singleGraph = new StateGraph(SingleState)
        .addNode('summarize', async (state) => {
          const msg = await llm.invoke([new HumanMessage('请用一句话总结以下内容（不超过50字）：\n\n' + state.input)])
          const summary = msg.content
          this.executionSteps.push({
            node: 'summarize',
            isSubgraph: false,
            input: 'input: "' + state.input.substring(0, 80) + '..."',
            output: 'summaryResult: "' + summary + '"'
          })
          return { summaryResult: summary }
        })
        .addNode('translate', async (state) => {
          const textToTranslate = state.summaryResult || state.input
          const msg = await llm.invoke([new HumanMessage('请将以下内容翻译成英文：\n\n' + textToTranslate)])
          const translated = msg.content
          this.executionSteps.push({
            node: 'translate',
            isSubgraph: false,
            input: 'summaryResult: "' + textToTranslate.substring(0, 80) + '..."',
            output: 'translateResult: "' + translated + '"'
          })
          return { translateResult: translated }
        })
        .addEdge(START, 'summarize')
        .addEdge('summarize', 'translate')
        .addEdge('translate', END)
        .compile()

      // 渲染 Mermaid 图
      await this.renderMermaid(singleGraph)

      // 执行
      const result = await singleGraph.invoke({ input: text })

      // 单图模式没有子图详情
      this.subgraphDetails = [
        {
          name: '单图模式（无子图）',
          status: '✅ 完成',
          internalNodes: ['summarize', 'translate'],
          inputKeys: ['input'],
          outputKeys: ['summaryResult', 'translateResult'],
          output: '所有节点在同一个图中，状态全局共享'
        }
      ]

      this.result = {
        input: text,
        summaryResult: result.summaryResult,
        translateResult: result.translateResult
      }
    }
  }
}
</script>

<style scoped>
.badge.stage {
  background: linear-gradient(135deg, #0891b2 0%, #0e7490 100%);
  color: #fff;
}

.input-section {
  display: flex;
  flex-direction: column;
}

.input-section input {
  flex: 1 1 100%;
  padding: 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  font-family: inherit;
  box-sizing: border-box;
}

.input-section .btn-row {
  display: flex;
  gap: 10px;
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

/* 子图水平布局 */
.subgraph-diagram-h {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 16px 0;
}

.subgraph-diagram-h .subgraph-box {
  border: 2px dashed #8b5cf6;
  border-radius: 12px;
  padding: 10px 14px;
  background: #f5f3ff;
  flex-shrink: 0;
}

.subgraph-diagram-h .subgraph-label {
  font-size: 11px;
  font-weight: 600;
  color: #7c3aed;
  margin-bottom: 6px;
  text-align: center;
  white-space: nowrap;
}

.subgraph-diagram-h .subgraph-inner {
  display: flex;
  justify-content: center;
}

.subgraph-diagram-h .node-sub {
  background: linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%);
  color: white;
  padding: 6px 16px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.cmd-subgraph {
  background: #ede9fe;
  color: #7c3aed;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

/* 图结构可视化 — 左右并排布局 */
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

.graph-viz-legend {
  margin-top: 10px;
  font-size: 12px;
  color: #64748b;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.graph-viz-legend span {
  padding: 2px 8px;
  border-radius: 4px;
}

/* Mermaid 容器 */
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

.mermaid-container {
  padding: 12px;
  background: white;
  border-radius: 6px;
  border: 1px dashed #cbd5e1;
  overflow-x: auto;
}

/* 图节点 */
.graph-node {
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
  white-space: nowrap;
}

.start-node {
  background: #10b981;
  color: white;
}

.end-node {
  background: #ef4444;
  color: white;
}

.graph-arrow-h {
  font-size: 20px;
  color: #94a3b8;
  font-weight: bold;
  flex-shrink: 0;
}

.btn-quick {
  margin-right: 8px;
}

/* 响应式：小屏幕时图结构上下堆叠 */
@media (max-width: 900px) {
  .graph-viz-row {
    flex-direction: column;
  }
  .graph-viz-half:last-child {
    flex: 1;
  }
}

/* 对比表格 */
.compare-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
  font-size: 13px;
}

.compare-table th,
.compare-table td {
  border: 1px solid #d1d5db;
  padding: 8px 12px;
  text-align: left;
}

.compare-table thead th {
  background: #f1f5f9;
  font-weight: 600;
  color: #374151;
}

.compare-table tbody td {
  color: #475569;
}

.highlight {
  background: #fef3c7;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}
</style>
