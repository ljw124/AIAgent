<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-08-27 18:50:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-11 14:47:24
 * @Description: 阶段七：RAG — 检索增强生成
 *   学习目标：基于外部知识库回答问题
 *   核心 API：RecursiveCharacterTextSplitter、MemoryVectorStore、createRetrievalChain
 *   注意：内网模型的 embedding API 可能与 OpenAI 不同，此处使用模拟向量存储演示流程
-->
<template>
  <div>
    <h1>阶段七：RAG 检索增强生成 <span class="badge stage">学习</span></h1>
    <div class="info-box">
      <strong>学习目标：</strong>基于外部知识库回答问题，解决「训练数据过时」和「幻觉」问题<br />
      <strong>核心 API：</strong><code>RecursiveCharacterTextSplitter</code>、<code>MemoryVectorStore</code>、检索链<br />
      <strong>流程：</strong>文档加载 → 分割 → 向量化 → 存储 → 检索 → 注入 Prompt → LLM 回答
    </div>

    <!-- 知识库管理 -->
    <div class="config-section">
      <!-- 状态栏 -->
      <div class="config-row">
        <label>知识库状态：</label>
        <span :class="['status-badge', knowledgeReady ? 'ready' : 'pending']">
          {{ knowledgeReady ? '✅ 已就绪 (' + docCount + ' 个文档片段)' : '⏳ 未初始化' }}
        </span>
      </div>

      <!-- 知识来源：两行分组 -->
      <div class="config-group">
        <div class="config-group-label">📦 内置知识库</div>
        <div class="config-group-actions">
          <button @click="initKnowledge" :disabled="loading" class="btn-init">
            {{ knowledgeReady ? '🔄 重新初始化' : '🚀 初始化知识库' }}
          </button>
          <span class="config-hint">使用预设的 LangChain 学习文档</span>
        </div>
      </div>

      <div class="config-group">
        <div class="config-group-label">📁 上传文件</div>
        <div class="config-group-actions">
          <label class="btn-upload">
            📎 选择文件（.txt / .md）
            <input
              type="file"
              accept=".txt,.md"
              @change="handleFileUpload"
              :disabled="loading"
              class="file-input-hidden"
            />
          </label>
          <span v-if="uploadedFileName" class="uploaded-name">📄 {{ uploadedFileName }}</span>
          <span v-else class="config-hint">支持 .txt / .md 格式</span>
        </div>
      </div>

      <!-- 知识库内容预览 -->
      <div class="knowledge-preview" v-if="knowledgeReady">
        <div class="preview-title">📚 知识库内容预览（共 {{ docCount }} 个片段）：</div>
        <div class="preview-list">
          <div v-for="(doc, i) in knowledgePreview" :key="i" class="preview-item">
            <span class="preview-index">#{{ i + 1 }}</span>
            <span class="preview-content">{{ doc }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="input-section">
      <textarea
        v-model="input"
        placeholder="基于知识库提问，如：LangChain 的核心设计模式是什么？"
        rows="3"
        @keydown.ctrl.enter="send"
      ></textarea>
      <button
        @click="send"
        :disabled="loading || !knowledgeReady"
        :title="!knowledgeReady ? '请先初始化知识库或上传文件' : 'Ctrl+Enter 发送'"
      >
        {{ loading ? '检索中...' : '提问 (Ctrl+Enter)' }}
      </button>
      <button @click="clear" class="btn-clear">清空对话</button>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- 检索结果展示 -->
    <div v-if="retrievedDocs.length > 0" class="retrieved-panel">
      <div class="retrieved-title">🔍 检索到的相关文档片段</div>
      <div v-for="(doc, i) in retrievedDocs" :key="i" class="retrieved-item">
        <span class="retrieved-score">相关度: {{ (doc.score * 100).toFixed(0) }}%</span>
        {{ doc.content.substring(0, 150) }}{{ doc.content.length > 150 ? '...' : '' }}
      </div>
    </div>

    <div class="chat-history" ref="chatHistory">
      <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
        <div class="role-label">{{ msg.role === 'user' ? '你' : 'AI（基于知识库）' }}</div>
        <div class="content">{{ msg.content }}</div>
      </div>
    </div>
  </div>
</template>

<script>
/* global INNER_API_KEY */
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

export default {
  name: 'LangChainStage7RAG',

  data() {
    return {
      input: '',
      messages: [],
      loading: false,
      error: null,
      knowledgeReady: false,
      docCount: 0,
      knowledgePreview: [],
      retrievedDocs: [],
      // 向量存储（简化版：用内存数组模拟）
      vectorStore: [],
      // 文件上传
      uploadedFileName: ''
    }
  },

  watch: {
    messages: {
      deep: true,
      handler() { this.$nextTick(() => this.scrollToBottom()) }
    }
  },

  methods: {
    // ============================================================
    // 知识库初始化
    // ============================================================

    /**
     * 模拟知识库文档（实际项目中从文件/数据库加载）
     */
    getKnowledgeDocuments() {
      return [
        {
          title: 'LangChain 概述',
          content: `LangChain 是一个用于构建 LLM 驱动应用的框架。它的核心设计模式是 LCEL（LangChain Expression Language），使用 .pipe() 方法串联组件。LangChain 提供了 Model I/O、Retrieval、Agent 三大核心模块。Model I/O 负责与 LLM 交互，Retrieval 负责检索增强生成（RAG），Agent 负责工具调用和自主决策。`,
        },
        {
          title: 'Prompt Template',
          content: `Prompt Template（提示词模板）是 LangChain 的核心抽象之一。它允许开发者定义可复用的提示词模板，支持变量插值。ChatPromptTemplate.fromMessages() 可以从消息数组创建模板，MessagesPlaceholder 用于在模板中为对话历史预留位置。模板变量使用 {variableName} 语法。`,
        },
        {
          title: 'Tool Calling',
          content: `Tool Calling（工具调用）让 LLM 能够调用外部函数。使用 tool() 函数定义工具，Zod schema 描述参数类型。通过 bindTools() 将工具绑定到模型。当 LLM 返回 tool_calls 时，执行对应工具并将结果以 ToolMessage 形式返回。Agent 可以自动处理这个循环。`,
        },
        {
          title: 'RAG 架构',
          content: `RAG（Retrieval-Augmented Generation）检索增强生成是解决 LLM 幻觉问题的关键技术。流程包括：1) 文档加载（Document Loader）；2) 文档分割（Text Splitter），常用 RecursiveCharacterTextSplitter；3) 向量化（Embeddings），将文本转为向量；4) 向量存储（Vector Store），如 Pinecone、Chroma；5) 相似度检索，找到最相关的文档片段；6) 将检索结果注入 Prompt，让 LLM 基于上下文回答。`,
        },
        {
          title: 'Agent 类型',
          content: `LangChain 支持多种 Agent 类型：ReAct Agent（Reasoning + Acting）是最常用的模式，通过思考→行动→观察的循环来解决问题。OpenAI Functions Agent 使用 Function Calling API。Tool Calling Agent 使用原生 tool_calls。LangGraph 提供了更灵活的状态图工作流引擎，支持多 Agent 协作和复杂的分支逻辑。`,
        },
        {
          title: 'Vue 2 项目结构',
          content: `Vue 2 项目使用 Options API，组件通过 export default { data(), methods: {}, computed: {}, watch: {} } 定义。Vue CLI 5 使用 webpack-dev-server，通过 setupMiddlewares 配置代理解决 CORS 问题。DefinePlugin 可以在编译时注入环境变量。单文件组件（.vue）包含 template、script、style 三部分。`,
        }
      ]
    },

    /**
     * 混合相似度计算：bigram Jaccard + 短查询加权 + 子串包含加分
     * - bigram Jaccard：对中文和英文都有效，无需分词库
     * - 短查询加权：查询越短，命中 bigram 的权重越高，避免被长文档稀释
     * - 子串包含加分：查询是文档的子串时额外加分，确保精确匹配排在最前
     */
    simpleSimilarity(query, document) {
      const q = query.toLowerCase()
      const d = document.toLowerCase()

      // 1. 子串包含检测：查询完全包含在文档中，给予高分
      const containsBonus = d.includes(q) ? 0.3 : 0

      // 2. bigram Jaccard 相似度
      const toBigrams = (str) => {
        const bigrams = new Set()
        for (let i = 0; i < str.length - 1; i++) {
          bigrams.add(str.substring(i, i + 2))
        }
        return bigrams
      }

      const queryBigrams = toBigrams(q)
      const docBigrams = toBigrams(d)

      if (queryBigrams.size === 0) return containsBonus

      let intersection = 0
      for (const bg of queryBigrams) {
        if (docBigrams.has(bg)) intersection++
      }

      // 3. 短查询加权：当查询 bigram 数较少时，用「命中率」替代 Jaccard
      //    避免短查询被长文档的并集稀释
      let bigramScore
      if (queryBigrams.size <= 6) {
        // 短查询：命中率 = 交集 / 查询bigram数（最高1.0）
        bigramScore = intersection / queryBigrams.size
      } else {
        // 长查询：标准 Jaccard = 交集 / 并集
        const union = queryBigrams.size + docBigrams.size - intersection
        bigramScore = union === 0 ? 0 : intersection / union
      }

      // 4. 综合分数：bigram 分数 + 子串包含加分（上限 1.0）
      return Math.min(bigramScore + containsBonus, 1.0)
    },

    /**
     * 初始化知识库：分割文档 → 构建向量存储
     */
    async initKnowledge() {
      this.loading = true
      this.error = null

      try {
        const documents = this.getKnowledgeDocuments()

        // 1. 创建文档分割器
        const splitter = new RecursiveCharacterTextSplitter({
          chunkSize: 100,   // 每个分片的最大字符数，默认值1000
          chunkOverlap: 20, // 相邻分片之间的重叠字符数，默认值200
          separators: ["\n\n", "\n", " ", ""], // 分隔符优先级列表，默认值["\n\n", "\n", " ", ""]
          keepSeparator: false // 是否在分片中保留分隔符，默认值false
        })

        // 2. 分割所有文档
        const allChunks = []
        for (const doc of documents) {
          const chunks = await splitter.splitText(doc.content)
          for (const chunk of chunks) {
            allChunks.push({
              content: chunk,
              metadata: { title: doc.title }
            })
          }
        }

        // 3. 构建向量存储（简化版：存储原始文本 + 元数据）
        //    实际项目中：用 OpenAIEmbeddings 将文本转为向量，存入 VectorStore
        this.vectorStore = allChunks
        this.docCount = allChunks.length
        this.knowledgePreview = allChunks.map((c) => c.content)
        this.knowledgeReady = true
      } catch (err) {
        this.error = `知识库初始化失败: ${err.message}`
      } finally {
        this.loading = false
      }
    },

    /**
     * 处理文件上传：读取 .txt / .md 文件内容，分片后构建知识库
     */
    async handleFileUpload(event) {
      const file = event.target.files[0]
      if (!file) return

      // 校验文件类型
      const allowedExts = ['.txt', '.md']
      const ext = '.' + file.name.split('.').pop().toLowerCase()
      if (!allowedExts.includes(ext)) {
        this.error = `不支持的文件格式：${ext}，仅支持 ${allowedExts.join(', ')}`
        return
      }

      this.loading = true
      this.error = null
      this.uploadedFileName = file.name

      try {
        // 使用 FileReader 读取文件内容
        const content = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target.result)
          reader.onerror = () => reject(new Error('文件读取失败'))
          reader.readAsText(file, 'UTF-8')
        })

        if (!content || !content.trim()) {
          throw new Error('文件内容为空')
        }

        // 复用分片逻辑：将文件内容作为单个"文档"进行分片
        const splitter = new RecursiveCharacterTextSplitter({
          chunkSize: 100,
          chunkOverlap: 20
        })

        const chunks = await splitter.splitText(content)
        const allChunks = chunks.map((chunk) => ({
          content: chunk,
          metadata: { title: file.name }
        }))

        // 构建向量存储
        this.vectorStore = allChunks
        this.docCount = allChunks.length
        this.knowledgePreview = allChunks.map((c) => c.content)
        this.knowledgeReady = true
      } catch (err) {
        this.error = `文件上传失败: ${err.message}`
        this.uploadedFileName = ''
      } finally {
        this.loading = false
        // 重置 file input，允许重复上传同一文件
        event.target.value = ''
      }
    },

    /**
     * 检索相关文档
     */
    retrieveDocuments(query) {
      // 计算每个文档片段与查询的相似度
      const scored = this.vectorStore.map((doc) => ({
        ...doc,
        score: this.simpleSimilarity(query, doc.content),
      }))

      // 按相似度排序，取 top 3
      const topDocs = scored
        .filter((d) => d.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)

      return topDocs
    },

    async send() {
      const text = this.input.trim()
      if (!text || this.loading || !this.knowledgeReady) return

      this.messages.push({ role: 'user', content: text })
      this.input = ''
      this.error = null
      this.loading = true
      this.retrievedDocs = []

      this.messages.push({ role: 'assistant', content: '' })
      const aiMsgIndex = this.messages.length - 1

      try {
        // ============================================================
        // 阶段七核心：RAG 检索增强生成
        // ============================================================

        // 1. 检索相关文档
        const relevantDocs = this.retrieveDocuments(text)
        this.retrievedDocs = relevantDocs

        // 2. 将检索到的文档拼接为上下文
        const context = relevantDocs
          .map((doc, i) => `[文档${i + 1}] ${doc.content}`)
          .join('\n\n')

        // 3. 构造带上下文的 System Prompt
        const systemPrompt = `你是一个基于知识库回答问题的AI助手。请严格根据以下提供的文档内容回答问题。

          重要规则：
          - 如果文档中包含用户查询的内容（即使是部分匹配、代码片段、哈希值等），你必须如实告知用户该内容在文档中存在，并引用相关文档片段
          - 只有当文档中确实没有任何与用户查询相关的内容时，才说"知识库中没有相关信息"
          - 不要因为文档内容看起来像随机字符串就忽略它

          === 知识库文档内容 ===
          ${context}
          === 文档内容结束 ===
          请用中文回答，回答要准确、简洁。`

        // 4. 构造消息
        const historyMessages = this.messages
          .slice(0, -1)
          .map((msg) => {
            if (msg.role === 'user') return new HumanMessage(msg.content)
            if (msg.role === 'assistant') return new AIMessage(msg.content)
            return null
          })
          .filter(Boolean)

        const langChainMessages = [
          new SystemMessage(systemPrompt),
          ...historyMessages
        ]

        // 5. 调用模型
        const llm = new ChatOpenAI({
          model: 'EB-DeepSeek-V4-Pro',
          apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
          temperature: 0.3,
          configuration: {
            baseURL: window.location.origin + '/inner/'
          }
        })

        const response = await llm.invoke(langChainMessages)
        this.messages[aiMsgIndex].content = response.content
      } catch (err) {
        this.error = `请求失败: ${err.message}`
        if (!this.messages[aiMsgIndex].content) {
          this.messages.splice(aiMsgIndex, 1)
        }
      } finally {
        this.loading = false
      }
    },

    clear() {
      this.messages = []
      this.retrievedDocs = []
      this.error = null
    },

    scrollToBottom() {
      const el = this.$refs.chatHistory
      if (el) el.scrollTop = el.scrollHeight
    }
  }
}
</script>

