/**
 * server.js — AI Agent 后端 API 服务
 * ============================================================
 * 提供 /api/inner/chat 端点，调用 Python 脚本执行内网大模型推理
 *
 * 启动方式：
 *   node server.js
 *
 * 端口：22223（与 vue.config.js 中 /api 代理目标一致）
 * ============================================================
 */
const http = require('http')
const https = require('https')
const { spawn } = require('child_process')
const path = require('path')
const { URL } = require('url')

// 加载 .env 文件中的环境变量（包括 LangSmith 配置），
// 确保 spawn Python 子进程时能通过 process.env 继承这些变量
require('dotenv').config()

const PORT = 22223

// Python 解释器路径（集中管理，支持通过环境变量覆盖，避免硬编码个人用户名）
const PYTHON_PATH = process.platform === 'win32'
  ? (process.env.PYTHON_PATH || 'C:\\Users\\lujinwei\\AppData\\Local\\Programs\\Python\\Python313\\python.exe')
  : 'python3'

// Python 脚本路径（集中管理）
const PYTHON_SCRIPTS = {
  inner: path.join(__dirname, 'src', 'composables', 'InnerModel.py'),
  ollama: path.join(__dirname, 'src', 'composables', 'OllamaModel.py'),
  modelscope: path.join(__dirname, 'src', 'composables', 'ModelScopeModel.py'),
  dashscope: path.join(__dirname, 'src', 'composables', 'DashScopeModel.py'),
  deepseek: path.join(__dirname, 'src', 'composables', 'DeepSeekModel.py'),
}

// Python 调用器配置（集中管理各 provider 的超时与日志标签）
const PYTHON_CALLERS = {
  inner: { script: PYTHON_SCRIPTS.inner, timeout: 60000, label: 'Inner' },
  ollama: { script: PYTHON_SCRIPTS.ollama, timeout: 120000, label: 'Ollama' },
  modelscope: { script: PYTHON_SCRIPTS.modelscope, timeout: 120000, label: 'ModelScope' },
  dashscope: { script: PYTHON_SCRIPTS.dashscope, timeout: 120000, label: 'DashScope' },
  deepseek: { script: PYTHON_SCRIPTS.deepseek, timeout: 120000, label: 'DeepSeek' },
}

// chat 端点路由表（/api 前缀会被 vue.config.js 代理 strip，故统一归一化处理）
const CHAT_ROUTES = {
  '/inner/chat': { provider: 'inner', label: 'Inner' },
  '/ollama/chat': { provider: 'ollama', label: 'Ollama' },
  '/modelscope/chat': { provider: 'modelscope', label: 'ModelScope' },
  '/DashScope/chat': { provider: 'dashscope', label: 'DashScope', defaultModel: 'qwen-plus' },
  '/deepseek/chat': { provider: 'deepseek', label: 'DeepSeek', defaultModel: 'deepseek-chat' },
}

// PostgreSQL 长期记忆存储模块
const pgStore = require('./src/composables/pgStore')

/**
 * 调用 Python 脚本并返回结果（统一工厂函数）
 * @param {string} script - Python 脚本路径
 * @param {number} timeout - 超时时间（毫秒）
 * @param {string} label - 日志标签
 * @param {object} args - 传给 Python 脚本的参数对象
 * @returns {Promise<{content?: string, error?: string}>}
 */
function runPythonScript(script, timeout, label, args = {}) {
  return new Promise((resolve, reject) => {
    const params = JSON.stringify(args)
    const python = spawn(PYTHON_PATH, [script, '--json', params], {
      timeout,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    })

    let stdout = ''
    let stderr = ''

    python.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    python.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    python.on('close', (code) => {
      if (code !== 0) {
        console.error(`[${label} Python] 进程退出码: ${code}, stderr: ${stderr}`)
        // 尝试从 stdout 中解析 JSON 错误信息（Python --json 模式会将错误输出到 stdout）
        try {
          const errResult = JSON.parse(stdout.trim())
          if (errResult.error) {
            reject(new Error(errResult.error))
            return
          }
        } catch (_) { /* stdout 不是 JSON，使用 stderr */ }
        reject(new Error(stderr || stdout.trim() || `Python 进程退出码: ${code}`))
        return
      }
      try {
        const result = JSON.parse(stdout.trim())
        if (result.error) {
          reject(new Error(result.error))
          return
        }
        resolve(result)
      } catch (e) {
        console.error(`[${label} Python] JSON 解析失败, stdout: ${stdout}`)
        reject(new Error(`Python 输出解析失败: ${stdout.substring(0, 200)}`))
      }
    })

    python.on('error', (err) => {
      console.error(`[${label} Python] 启动失败:`, err.message)
      reject(new Error(`无法启动 Python: ${err.message}`))
    })
  })
}

/**
 * 按 provider 调用对应 Python 脚本
 * @param {string} provider - 调用器 key（inner/ollama/modelscope/dashscope/deepseek）
 * @param {string} message - 用户消息
 * @param {number} temperature - 温度参数
 * @param {object} extra - 额外参数（如 model）
 * @returns {Promise<{content?: string, error?: string}>}
 */
