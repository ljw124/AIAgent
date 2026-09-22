/**
 * 智能客服 Agent — RAG 知识库模块（Stage2 + Stage7）
 *
 * Stage7: 文档加载 → 分片 → 向量存储 → 检索
 * Stage2: LCEL 检索链 retriever.pipe(prompt).pipe(llm).pipe(parser)
 *
 * 纯前端实现，使用 RecursiveCharacterTextSplitter + 内存数组 + bigram Jaccard 相似度
 * 与现有 LangChainStage7RAG.vue 采用相同的检索策略
 */

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'

// ============================================================
// 内置知识库文档（LangChain 学习资料）
// ============================================================
const BUILTIN_DOCUMENTS = [
  {
    title: 'LangChain 概述',
    source: 'LangChain详细指南.md',
    content: `LangChain 是一个用于构建 LLM 驱动应用程序的框架。它提供了标准化的组件接口、灵活的链式调用、丰富的工具集成，以及强大的 Agent 能力。

      核心设计理念：
      - Model：统一的 LLM 接口，屏蔽不同 Provider 差异
      - Prompt Template：参数化的提示词模板
      - Chain：将多个组件串联成管道（LCEL）
      - Agent：LLM 自主决策调用哪些工具
      - Memory：对话历史管理
      - Retriever：从外部数据源检索相关文档`,
  },
  {
    title: 'RAG 检索增强生成',
    source: 'LangChain.js RAG 检索增强生成详解.md',
    content: `RAG（Retrieval-Augmented Generation，检索增强生成）的核心思想：在提问之前，先从外部知识库中检索相关信息，将其作为上下文注入 Prompt，让 LLM 基于真实数据回答。

      RAG 的七大步骤：
      1. 文档加载（Document Loading）— 从文件、网页等来源加载文档
      2. 文档分片（Text Splitting）— 使用 RecursiveCharacterTextSplitter 将长文档切分为小块
      3. 向量化（Embedding）— 将文本转换为向量表示
      4. 向量存储（Vector Store）— 将向量存入 MemoryVectorStore 或 Chroma
      5. 相似度检索（Similarity Search）— 根据用户查询检索最相关的文档片段
      6. Prompt 注入 — 将检索结果注入 System Prompt
      7. LLM 回答 — 基于检索到的文档生成准确回答

      RAG 解决了 LLM 的两个根本问题：知识截止（训练数据有截止日期）和幻觉（对不知道的内容编造答案）。`,
  },
  {
    title: 'Agent 与 Tool Calling',
    source: 'LangChain详细指南.md',
    content: `Agent（智能体）是 LangChain 中最强大的概念之一。Agent = LLM + 工具 + 自主决策循环。

      ReAct 模式（Reasoning + Acting）：
      - Thought（思考）：LLM 分析当前状态，推理下一步该做什么
      - Action（行动）：LLM 执行具体操作（调用工具）
      - Observation（观察）：获取行动结果，作为下一步思考的输入

      使用 createReactAgent() 可以自动处理工具调用循环，无需手动编写 while 循环。

      工具定义使用 tool() 函数，配合 zod schema 定义参数：
      - calculator: 数学计算工具
      - get_weather: 天气查询工具
      - search_knowledge: 知识库搜索工具`,
  },
  {
    title: 'Memory 记忆系统',
    source: 'LangChain.js短期记忆Memory详解.md',
    content: `LangChain.js 提供两层记忆机制：

      短期记忆（MemorySaver）：
      - 基于 LangGraph Checkpoint 机制
      - 生命周期：线程级别（thread_id 隔离）
      - 自动保存每个节点执行后的状态
      - 支持历史回溯和中断恢复

      长期记忆（InMemoryStore）：
      - 基于键值对存储
      - 生命周期：跨线程、跨会话
      - 通过 namespace 命名空间隔离数据
      - 支持向量语义搜索

      典型用法：
      - MemorySaver 记住"这次对话说了什么"
      - InMemoryStore 记住"这个用户是谁、喜欢什么"`,
  },
  {
    title: 'LCEL 链式调用',
    source: 'LangChain详细指南.md',
    content: `LCEL（LangChain Expression Language）使用 .pipe() 方法串联组件，是 LangChain.js 的核心设计模式。

      基本语法：
      const chain = prompt.pipe(model).pipe(parser)

      RAG 检索链示例：
      const chain = RunnableSequence.from([
        { context: retriever, question: input },
        ragPrompt,
        llm,
        outputParser,
      ])

      LCEL 的优势：
      - 类型安全：自动推导输入输出类型
      - 流式支持：自动支持 .stream() 调用
      - 可组合：任意 Runnable 都可以串联`,
  },
  {
    title: 'Prompt 模板',
    source: 'LangChain详细指南.md',
    content: `Prompt Template（提示词模板）是 LangChain 中用于构建动态提示词的工具。

      ChatPromptTemplate.fromMessages() 支持：
      - system 消息：定义 AI 的角色和行为规范
      - human 消息：用户输入占位符
      - placeholder 消息：动态注入历史对话（配合 Memory 使用）

      示例：
      const prompt = ChatPromptTemplate.fromMessages([
        ['system', '你是{role}助手，请用{language}回答'],
        ['human', '{input}'],
      ])

      多租户场景中，每个租户可以有自己的 System Prompt 模板，实现角色和风格的定制化。`,
  },
  {
    title: 'Stream 流式输出',
    source: 'LangChain详细指南.md',
    content: `流式输出（Streaming）允许逐 token 返回 LLM 的生成结果，提升用户体验。

      基本用法：
      const stream = await model.stream('讲个故事')
      for await (const chunk of stream) {
        console.log(chunk.content) // 逐 token 输出
      }

      Agent 流式输出：
      const stream = await agent.stream(inputs, { streamMode: 'values' })
      // streamMode: 'values' 在每个节点执行后返回完整状态

      流式输出的优势：
      - 降低首字延迟（TTFT）
      - 用户可实时看到生成进度
      - 支持中途取消`,
  },
  {
    title: '结构化输出',
    source: 'LangChain详细指南.md',
    content: `结构化输出（Structured Output）让 LLM 按照预定义的 Schema 返回 JSON 格式数据。

      使用 responseFormat + zod schema：
      params.responseFormat = {
        schema: z.object({
          answer: z.string().describe('最终回答'),
          sources: z.array(z.string()).describe('引用来源'),
          confidence: z.number().describe('置信度 0-1'),
        }),
        method: 'jsonSchema',
      }

      结构化输出的优势：
      - 便于程序化处理回复
      - 可提取引用来源和置信度
      - 支持下游系统集成`,
  },
  {
    title: 'Middleware 中间件',
    source: 'LangChain-Python中间件Middleware详解.md',
    content: `中间件（Middleware）允许在 LLM 调用前后插入自定义逻辑。

      LangChain.js 通过 BaseCallbackHandler 实现中间件功能：
      - handleLLMStart：LLM 调用开始
      - handleLLMEnd：LLM 调用结束
      - handleLLMError：LLM 调用出错
      - handleToolStart：工具调用开始
      - handleToolEnd：工具调用结束

      常见中间件应用：
      - 请求日志：记录每次调用的耗时和参数
      - Token 统计：累计 Prompt 和 Completion tokens
      - 错误处理：统一捕获和上报错误`,
  },
]

