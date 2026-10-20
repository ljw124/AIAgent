<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-10-15 14:38:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-10-16 16:11:33
 * @Description: 阶段十四：Multi-Agent 多智能体系统
 *   学习目标：掌握 Supervisor / Swarm 两种多 Agent 架构模式，理解 handoff 交接机制
 *   核心 API：Command({ goto })、createReactAgent、tool() 定义 handoff 工具
 *   场景：智能客服 — 售前 Agent（查价格）+ 售后 Agent（查订单）+ 通用 Agent
 *   ⚡ 真实 LLM：使用 ChatOpenAI 调用内网大模型
 *   API 提示：
 *     - Supervisor 模式：supervisor 节点用 LLM 决策，返回 Command({ goto }) 路由到 Worker
 *     - Worker 用 createReactAgent 预构建（每个有独立 Prompt + 独立工具集）
 *     - Worker 完成后回到 supervisor，由 supervisor 决定继续派发或 FINISH 结束
 *     - Swarm 模式：无中心节点，Agent 通过 handoff 工具直接交接
 *     - handoff 工具内部返回 Command({ goto })，触发 Agent 跳转
 *     - 死循环防护：recursionLimit 限制超步数，超限抛 GraphRecursionError
 *     - 流式观察：streamMode: 'updates' 实时显示每个节点完成事件
