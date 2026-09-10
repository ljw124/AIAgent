<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-10 10:00:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-10 18:46:33
 * @Description: 阶段十：长期记忆 Store — LangChain.js InMemoryStore 长期记忆演示
 *   学习目标：理解 LangGraph 的 BaseStore/InMemoryStore 长期记忆机制，实现跨会话信息持久化
 *   核心 API：InMemoryStore、createReactAgent({ store })、namespace 命名空间隔离
-->
<template>
  <div>
    <h1>阶段十：长期记忆 Store <span class="badge stage">学习</span></h1>
    <div class="info-box">
      <strong>学习目标：</strong>理解 LangGraph 的 <code>InMemoryStore</code> 长期记忆机制，实现跨会话信息持久化<br />
      <strong>核心 API：</strong><code>InMemoryStore</code>（长期存储）、<code>createReactAgent({ store })</code>（注入长期记忆）、<code>namespace</code>（命名空间隔离）
    </div>

    <!-- 长期记忆配置 -->
    <div class="config-section">
      <div class="config-title">🗄️ 长期记忆配置</div>
      <div class="config-row">
        <label>记忆模式：</label>
        <select v-model="memoryMode" class="config-select">
          <option value="isolated">🔒 完全隔离 — 每个用户独立记忆空间，互不可见</option>
          <option value="shared">🌐 共享记忆 — 所有用户共享同一记忆空间</option>
          <option value="hybrid">🔀 混合模式 — 私有记忆 + 共享知识库</option>
        </select>
      </div>
      <div class="config-row">
        <label>当前用户 ID：</label>
        <input
          v-model="currentUserId"
          class="config-input user-id-input"
          placeholder="如：user-001"
        />
        <button @click="switchUser" class="btn-switch" :disabled="loading">
          🔄 切换用户
        </button>
        <button @click="deleteCurrentUserStore" class="btn-delete" :disabled="loading">
          🗑️ 清空当前用户记忆
        </button>
        <label class="ml-24">用户列表：</label>
        <div class="user-list">
          <span
            v-for="uid in userIds"
            :key="uid"
            :class="['user-tag', { active: uid === currentUserId }]"
            @click="selectUser(uid)"
          >
            {{ uid }}
            <span class="user-tag-count">({{ getUserMemoryCount(uid) }}条)</span>
          </span>
          <span v-if="userIds.length === 0" class="user-empty">暂无用户，发送消息后自动创建</span>
        </div>
      </div>
      <div class="config-row">
        <label>功能开关：</label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="enableLongTermMemory" />
          <span>启用长期记忆（InMemoryStore）</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="enableStream" />
          <span>流式输出（stream）</span>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" v-model="showStoreDetail" />
          <span>显示 Store 详情</span>
        </label>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-section">
      <textarea
        v-model="input"
        placeholder="试试长期记忆：告诉 Agent 你的名字和偏好 → 刷新页面 → 再问它你是谁"
        rows="3"
        @keydown.ctrl.enter="send"
      ></textarea>
      <button @click="send" :disabled="loading || (enableLongTermMemory && !storeReady)">
        {{ loading ? '请求中...' : (enableLongTermMemory && !storeReady) ? '初始化中...' : '发送 (Ctrl+Enter)' }}
      </button>
      <button @click="clearAll" class="btn-clear">清空全部</button>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- 记忆状态提示 -->
    <div v-if="enableLongTermMemory && messages.length > 0" class="memory-status">
      <span v-if="enableLongTermMemory">🗄️ 长期记忆已启用</span>
      <span v-if="enableLongTermMemory" class="memory-persist" :title="persistStatus">
        💾 {{ persistStatus }}
      </span>
      <span class="memory-user">用户：{{ currentUserId }}</span>
      <span class="memory-thread">线程：{{ currentThreadId }}</span>
      <span class="memory-rounds">对话轮次：{{ Math.floor(messages.length / 2) }}</span>
      <span class="memory-tokens" v-if="memoryTokens.total > 0" :title="`Prompt: ${memoryTokens.prompt} | Completion: ${memoryTokens.completion}`">
        🪙 累计 Token：{{ memoryTokens.total.toLocaleString() }}
      </span>
    </div>

    <!-- Agent 思考过程展示 -->
    <div v-if="agentSteps.length > 0" class="agent-steps-panel">
      <div class="agent-steps-title">🧠 Agent 思考过程</div>
      <div v-for="(step, i) in agentSteps" :key="i" class="agent-step-item">
        <div class="step-number">步骤 {{ i + 1 }}</div>
        <div v-if="step.thought" class="step-thought">💭 思考: {{ step.thought }}</div>
        <div v-if="step.action" class="step-action">🔧 行动: {{ step.action }}</div>
        <div v-if="step.observation" class="step-observation">👁️ 观察: {{ step.observation }}</div>
      </div>
    </div>

    <!-- Store 详情面板 -->
    <div v-if="showStoreDetail && (privateStoreItems.length > 0 || sharedStoreItems.length > 0)" class="store-panel">
      <div class="store-title">🗄️ Store 长期记忆数据（用户：{{ currentUserId }} | 模式：{{ memoryModeLabel }}）</div>
      <div class="store-summary">
        <span>🔒 私有记忆：{{ privateStoreItems.length }} 条</span>
        <span>🌐 共享记忆：{{ sharedStoreItems.length }} 条</span>
        <span>命名空间数：{{ storeNamespaces.length }}</span>
      </div>

      <!-- 私有记忆区域 -->
      <div v-if="privateStoreItems.length > 0" class="store-section">
        <div class="store-section-title">🔒 私有记忆（仅 {{ currentUserId }} 可见）</div>
        <div v-for="(item, i) in privateStoreItems" :key="'priv-'+i" class="store-item private">
          <div class="store-item-header">
            <span class="store-ns">{{ item.namespace.join(' / ') }}</span>
            <span class="store-key">{{ item.key }}</span>
            <span class="store-time">{{ item.updatedAt }}</span>
          </div>
          <div class="store-item-value">
            <pre>{{ JSON.stringify(item.value, null, 2) }}</pre>
          </div>
        </div>
      </div>

      <!-- 共享记忆区域 -->
      <div v-if="sharedStoreItems.length > 0" class="store-section">
        <div class="store-section-title">🌐 共享记忆（所有用户可见）</div>
        <div v-for="(item, i) in sharedStoreItems" :key="'shared-'+i" class="store-item shared">
          <div class="store-item-header">
            <span class="store-ns">{{ item.namespace.join(' / ') }}</span>
            <span class="store-key">{{ item.key }}</span>
            <span class="store-time">{{ item.updatedAt }}</span>
          </div>
          <div class="store-item-value">
            <pre>{{ JSON.stringify(item.value, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </div>

    <!-- 流式统计 -->
    <div v-if="streamStats" class="stream-stats">
      <span>📊 流式统计：共 {{ streamStats.steps }} 个步骤，{{ streamStats.tokens }} 个 token，耗时 {{ streamStats.duration }}ms</span>
    </div>

    <!-- 对话历史 -->
    <div class="chat-history" ref="chatHistory">
      <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
        <div class="role-label">{{ msg.role === 'user' ? '你' : 'AI助手' }}</div>
        <div class="content">
          {{ msg.content }}
          <span v-if="msg.role === 'assistant' && index === messages.length - 1 && loading" class="cursor-blink">▌</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
/* global INNER_API_KEY */
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, AIMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { InMemoryStore } from '@langchain/langgraph'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { z } from 'zod'

export default {
  name: 'LangChainStage10Store',

  data() {
    return {
      input: '',
      messages: [],
      loading: false,
      error: null,
      agentSteps: [],
      storeItems: [],
      privateStoreItems: [],
      sharedStoreItems: [],
      storeNamespaces: [],
      streamStats: null,
      persistStatus: '已持久化',
      // 配置项
      memoryMode: 'isolated', // 'isolated' | 'shared' | 'hybrid'
      currentUserId: 'user-001',
      currentThreadId: 'session-001',
      enableLongTermMemory: true,
      enableStream: true,
      showStoreDetail: false,
      // 用户管理
      userIds: ['user-001'],
      userMessages: {},
      userTokens: {},
      // 全局 InMemoryStore 实例（长期记忆，跨用户共享）
      inMemoryStore: null,
      // Token 统计
      memoryTokens: { prompt: 0, completion: 0, total: 0 },
      // Store 初始化完成标志（确保 localStorage 恢复完毕后才允许发送消息）
      storeReady: false,
      // Agent 缓存（避免每次 send 都重建 Agent 和 LLM 实例）
      cachedAgent: null,
      cachedAgentConfig: null,  // 用于判断缓存是否失效
      // localStorage 持久化防抖定时器
      persistTimer: null,
    }
  },

  watch: {
    messages: {
      deep: true,
      handler() { this.$nextTick(() => this.scrollToBottom()) }
    },
    // 记忆相关配置变化时，清除 Agent 缓存以强制重建
    memoryMode() { this.cachedAgent = null; this.cachedAgentConfig = null },
    enableLongTermMemory() { this.cachedAgent = null; this.cachedAgentConfig = null },
  },

  computed: {
    memoryModeLabel() {
      const labels = {
        isolated: '🔒 完全隔离',
        shared: '🌐 共享记忆',
        hybrid: '🔀 混合模式',
      }
      return labels[this.memoryMode] || '未知'
    },
  },

  created() {
    // 创建全局 InMemoryStore 实例（长期记忆）
    this.inMemoryStore = new InMemoryStore()
    // 初始化当前用户的消息
    this.userMessages[this.currentUserId] = []
    this.userTokens[this.currentUserId] = { prompt: 0, completion: 0, total: 0 }
  },

  async mounted() {
    // 在 mounted 中恢复长期记忆数据（确保 DOM 渲染后异步恢复完成）
    // 使用 storeReady 标志防止恢复完成前发送消息
    await this.restoreFromLocalStorage()
    this.storeReady = true
    console.log('[Store] 长期记忆初始化完成，storeReady = true')
  },

  methods: {
    // ============================================================
    // 获取 Store 实例（根据开关决定是否启用长期记忆）
    // ============================================================
    getStore() {
      return this.enableLongTermMemory ? this.inMemoryStore : undefined
    },

    // ============================================================
    // ============================================================
    // 根据记忆模式构建 namespace 前缀
    // isolated: ['users', userId] — 完全隔离
    // shared:   ['shared']       — 所有用户共享
    // hybrid:   同时支持 ['users', userId] 和 ['shared']
    // ============================================================
    getPrivateNamespace() {
      return ['users', this.currentUserId]
    },
    getSharedNamespace() {
      return ['shared']
    },

    // ============================================================
    // localStorage 持久化：从 localStorage 恢复 Store 数据
    // ============================================================
    async restoreFromLocalStorage() {
      try {
        const saved = localStorage.getItem('langgraph_store_snapshot')
        if (!saved) {
          this.persistStatus = '无历史数据'
          return
        }

        const items = JSON.parse(saved)
        if (!Array.isArray(items) || items.length === 0) {
          this.persistStatus = '无历史数据'
          return
        }

        // 使用 batch() 批量恢复，比逐条 put 效率高
        const validItems = items.filter((item) => item.namespace && item.key && item.value)
        if (validItems.length === 0) {
          this.persistStatus = '无历史数据'
          return
        }

        const batchOps = validItems.map((item) => ({
          namespace: item.namespace,
          key: item.key,
          value: item.value,
        }))
        await this.inMemoryStore.batch(batchOps)

        this.persistStatus = `已恢复 ${validItems.length} 条`
        console.log(`[Store] 已从 localStorage 批量恢复 ${validItems.length} 条长期记忆`)
      } catch (err) {
        console.error('[Store] localStorage 恢复失败:', err)
        this.persistStatus = '恢复失败'
      }
    },

    // ============================================================
    // localStorage 持久化：增量更新单条数据到 localStorage
    // 避免每次写入都全量序列化所有数据
    // ============================================================
    _updateLocalStorageItem(namespace, key, value) {
      try {
        const saved = localStorage.getItem('langgraph_store_snapshot')
        const items = saved ? JSON.parse(saved) : []

        // 查找并更新已有项，或追加新项
        const idx = items.findIndex(
          (item) =>
            Array.isArray(item.namespace) &&
            item.namespace.join(':') === namespace.join(':') &&
            item.key === key
        )
        if (idx >= 0) {
          if (value === null) {
            items.splice(idx, 1)  // 删除
          } else {
            items[idx].value = value  // 更新
          }
        } else if (value !== null) {
          items.push({ namespace, key, value })  // 新增
        }

        localStorage.setItem('langgraph_store_snapshot', JSON.stringify(items))
      } catch (err) {
        console.error('[Store] localStorage 增量更新失败:', err)
      }
    },

    // ============================================================
    // localStorage 持久化：带防抖的全量同步
    // 在 remember/forget 操作后延迟执行，合并短时间内的多次写入
    // ============================================================
    schedulePersist() {
      if (this.persistTimer) clearTimeout(this.persistTimer)
      this.persistTimer = setTimeout(() => {
        this.persistTimer = null
        this.persistToLocalStorage()
      }, 500)
    },

    // ============================================================
    // localStorage 持久化：将 Store 数据全量保存到 localStorage
    // ============================================================
    async persistToLocalStorage() {
      if (!this.inMemoryStore) return
      try {
        // 收集所有用户和共享空间的数据
        const allItems = []
        const namespaces = await this.inMemoryStore.listNamespaces({ limit: 200 })

        for (const ns of namespaces) {
          const results = await this.inMemoryStore.search(ns, { limit: 100 })
          for (const item of results) {
            allItems.push({
              namespace: item.namespace,
              key: item.key,
              value: item.value,
            })
          }
        }

        localStorage.setItem('langgraph_store_snapshot', JSON.stringify(allItems))
        this.persistStatus = `已持久化 ${allItems.length} 条`
        console.log(`[Store] 已持久化 ${allItems.length} 条长期记忆到 localStorage`)
      } catch (err) {
        console.error('[Store] localStorage 持久化失败:', err)
        this.persistStatus = '持久化失败'
      }
    },

    // ============================================================
    // 定义工具：记住用户信息（长期记忆核心工具）
    // 支持三种记忆模式：isolated / shared / hybrid
    // ============================================================
    createRememberTool() {
      const store = this.inMemoryStore
      const getPrivateNs = () => this.getPrivateNamespace()
      const getSharedNs = () => this.getSharedNamespace()
      const mode = this.memoryMode
      const persistFn = () => this.schedulePersist()
      return tool(
        async ({ category, key, content, scope }) => {
          try {
            // scope: 'private'（仅自己可见）| 'shared'（所有人可见）| 'auto'（根据模式自动选择）
            let namespace
            const effectiveScope = scope || 'auto'

            if (effectiveScope === 'private') {
              namespace = [...getPrivateNs(), category]
            } else if (effectiveScope === 'shared') {
              namespace = [...getSharedNs(), category]
            } else {
              // auto: 根据当前记忆模式决定
              if (mode === 'shared') {
                namespace = [...getSharedNs(), category]
              } else {
                // isolated 或 hybrid 默认存私有
                namespace = [...getPrivateNs(), category]
              }
            }

            await store.put(namespace, key, {
              content,
              category,
              scope: effectiveScope,
              timestamp: new Date().toISOString(),
            })
            // 增量更新 localStorage + 防抖全量同步
            this._updateLocalStorageItem(namespace, key, {
              content,
              category,
              scope: effectiveScope,
              timestamp: new Date().toISOString(),
            })
            persistFn()
            const scopeLabel = namespace[0] === 'shared' ? '共享记忆' : '私有记忆'
            return `✅ 已存入${scopeLabel}：[${category}] ${key} = ${content}`
          } catch (err) {
            return `❌ 存储失败: ${err.message}`
          }
        },
        {
          name: 'remember',
          description: `将用户的重要信息存入长期记忆。当用户告诉你关于他们自己的信息（如姓名、偏好、技能、目标等）时，使用此工具保存。
            记忆模式说明：
            - 当前为"完全隔离"模式时，所有记忆仅当前用户可见
            - 当前为"共享记忆"模式时，所有记忆所有用户可见
            - 当前为"混合模式"时，默认存为私有记忆，可通过 scope 参数指定为共享记忆`,
          schema: z.object({
            category: z.string().describe('信息分类，如 profile（档案）、preference（偏好）、skill（技能）、goal（目标）、fact（事实）'),
            key: z.string().describe('信息的唯一标识，如 name、language、skill_vue'),
            content: z.string().describe('要记住的具体内容'),
            scope: z.enum(['private', 'shared', 'auto']).optional().default('auto').describe('记忆范围：private=仅自己可见，shared=所有人可见，auto=根据当前模式自动选择'),
          }),
        }
      )
    },

    // ============================================================
    // 定义工具：回忆用户信息（长期记忆核心工具）
    // 支持三种记忆模式：isolated / shared / hybrid
    // ============================================================
    createRecallTool() {
      const store = this.inMemoryStore
      const getPrivateNs = () => this.getPrivateNamespace()
      const getSharedNs = () => this.getSharedNamespace()
      const mode = this.memoryMode
      return tool(
        async ({ category, scope }) => {
          try {
            const effectiveScope = scope || 'auto'
            let allResults = []

            if (effectiveScope === 'private') {
              // 仅搜索私有记忆
              const prefix = [...getPrivateNs()]
              if (category) prefix.push(category)
              allResults = await store.search(prefix, { limit: 10 })
            } else if (effectiveScope === 'shared') {
              // 仅搜索共享记忆
              const prefix = [...getSharedNs()]
              if (category) prefix.push(category)
              allResults = await store.search(prefix, { limit: 10 })
            } else {
              // auto: 根据模式决定搜索范围
              if (mode === 'isolated') {
                const prefix = [...getPrivateNs()]
                if (category) prefix.push(category)
                allResults = await store.search(prefix, { limit: 10 })
              } else if (mode === 'shared') {
                const prefix = [...getSharedNs()]
                if (category) prefix.push(category)
                allResults = await store.search(prefix, { limit: 10 })
              } else {
                // hybrid: 同时搜索私有和共享
                const privatePrefix = [...getPrivateNs()]
                if (category) privatePrefix.push(category)
                const sharedPrefix = [...getSharedNs()]
                if (category) sharedPrefix.push(category)
                const [privateResults, sharedResults] = await Promise.all([
                  store.search(privatePrefix, { limit: 10 }),
                  store.search(sharedPrefix, { limit: 10 }),
                ])
                allResults = [...privateResults, ...sharedResults]
              }
            }

            if (allResults.length === 0) {
              return '未找到相关的长期记忆信息。'
            }
            const items = allResults.map((item) => {
              const ns = item.namespace[item.namespace.length - 1]
              const scopeLabel = item.namespace[0] === 'shared' ? '🌐共享' : '🔒私有'
              return `- ${scopeLabel} [${ns}] ${item.key}: ${item.value.content}`
            })
            return `找到 ${allResults.length} 条相关记忆：\n${items.join('\n')}`
          } catch (err) {
            return `❌ 检索失败: ${err.message}`
          }
        },
        {
          name: 'recall',
          description: `从长期记忆中检索用户的信息。在回答用户问题前，先用此工具查询相关的用户档案、偏好、技能等信息，以便提供个性化回复。
            记忆模式说明：
            - "完全隔离"模式：仅搜索当前用户的私有记忆
            - "共享记忆"模式：仅搜索共享记忆空间
            - "混合模式"：同时搜索私有记忆和共享记忆`,
          schema: z.object({
            category: z.string().optional().describe('信息分类筛选，如 profile、preference、skill、goal、fact，不填则搜索全部'),
            scope: z.enum(['private', 'shared', 'auto']).optional().default('auto').describe('搜索范围：private=仅私有记忆，shared=仅共享记忆，auto=根据当前模式自动选择'),
          }),
        }
      )
    },

    // ============================================================
    // 定义工具：忘记用户信息
    // 支持三种记忆模式
    // ============================================================
    createForgetTool() {
      const store = this.inMemoryStore
      const getPrivateNs = () => this.getPrivateNamespace()
      const getSharedNs = () => this.getSharedNamespace()
      const persistFn = () => this.schedulePersist()
      return tool(
        async ({ category, key, scope }) => {
          try {
            const effectiveScope = scope || 'private'
            const namespace = effectiveScope === 'shared'
              ? [...getSharedNs(), category]
              : [...getPrivateNs(), category]
            await store.delete(namespace, key)
            // 增量更新 localStorage（删除）+ 防抖全量同步
            this._updateLocalStorageItem(namespace, key, null)
            persistFn()
            const scopeLabel = effectiveScope === 'shared' ? '共享记忆' : '私有记忆'
            return `✅ 已从${scopeLabel}中删除：[${category}] ${key}`
          } catch (err) {
            return `❌ 删除失败: ${err.message}`
          }
        },
        {
          name: 'forget',
          description: '从长期记忆中删除指定的信息。当用户要求忘记某些信息时使用。默认删除私有记忆，可通过 scope 参数指定删除共享记忆。',
          schema: z.object({
            category: z.string().describe('信息分类'),
            key: z.string().describe('要删除的信息标识'),
            scope: z.enum(['private', 'shared']).optional().default('private').describe('删除范围：private=私有记忆，shared=共享记忆'),
          }),
        }
      )
    },

    // ============================================================
    // 定义工具：计算器
    // ============================================================
    createCalculatorTool() {
      return tool(
        async ({ expression }) => {
          const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '')
          try {
            // eslint-disable-next-line no-eval
            const result = eval(sanitized)
            return `计算结果: ${expression} = ${result}`
          } catch (e) {
            return `计算错误: ${e.message}`
          }
        },
        {
          name: 'calculator',
          description: '执行数学计算。支持加减乘除、括号、百分比。',
          schema: z.object({
            expression: z.string().describe('数学表达式'),
          }),
        }
      )
    },

    // ============================================================
    // 定义工具：获取当前时间
    // ============================================================
    createTimeTool() {
      return tool(
        async ({ timezone }) => {
          const now = new Date()
          const timeStr = now.toLocaleString('zh-CN', { timeZone: timezone || 'Asia/Shanghai' })
          return `当前时间（${timezone || 'Asia/Shanghai'}）: ${timeStr}`
        },
        {
          name: 'get_current_time',
          description: '获取当前日期和时间。',
          schema: z.object({
            timezone: z.string().optional().describe('时区'),
          }),
        }
      )
    },

    // ============================================================
    // 构建 Agent（同时注入长期记忆）
    // ============================================================
    buildAgent() {
      // 构建配置指纹：当关键配置变化时重建 Agent
      const configFingerprint = JSON.stringify({
        memoryMode: this.memoryMode,
        enableLongTermMemory: this.enableLongTermMemory,
      })

      // 缓存命中：直接返回已有 Agent 实例
      if (this.cachedAgent && this.cachedAgentConfig === configFingerprint) {
        return this.cachedAgent
      }

      const tools = [
        this.createRememberTool(),
        this.createRecallTool(),
        this.createForgetTool(),
        this.createCalculatorTool(),
        this.createTimeTool(),
      ]

      const llm = new ChatOpenAI({
        model: 'EB-DeepSeek-V4-Pro',
        apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
        temperature: 0,
        configuration: {
          baseURL: window.location.origin + '/inner/',
        },
      })

      const params = {
        llm,
        tools,
        name: 'AI助手（带长期记忆）',
        prompt: `你是一个具有长期记忆能力的AI助手，支持三种记忆模式。
          你有以下记忆工具：
          - recall: 在回答用户问题前，先用此工具检索长期记忆（档案、偏好、技能等），以便提供个性化回复
            * scope参数：默认"auto"根据当前模式自动选择搜索范围
            * 混合模式下会同时搜索私有记忆和共享记忆
          - remember: 当用户告诉你关于他们自己的重要信息时，使用此工具存入长期记忆
            * scope参数：默认"auto"根据当前模式自动选择存储位置
            * 混合模式下如需存为共享知识（如公司政策、公共FAQ），请指定 scope="shared"
          - forget: 当用户要求忘记某些信息时使用

          当前记忆模式：${this.memoryMode === 'isolated' ? '完全隔离（每个用户独立记忆空间）' : this.memoryMode === 'shared' ? '共享记忆（所有用户共享同一空间）' : '混合模式（私有记忆 + 共享知识库）'}

          工作流程：
          1. 收到用户消息后，先用 recall 工具检索相关的用户记忆（默认 scope="auto"）
          2. 基于检索到的记忆和当前对话，给出个性化回复
          3. 如果用户分享了新的个人信息，用 remember 工具保存（默认 scope="auto"）
          4. 如果用户分享的是公共知识（如团队规范、公司政策），在混合模式下用 remember 工具并指定 scope="shared"

          重要：当用户问"我是谁"、"我的名字"等个人问题时，必须先用 recall 工具检索记忆，而不是凭猜测回答！

          请用中文回答。`,
      }

      // 注入 InMemoryStore（长期记忆）
      const store = this.getStore()
      if (store) {
        params.store = store
      }

      // 缓存 Agent 实例和配置指纹
      this.cachedAgent = createReactAgent(params)
      this.cachedAgentConfig = configFingerprint
      return this.cachedAgent
    },

    // ============================================================
    // 主动检索长期记忆（在调用 Agent 之前）
    // 解决模型可能不主动调用 recall 工具的问题
    // ============================================================
    async retrieveLongTermMemory() {
      if (!this.enableLongTermMemory || !this.inMemoryStore) return ''

      try {
        // 根据记忆模式决定搜索范围（与 recall 工具保持一致）
        let allResults = []
        const mode = this.memoryMode

        if (mode === 'isolated') {
          allResults = await this.inMemoryStore.search(this.getPrivateNamespace(), { limit: 50 })
        } else if (mode === 'shared') {
          allResults = await this.inMemoryStore.search(this.getSharedNamespace(), { limit: 50 })
        } else {
          // hybrid: 同时搜索私有和共享记忆
          const [privateResults, sharedResults] = await Promise.all([
            this.inMemoryStore.search(this.getPrivateNamespace(), { limit: 50 }),
            this.inMemoryStore.search(this.getSharedNamespace(), { limit: 50 }),
          ])
          allResults = [...privateResults, ...sharedResults]
        }

        if (allResults.length === 0) return ''

        const memories = allResults.map((item) => {
          const category = item.namespace[item.namespace.length - 1] || 'general'
          const scopeLabel = item.namespace[0] === 'shared' ? '🌐共享' : '🔒私有'
          return `- ${scopeLabel} [${category}] ${item.key}: ${item.value.content}`
        })

        return `\n\n【以下是从长期记忆中检索到的用户信息，请在回答时参考：】\n${memories.join('\n')}\n【请基于以上记忆信息回答用户问题，如果记忆中有用户的名字，请直接使用。】`
      } catch (err) {
        console.error('[Store] 检索长期记忆失败:', err)
        return ''
      }
    },

    // ============================================================
    // 发送消息
    // ============================================================
    async send() {
      const text = this.input.trim()
      if (!text || this.loading) return

      // 检查 Store 是否初始化完成
      if (this.enableLongTermMemory && !this.storeReady) {
        this.error = '长期记忆正在初始化中，请稍后再试...'
        return
      }

      this.messages.push({ role: 'user', content: text })
      this.input = ''
      this.error = null
      this.loading = true
      this.agentSteps = []
      this.streamStats = null

      this.messages.push({ role: 'assistant', content: '' })
      const aiMsgIndex = this.messages.length - 1

      try {
        // 主动检索长期记忆，将结果注入到用户消息中
        const memoryContext = await this.retrieveLongTermMemory()

        const agent = this.buildAgent()

        // 构建历史消息（LangChain 格式）
        // 将长期记忆上下文追加到最后一条用户消息中
        const rawMessages = this.messages.slice(0, -1)  // 排除 assistant 占位消息
        const historyMessages = rawMessages.map((msg, idx) => {
          if (msg.role === 'user') {
            // 如果是最后一条用户消息，追加长期记忆上下文
            const isLastUserMsg = idx === rawMessages.length - 1
            const content = isLastUserMsg && memoryContext
              ? msg.content + memoryContext
              : msg.content
            return new HumanMessage(content)
          }
          if (msg.role === 'assistant') return new AIMessage(msg.content)
          return null
        }).filter(Boolean)

        const inputs = { messages: historyMessages }

        // 配置：user_id（长期记忆标识）
        const config = {
          configurable: {
            thread_id: `${this.currentUserId}-${this.currentThreadId}`,
            user_id: this.currentUserId,
          },
        }

        if (this.enableStream) {
          // 流式输出
          const startTime = Date.now()
          let stepCount = 0
          let tokenCount = 0
          let lastState = null

          const stream = await agent.stream(inputs, {
            ...config,
            streamMode: 'values',
          })

          for await (const state of stream) {
            stepCount++
            lastState = state
            const msgs = state.messages || []
            const lastMsg = msgs[msgs.length - 1]

            // 实时更新思考过程
            this.extractSteps(msgs)

            // 实时更新最终回复（打字机效果）
            if (lastMsg && lastMsg._getType && lastMsg._getType() === 'ai') {
              const content = typeof lastMsg.content === 'string' ? lastMsg.content : ''
              if (content) {
                this.messages[aiMsgIndex].content = content
                tokenCount = content.length
              }
            }
          }

          this.streamStats = {
            steps: stepCount,
            tokens: tokenCount,
            duration: Date.now() - startTime,
          }

          if (lastState) {
            this.accumulateTokens(lastState.messages || [])
          }
        } else {
          // 非流式调用
          const result = await agent.invoke(inputs, config)

          this.extractSteps(result.messages || [])

          const allMessages = result.messages || []
          const finalMessage = [...allMessages].reverse().find(
            (m) => m._getType && m._getType() === 'ai' && m.content
          )
          this.messages[aiMsgIndex].content = finalMessage
            ? finalMessage.content
            : '(Agent 未返回文本回复)'

          this.accumulateTokens(allMessages)
        }

        // 保存当前用户消息
        this.saveUserMessages()

        // 更新 Store 详情
        if (this.showStoreDetail && this.enableLongTermMemory) {
          await this.loadStoreDetail()
        }
      } catch (err) {
        console.error('[Stage10 Error]', err)
        this.error = `请求失败: ${err.message}`
        if (!this.messages[aiMsgIndex].content) {
          this.messages.splice(aiMsgIndex, 1)
        }
      } finally {
        this.loading = false
      }
    },

    // ============================================================
    // 从 LangChain messages 中提取并累加 token 使用量
    // ============================================================
    accumulateTokens(messages) {
      let promptTokens = 0
      let completionTokens = 0

      for (const msg of messages) {
        const meta = msg.response_metadata || {}
        const usage = meta.tokenUsage || meta.token_usage || {}
        if (usage.promptTokens) promptTokens += usage.promptTokens
        if (usage.completionTokens) completionTokens += usage.completionTokens

        const addKwargs = msg.additional_kwargs || {}
        const addUsage = addKwargs.tokenUsage || addKwargs.token_usage || addKwargs.usage || {}
        if (addUsage.promptTokens && !usage.promptTokens) promptTokens += addUsage.promptTokens
        if (addUsage.completionTokens && !usage.completionTokens) completionTokens += addUsage.completionTokens
      }

      if (promptTokens > 0 || completionTokens > 0) {
        this.memoryTokens.prompt += promptTokens
        this.memoryTokens.completion += completionTokens
        this.memoryTokens.total += promptTokens + completionTokens
        this.userTokens[this.currentUserId] = { ...this.memoryTokens }
      }
    },

    // ============================================================
    // 从消息列表中提取 Agent 的思考过程
    // ============================================================
    extractSteps(allMessages) {
      const steps = []
      for (let i = 0; i < allMessages.length; i++) {
        const msg = allMessages[i]
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          const toolResults = []
          for (let j = i + 1; j < allMessages.length; j++) {
            if (allMessages[j]._getType && allMessages[j]._getType() === 'tool') {
              toolResults.push(allMessages[j].content)
            } else {
              break
            }
          }
          steps.push({
            thought: msg.content || '(思考中...)',
            action: msg.tool_calls.map((tc) => `${tc.name}(${JSON.stringify(tc.args)})`).join(', '),
            observation: toolResults.join(' | '),
          })
        }
      }
      this.agentSteps = steps
    },

    // ============================================================
    // 加载 Store 详情（同时加载私有和共享记忆）
    // ============================================================
    async loadStoreDetail() {
      if (!this.inMemoryStore) return

      try {
        // 并行加载私有记忆和共享记忆
        const [privateResults, sharedResults] = await Promise.all([
          this.inMemoryStore.search(['users', this.currentUserId], { limit: 50 }),
          this.inMemoryStore.search(['shared'], { limit: 50 }),
        ])

        const mapItems = (results) =>
          results.map((item) => ({
            namespace: item.namespace,
            key: item.key,
            value: item.value,
            updatedAt: item.updatedAt
              ? new Date(item.updatedAt).toLocaleString('zh-CN')
              : '?',
          }))

        this.privateStoreItems = mapItems(privateResults)
        this.sharedStoreItems = mapItems(sharedResults)
        this.storeItems = [...this.privateStoreItems, ...this.sharedStoreItems]

        // 提取命名空间列表
        const nsSet = new Set()
        for (const item of this.storeItems) {
          nsSet.add(item.namespace.join('/'))
        }
        this.storeNamespaces = [...nsSet]
      } catch (err) {
        console.error('[Store] 加载详情失败:', err)
      }
    },

    // ============================================================
    // 用户管理
    // ============================================================
    saveUserMessages() {
      this.userMessages[this.currentUserId] = [...this.messages]
      this.userTokens[this.currentUserId] = { ...this.memoryTokens }
    },

    switchUser() {
      this.saveUserMessages()

      const newId = `user-${Date.now()}`
      this.currentUserId = newId
      this.userMessages[newId] = []
      this.userTokens[newId] = { prompt: 0, completion: 0, total: 0 }
      if (!this.userIds.includes(newId)) {
        this.userIds.push(newId)
      }

      this.messages = []
      this.memoryTokens = { prompt: 0, completion: 0, total: 0 }
      this.agentSteps = []
      this.storeItems = []
      this.privateStoreItems = []
      this.sharedStoreItems = []
      this.storeNamespaces = []
      this.streamStats = null
      this.error = null
    },

    selectUser(userId) {
      if (userId === this.currentUserId || this.loading) return

      this.saveUserMessages()

      this.currentUserId = userId
      this.messages = this.userMessages[userId] || []
      this.memoryTokens = this.userTokens[userId] || { prompt: 0, completion: 0, total: 0 }
      this.agentSteps = []
      this.storeItems = []
      this.privateStoreItems = []
      this.sharedStoreItems = []
      this.storeNamespaces = []
      this.streamStats = null
      this.error = null

      if (this.showStoreDetail && this.enableLongTermMemory) {
        this.loadStoreDetail()
      }
    },

    async deleteCurrentUserStore() {
      if (this.loading) return

      const uid = this.currentUserId

      // 删除 Store 中该用户的所有数据
      if (this.inMemoryStore) {
        try {
          const results = await this.inMemoryStore.search(['users', uid], { limit: 100 })
          for (const item of results) {
            await this.inMemoryStore.delete(item.namespace, item.key)
          }
          // 删除后同步到 localStorage
          await this.persistToLocalStorage()
        } catch (err) {
          console.error('[Store] 清空用户记忆失败:', err)
        }
      }

      // 清空本地数据
      this.messages = []
      this.memoryTokens = { prompt: 0, completion: 0, total: 0 }
      this.userMessages[uid] = []
      this.userTokens[uid] = { prompt: 0, completion: 0, total: 0 }
      this.agentSteps = []
      this.storeItems = []
      this.privateStoreItems = []
      this.sharedStoreItems = []
      this.storeNamespaces = []
      this.streamStats = null
      this.error = null
    },

    getUserMemoryCount(userId) {
      const msgs = this.userMessages[userId] || []
      return msgs.length
    },

    // ============================================================
    // 清空全部
    // ============================================================
    clearAll() {
      this.messages = []
      this.memoryTokens = { prompt: 0, completion: 0, total: 0 }
      this.agentSteps = []
      this.storeItems = []
      this.privateStoreItems = []
      this.sharedStoreItems = []
      this.storeNamespaces = []
      this.streamStats = null
      this.error = null

      this.userMessages[this.currentUserId] = []
      this.userTokens[this.currentUserId] = { prompt: 0, completion: 0, total: 0 }

    },

    scrollToBottom() {
      const el = this.$refs.chatHistory
      if (el) el.scrollTop = el.scrollHeight
    },
  },
}
</script>

<style scoped>
.badge.stage {
  background: linear-gradient(135deg, #0891b2 0%, #0e7490 100%);
  color: #fff;
}

.config-section {
  background: #ecfeff;
  border: 1px solid #a5f3fc;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
}

.config-title {
  font-weight: 700;
  font-size: 14px;
  color: #0e7490;
  margin-bottom: 10px;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.config-row:last-child {
  margin-bottom: 0;
}

.config-row > label:first-child {
  font-weight: 600;
  font-size: 14px;
  color: #0e7490;
  min-width: 90px;
}

.config-input {
  padding: 6px 10px;
  border: 1px solid #a5f3fc;
  border-radius: 6px;
  font-size: 13px;
}

.user-id-input {
  flex: 1;
  max-width: 200px;
  font-family: monospace;
}

.btn-switch {
  padding: 6px 14px;
  background: #0891b2;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.btn-switch:hover {
  background: #0e7490;
}

.btn-switch:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-delete {
  padding: 6px 14px;
  background: #ef4444;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}

.btn-delete:hover {
  background: #dc2626;
}

.btn-delete:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.user-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  flex: 1;
}

.ml-24 {
  margin-left: 24px;
}

.user-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #cffafe;
  border: 1px solid #67e8f9;
  border-radius: 20px;
  font-size: 12px;
  font-family: monospace;
  color: #0e7490;
  cursor: pointer;
  transition: all 0.2s;
}

.user-tag:hover {
  background: #a5f3fc;
  border-color: #22d3ee;
}

.user-tag.active {
  background: #0891b2;
  color: #fff;
  border-color: #0e7490;
}

.user-tag-count {
  font-size: 11px;
  opacity: 0.8;
}

.user-empty {
  font-size: 13px;
  color: #9ca3af;
  font-style: italic;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: #334155;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  accent-color: #0891b2;
}

.memory-status {
  display: flex;
  align-items: center;
  gap: 16px;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 8px;
  padding: 8px 16px;
  margin-bottom: 16px;
  font-size: 13px;
  color: #065f46;
  font-weight: 600;
  flex-wrap: wrap;
}

.memory-persist {
  font-size: 12px;
  color: #92400e;
  background: #fef3c7;
  padding: 2px 8px;
  border-radius: 10px;
  cursor: help;
}

.memory-user {
  font-family: monospace;
  font-size: 12px;
  color: #047857;
}

.memory-thread {
  font-family: monospace;
  font-size: 12px;
  color: #047857;
}

.memory-rounds {
  color: #059669;
}

.memory-tokens {
  margin-left: auto;
  color: #b45309;
  cursor: help;
  font-family: monospace;
  font-size: 12px;
}

.agent-steps-panel {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.agent-steps-title {
  font-weight: 700;
  font-size: 14px;
  color: #166534;
  margin-bottom: 8px;
}

.agent-step-item {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 6px;
  font-size: 13px;
}

.step-number {
  font-weight: 700;
  color: #15803d;
  margin-bottom: 4px;
}

.step-thought {
  color: #6366f1;
  margin-bottom: 2px;
}

.step-action {
  color: #d97706;
  margin-bottom: 2px;
  font-family: monospace;
}

.step-observation {
  color: #065f46;
}

.store-panel {
  background: #fefce8;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.store-title {
  font-weight: 700;
  font-size: 14px;
  color: #92400e;
  margin-bottom: 8px;
}

.store-summary {
  display: flex;
  gap: 16px;
  margin-bottom: 10px;
  font-size: 13px;
  color: #a16207;
  font-weight: 600;
}

.store-item {
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 6px;
  font-size: 12px;
}

.store-item-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  flex-wrap: wrap;
  gap: 8px;
}

.store-ns {
  font-family: monospace;
  font-weight: 600;
  color: #92400e;
  background: #fef3c7;
  padding: 1px 6px;
  border-radius: 4px;
}

.store-key {
  font-family: monospace;
  color: #b45309;
}

.store-time {
  color: #a16207;
  font-size: 11px;
}

.store-item-value {
  background: #1e293b;
  border-radius: 4px;
  padding: 8px;
  overflow-x: auto;
}

.store-item-value pre {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: #e2e8f0;
  white-space: pre-wrap;
  word-break: break-word;
}

.stream-stats {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 8px 16px;
  margin-bottom: 16px;
  font-size: 13px;
  color: #166534;
  font-weight: 600;
}

.cursor-blink {
  animation: blink 1s step-end infinite;
  color: #0891b2;
  font-weight: 700;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* 记忆模式选择器 */
.config-select {
  padding: 6px 10px;
  border: 1px solid #a5f3fc;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
  color: #0e7490;
  cursor: pointer;
  min-width: 320px;
}

.config-select:focus {
  outline: none;
  border-color: #0891b2;
  box-shadow: 0 0 0 2px rgba(8, 145, 178, 0.2);
}

/* Store 分区样式 */
.store-section {
  margin-bottom: 12px;
}

.store-section-title {
  font-weight: 700;
  font-size: 13px;
  margin-bottom: 6px;
  padding: 4px 10px;
  border-radius: 4px;
  display: inline-block;
}

.store-section:first-of-type .store-section-title {
  background: #dbeafe;
  color: #1e40af;
}

.store-section:last-of-type .store-section-title {
  background: #dcfce7;
  color: #166534;
}

/* 私有记忆条目 */
.store-item.private {
  border-left: 3px solid #3b82f6;
}

/* 共享记忆条目 */
.store-item.shared {
  border-left: 3px solid #22c55e;
}
</style>