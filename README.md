# 🤖 AI Agent

> 基于 **LangChain.js** 与 **Vue 2** 构建的多模型 AI Agent 交互平台，支持内网大模型、本地 Ollama、百炼 DashScope、魔搭 ModelScope 等多种大模型接入，并内置完整的 LangChain.js 知识体系学习模块。

---

## 📖 目录

- [项目简介](#-项目简介)
- [核心特性](#-核心特性)
- [技术栈](#-技术栈)
- [支持的模型平台](#-支持的模型平台)
- [LangChain.js 知识体系](#-langchainjs-知识体系)
- [项目结构](#-项目结构)
- [环境配置](#-环境配置)
- [快速开始](#-快速开始)
- [后端服务](#-后端服务)
- [代理与网络说明](#-代理与网络说明)
- [LangSmith 追踪](#-langsmith-追踪)
- [常见问题](#-常见问题)

---

## 🚀 项目简介

本项目是一个面向大模型应用开发的学习与演示平台，通过统一的 Web 界面接入多种大模型服务，并配套完整的 **LangChain.js** 学习路径（从 Prompt 模板到 RAG 检索增强的七阶段进阶）。项目同时提供 **JavaScript** 与 **Python** 两种调用方式，方便对比学习不同语言生态下的 LangChain 用法。

前端基于 Vue 2 + Vue CLI 5，通过 `vue.config.js` 配置多路代理解决跨域与公司网络限制问题；后端使用 Node.js 原生 `http` 模块（[`server.js`](server.js)）调用 Python 脚本完成内网模型与本地模型的推理。

---

## ✨ 核心特性

- **多模型平台接入**：内网 hikvision、本地 Ollama、百炼 DashScope、魔搭 ModelScope 四大平台统一接入。
- **双语言调用**：每个模型平台均提供 JS 与 Python 两种调用示例，便于对比学习。
- **LangChain.js 七阶段学习**：从 Prompt Template 到 RAG 检索增强的完整进阶路线。
- **流式输出**：支持 Streaming 流式响应，实时展示模型输出。
- **结构化输出**：基于 Zod 实现结构化数据输出与校验。
- **Tool Calling**：支持工具调用，展示 Agent 调用工具的完整过程（思考 → 调用 → 结果）。
- **LangSmith 追踪**：集成 LangSmith 监控，可视化查看每次运行的追踪记录。
- **思考过程可视化**：对话界面可展开查看模型的思考过程（thinking）与工具调用细节。

---

## 🛠 技术栈

| 分类 | 技术 |
| --- | --- |
| 前端框架 | Vue 2.6、Vue CLI 5 |
| 构建工具 | Webpack 5、Babel |
| 包管理器 | pnpm（`.npmrc` 配置了 npmmirror 镜像） |
| AI 框架 | LangChain.js（`@langchain/core`、`@langchain/langgraph`、`@langchain/openai`、`@langchain/textsplitters`） |
| 数据校验 | Zod |
| 后端服务 | Node.js 原生 `http` 模块（[`server.js`](server.js)） |
| Python 运行时 | Python 3.13（调用内网 / 本地模型推理） |
| 监控追踪 | LangSmith |

---

## 🧩 支持的模型平台

| 平台 | 说明 | 调用方式 | 相关文件 |
| --- | --- | --- | --- |
| **内网 hikvision** | 公司内网部署的大模型 | JS / Python | [`InnerModelChat.vue`](src/pages/inner/InnerModelChat.vue)、[`InnerModelPythonChat.vue`](src/pages/inner/InnerModelPythonChat.vue)、[`InnerModel.py`](src/composables/InnerModel.py) |
| **本地 Ollama** | 本地部署的开源模型 | JS / Python | [`OllamaChat.vue`](src/pages/ollama/OllamaChat.vue)、[`OllamaPythonChat.vue`](src/pages/ollama/OllamaPythonChat.vue)、[`OllamaModel.py`](src/composables/OllamaModel.py) |
| **百炼 DashScope** | 阿里云百炼大模型平台 | JS / Python | [`DashScopeModelChat.vue`](src/pages/DashScope/DashScopeModelChat.vue)、[`DashScopePythonChat.vue`](src/pages/DashScope/DashScopePythonChat.vue)、[`DashScopeModel.js`](src/composables/DashScopeModel.js)、[`DashScope_demo.py`](src/pages/DashScope/DashScope_demo.py) |
| **魔搭 ModelScope** | 阿里魔搭社区大模型 | JS / Python | [`ModelScopeChat.vue`](src/pages/modelscope/ModelScopeChat.vue)、[`ModelScopePythonChat.vue`](src/pages/modelscope/ModelScopePythonChat.vue)、[`ModelScopeModel.py`](src/composables/ModelScopeModel.py) |

---

## 📚 LangChain.js 知识体系

项目内置了从入门到进阶的 **七阶段** LangChain.js 学习模块，每个阶段对应一个独立的 Vue 组件：

| 阶段 | 主题 | 组件 |
| --- | --- | --- |
| 1️⃣ | **Prompt Template** 提示词模板 | [`LangChainStage1Prompt.vue`](src/pages/langchain/LangChainStage1Prompt.vue) |
| 2️⃣ | **Chain 链式调用** | [`LangChainStage2Chain.vue`](src/pages/langchain/LangChainStage2Chain.vue) |
| 3️⃣ | **Streaming 流式输出** | [`LangChainStage3Stream.vue`](src/pages/langchain/LangChainStage3Stream.vue) |
| 4️⃣ | **Structured 结构化输出** | [`LangChainStage4Structured.vue`](src/pages/langchain/LangChainStage4Structured.vue) |
| 5️⃣ | **Tool Calling 工具调用** | [`LangChainStage5Tool.vue`](src/pages/langchain/LangChainStage5Tool.vue) |
| 6️⃣ | **Agent 智能体** | [`LangChainStage6Agent.vue`](src/pages/langchain/LangChainStage6Agent.vue) |
| 7️⃣ | **RAG 检索增强** | [`LangChainStage7RAG.vue`](src/pages/langchain/LangChainStage7RAG.vue) |

### 📄 配套学习文档

项目在 [`src/docs/`](src/docs) 目录下整理了丰富的学习资料：

**AI-Agent 文档**（位于 [`src/docs/agent/`](src/docs/agent)）：

- [什么是AI-Agent-三层模型演进之路.md](src/docs/agent/什么是AI-Agent-三层模型演进之路.md)
- [AI-Agent三种核心模式详解.md](src/docs/agent/AI-Agent三种核心模式详解.md)
- [构建高效的AI-Agent.md](src/docs/agent/构建高效的AI-Agent.md)

**LangChain 学习文档**（位于 [`src/docs/langchain/`](src/docs/langchain)）：

- [LangChain-Agent集成完整流程.md](src/docs/langchain/LangChain-Agent集成完整流程.md)
- [LangChain详细指南.md](src/docs/langchain/LangChain详细指南.md)
- [LangChain.js前端学习路径.md](src/docs/langchain/LangChain.js前端学习路径.md)
- [LangChain.js深入学习路线.md](src/docs/langchain/LangChain.js深入学习路线.md)
- [学习LangChain所需的Python知识.md](src/docs/langchain/学习LangChain所需的Python知识.md)
- [LangSmith追踪集成总结.md](src/docs/langchain/LangSmith追踪集成总结.md)
- [Vercel-AI-SDK详细指南.md](src/docs/langchain/Vercel-AI-SDK详细指南.md)

---

## 📁 项目结构

```
├── .env                      # 环境变量（API Key、Base URL、LangSmith 配置）
├── .npmrc                    # pnpm 配置（shamefully-hoist、npmmirror 镜像）
├── package.json              # 项目依赖与脚本
├── server.js                 # Node.js 后端服务（调用 Python 脚本、LangSmith 代理）
├── vue.config.js             # Vue CLI 配置（DefinePlugin 注入、多路代理）
├── public/                   # 静态资源
└── src/
    ├── App.vue               # 主入口（左侧菜单 + 右侧内容区）
    ├── main.js               # 应用入口
    ├── assets/               # 静态资源（logo 等）
    ├── composables/          # 模型调用封装（JS / Python）
    │   ├── DashScopeModel.js   # 百炼模型 JS 封装
    │   ├── DashScopeModel.py   # 百炼模型 Python 脚本
    │   ├── InnerModel.py     # 内网模型 Python 脚本
    │   ├── ModelScopeModel.py # 魔搭 ModelScope 模型 Python 脚本
    │   └── OllamaModel.py    # Ollama 模型 Python 脚本
    ├── docs/                 # 学习文档
    └── pages/                # 页面组件
        ├── DashScope/          # 百炼 DashScope（平台）
        ├── inner/            # 内网大模型（平台）
        ├── langchain/        # LangChain.js 知识体系（学习）
        ├── modelscope/       # 魔搭 ModelScope（平台）
        └── ollama/           # 本地 Ollama（平台）
```

---

## ⚙️ 环境配置

项目通过根目录的 [`.env`](.env) 文件管理所有环境变量，`vue.config.js` 使用 `DefinePlugin` 将变量注入前端代码，`server.js` 通过 `dotenv` 加载并传递给 Python 子进程。

```bash
# 百炼大模型
DASHSCOPE_API_KEY="your-dashscope-api-key"
DASHSCOPE_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"

# 魔搭社区大模型
MODELSCOPE_API_KEY="your-modelscope-api-key"
MODELSCOPE_BASE_URL="https://api-inference.modelscope.cn/v1"

# 内网环境大模型
INNER_API_KEY="your-inner-api-key"
INNER_BASE_URL="http://lanz.hikvision.com/v3/openai/model"

# LangSmith 监控
LANGSMITH_TRACING="true"
LANGSMITH_TRACING_V2="true"
LANGSMITH_ENDPOINT="https://api.smith.langchain.com"
LANGSMITH_API_KEY="your-langsmith-api-key"
LANGSMITH_PROJECT="ai-agent"
LANGSMITH_ENDPOINT_FRONTEND="/langsmith"
```

> ⚠️ **安全提示**：`.env` 文件包含敏感 API Key，请勿提交到版本库。建议在 `.gitignore` 中忽略该文件。

---

## 🚀 快速开始

### 环境要求

- **Node.js**（建议 16+）
- **pnpm**（包管理器）
- **Python 3.13**（用于内网 / 本地模型推理，需安装 `langchain_openai` 等依赖）
- **Ollama**（使用本地模型时需要，默认监听 `127.0.0.1:11434`）

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm run serve
```

### 启动后端服务（可选）

内网模型与本地模型的 **Python 调用** 需要后端服务支持：

```bash
node server.js
```

后端服务监听 `22223` 端口，提供 `/api/inner/chat` 等端点，通过 `spawn` 调用 Python 脚本执行推理。

### 生产构建

```bash
pnpm run build
```

### 代码检查

```bash
pnpm run lint
```

### 自定义配置

参见 [Vue CLI 配置参考](https://cli.vuejs.org/config/)。

---

## 🔌 后端服务

[`server.js`](server.js) 是一个基于 Node.js 原生 `http` 模块的轻量后端服务，主要职责：

- **调用 Python 脚本**：通过 `spawn` 启动 Python 子进程，执行内网模型（[`InnerModel.py`](src/composables/InnerModel.py)）、本地模型（[`OllamaModel.py`](src/composables/OllamaModel.py)）与魔搭模型（[`ModelScopeModel.py`](src/composables/ModelScopeModel.py)）的推理，并解析 JSON 结果返回。
- **LangSmith 代理**：将浏览器端无法直连的 `api.smith.langchain.com` 请求转发到真实地址，解决公司网络 ALPN 协商失败问题。

> **注意**：`server.js` 中硬编码了 Windows 下的 Python 路径（`C:\Users\lujinwei\AppData\Local\Programs\Python\Python313\python.exe`），如环境不同请自行修改。

---

## 🌐 代理与网络说明

[`vue.config.js`](vue.config.js) 通过 `devServer.setupMiddlewares` 配置了多路代理，用于解决跨域与公司网络限制：

| 代理路径 | 目标 | 用途 |
| --- | --- | --- |
| `/api` | `http://localhost:22223` | 转发到后端服务（Python 调用） |
| `/dashscope` | `https://dashscope.aliyuncs.com` | 百炼 API（解决 CORS） |
| `/modelscope` | `https://api-inference.modelscope.cn` | 魔搭 API（备选方案） |
| `/inner` | 内网大模型地址 | 内网模型 API |
| `/ollama` | `http://127.0.0.1:11434` | 本地 Ollama（OpenAI 兼容模式） |
| `/langsmith-proxy` | `http://localhost:22223` | LangSmith 代理链路 |

---

## 📊 LangSmith 追踪

项目集成了 **LangSmith** 监控，可可视化查看每次模型运行的追踪记录：

- 前端通过 `vue.config.js` 的 `DefinePlugin` 注入 `process.env.LANGSMITH_*` 变量。
- 浏览器端 LangSmith SDK 的请求被拦截并替换为 `/langsmith-proxy`，经 devServer 代理到后端 `server.js`，再转发到 `api.smith.langchain.com`。
- Python 后端直接使用 `.env` 中的真实地址。

> 详细集成过程可参考 [LangSmith追踪集成总结.md](src/docs/langchain/LangSmith追踪集成总结.md)。

---

## ❓ 常见问题

**Q1：Python 调用报错「无法启动 Python」？**
检查 [`server.js`](server.js) 中硬编码的 Python 路径是否与本地环境一致，并确认已安装 `langchain_openai` 等依赖。

**Q2：浏览器直连 LangSmith 报 `ERR_ALPN_NEGOTIATION_FAILED`？**
这是公司网络限制导致的，项目已通过 `/langsmith-proxy` 代理链路解决，请确保后端服务（`node server.js`）已启动。

**Q3：本地 Ollama 无法连接？**
确认 Ollama 服务已启动并监听 `127.0.0.1:11434`，且已拉取所需模型。

**Q4：生产构建后 LangSmith 追踪失效？**
`vue.config.js` 中针对 `langsmith` 和 `@langchain/core` 的 `sideEffects` 配置用于防止 tree-shaking 移除追踪模块，请勿删除该配置。

---

## 📄 License

本项目仅供学习与演示使用。
