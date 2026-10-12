/**
 * 智能客服 Agent — 核心 Composable（重构版）
 *
 * 从 createReactAgent 黑盒 → StateGraph 手写工作流
 * 融合 LangChain 10 阶段 + LangGraph 11 阶段全部知识
 *
 * 架构：纯前端 Vue 2，与现有 Stage1-Stage11 完全一致
 */

import { CustomerGraphBuilder } from '@/pages/CustomerAgent/modules/graph'
import { getTenantById, getTenantDefaultFeatures } from '@/pages/CustomerAgent/modules/tenants'

// ============================================================
// useCustomerAgent — 智能客服 Agent 核心 Composable
// ============================================================
export function useCustomerAgent() {
  /**
   * 客服 Agent 服务类
   * 组件在 data() 中创建实例，在 methods 中调用
   */
  class CustomerAgentService {
    constructor(vm) {
      // Vue 实例引用（用于 $forceUpdate 响应式更新）
      this._vm = vm

      // === 核心图引擎（重构：StateGraph 替代 createReactAgent） ===
      this.graphBuilder = new CustomerGraphBuilder()

      // === 当前状态 ===
      this.currentTenantId = 'tech-doc'
      this.currentThreadId = 'thread-001'
      this.currentUserId = 'user-001'

      // === 功能开关 ===
      this.features = getTenantDefaultFeatures('tech-doc')

      // === 执行轨迹（Phase 4: 可视化） ===
      this.executionTraces = []
    }

    // ============================================================
    // 初始化
    // ============================================================

    /**
     * 完整初始化（LLM + 知识库 + 长期记忆加载）
     */
    async fullInit() {
      // 同步功能开关到图引擎
      this._syncFeatures()

      const result = await this.graphBuilder.fullInit()

      // 加载长期记忆
      let userPreferences = null
      try {
        userPreferences = await this.graphBuilder.loadUserPreferences()
      } catch (err) {
        console.warn('[CustomerAgent] 加载长期记忆失败:', err.message)
      }

      return {
        llmReady: result.llmReady,
        ragReady: result.ragReady,
        memoryReady: result.memoryReady,
        userPreferences,
      }
    }

    /**
     * 同步功能开关到图引擎
     */
    _syncFeatures() {
      if (!this.graphBuilder) return
      this.graphBuilder.features = {
        ...this.graphBuilder.features,
        ...this.features,
      }
      this.graphBuilder.currentTenantId = this.currentTenantId
      this.graphBuilder.currentUserId = this.currentUserId
    }

    // ============================================================
    // 核心：发送消息（流式 + 非流式）
    // ============================================================

    /**
     * 发送用户消息并流式返回结果
     *
     * @param {string} userInput - 用户输入文本
     * @param {Array} historyMessages - 历史消息数组
     * @param {Function} onSegment - 消息段回调 (segment) => void
     *        segment 类型：
     *        - { type: 'thinking', content: '...' }       思考过程
     *        - { type: 'tool_use', toolName, toolInput }   工具调用
     *        - { type: 'tool_result', toolName, toolOutput } 工具返回
     *        - { type: 'retrieved', sources }              检索结果
     *        - { type: 'text', content: '...' }            文本回复
     *        - { type: 'structured', data: {...} }         结构化输出
     *        - { type: 'trace', trace: {...} }             节点执行轨迹
     *        - { type: 'error', message: '...' }           错误
     *        - { type: 'done' }                            完成
     */
    async sendMessage(userInput, historyMessages, onSegment) {
      this._syncFeatures()

      // 清空上次的执行轨迹
      this.executionTraces = []

      try {
        if (this.features.enableStream) {
          // ============================================================
          // Stage3: 流式输出 — streamMode 'values'
          // ============================================================
          let lastTextContent = ''

          // === M1 修复：去重标记，防止 streamMode 'values' 累积状态导致 segment 重复推送 ===
          let intentPushed = false
          let retrievedPushed = false
          const toolResultsPushed = new Set()
          let structuredPushed = false
          let humanReviewPushed = false

          for await (const state of this.graphBuilder.streamExecute(
            userInput,
            this.currentThreadId,
            (trace) => {
              // Phase 4: 收集执行轨迹
              this.executionTraces.push(trace)
              onSegment({ type: 'trace', trace })
            }
          )) {
            // 意图分类结果
            if (state.intent && state.intent !== 'unknown' && !intentPushed) {
              intentPushed = true
              if (this.features.showThinking) {
                onSegment({
                  type: 'thinking',
                  content: `意图识别: ${state.intent} (置信度: ${(state.intentConfidence * 100).toFixed(0)}%)`,
                })
              }
            }

            // RAG 检索结果
            if (state.retrievedDocs && state.retrievedDocs.length > 0 && !retrievedPushed) {
              retrievedPushed = true
              if (this.features.showRetrieved) {
                onSegment({
                  type: 'retrieved',
                  sources: state.retrievedDocs.map((doc) => ({
                    content: doc.content?.substring(0, 300) || '',
                    source: doc.metadata?.source || '未知来源',
                    score: doc.score?.toFixed(2) || 'N/A',
                  })),
                })
              }
            }

            // 工具调用结果
            if (state.toolResults && state.toolResults.length > 0) {
              for (const tr of state.toolResults) {
                const key = `${tr.toolName}_${tr.result?.substring(0, 50)}`
                if (toolResultsPushed.has(key)) continue
                toolResultsPushed.add(key)
                onSegment({
                  type: 'tool_use',
                  toolName: tr.toolName,
                  toolInput: { query: state.query },
                })
                onSegment({
                  type: 'tool_result',
                  toolName: tr.toolName,
                  toolOutput: tr.result,
                })
              }
            }

            // 文本回复
            if (state.finalAnswer && state.finalAnswer !== lastTextContent) {
              lastTextContent = state.finalAnswer
              onSegment({ type: 'text', content: state.finalAnswer })
            }

            // 结构化输出
            if (state.structuredResponse && !structuredPushed) {
              structuredPushed = true
              onSegment({ type: 'structured', data: state.structuredResponse })
            }

            // 人工审核
            if (state.needsHumanReview && !humanReviewPushed) {
              humanReviewPushed = true
              onSegment({
                type: 'thinking',
                content: '⚠️ 此问题需要人工客服介入，已转接...',
              })
            }
          }

          // 记录消息
          this.graphBuilder.memoryManager.recordMessage(this.currentThreadId)
        } else {
          // ============================================================
          // 非流式：invoke() 一次性返回
          // ============================================================
          const result = await this.graphBuilder.invokeExecute(
            userInput,
            this.currentThreadId
          )

          // 提取执行轨迹
          if (result.executionTrace) {
            this.executionTraces = result.executionTrace
            for (const trace of result.executionTrace) {
              onSegment({ type: 'trace', trace })
            }
          }

          // 意图
          if (result.intent && this.features.showThinking) {
            onSegment({
              type: 'thinking',
              content: `意图识别: ${result.intent}`,
            })
          }

          // 检索结果
          if (result.retrievedDocs?.length > 0 && this.features.showRetrieved) {
            onSegment({
              type: 'retrieved',
              sources: result.retrievedDocs.map((doc) => ({
                content: doc.content?.substring(0, 300) || '',
                source: doc.metadata?.source || '未知来源',
                score: doc.score?.toFixed(2) || 'N/A',
              })),
            })
          }

          // 工具结果
          if (result.toolResults?.length > 0) {
            for (const tr of result.toolResults) {
              onSegment({ type: 'tool_use', toolName: tr.toolName, toolInput: {} })
              onSegment({ type: 'tool_result', toolName: tr.toolName, toolOutput: tr.result })
            }
          }

          // 最终回答
          if (result.finalAnswer) {
            onSegment({ type: 'text', content: result.finalAnswer })
          }

          // 结构化输出
          if (result.structuredResponse) {
            onSegment({ type: 'structured', data: result.structuredResponse })
          }

          this.graphBuilder.memoryManager.recordMessage(this.currentThreadId)
        }

        onSegment({ type: 'done' })

        // Stage10: 异步保存对话摘要到长期记忆
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
     * 保存对话摘要到长期记忆，同时提取并保存用户偏好信息
     */
    async _saveConversationMemory(userInput, historyMessages) {
      const recentMessages = historyMessages.slice(-6)
      const conversationText = recentMessages
        .map((m) => `[${m.role}]: ${m.content?.substring(0, 200) || ''}`)
        .join('\n')

      const summary = {
        userQuery: userInput.substring(0, 200),
        conversationSnippet: conversationText.substring(0, 500),
        tenantId: this.currentTenantId,
        messageCount: historyMessages.length,
      }

      await this.graphBuilder.saveConversationSummary(this.currentThreadId, summary)

      // === 从对话中提取用户偏好信息（如姓名、语言、兴趣等） ===
      try {
        await this._extractAndSaveUserPreferences(historyMessages)
      } catch (err) {
        console.warn('[CustomerAgent] 提取用户偏好失败:', err.message)
      }
    }

    /**
     * 使用 LLM 从对话历史中提取用户偏好信息并保存到长期记忆
     */
    async _extractAndSaveUserPreferences(historyMessages) {
      // 获取已有的偏好信息
      const existingPrefs = await this.graphBuilder.loadUserPreferences()
      const existingName = existingPrefs?.preferences?.name || ''
      const existingLanguage = existingPrefs?.preferences?.language || ''
      const existingInterests = existingPrefs?.preferences?.interests || ''
      const existingExpertise = existingPrefs?.preferences?.expertise || ''

      // 构建最近对话文本
      const conversationText = historyMessages.slice(-10)
        .map((m) => `[${m.role}]: ${m.content?.substring(0, 300) || ''}`)
        .join('\n')

      // 使用 LLM 提取用户偏好
      const { HumanMessage, SystemMessage } = await import('@langchain/core/messages')
      const extractPrompt = [
        '你是一个用户信息提取器。从对话中提取用户的个人信息。',
        '',
        '已知信息：',
        `- 姓名: ${existingName || '未知'}`,
        `- 语言偏好: ${existingLanguage || '未知'}`,
        `- 兴趣领域: ${existingInterests || '未知'}`,
        `- 技术水平: ${existingExpertise || '未知'}`,
        '',
        '请从以下对话中提取用户信息，只返回 JSON 格式：',
        '{"name": "用户姓名（如果用户提到了）", "language": "偏好语言", "interests": "兴趣领域", "expertise": "技术水平"}',
        '',
        '规则：',
        '- 如果用户没有提到某个信息，对应字段留空字符串',
        '- 如果已知信息已有值且对话中没有新信息，保留已知值',
        '- 只提取明确提到的信息，不要推测',
      ].join('\n')

      const response = await this.graphBuilder.llm.invoke([
        new SystemMessage(extractPrompt),
        new HumanMessage(`对话内容：\n${conversationText}`),
      ])

      const content = typeof response.content === 'string' ? response.content : ''
      let extracted = {}
      try {
        // 尝试从响应中提取 JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          extracted = JSON.parse(jsonMatch[0])
        }
      } catch {
        console.warn('[CustomerAgent] 解析用户偏好 JSON 失败:', content.substring(0, 100))
        return
      }

      // 合并已有偏好和新提取的偏好
      const merged = {
        name: extracted.name || existingName,
        language: extracted.language || existingLanguage,
        interests: extracted.interests || existingInterests,
        expertise: extracted.expertise || existingExpertise,
      }

      // 只有提取到有效信息时才保存
      const hasNewInfo = Object.values(merged).some((v) => v)
      if (hasNewInfo) {
        await this.graphBuilder.saveUserPreferences(merged)
        console.log('[CustomerAgent] 用户偏好已更新:', merged)
      }
    }

    // ============================================================
    // 租户管理
    // ============================================================

    switchTenant(tenantId) {
      this.currentTenantId = tenantId
      this.features = getTenantDefaultFeatures(tenantId)
      this.graphBuilder.switchTenant(tenantId)
      this._syncFeatures()
    }

    getCurrentTenant() {
      return getTenantById(this.currentTenantId)
    }

    // ============================================================
    // 线程管理（Stage9: MemorySaver）
    // ============================================================

    newThread() {
      this.currentThreadId = this.graphBuilder.newThread()
      return this.currentThreadId
    }

    switchThread(threadId) {
      this.currentThreadId = threadId
    }

    async deleteThread(threadId) {
      await this.graphBuilder.deleteThread(threadId)
      if (this.currentThreadId === threadId) {
        this.currentThreadId = this.graphBuilder.getThreadIds()[0] || 'thread-001'
      }
    }

    getThreadIds() {
      return this.graphBuilder.getThreadIds()
    }

    // ============================================================
    // Stage9: Checkpoint — 时光旅行
    // ============================================================

    /**
     * 获取状态历史
     */
    async getStateHistory() {
      return this.graphBuilder.getStateHistory(this.currentThreadId)
    }

    /**
     * 回退到指定 checkpoint
     */
    async replayFromCheckpoint(checkpointId) {
      return this.graphBuilder.replayFromCheckpoint(this.currentThreadId, checkpointId)
    }

    // ============================================================
    // 长期记忆操作（Stage10）
    // ============================================================

    async loadUserPreferences() {
      return this.graphBuilder.loadUserPreferences()
    }

    async loadUserMemories() {
      return this.graphBuilder.loadUserMemories()
    }

    async getConversationHistory() {
      return this.graphBuilder.getConversationHistory()
    }

    async deleteUserMemory() {
      await this.graphBuilder.deleteUserMemory()
    }

    // ============================================================
    // 知识库操作（Stage7）
    // ============================================================

    async initKnowledgeBase() {
      const result = await this.graphBuilder.initKnowledgeBase()
      return { ready: true, docCount: result.docCount }
    }

    async uploadFile(fileName, content) {
      if (!this.graphBuilder.ragService) {
        throw new Error('知识库未初始化，请先调用 initKnowledgeBase()')
      }
      return this.graphBuilder.ragService.addFile(fileName, content)
    }

    getKnowledgeStats() {
      return this.graphBuilder.getKnowledgeStats()
    }

    getKnowledgePreview() {
      return this.graphBuilder.getKnowledgePreview()
    }

    // ============================================================
    // 功能开关
    // ============================================================

    toggleFeature(featureName, value) {
      if (Object.prototype.hasOwnProperty.call(this.features, featureName)) {
        this.features[featureName] = value
        this._syncFeatures()
      }
    }

    // ============================================================
    // 统计信息
    // ============================================================

    getStats() {
      // 从 graphBuilder 的 TokenMetricsCallback 读取实时 token 统计
      const tokenMetrics = this.graphBuilder?.callbacks?.tokenMetrics
      const tokens = tokenMetrics
        ? {
            promptTokens: tokenMetrics.totalPromptTokens,
            completionTokens: tokenMetrics.totalCompletionTokens,
            total: tokenMetrics.totalPromptTokens + tokenMetrics.totalCompletionTokens,
          }
        : { promptTokens: 0, completionTokens: 0, total: 0 }

      return {
        tenant: this.currentTenantId,
        thread: this.currentThreadId,
        rounds: this.graphBuilder.memoryManager.getRounds(this.currentThreadId),
        tokens,
        knowledge: this.getKnowledgeStats(),
        features: { ...this.features },
      }
    }

    resetTokenStats() {
      const tokenMetrics = this.graphBuilder?.callbacks?.tokenMetrics
      if (tokenMetrics) {
        tokenMetrics.reset()
      }
    }

    // ============================================================
    // Phase 4: 可视化 — 执行轨迹
    // ============================================================

    getExecutionTraces() {
      return [...this.executionTraces]
    }

    /**
     * 获取 Mermaid 图定义（用于可视化展示）
     */
    getMermaidGraph() {
      return `graph TD
    START["START"] --> classify["classify_intent<br/>意图分类"]
    classify -->|"faq"| faq["faq_answer<br/>FAQ直接回答"]
    classify -->|"technical"| rag["rag_retrieve<br/>RAG检索"]
    classify -->|"calculation"| tool["tool_execute<br/>工具调用"]
    classify -->|"weather"| tool
    classify -->|"human"| human["human_review<br/>人工转接"]
    classify -->|"general"| generate["generate_answer<br/>生成回答"]
    rag --> generate
    tool --> generate
    faq --> END["END"]
    human --> END
    generate --> END`
    }

    // ============================================================
    // 清理
    // ============================================================

    destroy() {
      if (this.graphBuilder) {
        this.graphBuilder.destroy()
      }
      this.executionTraces = []
    }
  }

  // ============================================================
  // 返回工厂函数（Vue 2 Options API 兼容）
  // ============================================================
  return {
    create(vm) {
      return new CustomerAgentService(vm)
    },
  }
}

// ============================================================
// 多实例支持（M4 修复：WeakMap 替代单例，支持多组件独立使用）
// ============================================================
const _instances = new WeakMap()

export function getCustomerAgentService(vm) {
  if (!_instances.has(vm)) {
    _instances.set(vm, useCustomerAgent().create(vm))
  }
  return _instances.get(vm)
}