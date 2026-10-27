/**
 * 智能客服 Agent — LangGraph StateGraph 核心引擎
 *
 * 用 StateGraph 手写客服工作流，替代 createReactAgent 黑盒。
 * 融合 LangChain 10 阶段 + LangGraph 11 阶段全部知识。
 *
 * LangGraph 阶段映射：
 *   Stage1:  StateGraph — 自定义状态图
 *   Stage2:  Annotation — 状态定义
 *   Stage3:  Routing — 条件路由（意图分流）
 *   Stage4:  Command — 命令式路由（工具调用后动态跳转）
 *   Stage5:  Interrupt — 人机协同（敏感操作确认）
 *   Stage6:  Send — 并行执行（多工具并行调用）
 *   Stage7:  Memory — 短期记忆（MemorySaver）
 *   Stage8:  Store — 长期记忆（PostgresStore）
 *   Stage9:  Checkpoint — 检查点/时光旅行
 *   Stage10: Context — 运行时上下文注入
 *   Stage11: Subgraph — 子图嵌套（RAG子图、工具子图）
 *
 * LangChain 阶段映射：
 *   Stage1:  Prompt 模板（多租户 System Prompt）
 *   Stage2:  LCEL 链（RAG 检索链）
 *   Stage3:  流式输出（streamMode: 'values'）
 *   Stage4:  结构化输出（responseFormat + zod）
 *   Stage5:  工具调用（calculator / weather / search_knowledge）
 *   Stage6:  Agent 循环（Think→Act→Observe，由 StateGraph 节点实现）
 *   Stage7:  RAG 知识库（文档→分片→向量→检索）
 *   Stage8:  中间件（日志 + Token 统计）
 */

/* global INNER_API_KEY */
import { StateGraph, Annotation, START, END } from '@langchain/langgraph'
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { ChatPromptTemplate } from '@langchain/core/prompts'

// 模块导入
import { createTools, setRAGService } from './tools'
import { RAGService } from './rag'
import { createCallbacks } from './middleware'
import { getMemoryManager } from './memory'
import { getTenantById, getTenantToolNames } from './tenants'

// ============================================================
// Stage2: Annotation — 客服状态定义
// ============================================================
export const CustomerState = Annotation.Root({
  // 用户原始输入
  query: Annotation(),

  // 对话消息历史（由 MemorySaver 自动管理，reducer 合并新旧消息）
  messages: Annotation({
    default: () => [],
    reducer: (prev, next) => {
      // 如果 next 是数组则合并，否则追加
      if (Array.isArray(next)) return [...prev, ...next]
      return [...prev, next]
    }
  }),

  // Stage3: 意图分类结果
  intent: Annotation({ default: () => 'unknown' }),
  intentConfidence: Annotation({ default: () => 0 }),

  // Stage7: RAG 检索结果
  retrievedDocs: Annotation({ default: () => [] }),

  // Stage5+6: 工具调用结果
  toolResults: Annotation({ default: () => [] }),
  toolCallsPending: Annotation({ default: () => [] }),

  // 最终回答
  finalAnswer: Annotation({ default: () => '' }),

  // Stage5: 是否需要人工介入
  needsHumanReview: Annotation({ default: () => false }),
  humanReviewApproved: Annotation({ default: () => false }),

  // 当前租户配置
  tenantId: Annotation({ default: () => 'tech-doc' }),
  userId: Annotation({ default: () => 'user-001' }),

  // 节点执行轨迹（用于可视化）
  executionTrace: Annotation({
    default: () => [],
    reducer: (prev, next) => [...prev, ...(Array.isArray(next) ? next : [next])]
  }),

  // 结构化输出（Stage4）
  structuredResponse: Annotation({ default: () => null })
})

// ============================================================
// C2 修复：预创建 Prompt 模板为模块级常量，避免每次节点调用时重复创建
// 注意：LangChain 的 f-string 模板使用 {var} 语法，字面量 { } 需用 {{ }} 转义
// ============================================================
var CLASSIFY_SYSTEM_PROMPT = [
  '你是一个意图分类器。分析用户输入，判断意图类型。',
  '',
  '意图类型：',
  '- faq: 简单常见问题（问候、感谢、自我介绍等），可以直接回答',
  '- technical: 技术问题，需要检索知识库',
  '- calculation: 数学计算，需要使用计算器工具',
  '- weather: 天气查询，需要使用天气工具',
  '- human: 需要人工客服介入（投诉、复杂问题等）',
  '- general: 通用问题，可以直接回答',
  '',
  '请只返回 JSON 格式：{{"intent": "类型", "confidence": 0.0-1.0}}'
].join('\n')