function callPythonScript(provider, message, temperature = 0.7, extra = {}) {
  const cfg = PYTHON_CALLERS[provider]
  if (!cfg) {
    return Promise.reject(new Error(`未知的 Python provider: ${provider}`))
  }
  return runPythonScript(cfg.script, cfg.timeout, cfg.label, { message, temperature, ...extra })
}

/**
 * 解析请求体
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (e) {
        reject(new Error('请求体 JSON 解析失败'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * 解析请求体（返回原始字符串，用于代理转发）
 */
function parseBodyRaw(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

/**
 * 代理请求到目标 URL（用于 LangSmith 转发）
 */
function proxyRequest(method, parsedUrl, reqHeaders, body, apiKey) {
  return new Promise((resolve, reject) => {
    const isHttps = parsedUrl.protocol === 'https:'
    const transport = isHttps ? https : http

    // 过滤掉 hop-by-hop 头
    const headers = {}
    const skipHeaders = ['host', 'connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer']
    for (const [key, value] of Object.entries(reqHeaders)) {
      if (!skipHeaders.includes(key.toLowerCase())) {
        headers[key] = value
      }
    }
    headers['host'] = parsedUrl.host
    if (apiKey) {
      headers['x-api-key'] = apiKey
    }

    const options = {
      method,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      headers,
      rejectUnauthorized: false, // 跳过 SSL 证书验证（公司网络环境）
    }

    const proxyReq = transport.request(options, (proxyRes) => {
      let responseBody = ''
      proxyRes.on('data', (chunk) => { responseBody += chunk })
      proxyRes.on('end', () => {
        resolve({
          statusCode: proxyRes.statusCode,
          headers: {
            'Content-Type': proxyRes.headers['content-type'] || 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: responseBody,
        })
      })
    })

    proxyReq.on('error', reject)
    proxyReq.setTimeout(30000, () => {
      proxyReq.destroy()
      reject(new Error('代理请求超时'))
    })

    if (body) {
      proxyReq.write(body)
    }
    proxyReq.end()
  })
}

/**
 * 发送 JSON 响应
 */
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(JSON.stringify(data, null, 2))
}

// 创建 HTTP 服务
const server = http.createServer(async (req, res) => {
  const { method, url } = req

  // CORS 预检
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  console.log(`[Server] ${method} ${url}`)

  try {
    // ============================================================
    // POST /api/inner/chat 或 /inner/chat — 内网大模型 Python 调用
    // （vue.config.js 中 /api 代理会 strip /api 前缀，所以两种路径都要支持）
    // ============================================================
    if (method === 'POST') {
      const chatRoute = CHAT_ROUTES[url.replace(/^\/api/, '')]
      if (chatRoute) {
        const body = await parseBody(req)
        const { message, temperature, model } = body

        if (!message || !message.trim()) {
          sendJSON(res, 400, { error: 'message 参数不能为空' })
          return
        }

        console.log(`[${chatRoute.label} Chat] 收到消息: "${message.substring(0, 50)}..."`)
        const extra = chatRoute.defaultModel ? { model: model || chatRoute.defaultModel } : {}
        const result = await callPythonScript(chatRoute.provider, message, temperature, extra)
        console.log(`[${chatRoute.label} Chat] 回复: "${(result.content || '').substring(0, 50)}..."`)
        sendJSON(res, 200, result)
        return
      }
    }

    // ============================================================
    // /langsmith-proxy/* — LangSmith API 代理
    // 前端浏览器无法直连 api.smith.langchain.com（公司网络 ALPN 协商失败），
    // 通过 Node.js 后端转发请求。Python 后端已验证可以连接 LangSmith。
    //
    // 代理链路：
    //   浏览器 langsmith SDK fetch()
    //   → overrideFetchImplementation 将 URL 替换为 /langsmith-proxy/*
    //   → vue.config.js devServer 代理 → localhost:22223/langsmith-proxy/*
    //   → server.js 转发到 https://api.smith.langchain.com/*
    // ============================================================
    if (url.startsWith('/langsmith-proxy/') || url.startsWith('/langsmith/')) {
      const langsmithTarget = process.env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com'
      const apiKey = process.env.LANGSMITH_API_KEY
      // 兼容两种路径前缀
      const prefix = url.startsWith('/langsmith-proxy/') ? '/langsmith-proxy' : '/langsmith'
      const targetUrl = langsmithTarget + url.replace(prefix, '')

      console.log(`[LangSmith Proxy] ${method} ${url} → ${targetUrl}`)

      try {
        const parsedUrl = new URL(targetUrl)
        const body = method === 'POST' || method === 'PUT' || method === 'PATCH'
          ? await parseBodyRaw(req)
          : null

        const result = await proxyRequest(method, parsedUrl, req.headers, body, apiKey)
        res.writeHead(result.statusCode, result.headers)
        res.end(result.body)
      } catch (err) {
        console.error('[LangSmith Proxy Error]', err.message)
        res.writeHead(502, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: `LangSmith 代理失败: ${err.message}` }))
      }
      return
    }

    // ============================================================
    // POST /api/store/get — 获取长期记忆 item
    // Body: { namespace: string[], key: string }
    // ============================================================
    if (method === 'POST' && (url === '/api/store/get' || url === '/store/get')) {
      const body = await parseBody(req)
      const { namespace, key } = body

      if (!Array.isArray(namespace) || !key) {
        sendJSON(res, 400, { error: 'namespace (array) 和 key 为必填参数' })
        return
      }

      try {
        const item = await pgStore.getItem(namespace, key)
        sendJSON(res, 200, { item })
      } catch (err) {
        console.error('[Store Get Error]', err.message)
        sendJSON(res, 500, { error: `获取记忆失败: ${err.message}` })
      }
      return
    }

    // ============================================================
    // POST /api/store/put — 存储/更新长期记忆 item
    // Body: { namespace: string[], key: string, value: object|null }
    // ============================================================
    if (method === 'POST' && (url === '/api/store/put' || url === '/store/put')) {
      const body = await parseBody(req)
      const { namespace, key, value } = body

      if (!Array.isArray(namespace) || !key) {
        sendJSON(res, 400, { error: 'namespace (array) 和 key 为必填参数' })
        return
      }

      try {
        await pgStore.putItem(namespace, key, value)
        sendJSON(res, 200, { success: true })
      } catch (err) {
        console.error('[Store Put Error]', err.message)
        sendJSON(res, 500, { error: `存储记忆失败: ${err.message}` })
      }
      return
    }

    // ============================================================
    // POST /api/store/search — 搜索长期记忆 items
    // Body: { namespacePrefix: string[], filter?: object, limit?: number, offset?: number }
    // ============================================================
    if (method === 'POST' && (url === '/api/store/search' || url === '/store/search')) {
      const body = await parseBody(req)
      const { namespacePrefix, filter, limit, offset } = body

      if (!Array.isArray(namespacePrefix)) {
        sendJSON(res, 400, { error: 'namespacePrefix (array) 为必填参数' })
        return
      }

      try {
        const items = await pgStore.searchItems(namespacePrefix, { filter, limit, offset })
        sendJSON(res, 200, { items })
      } catch (err) {
        console.error('[Store Search Error]', err.message)
        sendJSON(res, 500, { error: `搜索记忆失败: ${err.message}` })
      }
      return
    }

    // ============================================================
    // POST /api/store/delete — 删除长期记忆 item
    // Body: { namespace: string[], key: string }
    // ============================================================
    if (method === 'POST' && (url === '/api/store/delete' || url === '/store/delete')) {
      const body = await parseBody(req)
      const { namespace, key } = body

      if (!Array.isArray(namespace) || !key) {
        sendJSON(res, 400, { error: 'namespace (array) 和 key 为必填参数' })
        return
      }

      try {
        await pgStore.deleteItem(namespace, key)
        sendJSON(res, 200, { success: true })
      } catch (err) {
        console.error('[Store Delete Error]', err.message)
        sendJSON(res, 500, { error: `删除记忆失败: ${err.message}` })
      }
      return
    }

    // ============================================================
    // POST /api/store/delete-namespace — 删除 namespace 下所有记忆
    // Body: { namespace: string[] }
    // ============================================================
    if (method === 'POST' && (url === '/api/store/delete-namespace' || url === '/store/delete-namespace')) {
      const body = await parseBody(req)
      const { namespace } = body

      if (!Array.isArray(namespace)) {
        sendJSON(res, 400, { error: 'namespace (array) 为必填参数' })
        return
      }

      try {
        const result = await pgStore.deleteByNamespace(namespace)
        sendJSON(res, 200, result)
      } catch (err) {
        console.error('[Store DeleteNamespace Error]', err.message)
        sendJSON(res, 500, { error: `删除命名空间记忆失败: ${err.message}` })
      }
      return
    }

    // ============================================================
    // GET /api/health — 健康检查
    // ============================================================
    if (method === 'GET' && url === '/api/health') {
      sendJSON(res, 200, { status: 'ok', service: 'AI Agent Backend' })
      return
    }

    // 404
    sendJSON(res, 404, { error: `未找到路由: ${method} ${url}` })
  } catch (err) {
    console.error(`[Server Error]`, err)
    sendJSON(res, 500, { error: err.message })
  }
})

// 启动时初始化 PostgreSQL 长期记忆表
pgStore.initStoreTable().catch((err) => {
  console.error('[PGStore] 初始化失败:', err.message)
})

server.listen(PORT, () => {
  console.log(`[Server] AI Agent 后端服务已启动: http://localhost:${PORT}`)
  console.log(`[Server] 内网 Python 调用端点: POST http://localhost:${PORT}/api/inner/chat`)
  console.log(`[Server] Python 脚本路径: ${PYTHON_SCRIPTS.inner}`)
  console.log(`[Server] 长期记忆 Store API: POST http://localhost:${PORT}/api/store/{get,put,search,delete}`)
})
