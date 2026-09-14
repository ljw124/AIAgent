/**
 * 智能客服 Agent — 记忆系统模块（Stage9 + Stage10）
 *
 * Stage9: MemorySaver 短期记忆 — 多轮对话上下文，thread_id 隔离
 * Stage10: InMemoryStore 长期记忆 — 用户偏好跨会话持久化，namespace 隔离
 */

import { MemorySaver } from '@langchain/langgraph'
import { InMemoryStore } from '@langchain/langgraph'

// ============================================================
// 记忆系统管理类
// ============================================================
export class MemoryManager {
  constructor() {
    // Stage9: 短期记忆 — 全局单例（所有线程共享同一个 MemorySaver 实例）
    this.checkpointer = new MemorySaver()

    // Stage10: 长期记忆 — 全局单例
    this.store = new InMemoryStore()

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
  // Stage10: 长期记忆操作
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
      updatedAt: new Date().toISOString(),
    })
    this._schedulePersist()
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
   * 保存对话摘要到长期记忆
   */
  async saveConversationSummary(tenantId, userId, threadId, summary) {
    const ns = this.getUserNamespace(tenantId, userId)
    await this.store.put([...ns, 'history'], threadId, {
      summary,
      threadId,
      savedAt: new Date().toISOString(),
    })
    this._schedulePersist()
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
      await this.store.delete([...ns, 'preferences'], 'profile')
      // 删除历史记录需要逐条删除
      const historyItems = await this.getConversationHistory(tenantId, userId)
      for (const item of historyItems) {
        await this.store.delete([...ns, 'history'], item.key)
      }
    } catch (e) {
      console.warn('[Memory] 删除用户记忆失败:', e.message)
    }
  }

  // ============================================================
  // localStorage 持久化（防抖）
  // ============================================================

  _schedulePersist() {
    if (this._persistTimer) clearTimeout(this._persistTimer)
    this._persistTimer = setTimeout(() => this._persistToLocalStorage(), 2000)
  }

  async _persistToLocalStorage() {
    // InMemoryStore 数据在页面刷新后会丢失
    // 这里做简单的 localStorage 备份（仅备份用户偏好）
    // 完整的 Store 序列化需要更复杂的实现
    console.log('[Memory] 长期记忆已更新（内存模式，刷新后需重新加载）')
  }

  // ============================================================
  // 状态查询
  // ============================================================

  getStats(threadId) {
    return {
      threadCount: this.threadIds.length,
      currentThreadRounds: this.getRounds(threadId),
      currentThreadMessages: this.getThreadMessageCount(threadId),
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