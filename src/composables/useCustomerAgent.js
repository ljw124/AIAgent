/* global INNER_API_KEY */
/**
 * 智能客服 Agent — 核心 Composable
 *
 * 串联 LangChain 10 阶段全部知识：
 *   Stage1:  Prompt 模板（多租户 System Prompt）
 *   Stage2:  LCEL 链（RAG 检索链）
 *   Stage3:  流式输出（SSE streaming）
 *   Stage4:  结构化输出（responseFormat + zod）
 *   Stage5:  工具调用（calculator / weather / knowledge_search）
 *   Stage6:  ReAct Agent（createReactAgent）
 *   Stage7:  RAG 知识库（文档→分片→向量→检索）
 *   Stage8:  中间件（日志 + Token 统计）
 *   Stage9:  短期记忆（MemorySaver，thread_id 隔离）
 *   Stage10: 长期记忆（PostgresStore，namespace 隔离 + 用户事实提取注入）
 *
 * 架构：纯前端 Vue 2，与现有 Stage1-Stage10 完全一致
 */

import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { z } from 'zod'

// 模块导入
import { createTools, setRAGService } from '@/pages/CustomerAgent/modules/tools'
import { RAGService } from '@/pages/CustomerAgent/modules/rag'
import { createCallbacks } from '@/pages/CustomerAgent/modules/middleware'
import { getMemoryManager } from '@/pages/CustomerAgent/modules/memory'
import { getTenantById, getTenantDefaultFeatures, getTenantToolNames } from '@/pages/CustomerAgent/modules/tenants'