<style scoped>
.badge.stage {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: #fff;
}

.config-section {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.config-row label {
  font-weight: 600;
  font-size: 14px;
  color: #0369a1;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
}

.status-badge.ready {
  background: #dcfce7;
  color: #166534;
}

.status-badge.pending {
  background: #fef3c7;
  color: #92400e;
}

/* 知识来源分组 */
.config-group {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  margin-bottom: 6px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.config-group-label {
  font-weight: 600;
  font-size: 13px;
  color: #334155;
  min-width: 110px;
  flex-shrink: 0;
}

.config-group-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.config-hint {
  font-size: 12px;
  color: #94a3b8;
}

.btn-init {
  padding: 6px 16px;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

.btn-init:hover {
  background: #2563eb;
}

.btn-init:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-upload {
  display: inline-block;
  padding: 6px 16px;
  background: #10b981;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  position: relative;
  transition: background 0.2s;
  white-space: nowrap;
}

.btn-upload:hover {
  background: #059669;
}

.file-input-hidden {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.uploaded-name {
  font-size: 12px;
  color: #059669;
  font-weight: 500;
}

/* 知识库预览 */
.knowledge-preview {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #cbd5e1;
}

.preview-title {
  font-weight: 600;
  font-size: 13px;
  color: #0369a1;
  margin-bottom: 6px;
}

.preview-list {
  max-height: 160px;
  overflow-y: auto;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
}

.preview-item {
  display: flex;
  align-items: flex-start;
  font-size: 12px;
  color: #475569;
  padding: 6px 10px;
  border-bottom: 1px solid #f1f5f9;
  line-height: 1.5;
  word-break: break-all;
}

.preview-item:last-child {
  border-bottom: none;
}

.preview-index {
  color: #3b82f6;
  font-weight: 600;
  margin-right: 8px;
  flex-shrink: 0;
  min-width: 24px;
}

.preview-content {
  white-space: pre-wrap;
  word-break: break-all;
}

.retrieved-panel {
  background: #fefce8;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.retrieved-title {
  font-weight: 700;
  font-size: 14px;
  color: #92400e;
  margin-bottom: 8px;
}

.retrieved-item {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 6px;
  font-size: 13px;
  color: #78716c;
}

.retrieved-score {
  display: inline-block;
  background: #f59e0b;
  color: #fff;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  margin-right: 8px;
}
</style>