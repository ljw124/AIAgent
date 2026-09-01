/*
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-08-25 09:21:33
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-01 09:29:23
 * @Description:
 */
import Vue from 'vue'
import App from './App.vue'

Vue.config.productionTip = false

// ============================================================
// LangSmith 追踪初始化
//
// 架构说明：
//   浏览器端 langsmith SDK 使用 fetch API 发送追踪数据到
//   LangSmith API。公司网络环境（hikvision.com）下浏览器直连
//   api.smith.langchain.com 会触发 ERR_ALPN_NEGOTIATION_FAILED。
//
//   解决方案：使用 langsmith 的 overrideFetchImplementation() API
//   拦截所有 LangSmith 的 fetch 请求，将请求重定向到本地 server.js
//   代理（端口 22223），由 Node.js 后端转发到 LangSmith API。
//   Python 后端已验证可以连接 LangSmith，Node.js 同理。
//
//   代理链路：
//     langsmith SDK fetch()
//     → 自定义 fetch（将 URL 中的 api.smith.langchain.com 替换为 /langsmith-proxy）
//     → vue.config.js devServer 代理 /langsmith-proxy → http://localhost:22223
//     → server.js /langsmith-proxy/* → https://api.smith.langchain.com
//
//   环境变量：
//     LANGSMITH_ENDPOINT 必须设置为真正的 LangSmith API 地址
//     （https://api.smith.langchain.com），因为 server.js 代理
//     需要知道目标地址。浏览器端通过 overrideFetchImplementation
//     拦截请求，不依赖 LANGSMITH_ENDPOINT 做 URL 替换。
//
// 参考：https://docs.smith.langchain.com/observability/how_to_guides/trace_with_langchain_js
// ============================================================

// 1. 导入 langsmith 核心模块（防止 tree-shaking）
import { Client, RunTree, isTracingEnabled as lsIsTracingEnabled, overrideFetchImplementation } from 'langsmith'

// 2. 导入 @langchain/core 追踪相关模块（防止 tree-shaking）
import { CallbackManager } from '@langchain/core/callbacks/manager'
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain'

// 3. 创建 window.process.env 对象，供 langsmith SDK 的动态属性访问使用
//    getEnvironmentVariable(name) → process.env?.[name]
//    DefinePlugin 无法替换动态属性访问，必须手动设置
window.process = window.process || {}
window.process.env = window.process.env || {}

// 从 DefinePlugin 注入的静态值复制到 window.process.env
// 这些值在编译时由 DefinePlugin 替换为字符串字面量
window.process.env.LANGSMITH_TRACING_V2 = process.env.LANGSMITH_TRACING_V2
// LANGSMITH_ENDPOINT 必须指向真正的 LangSmith API 地址，
// 因为 server.js 代理需要知道转发目标。
// 但浏览器端不能直连该地址，所以通过 overrideFetchImplementation 拦截。
window.process.env.LANGSMITH_ENDPOINT = 'https://api.smith.langchain.com'
window.process.env.LANGSMITH_API_KEY = process.env.LANGSMITH_API_KEY
window.process.env.LANGSMITH_PROJECT = process.env.LANGSMITH_PROJECT

// 4. 使用 langsmith 的 overrideFetchImplementation API 拦截所有 fetch 请求
//    将发往 api.smith.langchain.com 的请求重定向到本地 server.js 代理
const LANGSMITH_API_HOST = 'api.smith.langchain.com'
const PROXY_PREFIX = '/langsmith-proxy'

const customFetch = async (url, options) => {
  let finalUrl = url

  // 如果 URL 指向 LangSmith API，替换为本地代理路径
  if (typeof url === 'string' && url.includes(LANGSMITH_API_HOST)) {
    const urlObj = new URL(url)
    finalUrl = PROXY_PREFIX + urlObj.pathname + urlObj.search
    console.log(`[LangSmith Fetch] ${options?.method || 'GET'} ${url} → ${finalUrl}`)
  } else if (url instanceof Request && url.url.includes(LANGSMITH_API_HOST)) {
    const urlObj = new URL(url.url)
    finalUrl = PROXY_PREFIX + urlObj.pathname + urlObj.search
    console.log(`[LangSmith Fetch] ${options?.method || url.method || 'GET'} ${url.url} → ${finalUrl}`)
  } else if (typeof url === 'string' && url.startsWith('/langsmith')) {
    // LANGSMITH_ENDPOINT 被设为相对路径 /langsmith 时，
    // langsmith SDK 构造的 URL 是 /langsmith/xxx（相对路径），
    // 不包含 api.smith.langchain.com，需要单独拦截
    finalUrl = url.replace(/^\/langsmith/, PROXY_PREFIX)
    console.log(`[LangSmith Fetch] ${options?.method || 'GET'} ${url} → ${finalUrl}`)
  }

  return fetch(finalUrl, options)
}

overrideFetchImplementation(customFetch)

// 5. 显式引用所有导入的模块，确保 webpack 不会移除它们
const _langsmithModules = {
  Client,
  RunTree,
  lsIsTracingEnabled,
  CallbackManager,
  LangChainTracer,
  overrideFetchImplementation
}

// 6. 在 console 中输出初始化状态（调试用，生产环境可移除）
if (typeof Client === 'function' && typeof CallbackManager === 'function') {
  console.log('[LangSmith] 追踪模块已加载，window.process.env 已初始化')
  console.log('[LangSmith] LANGSMITH_TRACING_V2:', window.process.env.LANGSMITH_TRACING_V2)
  console.log('[LangSmith] LANGSMITH_ENDPOINT:', window.process.env.LANGSMITH_ENDPOINT)
  console.log('[LangSmith] LANGSMITH_API_KEY:', window.process.env.LANGSMITH_API_KEY ? '已设置' : '未设置')
  console.log('[LangSmith] LANGSMITH_PROJECT:', window.process.env.LANGSMITH_PROJECT)
  console.log('[LangSmith] Fetch 拦截已启用，LangSmith 请求将通过本地代理转发')
}

// 防止 _langsmithModules 被 tree-shaking
void _langsmithModules

new Vue({
  render: h => h(App),
}).$mount('#app')