var TOOL_CALL_SYSTEM_PROMPT = [
  '你是一个工具调用决策器。根据用户输入，决定调用哪个工具以及传递什么参数。',
  '',
  '可用工具：',
  '{toolDescriptions}',
  '',
  '请只返回 JSON 格式：',
  '{{',
  '  "toolCalls": [',
  '    {{"name": "工具名称", "args": {{"参数名": "参数值"}}}}',
  '  ]',
  '}}',
  '',
  '如果不需要调用工具，返回：{{"toolCalls": []}}'
].join('\n')

// ============================================================
// 客服图构建器
// ============================================================
export class CustomerGraphBuilder {
  constructor() {
    this.llm = null
    this.ragService = null
    this.memoryManager = getMemoryManager()
    this.callbacks = null
    this.compiled = null

    // 租户配置
    this.currentTenantId = 'tech-doc'
    this.currentUserId = 'user-001'

    // 功能开关
    this.features = {
      enableStream: true,
      enableStructured: false,
      enableMemory: true,
      enableStore: true,
      showThinking: true,
      showRetrieved: true,
      enableParallelTools: true,   // Stage6: 并行工具调用
      enableHumanReview: false,    // Stage5: 人机协同
      enableFAQ: true              // FAQ 快速通道
    }

    // === C2 修复：使用模块级常量创建 Prompt 模板 ===
    this._classifyPrompt = ChatPromptTemplate.fromMessages([
      ['system', CLASSIFY_SYSTEM_PROMPT],
      ['human', '{query}']
    ])

    this._toolCallPrompt = ChatPromptTemplate.fromMessages([
      ['system', TOOL_CALL_SYSTEM_PROMPT],
      ['human', '{query}']
    ])
  }

  // ============================================================
  // 初始化
  // ============================================================
  initLLM() {
    if (this.llm) return this.llm
    // eslint-disable-next-line no-undef
    this.llm = new ChatOpenAI({
      model: 'EB-DeepSeek-Flash',
      apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
      temperature: 0.7,
      configuration: {
        baseURL: window.location.origin + '/inner/'
      },
      // 传入 callbacks 列表以启用 Token 统计
      callbacks: this.callbacks ? this.callbacks.list : undefined
    })
    return this.llm
  }

  async initKnowledgeBase() {
    if (this.ragService?.isReady()) return this.ragService.getStats()
    this.ragService = new RAGService()
    const docCount = await this.ragService.initBuiltinKnowledge()
    setRAGService(this.ragService)
    return { docCount, ready: true }
  }

  initCallbacks() {
    if (this.callbacks) return this.callbacks
    this.callbacks = createCallbacks()
    return this.callbacks
  }

  async fullInit() {
    // 先初始化 callbacks，再初始化 LLM（LLM 需要 callbacks 进行 Token 统计）
    this.initCallbacks()
    this.initLLM()
    await this.initKnowledgeBase()

    let userPreferences = null
    try {
      userPreferences = await this.memoryManager.loadUserPreferences(
        this.currentTenantId, this.currentUserId
      )
    } catch (err) {
      console.warn('[CustomerGraph] 加载长期记忆失败:', err.message)
    }

    return {
      llmReady: !!this.llm,
      ragReady: this.ragService?.isReady() || false,
      memoryReady: true,
      userPreferences
    }
  }