// ============================================================
// useCustomerAgent — 智能客服 Agent 核心 Composable
// ============================================================
export function useCustomerAgent() {
  // ============================================================
  // 响应式状态（由调用方 Vue 组件提供 reactive/ref）
  // 这里返回工厂函数，由组件在 setup() 或 data() 中调用
  // ============================================================

  // 由于项目使用 Vue 2 Options API，这里返回一个可实例化的类
  // 组件在 data() 中创建实例，在 methods 中调用

  class CustomerAgentService {
    constructor(vm) {
      // Vue 实例引用（用于 $set 响应式更新）
      this._vm = vm

      // === LLM 实例 ===
      this.llm = null

      // === 模块实例 ===
      this.ragService = null
      this.memoryManager = getMemoryManager()
      this.callbacks = null

      // === Agent 实例（按租户缓存） ===
      this._agentCache = {}

      // === 当前状态 ===
      this.currentTenantId = 'tech-doc'
      this.currentThreadId = 'thread-001'
      this.currentUserId = 'user-001'

      // === 功能开关 ===
      this.features = getTenantDefaultFeatures('tech-doc')

      // === 统计 ===
      this.tokenStats = { promptTokens: 0, completionTokens: 0, total: 0 }
    }

    // ============================================================
    // 初始化
    // ============================================================

    /**
     * 初始化 LLM 连接
     * 与现有 Stage 代码使用相同的 API 配置
     */
    initLLM() {
      if (this.llm) return this.llm

      this.llm = new ChatOpenAI({
        model: 'EB-DeepSeek-V4-Pro',
        apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
        temperature: 0.7,
        configuration: {
          baseURL: window.location.origin + '/inner/',
        },
      })

      return this.llm
    }

    /**
     * 初始化 RAG 知识库（Stage7）
     * 使用内网 API 兼容的 Embeddings
     */
    async initKnowledgeBase() {
      if (this.ragService?.isReady()) return this.ragService.getStats()

      this.ragService = new RAGService()
      const docCount = await this.ragService.initBuiltinKnowledge()

      // 将 RAG 服务注入到 search_knowledge 工具中
      setRAGService(this.ragService)

      return { docCount, ready: true }
    }

    /**
     * 初始化中间件（Stage8）
     */
    initCallbacks() {
      if (this.callbacks) return this.callbacks
      this.callbacks = createCallbacks()
      return this.callbacks
    }

    /**
     * 完整初始化（LLM + 知识库 + 中间件 + 长期记忆加载）
     */
    async fullInit() {
      this.initLLM()
      this.initCallbacks()
      await this.initKnowledgeBase()

      // Stage10: 从 PostgreSQL 加载用户偏好（长期记忆）
      let userPreferences = null
      try {
        userPreferences = await this.loadUserPreferences()
        console.log('[CustomerAgent] 长期记忆已加载:', userPreferences ? '命中' : '无记录')
      } catch (err) {
        console.warn('[CustomerAgent] 加载长期记忆失败:', err.message)
      }

      return {
        llmReady: !!this.llm,
        ragReady: this.ragService?.isReady() || false,
        memoryReady: true,
        userPreferences,
      }
    }

    // ============================================================
    // Agent 构建（Stage6 + Stage1 + Stage5 + Stage9 + Stage10）
    // ============================================================

    /**
     * 构建或获取缓存的 Agent 实例（异步）
     * Stage10: 加载用户长期记忆并注入到 System Prompt
     */
    async buildAgent(tenantId) {
      // 检查缓存
      if (this._agentCache[tenantId]) {
        return this._agentCache[tenantId]
      }

      const tenant = getTenantById(tenantId)
      const toolNames = getTenantToolNames(tenantId)
      const tools = createTools(toolNames)

      // Stage10: 从 PG 加载用户长期记忆，注入到 System Prompt
      let systemPrompt = tenant.systemPrompt

      // 1. 注入用户事实记忆（姓名、偏好等）
      try {
        const memories = await this.loadUserMemories()
        if (memories && memories.length > 0) {
          const memoryLines = memories.map((m) => {
            const content = m.value?.content || m.value?.value?.content || ''
            return `- ${content}`
          }).filter(Boolean)
          if (memoryLines.length > 0) {
            systemPrompt += `\n\n## 用户记忆（长期记忆）\n以下是关于该用户的已知信息，请在回答时参考这些信息：\n${memoryLines.join('\n')}`
            console.log('[CustomerAgent] 已注入用户事实记忆:', memoryLines.length, '条')
          }
        }
      } catch (err) {
        console.warn('[CustomerAgent] 加载用户记忆失败:', err.message)
      }

      // 2. 注入对话历史摘要（之前聊过什么）
      try {
        const history = await this.getConversationHistory()
        if (history && history.length > 0) {
          // 取最近 5 条对话历史，避免 prompt 过长
          const recentHistory = history.slice(-5)
          const historyLines = recentHistory.map((item) => {
            const summary = item.value?.summary || item.value?.value?.summary
            if (!summary) return ''
            const query = summary.userQuery || '(未知问题)'
            const snippet = summary.conversationSnippet || ''
            // 截取对话片段的前 150 字，避免 prompt 过长
            const shortSnippet = snippet.substring(0, 150)
            return `- 用户问：${query}\n  对话摘要：${shortSnippet}`
          }).filter(Boolean)
          if (historyLines.length > 0) {
            systemPrompt += `\n\n## 对话历史（长期记忆）\n以下是之前与用户的对话记录，请在回答时参考这些上下文：\n${historyLines.join('\n')}`
            console.log('[CustomerAgent] 已注入对话历史摘要:', historyLines.length, '条')
          }
        }
      } catch (err) {
        console.warn('[CustomerAgent] 加载对话历史失败:', err.message)
      }

      // Stage1: 构建 Prompt 模板
      const prompt = ChatPromptTemplate.fromMessages([
        ['system', systemPrompt],
        ['placeholder', '{messages}'],
      ])

      // 构建 createReactAgent 参数
      const params = {
        llm: this.llm,
        tools,
        prompt,
        // Stage9: 短期记忆
        checkpointer: this.memoryManager.getCheckpointer(),
        // Stage10: 长期记忆
        store: this.memoryManager.getStore(),
      }

      // Stage4: 结构化输出（可选）
      if (this.features.enableStructured) {
        params.responseFormat = {
          schema: z.object({
            answer: z.string().describe('对用户问题的最终回答'),
            sources: z.array(z.string()).optional().describe('引用的知识来源'),
            confidence: z.number().optional().describe('回答置信度 0-1'),
          }),
          prompt: '请将最终回复整理为结构化 JSON 输出。',
          method: 'jsonSchema',
        }
      }

      const agent = createReactAgent(params)
      this._agentCache[tenantId] = agent
      return agent
    }

    /**
     * 清除 Agent 缓存（租户切换时）
     */
    clearAgentCache(tenantId) {
      if (tenantId) {
        delete this._agentCache[tenantId]
      } else {
        this._agentCache = {}
      }
    }

    // ============================================================
    // 核心：发送消息（Stage3 流式 + Stage6 Agent 循环）
    // ============================================================

    /**
     * 发送用户消息并流式返回结果
     *
     * @param {string} userInput - 用户输入文本
     * @param {Array} historyMessages - 历史消息数组 [{ role, content }]
     * @param {Function} onSegment - 消息段回调 (segment) => void
     *        segment 类型：
     *        - { type: 'thinking', content: '...' }       Stage6 思考过程
     *        - { type: 'tool_use', toolName, toolInput }   Stage5 工具调用
     *        - { type: 'tool_result', toolName, toolOutput } 工具返回
     *        - { type: 'retrieved', sources }              Stage7 检索结果
     *        - { type: 'text', content: '...' }            Stage3 文本回复
     *        - { type: 'structured', data: {...} }         Stage4 结构化输出
     *        - { type: 'error', message: '...' }           错误
     *        - { type: 'done' }                            完成
     */
    async sendMessage(userInput, historyMessages, onSegment) {
      const agent = await this.buildAgent(this.currentTenantId)

      // 构建 LangChain 消息格式
      const langchainMessages = historyMessages
        .map((msg) => {
          if (msg.role === 'user') return new HumanMessage(msg.content)
          if (msg.role === 'assistant') return new AIMessage(msg.content)
          return null
        })
        .filter(Boolean)

      const inputs = { messages: langchainMessages }

      // Stage8: 中间件回调
      const callbacks = this.initCallbacks()

      try {
        if (this.features.enableStream) {
          // ============================================================
          // Stage3: 流式输出
          // ============================================================
          const stream = await agent.stream(inputs, {
            configurable: {
              thread_id: this.currentThreadId, // Stage9: thread_id 隔离
            },
            streamMode: 'values',
            callbacks: callbacks.list, // Stage8: 中间件
          })

          let lastTextContent = ''

          for await (const state of stream) {
            const msgs = state.messages || []
            const lastMsg = msgs[msgs.length - 1]
            if (!lastMsg) continue

            const msgType = lastMsg._getType?.()

            // Stage6: 工具调用（思考过程）
            if (msgType === 'ai' && lastMsg.tool_calls?.length > 0) {
              // 先发送思考内容
              if (lastMsg.content && this.features.showThinking) {
                onSegment({ type: 'thinking', content: lastMsg.content })
              }

              // 发送工具调用
              for (const tc of lastMsg.tool_calls) {
                onSegment({
                  type: 'tool_use',
                  toolName: tc.name,
                  toolInput: tc.args,
                })
              }
            }

            // Stage6: 工具返回
            if (msgType === 'tool') {
              if (lastMsg.name === 'search_knowledge' && this.features.showRetrieved) {
                // Stage7: 检索结果特殊展示
                try {
                  const sources = JSON.parse(lastMsg.content)
                  onSegment({ type: 'retrieved', sources })
                } catch {
                  onSegment({
                    type: 'tool_result',
                    toolName: lastMsg.name,
                    toolOutput: lastMsg.content,
                  })
                }
              } else {
                onSegment({
                  type: 'tool_result',
                  toolName: lastMsg.name,
                  toolOutput: lastMsg.content,
                })
              }
            }

            // Stage3: 文本回复（增量更新，打字机效果）
            if (msgType === 'ai' && lastMsg.content) {
              const content = typeof lastMsg.content === 'string' ? lastMsg.content : ''
              if (content !== lastTextContent) {
                lastTextContent = content
                onSegment({ type: 'text', content })
              }
            }

            // Stage8: 从 AIMessage 的 usage_metadata 提取 Token 用量
            if (msgType === 'ai' && lastMsg.usage_metadata) {
              const um = lastMsg.usage_metadata
              const promptTokens = um.input_tokens || um.promptTokens || 0
              const completionTokens = um.output_tokens || um.completionTokens || 0
              callbacks.tokenMetrics.totalPromptTokens += promptTokens
              callbacks.tokenMetrics.totalCompletionTokens += completionTokens
            }

            // Stage4: 结构化输出
            if (state.structuredResponse) {
              onSegment({ type: 'structured', data: state.structuredResponse })
            }
          }

          // 记录消息（Stage9）
          this.memoryManager.recordMessage(this.currentThreadId)

          // 更新 Token 统计（Stage8）
          this.tokenStats = callbacks.tokenMetrics.getStats()
        } else {
          // ============================================================
          // 非流式：invoke() 一次性返回
          // ============================================================
          const result = await agent.invoke(inputs, {
            configurable: {
              thread_id: this.currentThreadId,
            },
            callbacks: callbacks.list,
          })

          const allMessages = result.messages || []

          // Stage8: 从 AIMessage 的 usage_metadata 提取 Token 用量
          for (const msg of allMessages) {
            if (msg._getType?.() === 'ai' && msg.usage_metadata) {
              const um = msg.usage_metadata
              const promptTokens = um.input_tokens || um.promptTokens || 0
              const completionTokens = um.output_tokens || um.completionTokens || 0
              callbacks.tokenMetrics.totalPromptTokens += promptTokens
              callbacks.tokenMetrics.totalCompletionTokens += completionTokens
            }
          }

          // 提取思考过程
          this._extractNonStreamSteps(allMessages, onSegment)

          // 提取最终回复
          const finalMessage = [...allMessages]
            .reverse()
            .find((m) => m._getType?.() === 'ai' && m.content)

          if (finalMessage) {
            onSegment({ type: 'text', content: finalMessage.content })
          }

          // 结构化输出
          if (result.structuredResponse) {
            onSegment({ type: 'structured', data: result.structuredResponse })
          }

          this.memoryManager.recordMessage(this.currentThreadId)
          this.tokenStats = callbacks.tokenMetrics.getStats()
        }

        onSegment({ type: 'done' })

        // Stage10: 异步保存对话摘要到 PostgreSQL（长期记忆）
        this._saveConversationMemory(userInput, historyMessages).catch((err) => {
          console.warn('[CustomerAgent] 保存长期记忆失败:', err.message)
        })
      } catch (err) {
        console.error('[CustomerAgent Error]', err)
        onSegment({ type: 'error', message: `请求失败: ${err.message}` })
        onSegment({ type: 'done' })
      }
    }

    /**
     * 保存对话摘要到长期记忆（PostgreSQL）
     * 在每次对话结束后异步调用，不阻塞用户交互
     * Stage10: 同时使用 LLM 提取用户事实信息（姓名、偏好等）保存到 PG
     *
     * @param {string} userInput - 用户输入
     * @param {Array} historyMessages - 历史消息
     */
    async _saveConversationMemory(userInput, historyMessages) {
      // 获取最近几轮对话内容用于生成摘要
      const recentMessages = historyMessages.slice(-6) // 最近 3 轮（6 条消息）
      const conversationText = recentMessages
        .map((m) => `[${m.role}]: ${m.content?.substring(0, 200) || ''}`)
        .join('\n')

      // 1. 保存对话摘要
      const summary = {
        userQuery: userInput.substring(0, 200),
        conversationSnippet: conversationText.substring(0, 500),
        tenantId: this.currentTenantId,
        messageCount: historyMessages.length,
      }

      await this.memoryManager.saveConversationSummary(
        this.currentTenantId,
        this.currentUserId,
        this.currentThreadId,
        summary
      )
      console.log('[CustomerAgent] 对话摘要已保存到长期记忆')

      // 2. 使用 LLM 从对话中提取用户事实信息（姓名、偏好等）
      await this._extractAndSaveUserFacts(userInput, conversationText)
    }

    /**
     * 使用 LLM 从对话中提取用户事实信息并保存到 PG 长期记忆
     * 提取的信息包括：姓名、职业、偏好、重要事实等
     * 使用内容哈希作为 key 实现去重：相同事实不会重复保存，更新的事实会覆盖旧值
     */
    async _extractAndSaveUserFacts(userInput, conversationText) {
      if (!this.llm) return

      const extractPrompt = `你是一个信息提取助手。请从以下对话中提取用户的个人事实信息（如姓名、职业、偏好、重要事实等）。

对话内容：
${conversationText}

请以 JSON 数组格式返回提取到的事实，每条事实为一个字符串。如果没有可提取的事实，返回空数组 []。
只提取明确的事实，不要推测或编造。格式示例：
["用户姓名是小米", "用户是前端工程师"]

请只返回 JSON 数组，不要包含其他文字：`

      try {
        const response = await this.llm.invoke([
          { role: 'user', content: extractPrompt }
        ])

        const responseText = typeof response.content === 'string'
          ? response.content
          : JSON.stringify(response.content)

        // 解析 LLM 返回的 JSON 数组
        const jsonMatch = responseText.match(/\[[\s\S]*\]/)
        if (!jsonMatch) {
          console.log('[CustomerAgent] 未提取到用户事实信息')
          return
        }

        const facts = JSON.parse(jsonMatch[0])
        if (!Array.isArray(facts) || facts.length === 0) {
          console.log('[CustomerAgent] 未提取到用户事实信息')
          return
        }

        // 加载已有记忆，构建已有事实内容集合（用于去重）
        const existingMemories = await this.memoryManager.loadUserMemories(
          this.currentTenantId,
          this.currentUserId
        )
        const existingContents = new Set(
          existingMemories.map((m) => {
            const content = m.value?.content || m.value?.value?.content || ''
            return content.trim()
          })
        )

        // 保存新事实（去重：跳过已存在的内容）
        let newCount = 0
        for (const fact of facts) {
          const factStr = String(fact).trim()
          if (!factStr) continue

          // 跳过已存在的事实
          if (existingContents.has(factStr)) continue

          // 使用内容哈希作为 key，相同内容会覆盖（更新），不同内容不会重复
          const factKey = this._hashFact(factStr)
          await this.memoryManager.saveUserMemory(
            this.currentTenantId,
            this.currentUserId,
            `fact_${factKey}`,
            factStr
          )
          newCount++
        }

        if (newCount > 0) {
          console.log('[CustomerAgent] 已提取并保存用户事实:', newCount, '条（去重后）')
          // 清除 Agent 缓存，使下次对话能加载最新的用户记忆
          this.clearAgentCache(this.currentTenantId)
        } else {
          console.log('[CustomerAgent] 提取的事实均已存在，跳过保存')
        }
      } catch (err) {
        console.warn('[CustomerAgent] 提取用户事实失败:', err.message)
      }
    }

    /**
     * 生成事实内容的简单哈希（用于作为 PG key 实现去重）
     */
    _hashFact(content) {
      let hash = 0
      const str = content.trim().toLowerCase()
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash // 转为 32 位整数
      }
      return Math.abs(hash).toString(36)
    }

    /**
     * 非流式模式下提取 Agent 思考步骤
     */
    _extractNonStreamSteps(allMessages, onSegment) {
      for (let i = 0; i < allMessages.length; i++) {
        const msg = allMessages[i]
        const msgType = msg._getType?.()

        if (msgType === 'ai' && msg.tool_calls?.length > 0) {
          if (msg.content && this.features.showThinking) {
            onSegment({ type: 'thinking', content: msg.content })
          }
          for (const tc of msg.tool_calls) {
            onSegment({ type: 'tool_use', toolName: tc.name, toolInput: tc.args })
          }
        }

        if (msgType === 'tool') {
          if (msg.name === 'search_knowledge' && this.features.showRetrieved) {
            try {
              const sources = JSON.parse(msg.content)
              onSegment({ type: 'retrieved', sources })
            } catch {
              onSegment({ type: 'tool_result', toolName: msg.name, toolOutput: msg.content })
            }
          } else {
            onSegment({ type: 'tool_result', toolName: msg.name, toolOutput: msg.content })
          }
        }
      }
    }

    // ============================================================
    // 租户管理
    // ============================================================

    /**
     * 切换租户
     */
    switchTenant(tenantId) {
      this.currentTenantId = tenantId
      this.features = getTenantDefaultFeatures(tenantId)
      // 切换租户时清除 Agent 缓存，下次 send 时重建
      this.clearAgentCache(tenantId)
    }

    /**
     * 获取当前租户配置
     */
    getCurrentTenant() {
      return getTenantById(this.currentTenantId)
    }

    // ============================================================
    // 线程管理（Stage9）
    // ============================================================

    /**
     * 创建新对话线程
     */
    newThread() {
      this.currentThreadId = this.memoryManager.createThread()
      return this.currentThreadId
    }

    /**
     * 切换线程
     */
    switchThread(threadId) {
      this.currentThreadId = threadId
    }

    /**
     * 删除线程
     */
    async deleteThread(threadId) {
      await this.memoryManager.deleteThread(threadId)
      if (this.currentThreadId === threadId) {
        this.currentThreadId = this.memoryManager.threadIds[0] || 'thread-001'
      }
    }

    /**
     * 获取所有线程 ID
     */
    getThreadIds() {
      return [...this.memoryManager.threadIds]
    }

    // ============================================================
    // 长期记忆操作（Stage10）
    // ============================================================

    /**
     * 保存用户偏好
     */
    async saveUserPreferences(preferences) {
      await this.memoryManager.saveUserPreferences(
        this.currentTenantId,
        this.currentUserId,
        preferences
      )
    }

    /**
     * 加载用户偏好
     */
    async loadUserPreferences() {
      return this.memoryManager.loadUserPreferences(
        this.currentTenantId,
        this.currentUserId
      )
    }

    /**
     * 保存对话摘要
     */
    async saveConversationSummary(summary) {
      await this.memoryManager.saveConversationSummary(
        this.currentTenantId,
        this.currentUserId,
        this.currentThreadId,
        summary
      )
    }

    /**
     * 获取历史对话摘要
     */
    async getConversationHistory() {
      return this.memoryManager.getConversationHistory(
        this.currentTenantId,
        this.currentUserId
      )
    }

    /**
     * 保存用户事实记忆（姓名、偏好等）
     */
    async saveUserMemory(memoryKey, content) {
      await this.memoryManager.saveUserMemory(
        this.currentTenantId,
        this.currentUserId,
        memoryKey,
        content
      )
    }

    /**
     * 加载用户所有事实记忆
     */
    async loadUserMemories() {
      return this.memoryManager.loadUserMemories(
        this.currentTenantId,
        this.currentUserId
      )
    }

    /**
     * 删除用户所有长期记忆
     */
    async deleteUserMemory() {
      await this.memoryManager.deleteUserMemory(
        this.currentTenantId,
        this.currentUserId
      )
      // 清除 Agent 缓存，使下次对话重新加载记忆
      this.clearAgentCache(this.currentTenantId)
    }

    // ============================================================
    // 知识库操作（Stage7）
    // ============================================================

    /**
     * 上传文件到知识库
     */
    async uploadFile(fileName, content) {
      if (!this.ragService) {
        throw new Error('知识库未初始化，请先调用 initKnowledgeBase()')
      }
      return this.ragService.addFile(fileName, content)
    }

    /**
     * 获取知识库状态
     */
    getKnowledgeStats() {
      return this.ragService?.getStats() || { ready: false, docCount: 0 }
    }

    /**
     * 获取知识库预览
     */
    getKnowledgePreview() {
      return this.ragService?.getPreview() || []
    }

    // ============================================================
    // 功能开关
    // ============================================================

    /**
     * 切换功能开关
     */
    toggleFeature(featureName, value) {
      if (Object.prototype.hasOwnProperty.call(this.features, featureName)) {
        this.features[featureName] = value
        // 结构化输出变更需要清除 Agent 缓存
        if (featureName === 'enableStructured') {
          this.clearAgentCache()
        }
      }
    }

    // ============================================================
    // 统计信息
    // ============================================================

    /**
     * 获取完整统计
     */
    getStats() {
      return {
        tenant: this.currentTenantId,
        thread: this.currentThreadId,
        rounds: this.memoryManager.getRounds(this.currentThreadId),
        messages: this.memoryManager.getThreadMessageCount(this.currentThreadId),
        tokens: { ...this.tokenStats },
        knowledge: this.getKnowledgeStats(),
        features: { ...this.features },
      }
    }

    /**
     * 重置 Token 统计
     */
    resetTokenStats() {
      if (this.callbacks?.tokenMetrics) {
        this.callbacks.tokenMetrics.reset()
      }
      this.tokenStats = { promptTokens: 0, completionTokens: 0, total: 0 }
    }

    // ============================================================
    // 清理
    // ============================================================

    /**
     * 销毁服务实例
     */
    destroy() {
      this._agentCache = {}
      this.llm = null
      this.ragService = null
      this.callbacks = null
    }
  }

  // ============================================================
  // 返回工厂函数（Vue 2 Options API 兼容）
  // 组件在 created() 中调用: this.agentService = useCustomerAgent().create(this)
  // ============================================================
  return {
    create(vm) {
      return new CustomerAgentService(vm)
    },
  }
}

// ============================================================
// 默认导出单例
// ============================================================
let _instance = null

export function getCustomerAgentService(vm) {
  if (!_instance) {
    _instance = useCustomerAgent().create(vm)
  }
  return _instance
}