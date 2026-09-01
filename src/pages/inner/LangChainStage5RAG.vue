<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-08-27 18:50:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-08-27 18:50:00
 * @Description: 阶段五：RAG — 检索增强生成
 *   学习目标：基于外部知识库回答问题
 *   核心 API：RecursiveCharacterTextSplitter、MemoryVectorStore、createRetrievalChain
 *   注意：内网模型的 embedding API 可能与 OpenAI 不同，此处使用模拟向量存储演示流程
-->
<template>
  <div>
    <h1>阶段五：RAG 检索增强生成 <span class="badge stage">学习</span></h1>
    <div class="info-box">
      <strong>学习目标：</strong>基于外部知识库回答问题，解决「训练数据过时」和「幻觉」问题<br />
      <strong>核心 API：</strong><code>RecursiveCharacterTextSplitter</code>、<code>MemoryVectorStore</code>、检索链<br />
      <strong>流程：</strong>文档加载 → 分割 → 向量化 → 存储 → 检索 → 注入 Prompt → LLM 回答
    </div>

    <!-- 知识库管理 -->
    <div class="config-section">
      <div class="config-row">
        <label>知识库状态：</label>
        <span :class="['status-badge', knowledgeReady ? 'ready' : 'pending']">
          {{ knowledgeReady ? '✅ 已就绪 (' + docCount + ' 个文档片段)' : '⏳ 未初始化' }}
        </span>
        <button @click="initKnowledge" :disabled="loading" class="btn-init">
          {{ knowledgeReady ? '重新初始化' : '初始化知识库' }}
        </button>
      </div>
      <div class="knowledge-preview" v-if="knowledgeReady">
        <div class="preview-title">📚 知识库内容预览：</div>
        <div class="preview-list">
          <div v-for="(doc, i) in knowledgePreview" :key="i" class="preview-item">
            <span class="preview-index">#{{ i + 1 }}</span>
            {{ doc.substring(0, 80) }}{{ doc.length > 80 ? '...' : '' }}
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
      <button @click="send" :disabled="loading || !knowledgeReady">
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
  name: 'LangChainStage5RAG',

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
    }
  },

  watch: {
    messages: {
      deep: true,
      handler() { this.$nextTick(() => this.scrollToBottom()) },
    },
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
        },
      ]
    },

    /**
     * 简单的文本相似度计算（余弦相似度的简化版）
     * 实际项目中使用 embedding 向量计算相似度
     */
    simpleSimilarity(query, document) {
      const queryWords = new Set(query.toLowerCase().split(/\s+/))
      const docWords = new Set(document.toLowerCase().split(/\s+/))
      let overlap = 0
      for (const word of queryWords) {
        if (docWords.has(word)) overlap++
      }
      return overlap / Math.max(queryWords.size, 1)
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
          chunkSize: 200,   // 每个片段最大 200 字符
          chunkOverlap: 30, // 片段之间重叠 30 字符
        })

        // 2. 分割所有文档
        const allChunks = []
        for (const doc of documents) {
          const chunks = await splitter.splitText(doc.content)
          for (const chunk of chunks) {
            allChunks.push({
              content: chunk,
              metadata: { title: doc.title },
            })
          }
        }

        // 3. 构建向量存储（简化版：存储原始文本 + 元数据）
        //    实际项目中：用 OpenAIEmbeddings 将文本转为向量，存入 VectorStore
        this.vectorStore = allChunks
        this.docCount = allChunks.length
        this.knowledgePreview = allChunks.slice(0, 5).map((c) => c.content)
        this.knowledgeReady = true
      } catch (err) {
        this.error = `知识库初始化失败: ${err.message}`
      } finally {
        this.loading = false
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
        // 阶段五核心：RAG 检索增强生成
        // ============================================================

        // 1. 检索相关文档
        const relevantDocs = this.retrieveDocuments(text)
        this.retrievedDocs = relevantDocs

        // 2. 将检索到的文档拼接为上下文
        const context = relevantDocs
          .map((doc, i) => `[文档${i + 1}] ${doc.content}`)
          .join('\n\n')

        // 3. 构造带上下文的 System Prompt
        const systemPrompt = `你是一个基于知识库回答问题的AI助手。请严格根据以下提供的文档内容回答问题。如果文档中没有相关信息，请明确说"知识库中没有相关信息"。

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
          ...historyMessages,
        ]

        // 5. 调用模型
        const llm = new ChatOpenAI({
          model: 'EB-DeepSeek-V4-Pro',
          apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
          temperature: 0.3,
          configuration: {
            baseURL: window.location.origin + '/inner/',
          },
        })

        const response = await llm.invoke(langChainMessages)
        this.messages[aiMsgIndex].content = response.content
      } catch (err) {
        console.error('[Stage5 Error]', err)
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
    },
  },
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
  margin-bottom: 8px;
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

.btn-init {
  padding: 6px 16px;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.btn-init:hover {
  background: #2563eb;
}

.knowledge-preview {
  margin-top: 8px;
}

.preview-title {
  font-weight: 600;
  font-size: 13px;
  color: #0369a1;
  margin-bottom: 4px;
}

.preview-list {
  max-height: 120px;
  overflow-y: auto;
}

.preview-item {
  font-size: 12px;
  color: #64748b;
  padding: 2px 0;
  border-bottom: 1px solid #e0f2fe;
}

.preview-index {
  color: #3b82f6;
  font-weight: 600;
  margin-right: 4px;
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