  // ============================================================
  // Stage1: StateGraph — 构建客服工作流图
  // ============================================================
  buildGraph() {
    if (this.compiled) return this.compiled

    // 创建 StateGraph
    const workflow = new StateGraph(CustomerState)

    // 注册节点
    workflow
      .addNode('classify_intent', this._classifyIntentNode.bind(this))
      .addNode('faq_answer', this._faqAnswerNode.bind(this))
      .addNode('rag_retrieve', this._ragRetrieveNode.bind(this))
      .addNode('tool_execute', this._toolExecuteNode.bind(this))
      .addNode('generate_answer', this._generateAnswerNode.bind(this))
      .addNode('human_review', this._humanReviewNode.bind(this))

    // 设置入口
    workflow.addEdge(START, 'classify_intent')

    // Stage3: 条件路由 — 根据意图分流
    workflow.addConditionalEdges('classify_intent', this._routeByIntent.bind(this), {
      faq: 'faq_answer',
      technical: 'rag_retrieve',
      calculation: 'tool_execute',
      weather: 'tool_execute',
      human: 'human_review',
      general: 'generate_answer'
    })

    // FAQ 直接结束
    workflow.addEdge('faq_answer', END)

    // RAG 检索后 → 生成回答
    workflow.addEdge('rag_retrieve', 'generate_answer')

    // Stage4: 工具调用后 → 条件路由（可能需要继续调用工具 or 生成回答）
    workflow.addConditionalEdges('tool_execute', this._routeAfterTools.bind(this), {
      generate: 'generate_answer',
      continue_tools: 'tool_execute'
    })

    // 生成回答 → 结束
    workflow.addEdge('generate_answer', END)

    // 人工审核 → 结束
    workflow.addEdge('human_review', END)

    return workflow
  }

  /**
   * 编译图（注入 MemorySaver + Store）
   */
  compile() {
    if (this.compiled) return this.compiled

    const workflow = this.buildGraph()
    this.compiled = workflow.compile({
      // Stage7: 短期记忆
      checkpointer: this.memoryManager.getCheckpointer(),
      // Stage8: 长期记忆
      store: this.memoryManager.getStore()
    })

    return this.compiled
  }

  // ============================================================
  // 节点实现
  // ============================================================

