# LangSmith 追踪集成总结

## 一、概述

本文档记录了在 AI Agent 项目中集成 [LangSmith](https://smith.langchain.com/) 可观测性追踪的完整流程，包括架构设计、实现步骤、遇到的问题及解决方案。

项目有三条调用链路需要覆盖：

| 调用链路 | 技术栈 | LangSmith 集成方式 |
|----------|--------|-------------------|
| 前端 → `/inner` 代理 → 内网 API（ChatOpenAI） | Vue + LangChain.js | 浏览器端 SDK，通过代理转发 |
| 前端 → `/api/inner/chat` → server.js → Python | Node.js + Python | Python 端自动启用 |
| 前端 → `/api/ollama/chat` → server.js → Python | Node.js + Python | Python 端自动启用 |

---

## 二、环境变量配置

在 [`.env`](.env) 中配置 LangSmith 相关变量：

```env
# LangSmith 追踪配置
LANGSMITH_TRACING="true"
LANGSMITH_TRACING_V2="true"          # langsmith SDK 实际检查的变量名
LANGSMITH_ENDPOINT="https://api.smith.langchain.com"  # 后端代理使用的真实地址
LANGSMITH_API_KEY="lsv2_pt_..."
LANGSMITH_PROJECT="ai-agent"
LANGSMITH_ENDPOINT_FRONTEND="/langsmith"  # 前端 DefinePlugin 注入的相对路径
```

**关键点**：
- `LANGSMITH_TRACING_V2` 是 langsmith SDK 实际检查的变量名（不是 `LANGSMITH_TRACING`）
- `LANGSMITH_ENDPOINT` 设为真实 API 地址，供 server.js 代理转发使用
- `LANGSMITH_ENDPOINT_FRONTEND` 设为相对路径 `/langsmith`，供前端 DefinePlugin 注入

---

## 三、架构设计

### 3.1 代理链路

公司网络环境（hikvision.com）下，浏览器直连 `api.smith.langchain.com` 会触发 `ERR_ALPN_NEGOTIATION_FAILED` 错误。因此需要三层代理：

```
浏览器 langsmith SDK fetch()
  → overrideFetchImplementation 拦截，URL 替换为 /langsmith-proxy/*
  → vue.config.js devServer 代理 /langsmith-proxy → http://localhost:22223
  → server.js 转发到 https://api.smith.langchain.com
```

### 3.2 各文件职责

| 文件 | 职责 |
|------|------|
| [`.env`](.env) | 存储 LangSmith 配置（API Key、Endpoint、Project 等） |
| [`vue.config.js`](vue.config.js) | DefinePlugin 注入环境变量 + devServer 代理配置 + tree-shaking 防护 |
| [`src/main.js`](src/main.js) | 创建 `window.process.env` + `overrideFetchImplementation` 拦截 fetch |
| [`server.js`](server.js) | Node.js 后端代理，转发 LangSmith 请求到真实 API |
| [`src/composables/InnerModel.py`](src/composables/InnerModel.py) | Python 端加载 `.env`，自动启用 LangSmith 追踪 |
| [`src/composables/OllamaModel.py`](src/composables/OllamaModel.py) | 同上 |

---

## 四、实现细节

### 4.1 Python 后端（简单）

Python 端只需在脚本开头加载 `.env` 文件：

```python
from dotenv import load_dotenv
load_dotenv()  # 自动加载 LANGSMITH_* 环境变量
```

LangChain Python SDK 会自动读取 `LANGSMITH_TRACING_V2`、`LANGSMITH_API_KEY` 等环境变量并启用追踪。

### 4.2 Node.js 后端（server.js）

```javascript
require('dotenv').config()  // 加载 .env 到 process.env
```

添加 `/langsmith-proxy/*` 路由，将请求转发到 `api.smith.langchain.com`：

```javascript
if (url.startsWith('/langsmith-proxy/') || url.startsWith('/langsmith/')) {
  const targetUrl = langsmithTarget + url.replace(prefix, '')
  const result = await proxyRequest(method, parsedUrl, req.headers, body, apiKey)
  res.writeHead(result.statusCode, result.headers)
  res.end(result.body)
}
```

### 4.3 前端（最复杂）

前端需要解决三个核心问题：

#### 问题 1：环境变量注入

Webpack DefinePlugin 将 `process.env.LANGSMITH_*` 替换为字符串字面量。但 langsmith SDK 使用**动态属性访问** `process.env?.[name]`，DefinePlugin 无法替换动态访问。

**解决方案**：在 [`src/main.js`](src/main.js) 中手动创建 `window.process.env` 对象：

```javascript
window.process = window.process || {}
window.process.env = window.process.env || {}
window.process.env.LANGSMITH_TRACING_V2 = process.env.LANGSMITH_TRACING_V2  // DefinePlugin 静态替换
window.process.env.LANGSMITH_ENDPOINT = 'https://api.smith.langchain.com'
window.process.env.LANGSMITH_API_KEY = process.env.LANGSMITH_API_KEY
window.process.env.LANGSMITH_PROJECT = process.env.LANGSMITH_PROJECT
```

#### 问题 2：Webpack Tree-Shaking

Webpack 生产模式的 TerserPlugin 会将 `langsmith` 和 `@langchain/core` 的追踪代码作为"死代码"移除，因为 webpack 静态分析无法识别动态调用链（ChatOpenAI → CallbackManager → LangChainTracer → Client）。

**解决方案**：在 [`vue.config.js`](vue.config.js) 中：

```javascript
// 1. 标记 langsmith 和 @langchain/core 有副作用
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

// 2. 在 main.js 中显式导入关键模块
import { Client, RunTree, isTracingEnabled, overrideFetchImplementation } from 'langsmith'
import { CallbackManager } from '@langchain/core/callbacks/manager'
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain'
```

#### 问题 3：网络代理（ERR_ALPN_NEGOTIATION_FAILED）

公司网络下浏览器无法直连 `api.smith.langchain.com`。

**解决方案**：使用 langsmith SDK 的 `overrideFetchImplementation()` API 拦截所有 fetch 请求：

```javascript
import { overrideFetchImplementation } from 'langsmith'

const customFetch = async (url, options) => {
  let finalUrl = url
  // 拦截 api.smith.langchain.com 的绝对 URL
  if (typeof url === 'string' && url.includes('api.smith.langchain.com')) {
    const urlObj = new URL(url)
    finalUrl = '/langsmith-proxy' + urlObj.pathname + urlObj.search
  }
  // 拦截 /langsmith 开头的相对路径（LANGSMITH_ENDPOINT 为相对路径时）
  else if (typeof url === 'string' && url.startsWith('/langsmith')) {
    finalUrl = url.replace(/^\/langsmith/, '/langsmith-proxy')
  }
  return fetch(finalUrl, options)
}

overrideFetchImplementation(customFetch)
```

---

## 五、遇到的问题及解决方案

### 5.1 错误链一览

| # | 错误 | 根因 | 解决方案 |
|---|------|------|----------|
| 1 | `Cannot assign to read only property 'undefined'` | Webpack 5 不提供 `process` polyfill | 手动创建 `window.process = window.process \|\| {}` |
| 2 | `ERR_ALPN_NEGOTIATION_FAILED` | 公司网络阻止浏览器直连外部 HTTPS | 三层代理：overrideFetchImplementation → devServer → server.js |
| 3 | `Invalid left-hand side in assignment` | DefinePlugin 全局文本替换导致变量名冲突 | 放弃在 main.js 中对 `process.env.LANGSMITH_*` 的赋值语句 |
| 4 | `Unexpected token '&'` | EJS 模板 HTML 转义 JSON 中的双引号 | 改用 `beforeEmit` hook + 占位符替换 |
| 5 | `process.env.LANGSMITH_*` 在 ChatOpenAI 中为 `undefined` | DefinePlugin 替换的是编译时 `process.env`，与运行时 `window.process.env` 不是同一对象 | 直接 DefinePlugin 注入 `process.env.LANGSMITH_*`，main.js 中复制到 `window.process.env` |
| 6 | LangSmith 追踪代码被 webpack 移除 | TerserPlugin tree-shaking，langsmith 包无 `sideEffects` 字段 | `config.merge` 标记 sideEffects + 显式导入关键模块 |
| 7 | `Module not found: "./utils/callbacks"` | `@langchain/core` 的 `exports` 字段不暴露 `./utils/callbacks` | 移除该导入，只导入已暴露的路径 |
| 8 | `isTracingEnabled()` 返回 `false` | SDK 检查 `LANGSMITH_TRACING_V2` 而非 `LANGSMITH_TRACING` | 添加 `LANGSMITH_TRACING_V2="true"` |
| 9 | `isTracingEnabled()` 仍返回 `false` | DefinePlugin 无法替换动态属性访问 `process.env?.[name]` | 手动创建 `window.process.env` 对象 |
| 10 | `GET /langsmith/info 404` | `overrideFetchImplementation` 未拦截相对路径 URL | 增加对 `/langsmith` 开头相对路径的拦截逻辑 |

### 5.2 关键教训

1. **DefinePlugin 的限制**：只能替换**静态**属性访问（`process.env.FOO`），无法替换**动态**属性访问（`process.env?.[name]`）。需要手动构建运行时对象。

2. **Webpack Tree-Shaking 的陷阱**：对于没有 `sideEffects` 字段的第三方包，webpack 会激进地移除"未使用"的导出。动态调用链（如回调管理器模式）需要显式标记 sideEffects。

3. **环境变量命名约定**：langsmith SDK 检查 `LANGSMITH_TRACING_V2`（带 `_V2` 后缀），而非 `LANGSMITH_TRACING`。这是 SDK 内部的命名约定，文档中可能不够明显。

4. **公司网络限制**：`ERR_ALPN_NEGOTIATION_FAILED` 是企业网络环境的常见问题。解决方案是通过 Node.js 后端代理转发外部 API 请求，因为 Node.js 的 TLS 实现不受企业证书策略影响。

5. **`overrideFetchImplementation` 的 URL 匹配**：需要同时处理绝对 URL（`https://api.smith.langchain.com/...`）和相对路径（`/langsmith/...`），因为 `LANGSMITH_ENDPOINT` 的值决定了 SDK 构造的 URL 格式。

---

## 六、验证方法

1. 启动服务：
   ```bash
   # 终端 1：启动 Node.js 后端
   node server.js
   
   # 终端 2：启动 Vue 前端
   npm run serve
   ```

2. 打开浏览器 `http://localhost:8082/`，进入「内网 JS 调用」页面

3. 发送消息，观察：
   - 控制台输出 `[LangSmith] 追踪模块已加载`
   - 控制台输出 `[LangSmith Fetch]` 日志（fetch 拦截生效）
   - 终端 1 输出 `[LangSmith Proxy] GET /langsmith-proxy/info → 200`
   - 终端 1 输出 `[LangSmith Proxy] POST /langsmith-proxy/runs/multipart → 202`

4. 登录 [LangSmith](https://smith.langchain.com/) 查看追踪数据

---

## 七、文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `.env` | 修改 | 添加 `LANGSMITH_*` 变量，修正 `SMITH_API_KEY` → `LANGSMITH_API_KEY` |
| `vue.config.js` | 修改 | DefinePlugin 注入 + tree-shaking 防护 + `/langsmith-proxy` 代理 |
| `src/main.js` | 修改 | `window.process.env` 初始化 + `overrideFetchImplementation` + 显式导入 |
| `server.js` | 修改 | `dotenv.config()` + `/langsmith-proxy/*` 代理路由 |
| `src/composables/InnerModel.py` | 修改 | 添加 `load_dotenv()` |
| `src/composables/OllamaModel.py` | 修改 | 添加 `load_dotenv()` |