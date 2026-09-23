/**
 * 智能客服 Agent — 记忆系统模块（Stage9 + Stage10）
 *
 * Stage9: MemorySaver 短期记忆 — 多轮对话上下文，thread_id 隔离
 * Stage10: PostgresStore 长期记忆 — 用户偏好跨会话持久化，namespace 隔离
 *          通过后端 REST API（server.js → PostgreSQL）实现持久化
 */

import { MemorySaver, BaseStore } from '@langchain/langgraph'

// ============================================================
// PostgreSQL 长期记忆 Store — 前端代理实现
// ============================================================
// 浏览器无法直接连接 PostgreSQL，通过 server.js REST API 代理调用。
// 继承 BaseStore，实现 batch() 方法，与 LangGraph.js 原生 Store 接口完全兼容。

/**
 * PostgreSQL 后端 Store 代理
 * 继承 BaseStore，通过 fetch 调用后端 API 实现持久化
 */
class PostgresStore extends BaseStore {
  constructor() {
    super()
    // API 基础路径（通过 vue.config.js 代理到 localhost:22223）
    this.apiBase = '/api/store'
    // 请求超时（毫秒）
    this.timeout = 10000
  }

  /**
   * 发送 API 请求的封装方法
   */
  async _fetch(endpoint, body) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(`${this.apiBase}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(`Store API ${endpoint} 失败: ${errData.error || response.statusText}`)
      }

      return await response.json()
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Store API ${endpoint} 超时`)
      }
      throw err
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * 批量操作 — BaseStore 的核心方法
   * 处理 PutOperation 和 GetOperation
   *
   * 操作类型：
   *   - PutOperation: { namespace, key, value, index? } — value 为 null 表示删除
   *   - GetOperation: { namespace, key }
   *   - SearchOperation: { namespacePrefix, filter?, limit?, offset?, query? }
   *   - ListNamespacesOperation: { matchConditions?, maxDepth?, limit?, offset? }
   */
  async batch(operations) {
    const results = []

    for (const op of operations) {
      // SearchOperation
      if (op.namespacePrefix !== undefined) {
        try {
          const data = await this._fetch('search', {
            namespacePrefix: op.namespacePrefix,
            filter: op.filter,
            limit: op.limit || 10,
            offset: op.offset || 0,
          })
          results.push(data.items || [])
        } catch (err) {
          console.warn('[PostgresStore] search 失败:', err.message)
          results.push([])
        }
        continue
      }

      // ListNamespacesOperation
      if (op.matchConditions !== undefined || op.maxDepth !== undefined) {
        // 简化实现：返回空数组（当前业务场景不需要）
        results.push([])
        continue
      }

      // PutOperation（value 字段存在，包括 null）
      if (op.value !== undefined) {
        try {
          await this._fetch('put', {
            namespace: op.namespace,
            key: op.key,
            value: op.value,
          })
          results.push(undefined)
        } catch (err) {
          console.warn('[PostgresStore] put 失败:', err.message)
          results.push(undefined)
        }
        continue
      }

      // GetOperation
      if (op.namespace !== undefined && op.key !== undefined) {
        try {
          const data = await this._fetch('get', {
            namespace: op.namespace,
            key: op.key,
          })
          results.push(data.item || null)
        } catch (err) {
          console.warn('[PostgresStore] get 失败:', err.message)
          results.push(null)
        }
        continue
      }

      // 未知操作
      results.push(undefined)
    }

    return results
  }
}

// ============================================================
// 记忆系统管理类
// ============================================================
export class MemoryManager {
  constructor() {
    // Stage9: 短期记忆 — 全局单例（所有线程共享同一个 MemorySaver 实例）
    this.checkpointer = new MemorySaver()

    // Stage10: 长期记忆 — PostgreSQL 持久化（通过后端 API 代理）
    this.store = new PostgresStore()

    // 线程管理
    this.threadIds = ['thread-001']
    this.threadMessages = {} // threadId → messageCount

    // localStorage 持久化定时器
    this._persistTimer = null
  }

  // ============================================================
  // Stage9: 短期记忆操作
  // ============================================================

  /**
   * 获取 MemorySaver 实例（注入 Agent）
   */
  getCheckpointer() {
    return this.checkpointer
  }

  /**
   * 创建新对话线程
   */
  createThread() {
    const threadId = `thread-${Date.now()}`
    this.threadIds.push(threadId)
    this.threadMessages[threadId] = 0
    return threadId
  }