  /**
   * 意图分类节点
   * Stage1: Prompt 模板 + Stage3: 条件路由
   */
  async _classifyIntentNode(state) {
    const trace = { node: 'classify_intent', timestamp: Date.now(), status: 'running' }

    try {
      // C2 修复：使用预创建的 Prompt 模板，避免每次调用重复创建
      const chain = this._classifyPrompt.pipe(this.llm)
      const response = await chain.invoke({ query: state.query })
      const content = typeof response.content === 'string' ? response.content : ''

      // 解析 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      let intent = 'general'
      let confidence = 0.5

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        intent = parsed.intent || 'general'
        confidence = parsed.confidence || 0.5
      }

      trace.status = 'completed'
      trace.output = { intent, confidence }

      return {
        intent,
        intentConfidence: confidence,
        executionTrace: [trace],
        messages: [new HumanMessage(state.query)]
      }
    } catch (err) {
      trace.status = 'error'
      trace.error = err.message
      return {
        intent: 'general',
        intentConfidence: 0,
        executionTrace: [trace],
        messages: [new HumanMessage(state.query)]
      }
    }
  }

  /**
   * FAQ 快速回答节点
   * Stage3: Routing — 简单问题快速通道
   */
  async _faqAnswerNode(state) {
    const trace = { node: 'faq_answer', timestamp: Date.now(), status: 'running' }

    try {
      const tenant = getTenantById(state.tenantId || this.currentTenantId)

      // === 加载长期记忆（用户偏好 + 用户事实记忆） ===
      let userPreferences = null
      let userMemories = []
      try {
        const tenantId = state.tenantId || this.currentTenantId
        const userId = state.userId || this.currentUserId
        userPreferences = await this.memoryManager.loadUserPreferences(tenantId, userId)
        userMemories = await this.memoryManager.loadUserMemories(tenantId, userId)
      } catch (err) {
        console.warn('[FAQ] 加载长期记忆失败:', err.message)
      }

      // 构建用户上下文（用户偏好 + 事实记忆，包含所有非空字段）
      const parts = []
      if (userPreferences) {
        const prefs = userPreferences.preferences || userPreferences
        if (prefs.name) parts.push(`名称: ${prefs.name}`)
        if (prefs.interests) parts.push(`爱好: ${prefs.interests}`)
        if (prefs.expertise) parts.push(`专业领域: ${prefs.expertise}`)
        if (prefs.language) parts.push(`偏好语言: ${prefs.language}`)
      }
      if (Array.isArray(userMemories)) {
        for (const item of userMemories) {
          const content = item.value?.content || item.value?.value?.content
          if (content && typeof content === 'string') parts.push(content.trim())
        }
      }
      const userContext = parts.length > 0 ? `\n当前用户信息: ${parts.join(', ')}` : ''

      // 使用 SystemMessage/HumanMessage 直接调用，以便注入用户上下文
      const { SystemMessage, HumanMessage } = await import('@langchain/core/messages')
      const systemContent = `你是一个友好的智能客服。请简洁、直接地回答用户的问题，不要重复问候语。\n当前租户：${tenant?.name || '智能客服'}${userContext}\n回答限制在 100 字以内。\n注意：如果用户询问自己的个人信息（如姓名、爱好、专业领域、语言偏好等），请根据「当前用户信息」中的内容直接回答，不要说你不知道。回答其他问题时直接切入主题，不要在前面加问候语。`
      const response = await this.llm.invoke([
        new SystemMessage(systemContent),
        new HumanMessage(state.query)
      ])

      const answer = typeof response.content === 'string' ? response.content : ''

      trace.status = 'completed'
      trace.output = { answer }

      return {
        finalAnswer: answer,
        executionTrace: [trace],
        messages: [new AIMessage(answer)]
      }
    } catch (err) {
      trace.status = 'error'
      trace.error = err.message
      return {
        finalAnswer: `抱歉，处理您的问题时出现了错误：${err.message}`,
        executionTrace: [trace]
      }
    }
  }

  /**
   * RAG 检索节点
   * Stage7: 文档检索 + Stage11: 可作为子图
   */
  async _ragRetrieveNode(state) {
    const trace = { node: 'rag_retrieve', timestamp: Date.now(), status: 'running' }

    try {
      if (!this.ragService || !this.ragService.isReady()) {
        trace.status = 'completed'
        trace.output = { docCount: 0, note: '知识库未初始化' }
        return {
          retrievedDocs: [],
          executionTrace: [trace]
        }
      }

      const results = await this.ragService.search(state.query, 3)

      trace.status = 'completed'
      trace.output = { docCount: results.length }

      return {
        retrievedDocs: results,
        executionTrace: [trace]
      }
    } catch (err) {
      trace.status = 'error'
      trace.error = err.message
      return {
        retrievedDocs: [],
        executionTrace: [trace]
      }
    }
  }

  /**
   * 工具执行节点
   * Stage5: Tool Calling + Stage6: Send 并行执行
   *
   * C1 修复：增加 LLM Tool Calling 步骤，让 LLM 根据用户输入和工具 schema
   * 生成正确的调用参数（如 calculator 需要 {expression}，weather 需要 {city}）
   */
  async _toolExecuteNode(state) {
    const trace = { node: 'tool_execute', timestamp: Date.now(), status: 'running' }

    const toolNames = getTenantToolNames(state.tenantId || this.currentTenantId)
    const tools = createTools(toolNames)

    // 根据意图筛选工具
    let activeTools = tools
    if (state.intent === 'calculation') {
      activeTools = tools.filter((t) => t.name === 'calculator')
    } else if (state.intent === 'weather') {
      activeTools = tools.filter((t) => t.name === 'get_weather')
    }

    // === C1 修复：LLM Tool Calling — 让 LLM 决定调用参数 ===
    // 构建工具描述供 LLM 参考
    const toolDescriptions = activeTools
      .map((t) => `- ${t.name}: ${t.description || '无描述'}`)
      .join('\n')

    let toolCalls = []
    try {
      const toolCallChain = this._toolCallPrompt.pipe(this.llm)
      const toolCallResponse = await toolCallChain.invoke({
        query: state.query,
        toolDescriptions: toolDescriptions || '无可用工具'
      })
      const content = typeof toolCallResponse.content === 'string' ? toolCallResponse.content : ''
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        toolCalls = parsed.toolCalls || []
      }
    } catch (err) {
      console.warn('[ToolExecute] LLM Tool Calling 失败，使用回退策略:', err.message)
      // 回退：对 search_knowledge 工具使用 query 参数
      toolCalls = activeTools.map((t) => ({
        name: t.name,
        args: { query: state.query }
      }))
    }

    // 如果 LLM 没有返回工具调用，回退到默认行为
    if (toolCalls.length === 0) {
      toolCalls = activeTools.map((t) => ({
        name: t.name,
        args: { query: state.query }
      }))
    }

    // === 执行工具调用 ===
    const toolResults = []
    const toolMap = Object.fromEntries(activeTools.map((t) => [t.name, t]))

    // Stage6: Send 并行执行 — 如果启用并行且工具调用数 > 1
    if (this.features.enableParallelTools && toolCalls.length > 1) {
      const parallelResults = await Promise.allSettled(
        toolCalls.map(async (tc) => {
          const tool = toolMap[tc.name]
          if (!tool) return { toolName: tc.name, result: `工具 "${tc.name}" 不可用`, success: false }
          try {
            const result = await tool.invoke(tc.args)
            return { toolName: tc.name, result: String(result), success: true }
          } catch (err) {
            return { toolName: tc.name, result: err.message, success: false }
          }
        })
      )

      for (const r of parallelResults) {
        if (r.status === 'fulfilled') {
          toolResults.push(r.value)
        }
      }
    } else {
      // 串行执行
      for (const tc of toolCalls) {
        const tool = toolMap[tc.name]
        if (!tool) {
          toolResults.push({ toolName: tc.name, result: `工具 "${tc.name}" 不可用`, success: false })
          continue
        }
        try {
          const result = await tool.invoke(tc.args)
          toolResults.push({ toolName: tc.name, result: String(result), success: true })
        } catch (err) {
          toolResults.push({ toolName: tc.name, result: err.message, success: false })
        }
      }
    }

    trace.status = 'completed'
    trace.output = { toolsCalled: toolResults.map((t) => t.toolName) }

    return {
      toolResults,
      executionTrace: [trace],
    }
  }

  /**
   * 生成回答节点
   * Stage1: Prompt + Stage3: Stream + Stage4: Structured + Stage10: 长期记忆注入
   */
  async _generateAnswerNode(state) {
    const trace = { node: 'generate_answer', timestamp: Date.now(), status: 'running' }

    const tenant = getTenantById(state.tenantId || this.currentTenantId)

    // === Stage10: 加载长期记忆（用户偏好 + 历史对话摘要 + 用户事实记忆） ===
    let userPreferences = null
    let conversationHistory = null
    let userMemories = []
    try {
      const tenantId = state.tenantId || this.currentTenantId
      const userId = state.userId || this.currentUserId
      userPreferences = await this.memoryManager.loadUserPreferences(tenantId, userId)
      conversationHistory = await this.memoryManager.getConversationHistory(tenantId, userId)
      userMemories = await this.memoryManager.loadUserMemories(tenantId, userId)
    } catch (err) {
      console.warn('[GenerateAnswer] 加载长期记忆失败:', err.message)
    }

    // 构建上下文
    let contextParts = []

    // 长期记忆：用户偏好
    if (userPreferences) {
      const prefs = userPreferences.preferences || userPreferences
      const hasData = prefs.name || prefs.language || prefs.interests || prefs.expertise
      if (hasData) {
        contextParts.push('## 用户偏好（长期记忆）')
        if (prefs.name) contextParts.push(`- 用户名称: ${prefs.name}`)
        if (prefs.language) contextParts.push(`- 偏好语言: ${prefs.language}`)
        if (prefs.interests) contextParts.push(`- 兴趣领域: ${prefs.interests}`)
        if (prefs.expertise) contextParts.push(`- 技术水平: ${prefs.expertise}`)
      }
    }

    // 长期记忆：用户事实记忆（memories namespace，如“用户姓名是小米”“用户叫小米”）
    if (Array.isArray(userMemories) && userMemories.length > 0) {
      const memoryLines = userMemories
        .map((item) => {
          const content = item.value?.content || item.value?.value?.content
          return content && typeof content === 'string' ? content.trim() : ''
        })
        .filter(Boolean)
      if (memoryLines.length > 0) {
        contextParts.push('## 用户记忆（长期记忆）')
        contextParts.push(memoryLines.map((line) => `- ${line}`).join('\n'))
      }
    }

    // 长期记忆：历史对话摘要（仅提供背景，不要在回答中复述或评论历史内容）
    if (conversationHistory && conversationHistory.length > 0) {
      const historyLines = []
      conversationHistory.slice(-3).forEach((item) => {
        const summary = item.value?.summary || item.value
        if (summary && typeof summary === 'object' && summary.userQuery) {
          historyLines.push(`- 用户曾问过: ${summary.userQuery}`)
        }
      })
      if (historyLines.length > 0) {
        contextParts.push('## 历史对话（仅供背景参考，不要主动提及）')
        contextParts.push(historyLines.join('\n'))
      }
    }

    // RAG 检索结果
    if (state.retrievedDocs && state.retrievedDocs.length > 0) {
      contextParts.push('## 知识库检索结果')
      state.retrievedDocs.forEach((doc, i) => {
        contextParts.push(`[文档${i + 1}] (来源: ${doc.metadata?.source || '未知'}, 相似度: ${doc.score?.toFixed(2) || 'N/A'})`)
        contextParts.push(doc.content?.substring(0, 500) || '')
      })
    }

    // 工具调用结果
    if (state.toolResults && state.toolResults.length > 0) {
      contextParts.push('## 工具调用结果')
      state.toolResults.forEach((tr) => {
        contextParts.push(`[${tr.toolName}]: ${tr.result}`)
      })
    }

    const contextStr = contextParts.join('\n\n')

    const systemPrompt = `${tenant.systemPrompt}

    ## 当前上下文
    ${contextStr || '无额外上下文'}

    ## 回答要求
    - 只回答用户当前的问题，不要对「历史对话」中的内容进行评论或复述
    - 如果上下文中有「用户偏好」或「用户记忆」信息（如用户名称、用户叫法、兴趣等），请直接使用这些信息回答用户关于自身的问题，不要说你不知道
    - 如果上下文中有知识库检索结果，请引用来源
    - 如果上下文中有工具调用结果，请基于结果回答
    - 如果上下文为空，请基于你的知识回答`

    try {
      // === 修复：直接使用 SystemMessage/HumanMessage，避免 ChatPromptTemplate 将
      //     systemPrompt 中的 {role}、{language} 等 RAG 文档内容误解析为模板变量 ===
      const { SystemMessage, HumanMessage } = await import('@langchain/core/messages')

      // Stage4: 结构化输出
      if (this.features.enableStructured) {
        const structuredLlm = this.llm.bind({
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'customer_answer',
              schema: {
                type: 'object',
                properties: {
                  answer: { type: 'string', description: '最终回答' },
                  sources: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '引用的知识来源'
                  },
                  confidence: { type: 'number', description: '置信度 0-1' }
                },
                required: ['answer']
              }
            }
          }
        })

        const response = await structuredLlm.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(state.query)
        ])

        const content = typeof response.content === 'string' ? response.content : ''
        let structured = null
        try {
          structured = JSON.parse(content)
        } catch {
          structured = { answer: content, sources: [], confidence: 0.8 }
        }

        trace.status = 'completed'
        trace.output = { answer: structured.answer }

        return {
          finalAnswer: structured.answer,
          structuredResponse: structured,
          executionTrace: [trace],
          messages: [new AIMessage(structured.answer)]
        }
      }

      // 普通文本回答
      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(state.query)
      ])
      const answer = typeof response.content === 'string' ? response.content : ''

      trace.status = 'completed'
      trace.output = { answer }

      return {
        finalAnswer: answer,
        executionTrace: [trace],
        messages: [new AIMessage(answer)]
      }
    } catch (err) {
      trace.status = 'error'
      trace.error = err.message
      return {
        finalAnswer: `抱歉，生成回答时出现错误：${err.message}`,
        executionTrace: [trace]
      }
    }
  }

  /**
   * 人工审核节点
   * Stage5: Interrupt — 暂停等待人工确认
   */
  async _humanReviewNode(state) {
    const trace = { node: 'human_review', timestamp: Date.now(), status: 'running' }

    // 如果已经批准，直接返回
    if (state.humanReviewApproved) {
      trace.status = 'completed'
      trace.output = { action: 'approved' }
      return {
        finalAnswer: '已转接人工客服，请稍候...',
        executionTrace: [trace]
      }
    }

    trace.status = 'pending_review'
    trace.output = { action: 'waiting_for_approval' }

    return {
      needsHumanReview: true,
      executionTrace: [trace]
    }
  }

  // ============================================================
  // Stage3: 条件路由函数
  // ============================================================

  /**
   * 根据意图路由到不同节点
   */
  _routeByIntent(state) {
    const intent = state.intent || 'general'

    // FAQ 快速通道（可配置关闭）
    if (intent === 'faq' && !this.features.enableFAQ) {
      return 'general'
    }

    // 人工转接（可配置关闭）
    if (intent === 'human' && !this.features.enableHumanReview) {
      return 'general'
    }

    return intent
  }

  /**
   * 工具调用后的路由
   * Stage4: Command — 动态决定下一步
   */
  _routeAfterTools(state) {
    // 如果工具调用全部失败，直接生成回答
    const allFailed = state.toolResults?.every((t) => !t.success)
    if (allFailed) return 'generate'

    // 正常情况：生成回答
    return 'generate'
  }

  // ============================================================
  // 图执行（流式 + 非流式）
  // ============================================================

  /**
   * 流式执行图
   * Stage3: streamMode 'values' — 每个节点执行后返回完整状态
   */
  async *streamExecute(userInput, threadId, onTrace) {
    const compiled = this.compile()

    const stream = await compiled.stream(
      { query: userInput, tenantId: this.currentTenantId, userId: this.currentUserId },
      {
        configurable: {
          thread_id: threadId
        },
        streamMode: 'values'
      }
    )

    // 在 streamMode 'values' 下，每次 yield 都是累积后的完整 state，并且会从
    // MemorySaver checkpoint 恢复上一轮结束时的旧值。仅清空第一次 yield 是不够的：
    // 后续节点（如 classify_intent）再次 yield 时，finalAnswer / retrievedDocs /
    // toolResults 又会变回 checkpoint 中恢复的旧值，导致旧回答、旧检索结果混入本轮。
    //
    // 修复：记录第一轮恢复的旧值作为基线，后续 yield 中按「内容」与基线比较，
    // 仍等于基线旧值的字段说明本轮尚未真正更新，则屏蔽为空；只有本轮节点真正
    // 产出新值才放行。执行轨迹 executionTrace 是累积 reducer，按长度做增量切片，
    // 只推送本轮新增的 trace。
    const sameContent = (a, b) => JSON.stringify(a) === JSON.stringify(b)

    let baseline = null

    for await (const state of stream) {
      // 执行轨迹：增量推送本轮新增的 trace，跳过 checkpoint 恢复的旧轨迹
      if (onTrace && Array.isArray(state.executionTrace)) {
        const traces =
          baseline === null ? [] : state.executionTrace.slice(baseline.traceCount)
        for (const trace of traces) {
          if (trace) onTrace(trace)
        }
      }

      // 第一次 yield：记录 checkpoint 恢复的旧值作为基线，并全部清空
      if (baseline === null) {
        baseline = {
          intent: state.intent ?? 'unknown',
          intentConfidence: state.intentConfidence ?? 0,
          finalAnswer: state.finalAnswer ?? '',
          structuredResponse: state.structuredResponse ?? null,
          retrievedDocs: state.retrievedDocs ?? [],
          toolResults: state.toolResults ?? [],
          traceCount: Array.isArray(state.executionTrace) ? state.executionTrace.length : 0
        }
        yield {
          ...state,
          intent: 'unknown',
          intentConfidence: 0,
          finalAnswer: '',
          structuredResponse: null,
          retrievedDocs: [],
          toolResults: [],
          executionTrace: Array.isArray(state.executionTrace) ? [] : state.executionTrace
        }
        continue
      }

      // 屏蔽仍等于基线旧值的字段，防止上一轮残留混入本轮
      yield {
        ...state,
        intent: sameContent(state.intent, baseline.intent) ? 'unknown' : state.intent,
        intentConfidence:
          state.intentConfidence === baseline.intentConfidence
            ? 0
            : state.intentConfidence,
        finalAnswer: sameContent(state.finalAnswer, baseline.finalAnswer)
          ? ''
          : state.finalAnswer,
        structuredResponse: sameContent(state.structuredResponse, baseline.structuredResponse)
          ? null
          : state.structuredResponse,
        retrievedDocs: sameContent(state.retrievedDocs, baseline.retrievedDocs)
          ? []
          : state.retrievedDocs,
        toolResults: sameContent(state.toolResults, baseline.toolResults)
          ? []
          : state.toolResults,
        executionTrace: Array.isArray(state.executionTrace)
          ? state.executionTrace.slice(baseline.traceCount)
          : state.executionTrace
      }
    }
  }

  /**
   * 非流式执行图
   */
  async invokeExecute(userInput, threadId) {
    const compiled = this.compile()

    const result = await compiled.invoke(
      { query: userInput, tenantId: this.currentTenantId, userId: this.currentUserId },
      {
        configurable: {
          thread_id: threadId
        }
      }
    )

    return result
  }

  // ============================================================
  // Stage9: Checkpoint — 时光旅行
  // ============================================================

  /**
   * 获取状态历史（时光旅行）
   */
  async getStateHistory(threadId) {
    const compiled = this.compile()
    const history = []
    const config = { configurable: { thread_id: threadId } }

    try {
      // 遍历 checkpoint 历史
      for await (const snapshot of compiled.getStateHistory(config)) {
        history.push({
          values: snapshot.values,
          next: snapshot.next,
          checkpointId: snapshot.config?.configurable?.checkpoint_id,
          timestamp: snapshot.metadata?.timestamp
        })
      }
    } catch (err) {
      console.warn('[CustomerGraph] 获取状态历史失败:', err.message)
    }

    return history
  }

  /**
   * 回退到指定 checkpoint（时光旅行）
   */
  async replayFromCheckpoint(threadId, checkpointId) {
    const compiled = this.compile()
    const config = {
      configurable: {
        thread_id: threadId,
        checkpoint_id: checkpointId
      }
    }

    // 获取该 checkpoint 的状态
    const snapshot = await compiled.getState(config)
    return snapshot?.values || null
  }

  // ============================================================
  // 状态查询
  // ============================================================
  getKnowledgeStats() {
    return this.ragService?.getStats() || { ready: false, docCount: 0 }
  }

  getKnowledgePreview() {
    return this.ragService?.getPreview() || []
  }

  getStats(threadId) {
    // 从 TokenMetricsCallback 读取实际 token 统计
    const tokenMetrics = this.callbacks?.tokenMetrics
    const tokens = tokenMetrics
      ? {
          promptTokens: tokenMetrics.totalPromptTokens,
          completionTokens: tokenMetrics.totalCompletionTokens,
          total: tokenMetrics.totalPromptTokens + tokenMetrics.totalCompletionTokens,
        }
      : { promptTokens: 0, completionTokens: 0, total: 0 }

    return {
      tenant: this.currentTenantId,
      thread: threadId,
      rounds: this.memoryManager.getRounds(threadId),
      tokens,
      knowledge: this.getKnowledgeStats(),
      features: { ...this.features }
    }
  }

  // ============================================================
  // 租户/线程管理
  // ============================================================
  switchTenant(tenantId) {
    this.currentTenantId = tenantId
    // 清除编译缓存，下次重新编译
    this.compiled = null
  }

  newThread() {
    return this.memoryManager.createThread()
  }

  getThreadIds() {
    return [...this.memoryManager.threadIds]
  }

  async deleteThread(threadId) {
    await this.memoryManager.deleteThread(threadId)
  }

  // ============================================================
  // 长期记忆操作
  // ============================================================
  async loadUserPreferences() {
    return this.memoryManager.loadUserPreferences(this.currentTenantId, this.currentUserId)
  }

  async saveUserPreferences(preferences) {
    return this.memoryManager.saveUserPreferences(this.currentTenantId, this.currentUserId, preferences)
  }

  async loadUserMemories() {
    return this.memoryManager.loadUserMemories(this.currentTenantId, this.currentUserId)
  }

  async getConversationHistory() {
    return this.memoryManager.getConversationHistory(this.currentTenantId, this.currentUserId)
  }

  async deleteUserMemory() {
    await this.memoryManager.deleteUserMemory(this.currentTenantId, this.currentUserId)
  }

  async saveConversationSummary(threadId, summary) {
    await this.memoryManager.saveConversationSummary(
      this.currentTenantId, this.currentUserId, threadId, summary
    )
  }

  // ============================================================
  // 清理
  // ============================================================
  destroy() {
    this.compiled = null
    this.llm = null
    this.ragService = null
    this.callbacks = null
  }
}