// ============================================================
// RAG 服务类
// ============================================================
export class RAGService {
  constructor() {
    this.vectorStore = [] // 内存数组模拟向量存储
    this.splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50
    })
    this.docCount = 0
  }

  // ============================================================
  // Stage7 Step 1-4: 文档加载 → 分片 → 存储
  // ============================================================

  /**
   * 初始化内置知识库
   */
  async initBuiltinKnowledge() {
    const allChunks = []

    for (const doc of BUILTIN_DOCUMENTS) {
      const chunks = await this.splitter.splitText(doc.content)
      for (const chunk of chunks) {
        allChunks.push({
          content: chunk,
          metadata: { source: doc.source, title: doc.title }
        })
      }
    }

    this.vectorStore = allChunks
    this.docCount = allChunks.length
    return this.docCount
  }

  /**
   * 从文本内容添加文档到知识库
   */
  async addDocument(content, metadata = {}) {
    const chunks = await this.splitter.splitText(content)
    const docs = chunks.map((chunk) => ({
      content: chunk,
      metadata
    }))

    this.vectorStore.push(...docs)
    this.docCount += docs.length
    return docs.length
  }

  /**
   * 从文件内容添加文档（FileReader 读取后调用）
   */
  async addFile(fileName, content) {
    return this.addDocument(content, {
      source: fileName,
      uploadedAt: new Date().toISOString()
    })
  }

  // ============================================================
  // Stage7 Step 5: 相似度检索
  // 使用 bigram Jaccard + 短查询加权 + 子串包含加分
  // 与 LangChainStage7RAG.vue 相同的检索算法
  // ============================================================

  /**
   * 混合相似度计算
   */
  _similarity(query, document) {
    const q = query.toLowerCase()
    const d = document.toLowerCase()

    // 1. 子串包含检测
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

    // 3. 短查询加权
    let bigramScore
    if (queryBigrams.size <= 6) {
      bigramScore = intersection / queryBigrams.size
    } else {
      const union = queryBigrams.size + docBigrams.size - intersection
      bigramScore = union === 0 ? 0 : intersection / union
    }

    // 4. 综合分数
    return Math.min(bigramScore + containsBonus, 1.0)
  }

  /**
   * 搜索知识库
   * @param {string} query - 搜索查询
   * @param {number} k - 返回结果数
   * @returns {Array<{content: string, metadata: object, score: number}>}
   */
  search(query, k = 3) {
    if (!this.vectorStore || this.vectorStore.length === 0) return []

    const scored = this.vectorStore.map((doc) => ({
      content: doc.content,
      metadata: doc.metadata,
      score: this._similarity(query, doc.content)
    }))

    return scored
      .filter((d) => d.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
  }

  // ============================================================
  // 状态查询
  // ============================================================

  isReady() {
    return this.vectorStore !== null && this.docCount > 0
  }

  getStats() {
    return {
      ready: this.isReady(),
      docCount: this.docCount
    }
  }

  /**
   * 获取知识库预览（前 N 个文档标题）
   */
  getPreview(n = 5) {
    return BUILTIN_DOCUMENTS.slice(0, n).map((d) => d.title)
  }
}