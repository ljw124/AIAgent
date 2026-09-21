<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-18 10:00:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-21 18:47:27
 * @Description: 阶段三：条件边与路由 — 动态流程控制
 *   学习目标：掌握 addConditionalEdges 的用法，理解条件边如何让图拥有「决策能力」
 *   核心 API：addConditionalEdges、router 函数、toolsCondition、ToolNode
 *   对比：条件边（声明式）vs 普通边（固定路由），手动 ReAct 循环 vs createReactAgent
-->
<template>
  <div>
    <h1>阶段三：条件边与路由 <span class="badge stage">LangGraph</span></h1>

    <!-- 学习目标 -->
    <div class="info-box">
      <strong>学习目标：</strong>掌握 <code>addConditionalEdges</code> 的用法，理解条件边如何让图拥有「决策能力」<br />
      <strong>核心 API：</strong><code>addConditionalEdges</code>、<code>router</code> 函数、<code>toolsCondition</code>、<code>ToolNode</code><br />
      <strong>对比：</strong>条件边（声明式路由）vs 普通边（固定路由），手动 ReAct 循环 vs <code>createReactAgent</code><br />
      <strong>⚡ 真实 LLM：</strong>使用 <code>ChatOpenAI</code> + <code>bindTools</code> 调用内网大模型，LLM 自主决定是否调用工具
    </div>

    <!-- 图结构可视化 -->
    <div class="graph-viz">
      <div class="graph-viz-title">📐 当前图结构 — ReAct 循环（条件边）</div>
      <div class="graph-viz-diagram">
        <div class="graph-node start-node">START</div>
        <div class="graph-arrow">→</div>
        <div class="graph-node node-agent">agent<br /><small>LLM 决策</small></div>
        <div class="graph-arrow">→</div>
        <div class="graph-node node-router">🔀 条件边<br /><small>router(state)</small></div>
        <div class="graph-branch">
          <div class="branch-line">
            <div class="graph-arrow">→</div>
            <div class="graph-node node-tools">tools<br /><small>执行工具</small></div>
            <div class="graph-arrow branch-back">↩</div>
          </div>
          <div class="branch-line">
            <div class="graph-arrow">→</div>
            <div class="graph-node end-node">END<br /><small>结束</small></div>
          </div>
        </div>
      </div>
      <div class="graph-viz-legend">
        <span>START → agent（普通边）</span>
        <span>agent → router（条件边：有 tool_calls → tools，无 → END）</span>
        <span>tools → agent（普通边：循环回 agent）</span>
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
        路由方式：
        <select v-model="routerMode">
          <option value="toolsCondition">toolsCondition（预构建路由）</option>
          <option value="custom">自定义 router 函数</option>
        </select>
      </label>
      <label>
        LLM 模型：
        <select v-model="modelName">
          <option value="EB-DeepSeek-V4-Pro">EB-DeepSeek-V4-Pro</option>
          <option value="EB-Kimi-K2.6">EB-Kimi-K2.6</option>
        </select>
      </label>
      <label>
        🔁 recursion_limit
        <span title="限制单次图运行的最大 SuperStep 数量，防止 ReAct 循环无限执行" style="cursor: help; color: #6b7280;">❓</span>
        ：
        <input
          v-model.number="recursionLimit"
          type="number"
          min="10"
          max="200"
          style="width: 70px;"
        />
      </label>
    </div>

    <!-- 输入区域 -->
    <div class="input-section">
      <input
        v-model="userInput"
        type="text"
        placeholder="输入问题，如：北京今天天气怎么样？计算 (123 + 456) * 789..."
        style="flex: 1; min-width: 300px;"
        @keydown.enter="runGraph"
      />
      <button @click="runGraph" :disabled="loading">
        {{ loading ? '执行中...' : '▶ 执行' }}
      </button>
      <button @click="clearResult" class="btn-clear">清空结果</button>
    </div>

    <!-- 错误提示 -->
    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- 执行结果 -->
    <div v-if="result" class="result-area">
      <!-- 最终回答 -->
      <div class="result-box">
        <div class="result-label">📤 最终回答</div>
        <div class="result-content">
          <div class="final-answer">{{ finalAnswer }}</div>
          <div class="result-field" style="margin-top: 8px;">
            <span class="field-key">消息总数：</span>
            <span class="field-value">{{ result.messages ? result.messages.length : 0 }}</span>
          </div>
          <div class="result-field">
            <span class="field-key">路由决策次数：</span>
            <span class="field-value">{{ routingDecisions.length }}</span>
          </div>
        </div>
      </div>

      <!-- 路由决策详情 -->
      <div class="result-box" style="margin-top: 12px;">
        <div class="result-label" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
          🔀 路由决策详情
        </div>
        <div class="result-content">
          <div v-if="routingDecisions.length === 0" style="color: #9ca3af; font-size: 13px;">
            LLM 直接回答了问题，未触发工具调用（无路由决策）
          </div>
          <div
            v-for="(decision, index) in routingDecisions"
            :key="index"
            class="execution-step"
          >
            <div class="step-header">
              <span class="step-number">决策 {{ index + 1 }}</span>
              <span class="step-node">源节点：{{ decision.source }}</span>
              <span
                class="step-decision"
                :class="decision.target === 'tools' ? 'decision-tools' : 'decision-end'"
              >
                → {{ decision.target === '__end__' ? 'END' : decision.target }}
              </span>
            </div>
            <div class="step-detail">
              <div><strong>判断依据：</strong>{{ decision.reason }}</div>
              <div v-if="decision.toolCalls" style="margin-top: 6px;">
                <strong>tool_calls 内容：</strong>
                <pre class="state-json">{{ formatJSON(decision.toolCalls) }}</pre>
              </div>
            </div>
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
              <div><strong>输入状态摘要：</strong></div>
              <pre class="state-json">{{ step.input }}</pre>
              <div><strong>节点输出摘要：</strong></div>
              <pre class="state-json">{{ step.output }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 代码展示：JS 版 -->
    <details class="code-block" style="margin-top: 16px;">
      <summary>📝 LangGraph.js 核心代码（两种路由方式）</summary>
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
      ① JS 用 <code>addConditionalEdges</code>（驼峰），Python 用 <code>add_conditional_edges</code>（蛇形）<br />
      ② JS 路由函数直接返回节点名字符串，Python 也返回字符串（行为一致）<br />
      ③ JS 用 <code>lastMsg.tool_calls?.length</code> 判断，Python 用 <code>hasattr(last_msg, 'tool_calls')</code><br />
      ④ JS 的 <code>toolsCondition</code>（驼峰），Python 的 <code>tools_condition</code>（蛇形）<br />
      ⑤ 两者都支持返回 <code>END</code> 常量来终止图<br />
      ⑥ 条件边让图有了「决策能力」——这是 <code>createReactAgent</code> 内部的核心逻辑
    </div>

    <!-- recursion_limit 说明 -->
    <div class="info-box" style="margin-top: 12px; background: #fef2f2; border-color: #fecaca; color: #991b1b;">
      <strong>🔁 recursion_limit（递归限制）说明：</strong><br />
      ① <code>recursion_limit</code> 限制单次图运行的最大 <b>SuperStep</b>（超步）数量，防止 ReAct 循环无限执行<br />
      ② 达到限制时抛出 <code>GraphRecursionError</code>，之前遇到的 "Recursion limit of 25 reached" 就是这个错误<br />
      ③ JS 版 LangGraph 默认值通常为 <b>25</b>（来自 <code>langchain_core.runnables.config</code>），Python 版为 <b>10000</b><br />
      ④ <b>最佳实践：显式传入</b> <code>{ recursion_limit: N }</code>，避免不同版本/环境默认值不一致<br />
      ⑤ 也可通过 <code>RemainingSteps</code> 托管状态在路由函数中主动判断剩余步数，优雅退出循环
    </div>

    <!-- 条件边 vs 普通边 对比 -->
    <div class="info-box" style="margin-top: 12px; background: #f0f9ff; border-color: #bae6fd; color: #0369a1;">
      <strong>🔄 条件边 vs 普通边：</strong><br />
      <table class="compare-table">
        <thead>
          <tr>
            <th>特性</th>
            <th>普通边（addEdge）</th>
            <th>条件边（addConditionalEdges）</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>路由方式</strong></td>
            <td>固定路由，编译时确定</td>
            <td>动态路由，运行时根据状态决定</td>
          </tr>
          <tr>
            <td><strong>决策时机</strong></td>
            <td>编译时</td>
            <td>运行时（每次执行节点后）</td>
          </tr>
          <tr>
            <td><strong>API 签名</strong></td>
            <td><code>addEdge(from, to)</code></td>
            <td><code>addConditionalEdges(from, router)</code></td>
          </tr>
          <tr>
            <td><strong>适用场景</strong></td>
            <td>线性流程、固定顺序</td>
            <td>分支流程、循环流程、ReAct 模式</td>
          </tr>
          <tr>
            <td><strong>示例</strong></td>
            <td>START → A → B → END</td>
            <td>agent → [判断] → tools/END</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
/* global INNER_API_KEY */
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { StateGraph, Annotation, START, END } from '@langchain/langgraph'
import { ToolNode, toolsCondition } from '@langchain/langgraph/prebuilt'
import { z } from 'zod'
import mermaid from 'mermaid'
import { stage3JsCode, stage3PyCode } from '@/composables/langgraphSamples.js'

export default {
  name: 'LangGraphStage3Routing',

  data() {
    return {
      userInput: '',
      routerMode: 'toolsCondition',
      modelName: 'EB-DeepSeek-V4-Pro',
      recursionLimit: 50,
      loading: false,
      error: null,
      result: null,
      finalAnswer: '',
      executionSteps: [],
      routingDecisions: [],
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
    this.jsCodeSample = stage3JsCode
    this.pyCodeSample = stage3PyCode
  },

  methods: {
    /**
     * 创建天气查询工具
     */
    createWeatherTool() {
      return tool(
        async ({ city }) => {
          const weatherData = {
            '北京': { temp: 28, condition: '晴', humidity: '45%' },
            '上海': { temp: 32, condition: '多云', humidity: '65%' },
            '广州': { temp: 35, condition: '雷阵雨', humidity: '80%' },
            '深圳': { temp: 33, condition: '阵雨', humidity: '75%' },
            '杭州': { temp: 30, condition: '阴', humidity: '60%' }
          }
          const data = weatherData[city] || { temp: 25, condition: '未知', humidity: '50%' }
          return `${city}天气：${data.condition}，温度 ${data.temp}°C，湿度 ${data.humidity}`
        },
        {
          name: 'get_weather',
          description: '查询指定城市的天气信息。当用户询问天气时调用此工具。',
          schema: z.object({
            city: z.string().describe('城市名称，如 北京、上海、广州')
          })
        }
      )
    },

    /**
     * 创建计算器工具
     */
    createCalculatorTool() {
      return tool(
        async ({ expression }) => {
          const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '')
          try {
            const result = eval(sanitized)
            return `计算结果: ${expression} = ${result}`
          } catch (e) {
            return `计算错误: ${e.message}`
          }
        },
        {
          name: 'calculator',
          description: '执行数学计算。支持加减乘除、括号、百分比。当用户需要进行数学计算时调用此工具。',
          schema: z.object({
            expression: z.string().describe('数学表达式，如 "(123 + 456) * 789 / 10"')
          })
        }
      )
    },

    /**
     * 创建时间查询工具
     */
    createTimeTool() {
      return tool(
        async ({ timezone }) => {
          const now = new Date()
          const timeStr = now.toLocaleString('zh-CN', { timeZone: timezone || 'Asia/Shanghai' })
          return `当前时间（${timezone || 'Asia/Shanghai'}）: ${timeStr}`
        },
        {
          name: 'get_current_time',
          description: '获取当前日期和时间。当用户询问现在几点、今天日期时调用。',
          schema: z.object({
            timezone: z.string().optional().describe('时区，如 Asia/Shanghai，默认为北京时间')
          })
        }
      )
    },

    /**
     * 执行条件边图
     *
     * 阶段三核心：使用真实 LLM + ToolNode + toolsCondition 演示 ReAct 循环
     * 流程：START → agent(LLM决策) → [条件边] → tools(执行) → agent → ... → END
     */
    async runGraph() {
      const text = this.userInput.trim()
      if (!text || this.loading) return

      this.loading = true
      this.error = null
      this.result = null
      this.finalAnswer = ''
      this.executionSteps = []
      this.routingDecisions = []

      try {
        // ============================================================
        // 1. 创建工具列表
        // ============================================================
        const tools = [
          this.createWeatherTool(),
          this.createCalculatorTool(),
          this.createTimeTool()
        ]

        // ============================================================
        // 2. 创建 LLM 并绑定工具
        // ============================================================
        const llm = new ChatOpenAI({
          model: this.modelName,
          apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
          temperature: 0,
          configuration: {
            baseURL: window.location.origin + '/inner/'
          }
        })

        const llmWithTools = llm.bindTools(tools)

        // ============================================================
        // 3. 定义状态
        // ============================================================
        const AgentState = Annotation.Root({
          messages: Annotation({
            reducer: (left, right) => left.concat(right),
            default: () => []
          })
        })

        // ============================================================
        // 4. 定义节点函数
        // ============================================================

        // agent 节点：调用真实 LLM
        const agentNode = async (state) => {
          const msgCount = state.messages.length
          const lastMsg = state.messages[msgCount - 1]
          const lastContent = lastMsg?.content?.substring(0, 80) || '(tool_calls)'

          const response = await llmWithTools.invoke(state.messages)

          const hasToolCalls = response.tool_calls && response.tool_calls.length > 0
          const outputSummary = hasToolCalls
            ? `LLM 返回 ${response.tool_calls.length} 个 tool_calls: ${response.tool_calls.map(tc => tc.name).join(', ')}`
            : `LLM 返回文本: ${(response.content || '').substring(0, 100)}`

          this.executionSteps.push({
            node: 'agent',
            input: `消息数: ${msgCount}, 最后一条: ${lastContent}`,
            output: outputSummary
          })

          return { messages: [response] }
        }

        // tools 节点
        const toolsNode = async (state) => {
          const lastMsg = state.messages[state.messages.length - 1]
          const toolCallNames = lastMsg.tool_calls?.map(tc => tc.name).join(', ') || '未知'

          // 使用 ToolNode 自动执行工具
          const toolNode = new ToolNode(tools)
          const result = await toolNode.invoke(state)

          const toolResults = result.messages?.map(m => m.content?.substring(0, 100)).join(' | ') || ''

          this.executionSteps.push({
            node: 'tools',
            input: `执行工具: ${toolCallNames}`,
            output: `工具返回: ${toolResults}`
          })

          return result
        }

        // ============================================================
        // 5. 构建路由函数
        // ============================================================
        let routerFn
        if (this.routerMode === 'toolsCondition') {
          // 方式一：使用 LangGraph 官方的 toolsCondition 预构建路由
          // toolsCondition 内部逻辑：检查最后一条 AIMessage 是否有 tool_calls
          //   有 tool_calls → 返回 'tools'
          //   无 tool_calls → 返回 END
          // 包装一层用于记录路由决策到 UI
          routerFn = (state) => {
            const lastMsg = state.messages[state.messages.length - 1]
            const hasToolCalls = lastMsg.tool_calls && lastMsg.tool_calls.length > 0

            const decision = {
              source: 'agent',
              target: hasToolCalls ? 'tools' : '__end__',
              reason: hasToolCalls
                ? `toolsCondition（官方预构建）检测到 ${lastMsg.tool_calls.length} 个 tool_calls → 路由到 'tools' 节点`
                : 'toolsCondition（官方预构建）未检测到 tool_calls → 路由到 END（结束）',
              toolCalls: hasToolCalls ? lastMsg.tool_calls.map(tc => ({ name: tc.name, args: tc.args })) : null
            }
            this.routingDecisions.push(decision)

            // 调用官方 toolsCondition 进行实际路由
            return toolsCondition(state)
          }
        } else {
          // 方式二：自定义路由函数（手动实现 toolsCondition 等价逻辑）
          routerFn = (state) => {
            const lastMsg = state.messages[state.messages.length - 1]
            const hasToolCalls = lastMsg.tool_calls?.length > 0

            const decision = {
              source: 'agent',
              target: hasToolCalls ? 'tools' : '__end__',
              reason: hasToolCalls
                ? `自定义判断：lastMsg.tool_calls?.length = ${lastMsg.tool_calls.length} > 0 → 路由到 'tools'`
                : '自定义判断：lastMsg.tool_calls 为空或不存在 → 路由到 END',
              toolCalls: hasToolCalls ? lastMsg.tool_calls.map(tc => ({ name: tc.name, args: tc.args })) : null
            }
            this.routingDecisions.push(decision)

            if (hasToolCalls) return 'tools'
            return END
          }
        }

        // ============================================================
        // 6. 构建图
        // ============================================================
        const graph = new StateGraph(AgentState)
          .addNode('agent', agentNode)
          .addNode('tools', toolsNode)
          .addEdge(START, 'agent')
          .addConditionalEdges('agent', routerFn)
          .addEdge('tools', 'agent')

        // ============================================================
        // 7. 编译并执行
        // ============================================================
        const app = graph.compile()
        const initialState = {
          messages: [new HumanMessage(text)]
        }
        this.result = await app.invoke(initialState, { recursion_limit: this.recursionLimit })

        // 提取最终回答
        const lastMessage = this.result.messages[this.result.messages.length - 1]
        this.finalAnswer = lastMessage?.content || '(无文本内容)'
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
          console.warn('[LangGraph Stage3] 获取图结构失败:', graphErr)
        }
      } catch (err) {
        console.error('[LangGraph Stage3 Error]', err)
        this.error = `执行失败: ${err.message}`
      } finally {
        this.loading = false
      }
    },

    /** 清空结果 */
    clearResult() {
      this.result = null
      this.finalAnswer = ''
      this.executionSteps = []
      this.routingDecisions = []
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
        const { svg } = await mermaid.render('mermaid-graph', this.mermaidGraph)
        container.innerHTML = svg
      } catch (err) {
        console.warn('[LangGraph Stage3] Mermaid 渲染失败:', err)
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
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
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

.node-agent {
  background: #e0e7ff;
  color: #3730a3;
  border: 2px solid #a5b4fc;
}

.node-router {
  background: #fef3c7;
  color: #92400e;
  border: 2px solid #fcd34d;
  border-style: dashed;
}

.node-tools {
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

.branch-back {
  color: #6366f1;
  font-size: 20px;
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
  最终回答
  ============================================================ */
.final-answer {
  background: #f0fdf4;
  border: 1px solid #86efac;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 15px;
  line-height: 1.7;
  color: #166534;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ============================================================
  路由决策详情
  ============================================================ */
.step-decision {
  font-size: 13px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
  margin-left: 8px;
}

.decision-tools {
  background: #d1fae5;
  color: #065f46;
}

.decision-end {
  background: #fce7f3;
  color: #9d174d;
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
