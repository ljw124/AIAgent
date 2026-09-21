<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-20 10:00:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-21 15:52:47
 * @Description: 阶段四：Command 命令式路由 — 节点内动态跳转
 *   学习目标：掌握 Command 的用法，理解命令式路由与声明式条件边的区别
 *   核心 API：new Command({ goto, update })、Command.goto、Command.update
 *   对比：Command（命令式/节点内决策）vs addConditionalEdges（声明式/边层面决策）
 *   场景：消息分析器 — 根据内容在节点内部动态决定跳转目标
-->
<template>
  <div>
    <h1>阶段四：Command 命令式路由 <span class="badge stage">LangGraph</span></h1>

    <!-- 学习目标 -->
    <div class="info-box">
      <strong>学习目标：</strong>掌握 <code>Command</code> 的用法，理解命令式路由与声明式条件边的区别<br />
      <strong>核心 API：</strong><code>new Command({ goto, update })</code>、<code>Command.goto</code>、<code>Command.update</code><br />
      <strong>对比：</strong>Command（命令式/节点内决策）vs <code>addConditionalEdges</code>（声明式/边层面决策）<br />
      <strong>场景：</strong>消息分析器 — LLM 分析内容 → 节点内用 Command 动态决定跳转目标，同时更新状态<br />
      <strong>⚡ 真实 LLM：</strong>使用 <code>ChatOpenAI</code> 调用内网大模型，LLM 判断消息分类后由 Command 执行路由
    </div>

    <!-- 图结构可视化 -->
    <div class="graph-viz">
      <div class="graph-viz-title">📐 当前图结构 — Command 命令式路由（消息分析器）</div>
      <div class="graph-viz-diagram">
        <div class="graph-node start-node">START</div>
        <div class="graph-arrow">→</div>
        <div class="graph-node node-analyzer">analyzer<br /><small>Command 决策</small></div>
        <div class="graph-branch">
          <div class="branch-line">
            <div class="graph-arrow">→</div>
            <div class="graph-node node-priority">priorityHandler<br /><small>紧急处理</small></div>
            <div class="graph-arrow">→</div>
            <div class="graph-node end-node">END</div>
          </div>
          <div class="branch-line">
            <div class="graph-arrow">→</div>
            <div class="graph-node node-escalation">escalationHandler<br /><small>升级处理</small></div>
            <div class="graph-arrow">→</div>
            <div class="graph-node end-node">END</div>
          </div>
          <div class="branch-line">
            <div class="graph-arrow">→</div>
            <div class="graph-node node-normal">normalHandler<br /><small>普通处理</small></div>
            <div class="graph-arrow">→</div>
            <div class="graph-node end-node">END</div>
          </div>
          <div class="branch-line">
            <div class="graph-arrow">→</div>
            <div class="graph-node end-node">END<br /><small>直接终止</small></div>
          </div>
        </div>
      </div>
      <div class="graph-viz-legend">
        <span>START → analyzer（普通边）</span>
        <span>analyzer 内部用 Command 决定：priorityHandler / escalationHandler / normalHandler / END</span>
        <span>各 handler → END（普通边）</span>
      </div>
    </div>

    <!-- Mermaid 图结构 -->
    <div v-if="mermaidGraph" class="graph-viz" style="margin-top: 12px;">
      <div class="graph-viz-title">
        📐 LangGraph 官方图结构（getGraphAsync + drawMermaid）
      </div>
      <div ref="mermaidContainer" class="mermaid-container"></div>
    </div>

    <!-- 配置区域 -->
    <div class="config-section">
      <label>
        演示模式：
        <select v-model="demoMode">
          <option value="command">Command 命令式路由（节点内决策）</option>
          <option value="conditional">条件边 声明式路由（边层面决策）— 对比</option>
        </select>
      </label>
      <label>
        LLM 模型：
        <select v-model="modelName">
          <option value="EB-DeepSeek-V4-Pro">EB-DeepSeek-V4-Pro</option>
          <option value="EB-GLM-5.2">EB-GLM-5.2</option>
        </select>
      </label>
    </div>

    <!-- 输入区域 -->
    <div class="input-section">
      <input
        v-model="userInput"
        type="text"
        placeholder="输入消息，如：紧急！服务器宕机了 / 我要投诉产品质量 / 今天天气不错 / 结束"
        style="flex: 1; min-width: 300px;"
        @keydown.enter="runGraph"
      />
      <button @click="runGraph" :disabled="loading">
        {{ loading ? '执行中...' : '▶ 执行' }}
      </button>
      <button @click="clearResult" class="btn-clear">清空结果</button>
    </div>

    <!-- 快捷测试按钮 -->
    <div class="quick-test-section">
      <span class="quick-test-label">快捷测试：</span>
      <button class="btn-quick btn-urgent" @click="quickTest('紧急！服务器宕机了，请立即处理')" :disabled="loading">
        🔴 紧急消息
      </button>
      <button class="btn-quick btn-complaint" @click="quickTest('我要投诉产品质量问题，太差了')" :disabled="loading">
        🟠 投诉消息
      </button>
      <button class="btn-quick btn-normal" @click="quickTest('今天天气不错，适合出去玩')" :disabled="loading">
        🟢 普通消息
      </button>
      <button class="btn-quick btn-end" @click="quickTest('结束')" :disabled="loading">
        ⚫ 结束消息
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
            <span class="field-key">路由目标：</span>
            <span class="field-value" :class="'route-' + result.routeTarget">{{ result.routeTarget }}</span>
          </div>
          <div class="result-field">
            <span class="field-key">优先级：</span>
            <span class="field-value">{{ result.priority || 'normal' }}</span>
          </div>
          <div class="result-field">
            <span class="field-key">处理结果：</span>
            <span class="field-value">{{ result.handled ? '✅ 已处理' : '❌ 未处理' }}</span>
          </div>
          <div class="result-field">
            <span class="field-key">处理详情：</span>
            <span class="field-value">{{ result.handlerNote || '(无)' }}</span>
          </div>
        </div>
      </div>

      <!-- Command 决策详情 -->
      <div class="result-box" style="margin-top: 12px;">
        <div class="result-label" style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);">
          🎯 Command 决策详情
        </div>
        <div class="result-content">
          <div
            v-for="(decision, index) in commandDecisions"
            :key="index"
            class="execution-step"
          >
            <div class="step-header">
              <span class="step-number">决策 {{ index + 1 }}</span>
              <span class="step-node">节点：{{ decision.node }}</span>
              <span
                class="step-decision"
                :class="'cmd-' + decision.type"
              >
                → {{ decision.goto === '__end__' ? 'END' : decision.goto }}
              </span>
            </div>
            <div class="step-detail">
              <div><strong>判断逻辑：</strong>{{ decision.reason }}</div>
              <div v-if="decision.update" style="margin-top: 6px;">
                <strong>Command.update 内容：</strong>
                <pre class="state-json">{{ formatJSON(decision.update) }}</pre>
              </div>
              <div v-if="decision.isCommand" style="margin-top: 6px;">
                <span class="cmd-badge">🔀 使用了 Command（命令式路由）</span>
              </div>
              <div v-else style="margin-top: 6px;">
                <span class="default-badge">➡️ 未使用 Command（走默认边）</span>
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
      <summary>📝 LangGraph.js 核心代码（Command 命令式路由）</summary>
      <pre class="code-content">{{ jsCodeSample }}</pre>
    </details>

    <!-- 代码展示：Python 对比 -->
    <details class="code-block" style="margin-top: 8px;">
      <summary>🐍 LangGraph Python 对比代码</summary>
      <pre class="code-content">{{ pyCodeSample }}</pre>
    </details>

    <!-- Command vs 条件边 对比 -->
    <div class="info-box" style="margin-top: 12px; background: #f0f9ff; border-color: #bae6fd; color: #0369a1;">
      <strong>🔀 Command（命令式）vs 条件边（声明式）：</strong><br />
      <table class="compare-table">
        <thead>
          <tr>
            <th>特性</th>
            <th>条件边（addConditionalEdges）</th>
            <th>Command（new Command）</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>路由方式</strong></td>
            <td>声明式 — 在边层面定义 router 函数</td>
            <td>命令式 — 在节点内部直接返回 Command</td>
          </tr>
          <tr>
            <td><strong>决策位置</strong></td>
            <td>图编译时注册，运行时在边层面执行</td>
            <td>节点函数内部，与业务逻辑紧密耦合</td>
          </tr>
          <tr>
            <td><strong>状态更新</strong></td>
            <td>router 函数只返回目标节点名，不更新状态</td>
            <td>Command.update 可同时更新状态 + 路由</td>
          </tr>
          <tr>
            <td><strong>API 签名</strong></td>
            <td><code>addConditionalEdges(from, router)</code></td>
            <td><code>return new Command({ goto, update })</code></td>
          </tr>
          <tr>
            <td><strong>适用场景</strong></td>
            <td>基于状态字段的简单分支判断</td>
            <td>节点内部复杂决策、需要同时更新状态和路由</td>
          </tr>
          <tr>
            <td><strong>可读性</strong></td>
            <td>图结构清晰，路由逻辑集中在 router 中</td>
            <td>路由逻辑分散在各节点中，需查看节点代码</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- JS vs Python 关键差异 -->
    <div class="info-box" style="margin-top: 12px; background: #fefce8; border-color: #fde68a; color: #92400e;">
      <strong>🔀 JS vs Python 关键差异：</strong><br />
      ① JS 用 <code>new Command({ goto: '...', update: {...} })</code>（构造函数），Python 用 <code>Command(goto='...', update={...})</code>（直接实例化）<br />
      ② 两者都支持 <code>goto: END</code> 来终止图<br />
      ③ 当节点不返回 <code>Command</code> 时，走默认的普通边（行为一致）<br />
      ④ JS 从 <code>@langchain/langgraph</code> 导入 <code>Command</code>，Python 从 <code>langgraph.types</code> 导入<br />
      ⑤ Command 可以同时做两件事：<b>更新状态</b>（update）+ <b>跳转节点</b>（goto）——这是条件边做不到的
    </div>
  </div>