  /**
   * 删除对话线程（清除短期记忆）
   */
  async deleteThread(threadId) {
    try {
      await this.checkpointer.deleteThread(threadId)
    } catch (e) {
      console.warn('[Memory] 删除线程失败:', e.message)
    }
    this.threadIds = this.threadIds.filter((id) => id !== threadId)
    delete this.threadMessages[threadId]
  }

  /**
   * 记录线程消息数
   */
  recordMessage(threadId) {
    if (!this.threadMessages[threadId]) {
      this.threadMessages[threadId] = 0
    }
    this.threadMessages[threadId]++
  }

  /**
   * 获取线程消息数
   */
  getThreadMessageCount(threadId) {
    return this.threadMessages[threadId] || 0
  }

  /**
   * 获取对话轮次
   */
  getRounds(threadId) {
    return Math.floor((this.threadMessages[threadId] || 0) / 2)
  }

  // ============================================================
  // Stage10: 长期记忆操作（PostgreSQL 持久化）
  // ============================================================

  /**
   * 获取 Store 实例（注入 Agent）
   */
  getStore() {
    return this.store
  }

  /**
   * 构建用户私有 namespace
   */
  getUserNamespace(tenantId, userId) {
    return [tenantId, 'users', userId]
  }

  /**
   * 保存用户偏好
   */
  async saveUserPreferences(tenantId, userId, preferences) {
    const ns = this.getUserNamespace(tenantId, userId)
    await this.store.put([...ns, 'preferences'], 'profile', {
      ...preferences,
      updatedAt: new Date().toISOString()
    })
  }

  /**
   * 加载用户偏好
   */
  async loadUserPreferences(tenantId, userId) {
    const ns = this.getUserNamespace(tenantId, userId)
    try {
      const item = await this.store.get([...ns, 'preferences'], 'profile')
      return item?.value || null
    } catch {
      return null
    }
  }

  /**
   * 保存用户记忆（事实信息，如姓名、偏好等）
   * 每条记忆使用唯一 key，不会覆盖之前的记忆
   */
  async saveUserMemory(tenantId, userId, memoryKey, content) {
    const ns = this.getUserNamespace(tenantId, userId)
    await this.store.put([...ns, 'memories'], memoryKey, {
      content,
      savedAt: new Date().toISOString()
    })
  }

  /**
   * 加载用户所有记忆（事实信息）
   */
  async loadUserMemories(tenantId, userId) {
    const ns = this.getUserNamespace(tenantId, userId)
    try {
      const items = await this.store.search([...ns, 'memories'])
      return items || []
    } catch {
      return []
    }
  }

  /**
   * 保存对话摘要到长期记忆
   */
  async saveConversationSummary(tenantId, userId, threadId, summary) {
    const ns = this.getUserNamespace(tenantId, userId)
    await this.store.put([...ns, 'history'], threadId, {
      summary,
      threadId,
      savedAt: new Date().toISOString()
    })
  }

  /**
   * 获取用户所有历史对话摘要
   */
  async getConversationHistory(tenantId, userId) {
    const ns = this.getUserNamespace(tenantId, userId)
    try {
      const items = await this.store.search([...ns, 'history'])
      return items || []
    } catch {
      return []
    }
  }

  /**
   * 删除用户所有长期记忆
   */
  async deleteUserMemory(tenantId, userId) {
    const ns = this.getUserNamespace(tenantId, userId)
    try {
      // 删除用户偏好
      await this.store.delete([...ns, 'preferences'], 'profile')

      // 删除历史记录需要逐条删除
      const historyItems = await this.getConversationHistory(tenantId, userId)
      for (const item of historyItems) {
        await this.store.delete([...ns, 'history'], item.key)
      }

      // 删除用户事实记忆需要逐条删除
      const memoryItems = await this.loadUserMemories(tenantId, userId)
      for (const item of memoryItems) {
        await this.store.delete([...ns, 'memories'], item.key)
      }
    } catch (e) {
      console.warn('[Memory] 删除用户记忆失败:', e.message)
    }
  }

  // ============================================================
  // 状态查询
  // ============================================================

  getStats(threadId) {
    return {
      threadCount: this.threadIds.length,
      currentThreadRounds: this.getRounds(threadId),
      currentThreadMessages: this.getThreadMessageCount(threadId)
    }
  }
}

// ============================================================
// 创建记忆管理器单例
// ============================================================
let _memoryManager = null

export function getMemoryManager() {
  if (!_memoryManager) {
    _memoryManager = new MemoryManager()
  }
  return _memoryManager
}

export function resetMemoryManager() {
  _memoryManager = null
}