-->
<template>
  <div>
    <h1>阶段十四：Multi-Agent 多智能体系统 <span class="badge stage">LangGraph</span></h1>

    <!-- 学习目标 -->
    <div class="info-box">
      <strong>学习目标：</strong>掌握 Supervisor / Swarm 两种多 Agent 架构模式，理解 handoff 交接机制<br />
      <strong>核心 API：</strong><code>Command({ goto })</code>、<code>createReactAgent</code>、handoff 工具<br />
      <strong>场景：</strong>智能客服 — 售前 Agent（查价格）+ 售后 Agent（查订单）+ 通用 Agent<br />
      <strong>⚡ 真实 LLM：</strong>使用 <code>ChatOpenAI</code> 调用内网大模型<br />
      <strong>⚠️ 关键点：</strong>Supervisor 用 LLM 决策路由；Swarm 用 handoff 工具直接交接；死循环用 recursionLimit 防护
    </div>

    <!-- 模式切换 -->
    <div class="config-section">
      <div class="config-row">
        <label>架构模式：</label>
        <select v-model="mode">
          <option value="supervisor">👔 Supervisor 模式（主管编排）</option>
          <option value="swarm">🐝 Swarm 模式（交接协作）</option>
        </select>
        <label style="margin-left: 16px;">LLM 模型：</label>
        <select v-model="modelName">
          <option value="EB-DeepSeek-Flash">EB-DeepSeek-Flash</option>
          <option value="EB-GLM-Flash">EB-GLM-Flash</option>
        </select>
        <label style="margin-left: 16px;">
          <input type="checkbox" v-model="loopDemo" />
          死循环演示（Swarm 互相踢皮球）
        </label>
      </div>
    </div>

    <!-- 图结构可视化 -->
    <div class="graph-viz-row">
      <div class="graph-viz graph-viz-half">
        <div class="graph-viz-title">📐 当前架构 — {{ mode === 'supervisor' ? 'Supervisor 模式' : 'Swarm 模式' }}</div>
        <div v-if="mode === 'supervisor'" class="graph-viz-diagram supervisor-diagram">
          <div class="graph-node start-node">START</div>
          <div class="graph-arrow-h">→</div>
          <div class="graph-node node-supervisor">supervisor<br /><small>LLM 决策路由</small></div>
          <div class="graph-arrow-h">→</div>
          <div class="agent-cluster">
            <div class="graph-node node-worker" :class="{ active: activeAgent === 'salesAgent' }">salesAgent<br /><small>查价格</small></div>
            <div class="graph-node node-worker" :class="{ active: activeAgent === 'supportAgent' }">supportAgent<br /><small>查订单</small></div>
            <div class="graph-node node-worker" :class="{ active: activeAgent === 'generalAgent' }">generalAgent<br /><small>通用</small></div>
          </div>
          <div class="graph-arrow-h">→</div>
          <div class="graph-node end-node">END</div>
        </div>
        <div v-else class="graph-viz-diagram swarm-diagram">
          <div class="graph-node start-node">START</div>
          <div class="graph-arrow-h">→</div>
          <div class="graph-node node-worker" :class="{ active: activeAgent === 'salesAgent' }">salesAgent<br /><small>售前</small></div>
          <div class="graph-arrow-h">⇄</div>
          <div class="graph-node node-worker" :class="{ active: activeAgent === 'supportAgent' }">supportAgent<br /><small>售后</small></div>
          <div class="graph-arrow-h">⇄</div>
          <div class="graph-node node-worker" :class="{ active: activeAgent === 'generalAgent' }">generalAgent<br /><small>通用</small></div>
          <div class="graph-arrow-h">→</div>
          <div class="graph-node end-node">END</div>
        </div>
        <div class="graph-viz-legend">
          <span v-if="mode === 'supervisor'">supervisor 决策 → Worker 执行 → 回到 supervisor → FINISH 结束</span>
          <span v-else>Agent 之间通过 handoff 工具直接交接（无中心节点）</span>
        </div>
      </div>

      <div class="graph-viz graph-viz-half">
        <div class="graph-viz-title">📐 LangGraph 官方图结构（getGraphAsync + drawMermaid）</div>
        <div v-if="mermaidGraph" ref="mermaidContainer" class="mermaid-container"></div>
        <div v-else class="mermaid-placeholder">
          <p>执行后将自动生成</p>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-section">
      <textarea
        v-model="userInput"
        rows="3"
        placeholder="输入客服问题，如：我想退货，订单号是 A12345 / 摄像头多少钱 / 先查价格再查订单 A12345"
        @keydown.ctrl.enter="runGraph"
      />
      <div class="btn-row">
        <button @click="runGraph" :disabled="loading">
          {{ loading ? '执行中...' : '▶ 执行 (Ctrl+Enter)' }}
        </button>
        <button @click="clearResult" class="btn-clear">清空结果</button>
      </div>
    </div>

    <!-- 快捷测试 -->
    <div class="quick-test-section">
      <span class="quick-test-label">快捷测试：</span>
      <button class="btn-quick" @click="quickTest('摄像头多少钱？')" :disabled="loading">
        💰 售前问题
      </button>
      <button class="btn-quick" @click="quickTest('我想退货，订单号是 A12345')" :disabled="loading">
        📦 售后问题
      </button>
      <button class="btn-quick" @click="quickTest('先查下摄像头多少钱，然后帮我查订单 A12345 的物流')" :disabled="loading">
        🔀 交接场景（Swarm）
      </button>
      <button class="btn-quick" @click="quickTest('你们公司是做什么的？')" :disabled="loading">
        🏢 通用问题
      </button>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- 执行结果 -->
    <div v-if="result" class="result-area">
      <!-- 最终回复 -->
      <div class="result-box">
        <div class="result-label">📤 最终回复</div>
        <div class="result-content">
          <div class="result-field">
            <span class="field-key">用户输入：</span>
            <span class="field-value">{{ result.input }}</span>
          </div>
          <div class="result-field">
            <span class="field-key">架构模式：</span>
            <span class="field-value">{{ result.mode === 'supervisor' ? '👔 Supervisor（主管编排）' : '🐝 Swarm（交接协作）' }}</span>
          </div>
          <div class="result-field">
            <span class="field-key">💬 最终回复：</span>
            <span class="field-value highlight">{{ result.finalReply || '(无)' }}</span>
          </div>
        </div>
      </div>

      <!-- 交接时间线 -->
      <div class="result-box" style="margin-top: 12px;">
        <div class="result-label" style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);">
          🔀 Agent 交接时间线（streamMode: 'updates'）
        </div>
        <div class="result-content">
          <div v-if="!timeline.length" class="timeline-empty">（无交接事件）</div>
          <div v-for="(event, index) in timeline" :key="index" class="timeline-event">
            <span class="timeline-step">{{ index + 1 }}</span>
            <span class="timeline-node" :class="event.type">{{ event.node }}</span>
            <span class="timeline-detail">{{ event.detail }}</span>
          </div>
        </div>
      </div>

      <!-- 路由/交接日志 -->
      <div class="result-box" style="margin-top: 12px;">
        <div class="result-label" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
          📋 {{ mode === 'supervisor' ? 'Supervisor 路由决策日志' : 'Swarm 交接日志' }}
        </div>
        <div class="result-content">
          <div v-if="!routeLog.length" class="timeline-empty">（无日志）</div>
          <div v-for="(log, index) in routeLog" :key="index" class="route-log-item">
            <span class="route-log-step">决策 {{ index + 1 }}</span>
            <span class="route-log-text">{{ log }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 代码展示：JS 版 -->
    <details class="code-block" style="margin-top: 16px;">
      <summary>📝 LangGraph.js 核心代码（{{ mode === 'supervisor' ? 'Supervisor 模式' : 'Swarm 模式' }}）</summary>
      <pre class="code-content">{{ jsCodeSample }}</pre>
    </details>

    <!-- 代码展示：Python 对比 -->
    <details class="code-block" style="margin-top: 8px;">
      <summary>🐍 LangGraph Python 对比代码</summary>
      <pre class="code-content">{{ pyCodeSample }}</pre>
    </details>

    <!-- 三种模式对比 -->
    <div class="info-box" style="margin-top: 12px; background: #fefce8; border-color: #fde68a; color: #92400e;">
      <strong>🔀 三种多 Agent 架构模式对比：</strong><br />
      <table class="compare-table">
        <thead>
          <tr>
            <th>维度</th>
            <th>Supervisor</th>
            <th>Swarm</th>
            <th>Network</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>中心化</strong></td>
            <td>有主管节点</td>
            <td>无中心</td>
            <td>无中心</td>
          </tr>
          <tr>
            <td><strong>通信路径</strong></td>
            <td>Worker ↔ Supervisor</td>
            <td>Agent ↔ Agent（交接）</td>
            <td>Agent ↔ Agent（任意）</td>
          </tr>
          <tr>
            <td><strong>路由决策者</strong></td>
            <td>Supervisor 的 LLM</td>
            <td>当前 Agent 的 LLM</td>
            <td>当前 Agent 的 LLM</td>
          </tr>
          <tr>
            <td><strong>死循环风险</strong></td>
            <td>低（主管兜底 FINISH）</td>
            <td>中</td>
            <td>高（必须防护）</td>
          </tr>
          <tr>
            <td><strong>适用场景</strong></td>
            <td>任务编排、客服分流</td>
            <td>客服转接</td>
            <td>复杂协作</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 死循环防护说明 -->
    <div class="info-box" style="margin-top: 12px; background: #fef2f2; border-color: #fecaca; color: #991b1b;">
      <strong>⚠️ 死循环防护（Network 模式必读）：</strong><br />
      <table class="compare-table">
        <thead>
          <tr>
            <th>防护手段</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>recursionLimit</code></td>
            <td>执行图的超步数上限（默认 25），超限抛 <code>GraphRecursionError</code></td>
          </tr>
          <tr>
            <td>Prompt 约束</td>
            <td>System Prompt 中明确「不要转回刚转给你的 Agent」</td>
          </tr>
          <tr>
            <td>转接计数</td>
            <td>state 中记录 handoff 次数，超过 N 次强制 END</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
/* global INNER_API_KEY */
import { ChatOpenAI } from '@langchain/openai'
import { StateGraph, Annotation, START, END, Command } from '@langchain/langgraph'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { tool } from '@langchain/core/tools'
import { HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'
import mermaid from 'mermaid'
import { stage14SupervisorJsCode, stage14SwarmJsCode, stage14MultiAgentPyCode } from '@/composables/langgraphSamples'

export default {
  name: 'LangGraphStage14MultiAgent',

  data() {
    return {
      mode: 'supervisor',
      modelName: 'EB-DeepSeek-Flash',
      loopDemo: false,
      userInput: '',
      loading: false,
      error: null,
      result: null,
      timeline: [],
      routeLog: [],
      activeAgent: '',
      mermaidGraph: ''
    }
  },

  computed: {
    jsCodeSample() {
      return this.mode === 'supervisor' ? stage14SupervisorJsCode : stage14SwarmJsCode
    },
    pyCodeSample() {
      return stage14MultiAgentPyCode
    }
  },

  watch: {
    mode() {
      // 切换模式时清空结果
      this.clearResult()
    }
  },

  mounted() {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose'
    })
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
      this.timeline = []
      this.routeLog = []
      this.activeAgent = ''
      this.mermaidGraph = ''
      this.error = null
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
              const id = 'mermaid-multi-' + Date.now()
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
     * 执行多 Agent 工作流
     */
    async runGraph() {
      const text = this.userInput.trim()
      if (!text || this.loading) return

      this.loading = true
      this.error = null
      this.result = null
      this.timeline = []
      this.routeLog = []
      this.activeAgent = ''

      try {
        const llm = new ChatOpenAI({
          model: this.modelName,
          temperature: 0.3,
          apiKey: INNER_API_KEY,
          configuration: {
            baseURL: window.location.origin + '/inner/'
          }
        })

        if (this.mode === 'supervisor') {
          await this.runSupervisorMode(llm, text)
        } else {
          await this.runSwarmMode(llm, text)
        }
      } catch (e) {
        // 死循环演示：捕获 GraphRecursionError
        if (e.message && e.message.includes('recursion')) {
          this.error = '⚠️ 触发 recursionLimit 死循环防护：' + e.message.substring(0, 200)
        } else {
          this.error = '执行失败：' + (e.message || e)
        }
        console.error(e)
      } finally {
        this.loading = false
      }
    },

    /**
     * ============================================================
     * Supervisor 模式：主管编排
     * 流程：START → supervisor（LLM 决策）→ Worker → 回到 supervisor → FINISH
     * ============================================================
     */
    async runSupervisorMode(llm, text) {
      // 1. 共享状态：所有 Agent 共用一个 messages 列表
      const SupervisorState = Annotation.Root({
        messages: Annotation({
          reducer: (curr, update) => curr.concat(update),
          default: () => []
        }),
        routeLog: Annotation({
          reducer: (curr, update) => curr.concat(update),
          default: () => []
        })
      })

      // 2. Worker 工具（每个 Agent 只绑定自己领域的工具）
      const getPriceTool = tool(
        async ({ productName }) => {
          const prices = { '摄像头': '¥299', '门禁机': '¥1599', '报警器': '¥399' }
          return `${productName} 的价格是 ${prices[productName] || '暂无报价（可咨询售前）'}`
        },
        {
          name: 'get_price',
          description: '查询产品价格',
          schema: z.object({ productName: z.string().describe('产品名称') })
        }
      )

      const getOrderTool = tool(
        async ({ orderId }) => `订单 ${orderId} 状态：已发货，预计 3 天内送达`,
        {
          name: 'get_order_status',
          description: '查询订单物流状态',
          schema: z.object({ orderId: z.string().describe('订单号') })
        }
      )

      // 3. Worker Agent（createReactAgent 预构建）
      const salesAgent = createReactAgent({
        llm,
        tools: [getPriceTool],
        prompt: '你是售前顾问，负责产品咨询和报价。回答要简洁（50字内）。只处理售前问题。'
      })

      const supportAgent = createReactAgent({
        llm,
        tools: [getOrderTool],
        prompt: '你是售后客服，负责订单查询、退换货。回答要简洁（50字内）。只处理售后问题。'
      })

      const generalAgent = createReactAgent({
        llm,
        tools: [],
        prompt: '你是通用客服助手，回答产品介绍、公司信息等一般性问题。回答要简洁（50字内）。'
      })

      // 4. Supervisor 节点：LLM 决策路由
      //    ⚠️ 核心：返回 Command({ goto }) 动态跳转
      const supervisorNode = async (state) => {
        const lastMessage = state.messages[state.messages.length - 1]
        const content = typeof lastMessage.content === 'string'
          ? lastMessage.content
          : JSON.stringify(lastMessage.content)

        const routeResult = await llm.invoke([
          new HumanMessage(
            `分析以下对话的最后一条消息，判断下一步：
            - salesAgent：产品咨询、价格查询
            - supportAgent：订单查询、退换货、物流
            - generalAgent：产品介绍、公司信息等一般问题
            - FINISH：问题已得到回答，可以结束

            对话最后消息：${content.substring(0, 200)}

            只输出一个词：salesAgent / supportAgent / generalAgent / FINISH`
          )
        ])

        const decision = routeResult.content.trim()

        // 记录路由决策
        this.routeLog.push(`Supervisor 决策 → ${decision}`)
        this.timeline.push({
          node: 'supervisor',
          type: 'supervisor',
          detail: `决策：${decision}`
        })

        // 判定完成 → 结束
        if (decision === 'FINISH') {
          return new Command({ goto: END })
        }

        // 路由到对应 Worker
        this.activeAgent = decision
        return new Command({ goto: decision })
      }

      // 5. 组装 Supervisor 图
      const graph = new StateGraph(SupervisorState)
        .addNode('supervisor', supervisorNode, { ends: ['salesAgent', 'supportAgent', 'generalAgent', END] })
        .addNode('salesAgent', salesAgent, { ends: ['supervisor'] })
        .addNode('supportAgent', supportAgent, { ends: ['supervisor'] })
        .addNode('generalAgent', generalAgent, { ends: ['supervisor'] })
        .addEdge(START, 'supervisor')
        // ⚠️ Worker 完成后回到 supervisor（循环由 supervisor 控制）
        .addEdge('salesAgent', 'supervisor')
        .addEdge('supportAgent', 'supervisor')
        .addEdge('generalAgent', 'supervisor')
        .compile()

      // 渲染 Mermaid 图
      await this.renderMermaid(graph)

      // 6. 流式执行（streamMode: 'updates' 观察每个节点完成事件）
      const stream = await graph.stream(
        { messages: [new HumanMessage(text)] },
        { streamMode: 'updates', recursionLimit: 10 }
      )

      let finalState = { messages: [] }
      for await (const update of stream) {
        const nodeName = Object.keys(update)[0]
        if (nodeName === '__end__') continue

        // 记录时间线
        if (nodeName !== 'supervisor') {
          this.timeline.push({
            node: nodeName,
            type: 'worker',
            detail: 'Worker 执行完成'
          })
          this.activeAgent = nodeName
        }

        // 累积状态
        if (update[nodeName]?.messages) {
          finalState.messages = finalState.messages.concat(update[nodeName].messages)
        }
      }

      // 7. 提取最终回复（最后一条 AI 消息）
      const aiMessages = finalState.messages.filter(m => m._getType && m._getType() === 'ai' && m.content)
      const finalReply = aiMessages.length
        ? (typeof aiMessages[aiMessages.length - 1].content === 'string'
            ? aiMessages[aiMessages.length - 1].content
            : JSON.stringify(aiMessages[aiMessages.length - 1].content))
        : '(无回复)'

      this.result = {
        input: text,
        mode: 'supervisor',
        finalReply
      }
    },

    /**
     * ============================================================
     * Swarm 模式：交接协作（无中心节点）
     * 流程：START → salesAgent →（handoff）→ supportAgent → END
     * ============================================================
     */
    async runSwarmMode(llm, text) {
      // 1. 共享状态（交接时历史自动携带）
      const SwarmState = Annotation.Root({
        messages: Annotation({
          reducer: (curr, update) => curr.concat(update),
          default: () => []
        }),
        handoffLog: Annotation({
          reducer: (curr, update) => curr.concat(update),
          default: () => []
        })
      })

      // 2. Worker 工具
      const getPriceTool = tool(
        async ({ productName }) => {
          const prices = { '摄像头': '¥299', '门禁机': '¥1599', '报警器': '¥399' }
          return `${productName} 的价格是 ${prices[productName] || '暂无报价（可咨询售前）'}`
        },
        {
          name: 'get_price',
          description: '查询产品价格',
          schema: z.object({ productName: z.string().describe('产品名称') })
        }
      )

      const getOrderTool = tool(
        async ({ orderId }) => `订单 ${orderId} 状态：已发货，预计 3 天内送达`,
        {
          name: 'get_order_status',
          description: '查询订单物流状态',
          schema: z.object({ orderId: z.string().describe('订单号') })
        }
      )

      // 3. handoff 工具：交接的核心
      //    ⚠️ 工具内部返回 Command({ goto })，触发 Agent 跳转
      const createHandoffTool = (targetAgent, description) => tool(
        async ({ reason }) => {
          return new Command({
            goto: targetAgent,
            update: {
              handoffLog: [`交接 → ${targetAgent}（原因：${reason}）`]
            }
          })
        },
        {
          name: `transfer_to_${targetAgent}`,
          description,
          schema: z.object({
            reason: z.string().describe('转接原因，简短说明')
          })
        }
      )

      // 4. Swarm Agent（每个绑定：自己的工具 + 他人的 handoff）
      //    死循环演示模式：Prompt 故意让两个 Agent 互相踢皮球
      const salesPrompt = this.loopDemo
        ? '你是售前顾问。⚠️ 重要规则：任何问题都不要自己处理，必须立即转接给 supportAgent（说"这属于售后问题"）。'
        : '你是售前顾问。价格问题直接用 get_price 工具查询并回答；订单/退货/物流问题必须转接 supportAgent；产品介绍等一般问题转接 generalAgent。回答简洁（50字内）。'

      const supportPrompt = this.loopDemo
        ? '你是售后客服。⚠️ 重要规则：任何问题都不要自己处理，必须立即转接给 salesAgent（说"这属于售前问题"）。'
        : '你是售后客服。订单/退货/物流问题直接用 get_order_status 工具查询并回答；价格咨询转接 salesAgent。回答简洁（50字内）。'

      const salesAgent = createReactAgent({
        llm,
        tools: [
          getPriceTool,
          createHandoffTool('supportAgent', '用户咨询订单、退货、物流时，转接给售后客服'),
          createHandoffTool('generalAgent', '用户咨询产品介绍、公司信息时，转接给通用客服')
        ],
        prompt: salesPrompt
      })

      const supportAgent = createReactAgent({
        llm,
        tools: [
          getOrderTool,
          createHandoffTool('salesAgent', '用户想了解产品价格时，转接给售前顾问'),
          createHandoffTool('generalAgent', '一般性问题时，转接给通用客服')
        ],
        prompt: supportPrompt
      })

      const generalAgent = createReactAgent({
        llm,
        tools: [
          createHandoffTool('salesAgent', '用户想买产品/查价格时，转接给售前顾问'),
          createHandoffTool('supportAgent', '用户有订单/退货问题时，转接给售后客服')
        ],
        prompt: '你是通用客服。产品介绍、公司信息直接回答（简洁50字内）；价格问题转售前；订单问题转售后。'
      })

      // 5. 组装 Swarm 图（无 supervisor 节点！）
      const graph = new StateGraph(SwarmState)
        .addNode('salesAgent', salesAgent, { ends: ['supportAgent', 'generalAgent', END] })
        .addNode('supportAgent', supportAgent, { ends: ['salesAgent', 'generalAgent', END] })
        .addNode('generalAgent', generalAgent, { ends: ['salesAgent', 'supportAgent', END] })
        // ⚠️ 入口固定为 salesAgent（Swarm 需指定初始 Agent）
        .addEdge(START, 'salesAgent')
        // Agent 输出普通回复 → END；输出 handoff（Command goto）→ 自动跳转
        .addEdge('salesAgent', END)
        .addEdge('supportAgent', END)
        .addEdge('generalAgent', END)
        .compile()

      // 渲染 Mermaid 图
      await this.renderMermaid(graph)

      // 6. 流式执行（观察交接事件）
      //    死循环演示：recursionLimit 设小（6），快速触发防护
      const recursionLimit = this.loopDemo ? 6 : 10

      const stream = await graph.stream(
        { messages: [new HumanMessage(text)] },
        { streamMode: 'updates', recursionLimit }
      )

      let finalState = { messages: [], handoffLog: [] }
      for await (const update of stream) {
        const nodeName = Object.keys(update)[0]
        if (nodeName === '__end__') continue

        this.activeAgent = nodeName
        this.timeline.push({
          node: nodeName,
          type: 'worker',
          detail: 'Agent 执行'
        })

        // 累积状态
        if (update[nodeName]?.messages) {
          finalState.messages = finalState.messages.concat(update[nodeName].messages)
        }
        if (update[nodeName]?.handoffLog) {
          finalState.handoffLog = finalState.handoffLog.concat(update[nodeName].handoffLog)
          // 交接事件加入时间线
          update[nodeName].handoffLog.forEach(log => {
            this.timeline.push({
              node: 'handoff',
              type: 'handoff',
              detail: log
            })
          })
        }
      }

      // 7. 交接日志
      this.routeLog = finalState.handoffLog

      // 8. 提取最终回复
      const aiMessages = finalState.messages.filter(m => m._getType && m._getType() === 'ai' && m.content)
      const finalReply = aiMessages.length
        ? (typeof aiMessages[aiMessages.length - 1].content === 'string'
            ? aiMessages[aiMessages.length - 1].content
            : JSON.stringify(aiMessages[aiMessages.length - 1].content))
        : '(无回复)'

      this.result = {
        input: text,
        mode: 'swarm',
        finalReply
      }
    }
  }
}
</script>