</template>

<script>
/* global INNER_API_KEY */
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
import { StateGraph, Annotation, START, END, Command } from '@langchain/langgraph'
import mermaid from 'mermaid'
import { stage4JsCode, stage4PyCode } from '@/composables/langgraphSamples.js'

export default {
  name: 'LangGraphStage4Command',

  data() {
    return {
      userInput: '',
      demoMode: 'command',
      modelName: 'EB-DeepSeek-V4-Pro',
      loading: false,
      error: null,
      result: null,
      executionSteps: [],
      commandDecisions: [],
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
    this.jsCodeSample = stage4JsCode
    this.pyCodeSample = stage4PyCode
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
     * 执行 Command 命令式路由图
     *
     * 阶段四核心：使用 Command 在节点内部动态决定跳转目标
     * 流程：START → analyzer(Command决策) → priorityHandler/escalationHandler/normalHandler/END → END
     *
     * 对比模式：使用条件边（addConditionalEdges）实现相同逻辑
     */
    async runGraph() {
      const text = this.userInput.trim()
      if (!text || this.loading) return

      this.loading = true
      this.error = null
      this.result = null
      this.executionSteps = []
      this.commandDecisions = []

      try {
        // ============================================================
        // 1. 定义状态
        // ============================================================
        const AnalyzerState = Annotation.Root({
          text: Annotation({
            reducer: (_, right) => right,
            default: () => ''
          }),
          // 消息优先级
          priority: Annotation({
            reducer: (_, right) => right,
            default: () => 'normal'
          }),
          // 消息是否已被处理
          handled: Annotation({
            reducer: (_, right) => right,
            default: () => false
          }),
          // 处理节点写入的处理结果描述
          handlerNote: Annotation({
            reducer: (_, right) => right,
            default: () => ''
          }),
          // 条件边模式专用字段
          shouldEnd: Annotation({
            reducer: (_, right) => right,
            default: () => false
          })
        })

        // ============================================================
        // 2. 定义处理节点
        // ============================================================
        // 优先处理节点
        const priorityHandler = (state) => {
          const note = `[优先处理] 已紧急响应: ${state.text.substring(0, 80)}`
          this.executionSteps.push({
            node: 'priorityHandler',
            input: `text: ${state.text.substring(0, 50)}, priority: ${state.priority}`,
            output: `handlerNote: ${note}`
          })
          return { handlerNote: note }
        }

        // 升级处理节点
        const escalationHandler = (state) => {
          const note = `[升级处理] 已升级投诉: ${state.text.substring(0, 80)}`
          this.executionSteps.push({
            node: 'escalationHandler',
            input: `text: ${state.text.substring(0, 50)}, priority: ${state.priority}`,
            output: `handlerNote: ${note}`
          })
          return { handlerNote: note }
        }

        // 普通处理节点
        const normalHandler = (state) => {
          const note = `[普通处理] 已记录: ${state.text.substring(0, 80)}`
          this.executionSteps.push({
            node: 'normalHandler',
            input: `text: ${state.text.substring(0, 50)}, priority: ${state.priority}`,
            output: `handlerNote: ${note}, handled: true`
          })
          return { handlerNote: note, handled: true }
        }

        // ============================================================
        // 3. 构建图（根据模式选择）
        // ============================================================
        let graph

        if (this.demoMode === 'command') {
          // ===== 方式一：Command 命令式路由（LLM 驱动） =====

          // 创建 LLM 实例用于消息分类
          const llm = new ChatOpenAI({
            model: this.modelName,
            apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
            temperature: 0,
            configuration: {
              baseURL: window.location.origin + '/inner/'
            }
          })

          const analyzerNode = async (state) => {
            const { text: msgText } = state

            this.executionSteps.push({
              node: 'analyzer',
              input: `text: "${msgText}"`,
              output: '正在调用 LLM 分析...'
            })

            // ⚡ 用 LLM 分析消息分类
            const classificationPrompt = `请分析以下消息的分类，只返回一个单词：
              - 如果消息涉及紧急情况、系统故障、宕机、安全漏洞等，返回 "urgent"
              - 如果消息涉及投诉、不满、抱怨、质量问题等，返回 "complaint"
              - 如果消息表示结束、终止、再见等，返回 "end"
              - 其他情况返回 "normal"

              消息内容：${msgText}

              分类结果（只返回一个单词）：`

            const llmResponse = await llm.invoke([new HumanMessage(classificationPrompt)])
            const category = (llmResponse.content || '').trim().toLowerCase()

            this.executionSteps[this.executionSteps.length - 1].output =
              `LLM 分类结果: "${category}"（原始输入: "${msgText}"）`

            // 在节点内部根据 LLM 分类结果用 Command 动态决定跳转目标
            if (category === 'urgent') {
              const cmd = new Command({
                goto: 'priorityHandler',
                update: { priority: 'high', handled: true }
              })
              this.commandDecisions.push({
                node: 'analyzer',
                goto: 'priorityHandler',
                type: 'priority',
                reason: `LLM 分类为 "urgent" → 返回 new Command({ goto: 'priorityHandler', update: { priority: 'high', handled: true } })`,
                update: { priority: 'high', handled: true },
                isCommand: true
              })
              return cmd
            } else if (category === 'complaint') {
              const cmd = new Command({
                goto: 'escalationHandler',
                update: { priority: 'critical', handled: true }
              })
              this.commandDecisions.push({
                node: 'analyzer',
                goto: 'escalationHandler',
                type: 'escalation',
                reason: `LLM 分类为 "complaint" → 返回 new Command({ goto: 'escalationHandler', update: { priority: 'critical', handled: true } })`,
                update: { priority: 'critical', handled: true },
                isCommand: true
              })
              return cmd
            } else if (category === 'end') {
              const cmd = new Command({
                goto: END,
                update: { handled: true }
              })
              this.commandDecisions.push({
                node: 'analyzer',
                goto: '__end__',
                type: 'end',
                reason: `LLM 分类为 "end" → 返回 new Command({ goto: END, update: { handled: true } })`,
                update: { handled: true },
                isCommand: true
              })
              return cmd
            }

            // 普通消息 → 不返回 Command，走默认边
            this.commandDecisions.push({
              node: 'analyzer',
              goto: 'normalHandler',
              type: 'normal',
              reason: `LLM 分类为 "${category}" → 不返回 Command，走默认边到 normalHandler`,
              update: { priority: 'normal', handled: false },
              isCommand: false
            })
            return { priority: 'normal', handled: false }
          }

          graph = new StateGraph(AnalyzerState)
            .addNode('analyzer', analyzerNode, {
              ends: ['priorityHandler', 'escalationHandler', 'normalHandler', END]
            })
            .addNode('priorityHandler', priorityHandler)
            .addNode('escalationHandler', escalationHandler)
            .addNode('normalHandler', normalHandler)
            .addEdge(START, 'analyzer')
            .addEdge('priorityHandler', END)
            .addEdge('escalationHandler', END)
            .addEdge('normalHandler', END)
        } else {
          // ===== 方式二：条件边 声明式路由（对比） =====
          // 同样使用 LLM 分类，仅路由方式不同：用 router 函数 + addConditionalEdges

          // 创建 LLM 实例用于消息分类
          const llmV2 = new ChatOpenAI({
            model: this.modelName,
            apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
            temperature: 0,
            configuration: {
              baseURL: window.location.origin + '/inner/'
            }
          })

          const analyzerNodeV2 = async (state) => {
            const { text: msgText } = state

            this.executionSteps.push({
              node: 'analyzer',
              input: `text: "${msgText}"`,
              output: '正在调用 LLM 分析...'
            })

            // ⚡ 用 LLM 分析消息分类（与 Command 模式相同的 prompt）
            const classificationPrompt = `请分析以下消息的分类，只返回一个单词：
              - 如果消息涉及紧急情况、系统故障、宕机、安全漏洞等，返回 "urgent"
              - 如果消息涉及投诉、不满、抱怨、质量问题等，返回 "complaint"
              - 如果消息表示结束、终止、再见等，返回 "end"
              - 其他情况返回 "normal"

              消息内容：${msgText}

              分类结果（只返回一个单词）：`

            const llmResponse = await llmV2.invoke([new HumanMessage(classificationPrompt)])
            const category = (llmResponse.content || '').trim().toLowerCase()

            this.executionSteps[this.executionSteps.length - 1].output =
              `LLM 分类结果: "${category}"（原始输入: "${msgText}"）`

            // 根据 LLM 分类结果设置状态字段，由条件边 router 函数决定路由
            if (category === 'urgent') {
              this.commandDecisions.push({
                node: 'analyzer',
                goto: 'priorityHandler',
                type: 'priority',
                reason: `LLM 分类为 "urgent" → 设置 priority='high'，由条件边 router 函数决定路由`,
                update: { priority: 'high' },
                isCommand: false
              })
              return { priority: 'high' }
            } else if (category === 'complaint') {
              this.commandDecisions.push({
                node: 'analyzer',
                goto: 'escalationHandler',
                type: 'escalation',
                reason: `LLM 分类为 "complaint" → 设置 priority='critical'，由条件边 router 函数决定路由`,
                update: { priority: 'critical' },
                isCommand: false
              })
              return { priority: 'critical' }
            } else if (category === 'end') {
              this.commandDecisions.push({
                node: 'analyzer',
                goto: '__end__',
                type: 'end',
                reason: `LLM 分类为 "end" → 设置 shouldEnd=true，由条件边 router 函数决定路由`,
                update: { shouldEnd: true },
                isCommand: false
              })
              return { shouldEnd: true }
            }

            // 普通消息 → 设置 priority=normal，由条件边 router 函数决定路由
            this.commandDecisions.push({
              node: 'analyzer',
              goto: 'normalHandler',
              type: 'normal',
              reason: `LLM 分类为 "${category}" → 设置 priority='normal'，由条件边 router 函数决定路由`,
              update: { priority: 'normal' },
              isCommand: false
            })
            return { priority: 'normal' }
          }

          // 条件边 router 函数（声明式路由：在边层面决策）
          const routerFn = (state) => {
            if (state.shouldEnd) return END
            if (state.priority === 'high') return 'priorityHandler'
            if (state.priority === 'critical') return 'escalationHandler'
            return 'normalHandler'
          }

          graph = new StateGraph(AnalyzerState)
            .addNode('analyzer', analyzerNodeV2)
            .addNode('priorityHandler', priorityHandler)
            .addNode('escalationHandler', escalationHandler)
            .addNode('normalHandler', normalHandler)
            .addEdge(START, 'analyzer')
            .addConditionalEdges('analyzer', routerFn)
            .addEdge('priorityHandler', END)
            .addEdge('escalationHandler', END)
            .addEdge('normalHandler', END)
        }

        // ============================================================
        // 4. 编译并执行
        // ============================================================
        const app = graph.compile()
        const initialState = { text }
        this.result = await app.invoke(initialState)

        // 确定路由目标
        let routeTarget = 'normalHandler'
        if (this.result.priority === 'high') routeTarget = 'priorityHandler'
        if (this.result.priority === 'critical') routeTarget = 'escalationHandler'
        if (this.result.shouldEnd) routeTarget = 'END'
        this.result.routeTarget = routeTarget

        this.userInput = ''

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
          console.warn('[LangGraph Stage4] 获取图结构失败:', graphErr)
        }
      } catch (err) {
        console.error('[LangGraph Stage4 Error]', err)
        this.error = `执行失败: ${err.message}`
      } finally {
        this.loading = false
      }
    },

    /** 清空结果 */
    clearResult() {
      this.result = null
      this.executionSteps = []
      this.commandDecisions = []
      this.mermaidGraph = ''
      this.error = null
      this.userInput = ''
    },

    /** 渲染 Mermaid 图 */
    async renderMermaid() {
      if (!this.mermaidGraph) return
      const container = this.$refs.mermaidContainer
      if (!container) return
      try {
        const { svg } = await mermaid.render('mermaid-graph-stage4', this.mermaidGraph)
        container.innerHTML = svg
      } catch (err) {
        console.warn('[LangGraph Stage4] Mermaid 渲染失败:', err)
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
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
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

.node-analyzer {
  background: #ede9fe;
  color: #5b21b6;
  border: 2px solid #c4b5fd;
  border-style: dashed;
}

.node-priority {
  background: #fee2e2;
  color: #991b1b;
  border: 2px solid #fca5a5;
}

.node-escalation {
  background: #ffedd5;
  color: #9a3412;
  border: 2px solid #fdba74;
}

.node-normal {
  background: #d1fae5;
  color: #065f46;
  border: 2px solid #6ee7b7;
}

.graph-arrow {
  font-size: 24px;
  color: #94a3b8;
  font-weight: 700;
}

.graph-branch {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.branch-line {
  display: flex;
  align-items: center;
  gap: 8px;
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
  快捷测试按钮
  ============================================================ */
.quick-test-section {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.quick-test-label {
  font-size: 13px;
  color: #6b7280;
  font-weight: 500;
}

.btn-quick {
  padding: 6px 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  background: #fff;
}

.btn-quick:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.btn-quick:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-urgent {
  border-color: #fca5a5;
  color: #991b1b;
  background: #fef2f2;
}
.btn-urgent:hover:not(:disabled) {
  background: #fee2e2;
}

.btn-complaint {
  border-color: #fdba74;
  color: #9a3412;
  background: #fff7ed;
}
.btn-complaint:hover:not(:disabled) {
  background: #ffedd5;
}

.btn-normal {
  border-color: #6ee7b7;
  color: #065f46;
  background: #f0fdf4;
}
.btn-normal:hover:not(:disabled) {
  background: #d1fae5;
}

.btn-end {
  border-color: #c4b5fd;
  color: #5b21b6;
  background: #f5f3ff;
}
.btn-end:hover:not(:disabled) {
  background: #ede9fe;
}

/* ============================================================
  路由目标颜色
  ============================================================ */
.route-priorityHandler {
  background: #fee2e2 !important;
  color: #991b1b !important;
}

.route-escalationHandler {
  background: #ffedd5 !important;
  color: #9a3412 !important;
}

.route-normalHandler {
  background: #d1fae5 !important;
  color: #065f46 !important;
}

.route-END {
  background: #fce7f3 !important;
  color: #9d174d !important;
}

/* ============================================================
  Command 决策详情
  ============================================================ */
.step-decision {
  font-size: 13px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  margin-left: 8px;
}

.cmd-priority {
  background: #fee2e2;
  color: #991b1b;
}

.cmd-escalation {
  background: #ffedd5;
  color: #9a3412;
}

.cmd-normal {
  background: #d1fae5;
  color: #065f46;
}

.cmd-end {
  background: #fce7f3;
  color: #9d174d;
}

.cmd-badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: #ede9fe;
  color: #5b21b6;
  border: 1px solid #c4b5fd;
}

.default-badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  background: #f3f4f6;
  color: #6b7280;
  border: 1px solid #d1d5db;
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

/* ============================================================
  对比表格
  ============================================================ */
.compare-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
  font-size: 13px;
}

.compare-table th,
.compare-table td {
  border: 1px solid #bae6fd;
  padding: 8px 12px;
  text-align: left;
}

.compare-table th {
  background: #e0f2fe;
  color: #0369a1;
  font-weight: 600;
}

.compare-table td {
  background: #f0f9ff;
}

.compare-table code {
  background: #e0f2fe;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 12px;
}
</style>