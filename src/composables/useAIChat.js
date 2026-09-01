/**
 * useAIChat — Vue 2 兼容的 useChat composable
 *
 * 模仿 @ai-sdk/vue 的 useChat API，提供声明式的聊天状态管理。
 * 对比 App.vue 中 200+ 行的手动 fetch + SSE 解析代码，
 * 使用本 composable 只需 ~30 行即可完成同样的功能。
 *
 * API 设计参考: https://sdk.vercel.ai/docs/reference/ai-sdk-ui/use-chat
 *
 * 返回:
 *   messages       - 消息列表 (响应式)
 *   input          - 输入框绑定值 (响应式)
 *   handleSubmit   - 提交表单处理函数
 *   handleInputChange - 输入变化处理函数
 *   isLoading      - 加载状态 (响应式)
 *   error          - 错误信息 (响应式)
 *   stop           - 停止生成
 *   reload         - 重新生成最后一条
 *   setMessages    - 手动设置消息
 *   append         - 追加消息并触发请求
 */

import Vue from 'vue'

// ============================================================
// 默认 API 配置
// ============================================================
const DEFAULT_API_CONFIG = {
  endpoint: '/api/text2db/chatbi/chatbot/dataAnalysis',
  convId: '1787626439941',
  username: 'admin',
  extra: {
    relatedModelId: '1776826577318',
    agentType: 1
  }
}

// ============================================================
// SSE 流解析器
// ============================================================
function createSSEReader(response, onChunk, onDone, onError) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let aborted = false

  function abort() {
    aborted = true
    try { reader.cancel() } catch (_) { /* ignore */ }
  }

  async function read() {
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done || aborted) break

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith(':')) continue

          if (trimmed.startsWith('data:')) {
            const jsonStr = trimmed.substring(5).trim()
            if (jsonStr === '[DONE]') continue

            try {
              const chunk = JSON.parse(jsonStr)
              onChunk(chunk)
            } catch (e) {
              console.warn('[useAIChat SSE Parse Error]', e, 'line:', trimmed)
            }
          }
        }
      }
      onDone()
    } catch (err) {
      if (!aborted) {
        onError(err)
      }
    }
  }

  read()
  return { abort }
}

// ============================================================
// 将 SSE chunk 转换为消息 segments
// ============================================================
function processChunk(chunk, segments) {
  const msgType = chunk.messageType
  const isLast = chunk.last === true

  // 获取或创建最后一个匹配类型的 segment
  const getOrCreateSeg = (type) => {
    const lastSeg = segments[segments.length - 1]
    if (lastSeg && lastSeg.type === type && !lastSeg.done) {
      return lastSeg
    }
    const newSeg = { type, content: '', done: false }
    segments.push(newSeg)
    return newSeg
  }

  switch (msgType) {
    case 'thinking': {
      const seg = getOrCreateSeg('thinking')
      seg.content = chunk.thinking || ''
      seg.done = isLast
      break
    }
    case 'tool_use': {
      const seg = getOrCreateSeg('tool_use')
      if (chunk.toolUseList && chunk.toolUseList.length > 0) {
        const tool = chunk.toolUseList[0]
        seg.toolName = tool.toolName || ''
        seg.toolInput = tool.toolInput || ''
        seg.done = isLast
      }
      break
    }
    case 'tool_result': {
      const seg = getOrCreateSeg('tool_result')
      if (chunk.toolResult) {
        const outputs = chunk.toolResult.toolOutputList || []
        seg.content = outputs.map(o => o.text || '').join('\n')
        seg.done = isLast
      }
      break
    }
    case 'text': {
      const seg = getOrCreateSeg('text')
      seg.content = chunk.content || chunk.text || ''
      seg.done = isLast
      break
    }
    default:
      console.log('[useAIChat] Unknown messageType:', msgType, chunk)
  }
}