<style scoped>
.badge.stage {
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  color: #fff;
}

.config-section {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.config-row label {
  font-weight: 600;
  font-size: 14px;
  color: #0369a1;
}

.config-row select {
  padding: 6px 12px;
  border: 1px solid #bae6fd;
  border-radius: 6px;
  font-size: 14px;
  background: #fff;
  color: #0c4a6e;
}

.config-row input[type='checkbox'] {
  margin-right: 4px;
}

/* 图结构可视化 */
.graph-viz-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.graph-viz-half {
  flex: 1;
  min-width: 0;
}

.graph-viz {
  background: #fafafa;
  border: 1px solid #e5e5e5;
  border-radius: 8px;
  padding: 12px;
}

.graph-viz-title {
  font-size: 13px;
  font-weight: 600;
  color: #666;
  margin-bottom: 10px;
}

.graph-viz-diagram {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 8px;
  flex-wrap: wrap;
  min-height: 100px;
}

.graph-node {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  border: 2px solid;
  transition: all 0.3s;
}

.graph-node small {
  font-weight: 400;
  font-size: 10px;
  opacity: 0.8;
}

.start-node {
  background: #dcfce7;
  border-color: #16a34a;
  color: #166534;
}

.end-node {
  background: #fee2e2;
  border-color: #dc2626;
  color: #991b1b;
}

.node-supervisor {
  background: #ede9fe;
  border-color: #7c3aed;
  color: #5b21b6;
  min-width: 90px;
}

.node-worker {
  background: #dbeafe;
  border-color: #2563eb;
  color: #1e40af;
  min-width: 80px;
}

.node-worker.active {
  background: #2563eb;
  color: #fff;
  transform: scale(1.08);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
}

.agent-cluster {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.graph-arrow-h {
  color: #999;
  font-size: 16px;
}

.graph-viz-legend {
  margin-top: 10px;
  font-size: 11px;
  color: #888;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mermaid-container {
  background: #fff;
  border-radius: 6px;
  padding: 8px;
  overflow: auto;
  text-align: center;
}

.mermaid-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100px;
  color: #aaa;
  font-size: 13px;
}

/* 输入区域 */
.input-section {
  margin-bottom: 12px;
}

.input-section textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  resize: vertical;
  box-sizing: border-box;
}

