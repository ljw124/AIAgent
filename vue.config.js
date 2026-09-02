/*
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-08-25 09:21:33
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-02 09:52:06
 * @Description:
 */
const { defineConfig } = require('@vue/cli-service')
const { createProxyMiddleware } = require('http-proxy-middleware')
const dotenv = require('dotenv')
const path = require('path')

// 加载 .env 文件中的环境变量
const envConfig = dotenv.config({ path: path.resolve(__dirname, '.env') }).parsed || {}

module.exports = defineConfig({
  transpileDependencies: true,

  chainWebpack(config) {
    // 通过 DefinePlugin 将 .env 变量注入前端代码
    config.plugin('define').tap((args) => {
      const envVars = {}
      // 百炼 DashScope
      if (envConfig.DASHSCOPE_API_KEY) {
        envVars.DASHSCOPE_API_KEY = JSON.stringify(envConfig.DASHSCOPE_API_KEY)
      }
      if (envConfig.DASHSCOPE_BASE_URL) {
        envVars.DASHSCOPE_BASE_URL = JSON.stringify(envConfig.DASHSCOPE_BASE_URL)
      }
      // 内网大模型（供 LangChain.js 前端调用使用）
      if (envConfig.INNER_API_KEY) {
        envVars.INNER_API_KEY = JSON.stringify(envConfig.INNER_API_KEY)
      }
      // 魔塔社区大模型（供 LangChain.js 前端调用使用）
      // ChatOpenAI 客户端会校验 apiKey 必须存在，否则报 Missing credentials
      // 实际请求头由 /modelscope 代理的 onProxyReq 注入，这里仅用于通过校验
      if (envConfig.MODELSCOPE_API_KEY) {
        envVars.MODELSCOPE_API_KEY = JSON.stringify(envConfig.MODELSCOPE_API_KEY)
      }
      // LangSmith 配置：直接定义 process.env.LANGSMITH_* 变量
      // 因为 langsmith 和 @langchain/core 包中的 getEnvironmentVariable()
      // 使用 process.env?.[name] 动态读取，DefinePlugin 在编译时将其替换为
      // 对应的值。这里直接注入到 process.env 对象中。
      // 注意：main.js 中不能有对 process.env.LANGSMITH_* 的赋值语句，
      // 否则 DefinePlugin 替换后会产生语法错误。
      // LANGSMITH_TRACING_V2 是 langsmith SDK 实际检查的变量名
      // isEnvTracingEnabled() → getLangSmithEnvironmentVariable("TRACING_V2")
      // → getEnvironmentVariable("LANGSMITH_TRACING_V2")
      if (envConfig.LANGSMITH_TRACING_V2) {
        envVars['process.env.LANGSMITH_TRACING_V2'] = JSON.stringify(envConfig.LANGSMITH_TRACING_V2)
      }
      if (envConfig.LANGSMITH_ENDPOINT_FRONTEND) {
        envVars['process.env.LANGSMITH_ENDPOINT'] = JSON.stringify(envConfig.LANGSMITH_ENDPOINT_FRONTEND)
      }
      if (envConfig.LANGSMITH_API_KEY) {
        envVars['process.env.LANGSMITH_API_KEY'] = JSON.stringify(envConfig.LANGSMITH_API_KEY)
      }
      if (envConfig.LANGSMITH_PROJECT) {
        envVars['process.env.LANGSMITH_PROJECT'] = JSON.stringify(envConfig.LANGSMITH_PROJECT)
      }
      args[0] = { ...args[0], ...envVars }
      return args
    })

    // ============================================================
    // 防止 webpack TerserPlugin 将 langsmith 和 @langchain/core
    // 的追踪相关模块 tree-shaking 掉。
    //
    // 问题根因：
    //   langsmith 和 @langchain/core 的 package.json 中都没有
    //   "sideEffects" 字段，webpack 默认将其视为 sideEffects: false，
    //   导致 TerserPlugin 在 production 模式下移除所有"未使用"的导出。
    //   但追踪调用链是动态的（ChatOpenAI → CallbackManager →
    //   LangChainTracer → Client），webpack 静态分析无法识别。
    //
    // 解决方案：
    //   1. 通过 config.merge 注入 module.rule 标记 sideEffects: true
    //   2. 禁用 usedExports 防止 webpack 标记未使用导出
    // ============================================================
    config.merge({
      module: {
        rules: [{
          test: /[\\/]node_modules[\\/](langsmith|@langchain[\\/]core)[\\/]/,
          sideEffects: true
        }]
      },
      optimization: {
        usedExports: false,
        sideEffects: true
      }
    })
  },

  devServer: {
    // 使用 setupMiddlewares 配置代理（Vue CLI 5 兼容方式）
    setupMiddlewares(middlewares, devServer) {
      // 代理：/api → 后端服务
      devServer.app.use(
        '/api',
        createProxyMiddleware({
          target: 'http://localhost:22223',
          changeOrigin: true,
          pathRewrite: { '^/api': '' }
        })
      )

      // 代理：/dashscope → 百炼 API（解决 CORS 跨域问题）
      devServer.app.use(
        '/dashscope',
        createProxyMiddleware({
          target: 'https://dashscope.aliyuncs.com',
          changeOrigin: true,
          pathRewrite: { '^/dashscope': '' },
          onProxyReq(proxyReq) {
            if (envConfig.DASHSCOPE_API_KEY) {
              proxyReq.setHeader('Authorization', `Bearer ${envConfig.DASHSCOPE_API_KEY}`)
            }
          },
          onProxyRes(proxyRes, req) {
            console.log(`[DashScope Proxy] ${req.method} ${req.url} → ${proxyRes.statusCode}`)
          },
          onError(err, req, res) {
            console.error('[DashScope Proxy Error]', err.message)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: `代理请求失败: ${err.message}` }))
          }
        })
      )

      // 代理：/modelscope → 魔塔社区 API（备选方案，解决公司网络限制）
      devServer.app.use(
        '/modelscope',
        createProxyMiddleware({
          target: 'https://api-inference.modelscope.cn',
          changeOrigin: true,
          pathRewrite: { '^/modelscope': '' },
          onProxyReq(proxyReq) {
            if (envConfig.MODELSCOPE_API_KEY) {
              proxyReq.setHeader('Authorization', `Bearer ${envConfig.MODELSCOPE_API_KEY}`)
            }
          },
          onProxyRes(proxyRes, req) {
            console.log(`[ModelScope Proxy] ${req.method} ${req.url} → ${proxyRes.statusCode}`)
          },
          onError(err, req, res) {
            console.error('[ModelScope Proxy Error]', err.message)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: `代理请求失败: ${err.message}` }))
          }
        })
      )

      // 代理：/inner → 内网大模型 API
      devServer.app.use(
        '/inner',
        createProxyMiddleware({
          target: envConfig.INNER_BASE_URL || 'http://lanz.hikvision.com',
          changeOrigin: true,
          pathRewrite: { '^/inner': '' },
          onProxyReq(proxyReq) {
            if (envConfig.INNER_API_KEY) {
              proxyReq.setHeader('Authorization', `Bearer ${envConfig.INNER_API_KEY}`)
            }
          },
          onProxyRes(proxyRes, req) {
            console.log(`[Inner Proxy] ${req.method} ${req.url} → ${proxyRes.statusCode}`)
          },
          onError(err, req, res) {
            console.error('[Inner Proxy Error]', err.message)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: `代理请求失败: ${err.message}` }))
          }
        })
      )

      // 代理：/ollama → 本地 Ollama API（OpenAI 兼容模式）
      devServer.app.use(
        '/ollama',
        createProxyMiddleware({
          target: 'http://127.0.0.1:11434',
          changeOrigin: true,
          pathRewrite: { '^/ollama': '' },
          onProxyReq(proxyReq) {
            proxyReq.removeHeader('origin')
            proxyReq.removeHeader('referer')
          },
          onProxyRes(proxyRes, req) {
            console.log(`[Ollama Proxy] ${req.method} ${req.url} → ${proxyRes.statusCode}`)
          },
          onError(err, req, res) {
            console.error('[Ollama Proxy Error]', err.message)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: `Ollama 代理请求失败: ${err.message}` }))
          }
        })
      )

      // 代理：/langsmith-proxy → server.js（端口 22223）→ LangSmith API
      // 公司网络环境导致浏览器直连 api.smith.langchain.com 时
      // ALPN 协商失败（ERR_ALPN_NEGOTIATION_FAILED）。
      //
      // 代理链路：
      //   浏览器端 langsmith SDK 的 fetch 请求被 overrideFetchImplementation
      //   拦截，将 https://api.smith.langchain.com/* 替换为 /langsmith-proxy/*
      //   → vue.config.js devServer 代理 → http://localhost:22223
      //   → server.js 转发到 https://api.smith.langchain.com
      devServer.app.use(
        '/langsmith-proxy',
        createProxyMiddleware({
          target: 'http://localhost:22223',
          changeOrigin: true,
          onProxyRes(proxyRes, req) {
            console.log(`[LangSmith Proxy] ${req.method} ${req.url} → ${proxyRes.statusCode}`)
          },
          onError(err, req, res) {
            console.error('[LangSmith Proxy Error]', err.message)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: `LangSmith 代理请求失败: ${err.message}` }))
          }
        })
      )

      return middlewares
    }
  }
})