// ============================================================
// useAIChat composable
// ============================================================
export function useAIChat(options = {}) {
  const config = { ...DEFAULT_API_CONFIG, ...options }

  // ---- 响应式状态 ----
  const state = Vue.observable({
    messages: options.initialMessages || [],
    input: options.initialInput || '',
    isLoading: false,
    error: null
  })

  let currentReader = null

  // ---- 发送 API 请求 ----
  async function triggerRequest(messagesToSend) {
    if (state.isLoading) return

    state.isLoading = true
    state.error = null

    // 添加 assistant 占位消息
    const assistantMsg = { role: 'assistant', segments: [] }
    state.messages.push(assistantMsg)

    const body = {
      messages: messagesToSend,
      convId: config.convId,
      username: config.username,
      extra: config.extra
    }

    try {
      const response = await fetch(config.endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      currentReader = createSSEReader(
        response,
        // onChunk
        (chunk) => {
          processChunk(chunk, assistantMsg.segments)
        },
        // onDone
        () => {
          assistantMsg.segments.forEach(seg => { seg.done = true })
          state.isLoading = false
          currentReader = null
        },
        // onError
        (err) => {
          console.error('[useAIChat] Stream error:', err)
          state.error = `请求失败: ${err.message}`
          // 如果 assistant 消息为空则移除
          if (assistantMsg.segments.length === 0) {
            const idx = state.messages.indexOf(assistantMsg)
            if (idx !== -1) state.messages.splice(idx, 1)
          }
          state.isLoading = false
          currentReader = null
        }
      )
    } catch (err) {
      console.error('[useAIChat] Request error:', err)
      state.error = `请求失败: ${err.message}`
      const idx = state.messages.indexOf(assistantMsg)
      if (idx !== -1 && assistantMsg.segments.length === 0) {
        state.messages.splice(idx, 1)
      }
      state.isLoading = false
      currentReader = null
    }
  }

  // ---- 公共方法 ----

  /**
   * 处理表单提交
   * 对应 @ai-sdk/vue useChat 的 handleSubmit
   */
  function handleSubmit(e) {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault()
    }
    const input = state.input.trim()
    if (!input || state.isLoading) return

    // 添加用户消息
    state.messages.push({ role: 'user', content: input })
    state.input = ''

    // 发送请求（取最后一条用户消息）
    const lastUserMsg = state.messages.filter(m => m.role === 'user').pop()
    triggerRequest(lastUserMsg ? lastUserMsg.content : input)
  }

  /**
   * 处理输入变化
   * 对应 @ai-sdk/vue useChat 的 handleInputChange
   */
  function handleInputChange(e) {
    state.input = e.target ? e.target.value : e
  }

  /**
   * 停止生成
   * 对应 @ai-sdk/vue useChat 的 stop
   */
  function stop() {
    if (currentReader) {
      currentReader.abort()
      currentReader = null
    }
    state.isLoading = false
    // 标记当前 assistant 消息的 segments 为 done
    const lastMsg = state.messages[state.messages.length - 1]
    if (lastMsg && lastMsg.role === 'assistant') {
      lastMsg.segments.forEach(seg => { seg.done = true })
    }
  }

  /**
   * 重新生成最后一条回复
   * 对应 @ai-sdk/vue useChat 的 reload
   */
  function reload() {
    if (state.isLoading) return

    // 移除最后一条 assistant 消息
    const lastMsg = state.messages[state.messages.length - 1]
    if (lastMsg && lastMsg.role === 'assistant') {
      state.messages.pop()
    }

    // 取最后一条用户消息重新发送
    const lastUserMsg = state.messages.filter(m => m.role === 'user').pop()
    if (lastUserMsg) {
      triggerRequest(lastUserMsg.content)
    }
  }

  /**
   * 手动设置消息列表
   * 对应 @ai-sdk/vue useChat 的 setMessages
   */
  function setMessages(messagesOrFn) {
    if (typeof messagesOrFn === 'function') {
      state.messages = messagesOrFn(state.messages)
    } else {
      state.messages = messagesOrFn
    }
  }

  /**
   * 追加消息并触发请求
   * 对应 @ai-sdk/vue useChat 的 append
   */
  async function append(message) {
    if (state.isLoading) return

    const userMsg = {
      role: 'user',
      content: typeof message === 'string' ? message : message.content
    }
    state.messages.push(userMsg)
    triggerRequest(userMsg.content)
  }

  // ---- 返回 ----
  return {
    // 状态 (只读引用)
    messages: state.messages,
    input: state.input,
    isLoading: state.isLoading,
    error: state.error,

    // 方法
    handleSubmit,
    handleInputChange,
    stop,
    reload,
    setMessages,
    append
  }
}