.btn-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.btn-row button {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.btn-row button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-clear {
  background: #f3f4f6 !important;
  color: #6b7280 !important;
  border: 1px solid #d1d5db !important;
}

/* 快捷测试 */
.quick-test-section {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.quick-test-label {
  font-size: 13px;
  font-weight: 600;
  color: #666;
}

.btn-quick {
  padding: 5px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #fff;
  font-size: 12px;
  color: #555;
  cursor: pointer;
}

.btn-quick:hover {
  border-color: #8b5cf6;
  color: #7c3aed;
}

.btn-quick:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 错误提示 */
.error-msg {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  padding: 10px 14px;
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 13px;
}

/* 结果区域 */
.result-area {
  margin-top: 12px;
}

.result-box {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.result-label {
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  color: #fff;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
}

.result-content {
  padding: 12px 14px;
  background: #fff;
}

.result-field {
  display: flex;
  margin-bottom: 8px;
  font-size: 13px;
  line-height: 1.6;
}

.result-field:last-child {
  margin-bottom: 0;
}

.field-key {
  font-weight: 600;
  color: #555;
  white-space: nowrap;
  margin-right: 8px;
}

.field-value {
  color: #333;
  flex: 1;
}

.field-value.highlight {
  background: #f0fdf4;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #bbf7d0;
}

/* 交接时间线 */
.timeline-event {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px dashed #e5e7eb;
  font-size: 13px;
}

.timeline-event:last-child {
  border-bottom: none;
}

.timeline-step {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ede9fe;
  color: #5b21b6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}

.timeline-node {
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  flex-shrink: 0;
}

.timeline-node.supervisor {
  background: #ede9fe;
  color: #5b21b6;
}

.timeline-node.worker {
  background: #dbeafe;
  color: #1e40af;
}

.timeline-node.handoff {
  background: #fef3c7;
  color: #92400e;
}

.timeline-detail {
  color: #666;
}

.timeline-empty {
  color: #aaa;
  font-size: 13px;
  text-align: center;
  padding: 8px;
}

/* 路由日志 */
.route-log-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px dashed #e5e7eb;
  font-size: 13px;
}

.route-log-item:last-child {
  border-bottom: none;
}

.route-log-step {
  font-weight: 600;
  color: #d97706;
  font-size: 12px;
  flex-shrink: 0;
}

.route-log-text {
  color: #555;
}

/* 代码块 */
.code-block {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.code-block summary {
  padding: 10px 14px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: #555;
}

.code-content {
  background: #1e293b;
  color: #e2e8f0;
  padding: 14px;
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
  margin: 0;
  font-family: 'Consolas', 'Monaco', monospace;
}

/* 对比表格 */
.compare-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
  font-size: 12px;
}

.compare-table th,
.compare-table td {
  border: 1px solid rgba(0, 0, 0, 0.1);
  padding: 6px 10px;
  text-align: left;
}

.compare-table th {
  background: rgba(0, 0, 0, 0.05);
  font-weight: 600;
}
</style>
