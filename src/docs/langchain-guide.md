# LangChain 详细指南

> LangChain 是一个用于构建 LLM 驱动应用程序的框架。它提供了标准化的组件接口、灵活的链式调用、丰富的工具集成，以及强大的 Agent 能力。支持 Python 和 JavaScript/TypeScript 两个版本。

---

## 目录

1. [概述与核心概念](#1-概述与核心概念)
2. [安装与快速开始](#2-安装与快速开始)
3. [Model I/O — 模型交互层](#3-model-io--模型交互层)
   - [3.1 LLM / Chat Model](#31-llm--chat-model)
   - [3.2 Prompt Template](#32-prompt-template)
   - [3.3 Output Parser](#33-output-parser)
4. [Retrieval — 检索增强生成 (RAG)](#4-retrieval--检索增强生成-rag)
   - [4.1 Document Loader](#41-document-loader)
   - [4.2 Text Splitter](#42-text-splitter)
   - [4.3 Embedding](#43-embedding)
   - [4.4 Vector Store](#44-vector-store)
   - [4.5 Retriever](#45-retriever)
5. [Chains — 链式调用](#5-chains--链式调用)
   - [5.1 LCEL (LangChain Expression Language)](#51-lcel-langchain-expression-language)
   - [5.2 内置 Chain 类型](#52-内置-chain-类型)
6. [Agents — 智能代理](#6-agents--智能代理)
   - [6.1 Agent 核心概念](#61-agent-核心概念)
   - [6.2 Tool 定义](#62-tool-定义)
   - [6.3 Agent Executor](#63-agent-executor)
   - [6.4 ReAct Agent](#64-react-agent)
   - [6.5 OpenAI Functions Agent](#65-openai-functions-agent)
   - [6.6 自定义 Agent](#66-自定义-agent)
7. [Memory — 记忆系统](#7-memory--记忆系统)
8. [Callbacks — 回调系统](#8-callbacks--回调系统)
9. [LangGraph — 状态图工作流](#9-langgraph--状态图工作流)
10. [LangSmith — 调试与监控](#10-langsmith--调试与监控)
11. [完整示例：RAG 问答系统](#11-完整示例rag-问答系统)
12. [完整示例：多工具 Agent](#12-完整示例多工具-agent)
13. [LangChain.js 前端集成](#13-langchainjs-前端集成)
14. [最佳实践](#14-最佳实践)

---

## 1. 概述与核心概念

### 1.1 什么是 LangChain？

LangChain 是一个**模块化框架**，将 LLM 应用开发中的常见模式抽象为标准组件：

```
┌──────────────────────────────────────────────────────────────┐
│                      LangChain 架构                            │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ Model I/O │  │Retrieval │  │  Chains  │  │   Agents     │ │
│  │ 模型交互  │  │ 检索增强 │  │ 链式调用 │  │  智能代理    │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘ │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │  Memory  │  │Callbacks │  │LangGraph │  │  LangSmith   │ │
│  │  记忆    │  │  回调    │  │ 状态图   │  │  调试监控    │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘ │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 核心设计理念

| 概念 | 说明 | 前端类比 |
|------|------|---------|
| **Model** | 统一的 LLM 接口，屏蔽不同 Provider 差异 | 类似 axios 统一 HTTP 请求 |
| **Prompt Template** | 参数化的提示词模板 | 类似模板字符串 / JSX |
| **Chain** | 将多个组件串联成管道 | 类似 Promise 链 / RxJS pipe |
| **Agent** | LLM 自主决策调用哪些工具 | 类似状态机 + 中间件 |
| **Memory** | 对话历史管理 | 类似 Redux store |
| **Retriever** | 从外部数据源检索相关文档 | 类似搜索引擎 API |

### 1.3 Python vs JavaScript 版本

| 特性 | Python (`langchain`) | JavaScript (`langchain`) |
|------|---------------------|--------------------------|
| 生态成熟度 | ⭐⭐⭐⭐⭐ 最全 | ⭐⭐⭐ 快速增长 |
| 文档质量 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| LangGraph 支持 | ✅ 完整 | ✅ 完整 |
| LangSmith 集成 | ✅ | ✅ |
| 社区规模 | 最大 | 较大 |
| 适合场景 | 后端/数据处理 | 全栈/前端友好 |

---

## 2. 安装与快速开始

### 2.1 Python 安装

```bash
# 核心库
pip install langchain

# LLM Provider
pip install langchain-openai
pip install langchain-anthropic
pip install langchain-google-genai

# 向量数据库
pip install langchain-chroma
pip install langchain-pinecone

# 工具
pip install langchain-community  # 社区集成
pip install langgraph            # 状态图工作流
pip install langsmith            # 调试监控
```

### 2.2 JavaScript/TypeScript 安装

```bash
# 核心库
npm install langchain

# LLM Provider
npm install @langchain/openai
npm install @langchain/anthropic
npm install @langchain/google-genai

# 向量数据库
npm install @langchain/community
npm install chromadb

# 工具
npm install @langchain/langgraph
npm install langsmith
```

### 2.3 最小示例

**Python 版本：**

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# 1. 创建模型
llm = ChatOpenAI(model="gpt-4o", temperature=0.7)

# 2. 创建提示词模板
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个有帮助的助手，用中文回答。"),
    ("user", "{input}")
])

# 3. 创建输出解析器
output_parser = StrOutputParser()

# 4. 构建链
chain = prompt | llm | output_parser

# 5. 调用
response = chain.invoke({"input": "什么是 LangChain？"})
print(response)
```

**JavaScript/TypeScript 版本：**

```typescript
import { ChatOpenAI } from "@langchain/openai"
import { ChatPromptTemplate } from "@langchain/core/prompts"
import { StringOutputParser } from "@langchain/core/output_parsers"

// 1. 创建模型
const llm = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0.7,
})

// 2. 创建提示词模板
const prompt = ChatPromptTemplate.fromMessages([
  ["system", "你是一个有帮助的助手，用中文回答。"],
  ["user", "{input}"],
])

// 3. 创建输出解析器
const outputParser = new StringOutputParser()

// 4. 构建链
const chain = prompt.pipe(llm).pipe(outputParser)

// 5. 调用
const response = await chain.invoke({ input: "什么是 LangChain？" })
console.log(response)
```

---

## 3. Model I/O — 模型交互层

### 3.1 LLM / Chat Model

LangChain 提供统一的模型接口，支持多种 Provider：

```python
# Python
from langchain_openai import ChatOpenAI, OpenAI
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI

# OpenAI
llm = ChatOpenAI(
    model="gpt-4o",
    temperature=0.7,
    max_tokens=1000,
    api_key="sk-xxx",  # 或通过环境变量 OPENAI_API_KEY
)

# Anthropic Claude
llm = ChatAnthropic(
    model="claude-3-5-sonnet-20241022",
    temperature=0.7,
)

# Google Gemini
llm = ChatGoogleGenerativeAI(
    model="gemini-1.5-pro",
    temperature=0.7,
)

# 调用方式
# 同步
response = llm.invoke("你好")
print(response.content)

# 异步
response = await llm.ainvoke("你好")

# 流式
for chunk in llm.stream("写一首诗"):
    print(chunk.content, end="", flush=True)

# 批量
responses = llm.batch(["问题1", "问题2", "问题3"])
```

```typescript
// TypeScript
import { ChatOpenAI } from "@langchain/openai"
import { ChatAnthropic } from "@langchain/anthropic"

const llm = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0.7,
  maxTokens: 1000,
})

// 调用方式
const response = await llm.invoke("你好")
console.log(response.content)

// 流式
const stream = await llm.stream("写一首诗")
for await (const chunk of stream) {
  process.stdout.write(chunk.content)
}
```

### 3.2 Prompt Template

#### 基础模板

```python
# Python
from langchain_core.prompts import PromptTemplate, ChatPromptTemplate

# 字符串模板
template = PromptTemplate.from_template("请用{language}解释{topic}")
prompt = template.format(language="中文", topic="量子计算")
# 结果: "请用中文解释量子计算"

# 对话模板
chat_template = ChatPromptTemplate.from_messages([
    ("system", "你是一个{role}，用{language}回答。"),
    ("user", "{input}"),
])

messages = chat_template.format_messages(
    role="数学老师",
    language="中文",
    input="什么是微积分？"
)
```

#### Few-Shot 模板

```python
# Python
from langchain_core.prompts import FewShotChatMessagePromptTemplate

examples = [
    {"input": "1+1=?", "output": "1+1=2"},
    {"input": "2*3=?", "output": "2*3=6"},
]

example_prompt = ChatPromptTemplate.from_messages([
    ("user", "{input}"),
    ("assistant", "{output}"),
])

few_shot_prompt = FewShotChatMessagePromptTemplate(
    example_prompt=example_prompt,
    examples=examples,
)

final_prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个数学助手"),
    few_shot_prompt,
    ("user", "{input}"),
])
```

#### 消息占位符（动态消息列表）

```python
# Python
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个有帮助的助手"),
    MessagesPlaceholder(variable_name="history"),  # 动态插入对话历史
    ("user", "{input}"),
])

# 使用时传入历史消息
messages = prompt.format_messages(
    history=[
        ("user", "你好"),
        ("assistant", "你好！有什么可以帮助你的？"),
    ],
    input="今天天气怎么样？"
)
```

```typescript
// TypeScript
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts"

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "你是一个有帮助的助手"],
  new MessagesPlaceholder("history"),
  ["user", "{input}"],
])
```

### 3.3 Output Parser

#### 字符串解析器

```python
# Python
from langchain_core.output_parsers import StrOutputParser

parser = StrOutputParser()
chain = prompt | llm | parser
result = chain.invoke({"input": "你好"})
# result 是纯字符串
```

#### 结构化输出解析器

```python
# Python
from langchain_core.output_parsers import JsonOutputParser, PydanticOutputParser
from pydantic import BaseModel, Field

# 方式1：Pydantic 解析器
class Person(BaseModel):
    name: str = Field(description="姓名")
    age: int = Field(description="年龄")
    email: str = Field(description="邮箱")

parser = PydanticOutputParser(pydantic_object=Person)

prompt = ChatPromptTemplate.from_messages([
    ("system", "从文本中提取人物信息。\n{format_instructions}"),
    ("user", "{input}"),
])

# 注入格式说明
prompt = prompt.partial(format_instructions=parser.get_format_instructions())

chain = prompt | llm | parser
result = chain.invoke({"input": "张三，25岁，邮箱是zhangsan@example.com"})
# result 是 Person 对象
print(result.name)  # "张三"
print(result.age)   # 25

# 方式2：JSON 解析器
json_parser = JsonOutputParser()
chain = prompt | llm | json_parser
result = chain.invoke({"input": "..."})
# result 是 dict
```

```typescript
// TypeScript - 使用 Zod
import { z } from "zod"
import { StructuredOutputParser } from "@langchain/core/output_parsers"

const personSchema = z.object({
  name: z.string().describe("姓名"),
  age: z.number().describe("年龄"),
  email: z.string().describe("邮箱"),
})

const parser = StructuredOutputParser.fromZodSchema(personSchema)

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "从文本中提取人物信息。\n{format_instructions}"],
  ["user", "{input}"],
])

const chain = prompt.pipe(llm).pipe(parser)
const result = await chain.invoke({
  input: "张三，25岁，邮箱是zhangsan@example.com",
  format_instructions: parser.getFormatInstructions(),
})
```

#### 自定义解析器

```python
# Python
from langchain_core.output_parsers import BaseOutputParser

class CommaSeparatedParser(BaseOutputParser[list[str]]):
    """将逗号分隔的字符串解析为列表"""

    def parse(self, text: str) -> list[str]:
        return [item.strip() for item in text.split(",")]

    @property
    def _type(self) -> str:
        return "comma_separated"

parser = CommaSeparatedParser()
chain = prompt | llm | parser
result = chain.invoke({"input": "列出三种编程语言"})
# result: ["Python", "JavaScript", "Go"]
```

---

## 4. Retrieval — 检索增强生成 (RAG)

RAG 是 LangChain 最核心的应用模式之一：

```
文档加载 → 文本分割 → 向量嵌入 → 向量存储 → 相似检索 → 注入 LLM 上下文
```

### 4.1 Document Loader

```python
# Python
from langchain_community.document_loaders import (
    TextLoader,           # 文本文件
    PyPDFLoader,          # PDF
    CSVLoader,            # CSV
    UnstructuredMarkdownLoader,  # Markdown
    WebBaseLoader,        # 网页
    DirectoryLoader,      # 目录批量加载
)

# 加载文本文件
loader = TextLoader("data/readme.txt")
documents = loader.load()

# 加载 PDF
loader = PyPDFLoader("data/report.pdf")
documents = loader.load()

# 加载网页
loader = WebBaseLoader("https://example.com/article")
documents = loader.load()

# 批量加载目录
loader = DirectoryLoader("data/", glob="**/*.md")
documents = loader.load()

# 每个 Document 包含:
# - page_content: 文本内容
# - metadata: 元数据（来源、页码等）
```

```typescript
// TypeScript
import { TextLoader } from "langchain/document_loaders/fs/text"
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"
import { CheerioWebBaseLoader } from "@langchain/community/document_loaders/web/cheerio"

const loader = new TextLoader("data/readme.txt")
const docs = await loader.load()
```

### 4.2 Text Splitter

```python
# Python
from langchain_text_splitters import (
    RecursiveCharacterTextSplitter,
    CharacterTextSplitter,
    MarkdownHeaderTextSplitter,
)

# 递归字符分割器（最常用）
splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,        # 每块最大字符数
    chunk_overlap=200,      # 块之间重叠字符数
    separators=["\n\n", "\n", "。", "，", " ", ""],  # 分割优先级
    length_function=len,
)

chunks = splitter.split_documents(documents)

# Markdown 按标题分割
headers_to_split_on = [
    ("#", "h1"),
    ("##", "h2"),
    ("###", "h3"),
]
markdown_splitter = MarkdownHeaderTextSplitter(headers_to_split_on)
chunks = markdown_splitter.split_text(markdown_text)
```

### 4.3 Embedding

```python
# Python
from langchain_openai import OpenAIEmbeddings
from langchain_community.embeddings import HuggingFaceEmbeddings

# OpenAI Embedding
embeddings = OpenAIEmbeddings(
    model="text-embedding-3-small",  # 或 text-embedding-3-large
)

# 本地模型（免费）
embeddings = HuggingFaceEmbeddings(
    model_name="BAAI/bge-large-zh-v1.5",  # 中文优化
)

# 使用
vector = embeddings.embed_query("你好世界")
# vector 是 1536 维（OpenAI）或 1024 维（BGE）的浮点数列表

# 批量嵌入
vectors = embeddings.embed_documents(["文本1", "文本2", "文本3"])
```

### 4.4 Vector Store

```python
# Python
from langchain_chroma import Chroma
from langchain_community.vectorstores import FAISS, Pinecone

# Chroma（本地，轻量）
vectorstore = Chroma.from_documents(
    documents=chunks,
    embedding=embeddings,
    persist_directory="./chroma_db",  # 持久化目录
)

# FAISS（高性能，内存）
vectorstore = FAISS.from_documents(
    documents=chunks,
    embedding=embeddings,
)

# 相似度搜索
results = vectorstore.similarity_search("查询文本", k=4)

# 带分数的搜索
results_with_scores = vectorstore.similarity_search_with_score("查询文本", k=4)

# MMR 搜索（最大边际相关性，增加多样性）
results = vectorstore.max_marginal_relevance_search("查询文本", k=4)
```

### 4.5 Retriever

```python
# Python
# 从 Vector Store 创建 Retriever
retriever = vectorstore.as_retriever(
    search_type="similarity",  # "similarity" | "mmr" | "similarity_score_threshold"
    search_kwargs={"k": 4},
)

# 自查询 Retriever（LLM 自动提取过滤条件）
from langchain.retrievers import SelfQueryRetriever

retriever = SelfQueryRetriever.from_llm(
    llm=llm,
    vectorstore=vectorstore,
    document_content_description="技术文档",
    metadata_field_info=[...],
)

# 多查询 Retriever（生成多个查询变体提高召回率）
from langchain.retrievers import MultiQueryRetriever

retriever = MultiQueryRetriever.from_llm(
    retriever=vectorstore.as_retriever(),
    llm=llm,
)
```

#### 完整 RAG Chain

```python
# Python
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

# 构建 RAG Chain
def format_docs(docs):
    return "\n\n".join(doc.page_content for doc in docs)

rag_chain = (
    {
        "context": retriever | format_docs,  # 检索 + 格式化
        "question": RunnablePassthrough(),    # 原样传递问题
    }
    | prompt
    | llm
    | StrOutputParser()
)

# 使用
answer = rag_chain.invoke("什么是 RAG？")
print(answer)
```

---

## 5. Chains — 链式调用

### 5.1 LCEL (LangChain Expression Language)

LCEL 是 LangChain 的核心编排语法，使用 `|` 管道操作符连接组件：

```python
# Python
from langchain_core.runnables import RunnablePassthrough, RunnableLambda

# 基础管道
chain = prompt | llm | output_parser

# 并行执行
from langchain_core.runnables import RunnableParallel

chain = RunnableParallel(
    summary=summary_chain,    # 生成摘要
    keywords=keywords_chain,  # 提取关键词
    sentiment=sentiment_chain, # 情感分析
)
result = chain.invoke({"text": "..."})
# result: {"summary": "...", "keywords": [...], "sentiment": "positive"}

# 条件分支
from langchain_core.runnables import RunnableBranch

chain = RunnableBranch(
    (lambda x: len(x["text"]) < 100, short_chain),   # 短文本
    (lambda x: len(x["text"]) < 1000, medium_chain),  # 中等文本
    long_chain,  # 默认：长文本
)

# 自定义函数
def custom_transform(input_dict):
    return {"processed": input_dict["raw"].upper()}

chain = prompt | llm | RunnableLambda(custom_transform)

# 回退策略
chain = primary_llm.with_fallbacks([backup_llm, fallback_llm])
```

```typescript
// TypeScript
import { RunnableSequence, RunnablePassthrough } from "@langchain/core/runnables"

const chain = RunnableSequence.from([
  prompt,
  llm,
  outputParser,
])

// 并行
const parallelChain = RunnableSequence.from([
  {
    summary: summaryChain,
    keywords: keywordsChain,
  },
])
```

### 5.2 内置 Chain 类型

```python
# Python

# 1. LLMChain — 基础链
from langchain.chains import LLMChain
chain = LLMChain(llm=llm, prompt=prompt)

# 2. ConversationChain — 对话链（带记忆）
from langchain.chains import ConversationChain
from langchain.memory import ConversationBufferMemory

chain = ConversationChain(
    llm=llm,
    memory=ConversationBufferMemory(),
)

# 3. RetrievalQA — 检索问答链
from langchain.chains import RetrievalQA

qa_chain = RetrievalQA.from_chain_type(
    llm=llm,
    chain_type="stuff",  # stuff | map_reduce | refine | map_rerank
    retriever=retriever,
)

# 4. SummarizationChain — 摘要链
from langchain.chains.summarize import load_summarize_chain

chain = load_summarize_chain(
    llm=llm,
    chain_type="map_reduce",  # stuff | map_reduce | refine
)

# 5. SQLDatabaseChain — 数据库查询链
from langchain_community.utilities import SQLDatabase
from langchain.chains import create_sql_query_chain

db = SQLDatabase.from_uri("sqlite:///data.db")
chain = create_sql_query_chain(llm, db)
```

---

## 6. Agents — 智能代理

### 6.1 Agent 核心概念

```
┌─────────────────────────────────────────────┐
│                  Agent Loop                   │
│                                              │
│  用户输入 → Agent 思考 → 选择工具 → 执行工具  │
│       ↑                          ↓           │
│       └──── 观察结果 ←───────────┘           │
│                    ↓ (任务完成)               │
│                 生成最终回复                   │
└─────────────────────────────────────────────┘
```

Agent 三要素：

| 要素 | 说明 |
|------|------|
| **LLM** | 推理引擎，决定使用哪个工具 |
| **Tools** | 可调用的外部功能（搜索、计算、API 等） |
| **Agent Executor** | 执行循环，管理 Agent 的思考-行动-观察循环 |

### 6.2 Tool 定义

```python
# Python
from langchain_core.tools import tool
from pydantic import BaseModel, Field

# 方式1：装饰器定义
@tool
def search_web(query: str) -> str:
    """搜索互联网获取信息。"""
    # 实际搜索逻辑
    return f"搜索结果: {query} 的相关信息..."

@tool
def calculator(expression: str) -> str:
    """执行数学计算。输入数学表达式，返回计算结果。"""
    try:
        return str(eval(expression))
    except Exception as e:
        return f"计算错误: {e}"

# 方式2：类定义（复杂工具）
class WeatherInput(BaseModel):
    city: str = Field(description="城市名称")

@tool(args_schema=WeatherInput)
def get_weather(city: str) -> str:
    """获取指定城市的天气信息。"""
    return f"{city}今天晴，25°C"

# 方式3：StructuredTool
from langchain_core.tools import StructuredTool

def query_database(sql: str) -> str:
    """执行 SQL 查询"""
    # 实际数据库查询
    return "查询结果: [...]"

db_tool = StructuredTool.from_function(
    func=query_database,
    name="query_database",
    description="执行 SQL 查询数据库",
)
```

```typescript
// TypeScript
import { tool } from "@langchain/core/tools"
import { z } from "zod"

const searchWeb = tool(
  async ({ query }: { query: string }) => {
    return `搜索结果: ${query} 的相关信息...`
  },
  {
    name: "search_web",
    description: "搜索互联网获取信息",
    schema: z.object({
      query: z.string().describe("搜索关键词"),
    }),
  }
)
```

### 6.3 Agent Executor

```python
# Python
from langchain.agents import AgentExecutor, create_react_agent
from langchain_openai import ChatOpenAI

# 定义工具列表
tools = [search_web, calculator, get_weather]

# 创建 Agent
llm = ChatOpenAI(model="gpt-4o", temperature=0)

agent = create_react_agent(llm, tools, prompt)

# 创建 Executor
agent_executor = AgentExecutor(
    agent=agent,
    tools=tools,
    verbose=True,           # 打印详细日志
    max_iterations=10,      # 最大迭代次数
    handle_parsing_errors=True,  # 处理解析错误
    return_intermediate_steps=True,  # 返回中间步骤
)

# 执行
result = agent_executor.invoke({
    "input": "北京今天天气怎么样？如果温度超过30度，计算30度的华氏温度"
})

print(result["output"])
# 中间步骤
for step in result["intermediate_steps"]:
    action, observation = step
    print(f"工具: {action.tool}, 输入: {action.tool_input}")
    print(f"结果: {observation}")
```

### 6.4 ReAct Agent

ReAct（Reasoning + Acting）是最经典的 Agent 模式：

```python
# Python
from langchain import hub
from langchain.agents import create_react_agent, AgentExecutor

# 从 LangChain Hub 加载 ReAct 提示词
prompt = hub.pull("hwchase17/react")

# 或自定义提示词
from langchain_core.prompts import PromptTemplate

react_template = """尽你所能回答以下问题。你可以使用以下工具：

{tools}

使用以下格式：

Question: 需要回答的问题
Thought: 你应该思考该怎么做
Action: 要使用的工具，必须是 [{tool_names}] 之一
Action Input: 工具的输入
Observation: 工具返回的结果
... (这个 Thought/Action/Action Input/Observation 可以重复多次)
Thought: 我现在知道最终答案了
Final Answer: 对原始问题的最终答案

开始！

Question: {input}
Thought: {agent_scratchpad}"""

prompt = PromptTemplate.from_template(react_template)

# 创建 Agent
agent = create_react_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

result = executor.invoke({"input": "2024年奥运会金牌最多的国家是哪个？"})
```

### 6.5 OpenAI Functions Agent

利用 OpenAI 原生 Function Calling 能力：

```python
# Python
from langchain.agents import create_openai_functions_agent

# 创建 Agent（自动使用 OpenAI Function Calling）
agent = create_openai_functions_agent(llm, tools, prompt)

executor = AgentExecutor(
    agent=agent,
    tools=tools,
    verbose=True,
)

result = executor.invoke({"input": "搜索 LangChain 的最新版本，然后计算 2 的 10 次方"})
```

### 6.6 自定义 Agent

```python
# Python
from langchain.agents import create_tool_calling_agent

# 使用 Tool Calling Agent（通用，支持多种模型）
agent = create_tool_calling_agent(llm, tools, prompt)

executor = AgentExecutor(
    agent=agent,
    tools=tools,
    verbose=True,
    max_iterations=5,
    early_stopping_method="generate",  # force | generate
)

# 流式执行
async for chunk in executor.astream({"input": "..."}):
    print(chunk)
```

---

## 7. Memory — 记忆系统

```python
# Python
from langchain.memory import (
    ConversationBufferMemory,
    ConversationBufferWindowMemory,
    ConversationSummaryMemory,
    ConversationSummaryBufferMemory,
    ConversationTokenBufferMemory,
)

# 1. 缓冲记忆 — 保存所有对话
memory = ConversationBufferMemory(
    memory_key="history",
    return_messages=True,
)

# 2. 窗口记忆 — 只保留最近 K 轮对话
memory = ConversationBufferWindowMemory(
    memory_key="history",
    k=5,  # 只保留最近 5 轮
    return_messages=True,
)

# 3. 摘要记忆 — 用 LLM 摘要历史对话
memory = ConversationSummaryMemory(
    llm=llm,
    memory_key="history",
    return_messages=True,
)

# 4. 摘要缓冲记忆 — 窗口 + 摘要混合
memory = ConversationSummaryBufferMemory(
    llm=llm,
    max_token_limit=2000,  # 超过此限制时自动摘要
    memory_key="history",
    return_messages=True,
)

# 5. Token 缓冲记忆 — 按 Token 数限制
memory = ConversationTokenBufferMemory(
    llm=llm,
    max_token_limit=1000,
    memory_key="history",
    return_messages=True,
)

# 使用记忆
from langchain.chains import ConversationChain

chain = ConversationChain(
    llm=llm,
    memory=memory,
    verbose=True,
)

chain.invoke("我叫张三")
chain.invoke("我叫什么名字？")  # 能记住之前的对话
```

```typescript
// TypeScript
import { BufferMemory, BufferWindowMemory } from "langchain/memory"

const memory = new BufferMemory({
  memoryKey: "history",
  returnMessages: true,
})

const windowMemory = new BufferWindowMemory({
  memoryKey: "history",
  k: 5,
  returnMessages: true,
})
```

---

## 8. Callbacks — 回调系统

```python
# Python
from langchain.callbacks import StdOutCallbackHandler
from langchain_core.callbacks import BaseCallbackHandler

# 自定义回调处理器
class MyCallbackHandler(BaseCallbackHandler):
    def on_llm_start(self, serialized, prompts, **kwargs):
        print(f"🚀 LLM 开始调用，prompts: {prompts}")

    def on_llm_end(self, response, **kwargs):
        print(f"✅ LLM 调用完成")

    def on_llm_error(self, error, **kwargs):
        print(f"❌ LLM 错误: {error}")

    def on_tool_start(self, serialized, input_str, **kwargs):
        print(f"🔧 工具开始: {serialized['name']}, 输入: {input_str}")

    def on_tool_end(self, output, **kwargs):
        print(f"✅ 工具完成: {output}")

    def on_agent_action(self, action, **kwargs):
        print(f"🤔 Agent 行动: {action.tool}, 输入: {action.tool_input}")

    def on_agent_finish(self, finish, **kwargs):
        print(f"🎯 Agent 完成: {finish.return_values}")

# 使用回调
callback = MyCallbackHandler()

chain.invoke(
    {"input": "你好"},
    config={"callbacks": [callback]},
)

# 全局回调
from langchain.globals import set_debug
set_debug(True)  # 开启全局调试模式
```

---

## 9. LangGraph — 状态图工作流

LangGraph 是 LangChain 的状态图引擎，用于构建复杂的多步骤 Agent 工作流：

```python
# Python
from typing import TypedDict, Annotated, Sequence
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolExecutor
import operator

# 1. 定义状态
class AgentState(TypedDict):
    messages: Annotated[Sequence[dict], operator.add]
    next: str

# 2. 定义节点函数
def call_model(state):
    """调用 LLM"""
    messages = state["messages"]
    response = llm.invoke(messages)
    return {"messages": [response]}

def should_continue(state):
    """判断是否继续"""
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "action"
    return "end"

def call_tool(state):
    """执行工具"""
    last_message = state["messages"][-1]
    tool_calls = last_message.tool_calls

    tool_executor = ToolExecutor(tools)
    responses = []
    for tool_call in tool_calls:
        response = tool_executor.invoke(tool_call)
        responses.append(response)

    return {"messages": responses}

# 3. 构建图
workflow = StateGraph(AgentState)

# 添加节点
workflow.add_node("agent", call_model)
workflow.add_node("action", call_tool)

# 设置入口
workflow.set_entry_point("agent")

# 添加边
workflow.add_conditional_edges(
    "agent",
    should_continue,
    {
        "action": "action",
        "end": END,
    },
)
workflow.add_edge("action", "agent")  # 工具执行后回到 Agent

# 4. 编译并运行
app = workflow.compile()

result = app.invoke({
    "messages": [{"role": "user", "content": "搜索 LangGraph 并总结"}]
})
```

### LangGraph 高级模式

```python
# Python

# 并行执行
from langgraph.graph import StateGraph

workflow = StateGraph(State)

# 添加多个并行节点
workflow.add_node("analyze_sentiment", sentiment_node)
workflow.add_node("extract_keywords", keywords_node)
workflow.add_node("generate_summary", summary_node)

# 从 agent 分叉到多个节点
workflow.add_edge("agent", "analyze_sentiment")
workflow.add_edge("agent", "extract_keywords")
workflow.add_edge("agent", "generate_summary")

# 汇聚结果
workflow.add_edge("analyze_sentiment", "merge")
workflow.add_edge("extract_keywords", "merge")
workflow.add_edge("generate_summary", "merge")

# 带人工审批的工作流
def human_approval(state):
    """需要人工审批"""
    action = state["pending_action"]
    print(f"需要审批: {action}")
    approved = input("批准? (y/n): ")
    if approved.lower() == "y":
        return {"approved": True}
    return {"approved": False}

workflow.add_node("human_approval", human_approval)
workflow.add_conditional_edges(
    "human_approval",
    lambda s: "execute" if s["approved"] else "reject",
    {"execute": "execute_action", "reject": END},
)
```

---

## 10. LangSmith — 调试与监控

```python
# Python
# 设置环境变量
# LANGCHAIN_TRACING_V2=true
# LANGCHAIN_API_KEY=your-api-key
# LANGCHAIN_PROJECT=my-project

import os
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_API_KEY"] = "your-api-key"
os.environ["LANGCHAIN_PROJECT"] = "my-agent-project"

# 所有 LangChain 调用会自动追踪到 LangSmith

# 手动创建 Run
from langsmith import Client

client = Client()

# 创建数据集
dataset = client.create_dataset(
    dataset_name="qa-test-set",
    description="问答测试集",
)

# 添加测试用例
client.create_examples(
    inputs=[
        {"question": "什么是 RAG？"},
        {"question": "LangChain 支持哪些模型？"},
    ],
    outputs=[
        {"answer": "RAG 是检索增强生成..."},
        {"answer": "LangChain 支持 OpenAI、Anthropic..."},
    ],
    dataset_id=dataset.id,
)

# 评估
from langsmith.evaluation import evaluate

results = evaluate(
    lambda x: chain.invoke(x),
    data=dataset.name,
    evaluators=[
        "qa",           # 问答准确性
        "context_relevance",  # 上下文相关性
    ],
)
```

---

## 11. 完整示例：RAG 问答系统

```python
# Python — 完整的 RAG 问答系统
import os
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.document_loaders import DirectoryLoader, TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough

# ============================================================
# 1. 加载文档
# ============================================================
loader = DirectoryLoader(
    "./docs/",
    glob="**/*.md",
    loader_cls=TextLoader,
)
documents = loader.load()
print(f"加载了 {len(documents)} 个文档")

# ============================================================
# 2. 分割文档
# ============================================================
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    separators=["\n\n", "\n", "。", "，", " ", ""],
)
chunks = text_splitter.split_documents(documents)
print(f"分割为 {len(chunks)} 个块")

# ============================================================
# 3. 创建向量存储
# ============================================================
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

vectorstore = Chroma.from_documents(
    documents=chunks,
    embedding=embeddings,
    persist_directory="./chroma_db",
)

# ============================================================
# 4. 创建 Retriever
# ============================================================
retriever = vectorstore.as_retriever(
    search_type="similarity",
    search_kwargs={"k": 4},
)

# ============================================================
# 5. 构建 RAG Prompt
# ============================================================
template = """你是一个知识库问答助手。请根据以下上下文回答问题。
如果上下文中没有相关信息，请如实说不知道。

上下文：
{context}

问题：{question}

回答："""

prompt = ChatPromptTemplate.from_template(template)

# ============================================================
# 6. 创建 LLM
# ============================================================
llm = ChatOpenAI(
    model="gpt-4o",
    temperature=0.3,
    max_tokens=1000,
)

# ============================================================
# 7. 构建 RAG Chain
# ============================================================
def format_docs(docs):
    return "\n\n".join(
        f"[来源: {doc.metadata.get('source', 'unknown')}]\n{doc.page_content}"
        for doc in docs
    )

rag_chain = (
    {
        "context": retriever | format_docs,
        "question": RunnablePassthrough(),
    }
    | prompt
    | llm
    | StrOutputParser()
)

# ============================================================
# 8. 使用
# ============================================================
if __name__ == "__main__":
    # 单次查询
    answer = rag_chain.invoke("什么是 LangChain？")
    print(f"回答: {answer}")

    # 交互式问答
    print("\n=== RAG 问答系统 ===")
    print("输入 'quit' 退出\n")

    while True:
        question = input("\n你的问题: ")
        if question.lower() == "quit":
            break

        # 流式输出
        print("回答: ", end="", flush=True)
        for chunk in rag_chain.stream(question):
            print(chunk, end="", flush=True)
        print()
```

---

## 12. 完整示例：多工具 Agent

```python
# Python — 多工具 Agent
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langchain.agents import create_openai_functions_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from pydantic import BaseModel, Field
import json
import datetime

# ============================================================
# 1. 定义工具
# ============================================================

@tool
def get_current_time() -> str:
    """获取当前日期和时间"""
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

@tool
def search_knowledge_base(query: str) -> str:
    """搜索内部知识库"""
    # 模拟知识库
    knowledge = {
        "公司地址": "杭州市滨江区江南大道 3588 号",
        "工作时间": "周一至周五 9:00-18:00",
        "CEO": "张伟",
    }
    for key, value in knowledge.items():
        if query in key:
            return value
    return f"未找到关于 '{query}' 的信息"

class CalculatorInput(BaseModel):
    expression: str = Field(description="数学表达式，如 '2 + 3 * 4'")

@tool(args_schema=CalculatorInput)
def calculator(expression: str) -> str:
    """执行数学计算"""
    try:
        result = eval(expression)
        return f"{expression} = {result}"
    except Exception as e:
        return f"计算错误: {e}"

class EmailInput(BaseModel):
    to: str = Field(description="收件人邮箱")
    subject: str = Field(description="邮件主题")
    body: str = Field(description="邮件正文")

@tool(args_schema=EmailInput)
def send_email(to: str, subject: str, body: str) -> str:
    """发送邮件（模拟）"""
    return f"邮件已发送到 {to}，主题: {subject}"

# ============================================================
# 2. 创建 Agent
# ============================================================
tools = [get_current_time, search_knowledge_base, calculator, send_email]

llm = ChatOpenAI(model="gpt-4o", temperature=0)

prompt = ChatPromptTemplate.from_messages([
    ("system", """你是一个智能助手，可以：
1. 获取当前时间
2. 搜索公司内部知识库
3. 执行数学计算
4. 发送邮件

请逐步思考，在需要时使用工具。用中文回答。"""),
    MessagesPlaceholder(variable_name="chat_history"),
    ("user", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])

agent = create_openai_functions_agent(llm, tools, prompt)

executor = AgentExecutor(
    agent=agent,
    tools=tools,
    verbose=True,
    max_iterations=10,
    handle_parsing_errors=True,
    return_intermediate_steps=True,
)

# ============================================================
# 3. 使用
# ============================================================
if __name__ == "__main__":
    # 复杂任务
    result = executor.invoke({
        "input": "现在几点了？搜索公司地址，然后计算从公司到西湖的距离（假设距离是 5.2 公里），最后把结果发邮件给 admin@company.com",
        "chat_history": [],
    })

    print(f"\n最终回答: {result['output']}")

    # 查看中间步骤
    print("\n=== 中间步骤 ===")
    for i, (action, observation) in enumerate(result["intermediate_steps"]):
        print(f"\n步骤 {i+1}:")
        print(f"  工具: {action.tool}")
        print(f"  输入: {action.tool_input}")
        print(f"  结果: {observation}")
```

---

## 13. LangChain.js 前端集成

### 13.1 在 Node.js 后端使用

```typescript
// server.ts — Express + LangChain.js
import express from "express"
import { ChatOpenAI } from "@langchain/openai"
import { ChatPromptTemplate } from "@langchain/core/prompts"
import { StringOutputParser } from "@langchain/core/output_parsers"

const app = express()
app.use(express.json())

app.post("/api/chat", async (req, res) => {
  const { message } = req.body

  const llm = new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0.7,
    streaming: true,
  })

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", "你是一个有帮助的助手，用中文回答。"],
    ["user", "{input}"],
  ])

  const chain = prompt.pipe(llm).pipe(new StringOutputParser())

  // 流式响应
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")

  const stream = await chain.stream({ input: message })
  for await (const chunk of stream) {
    res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`)
  }
  res.write("data: [DONE]\n\n")
  res.end()
})

app.listen(3000)
```

### 13.2 在浏览器中直接使用（不推荐生产环境）

```typescript
// 浏览器端使用 LangChain.js（需要 Vite/Webpack 打包）
import { ChatOpenAI } from "@langchain/openai"

// 注意：API Key 不应暴露在前端，仅用于开发测试
const llm = new ChatOpenAI({
  model: "gpt-4o-mini",
  apiKey: "sk-xxx",  // 生产环境应通过后端代理
  temperature: 0.7,
})

const response = await llm.invoke("你好")
console.log(response.content)
```

### 13.3 与 Vue/React 集成

```vue
<!-- Vue 3 + LangChain.js 后端 -->
<script setup>
import { ref } from 'vue'

const messages = ref([])
const input = ref('')
const loading = ref(false)

async function sendMessage() {
  if (!input.value.trim() || loading.value) return

  const userMessage = input.value
  messages.value.push({ role: 'user', content: userMessage })
  input.value = ''
  loading.value = true

  // 添加 AI 占位消息
  messages.value.push({ role: 'assistant', content: '' })

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMessage }),
    })

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          const { content } = JSON.parse(line.substring(6))
          const lastMsg = messages.value[messages.value.length - 1]
          lastMsg.content += content
        }
      }
    }
  } catch (error) {
    console.error('Error:', error)
  } finally {
    loading.value = false
  }
}
</script>
```

---

## 14. 最佳实践

### 14.1 性能优化

```python
# 1. 使用异步调用
import asyncio

async def process_batch(questions: list[str]):
    tasks = [chain.ainvoke({"input": q}) for q in questions]
    return await asyncio.gather(*tasks)

# 2. 使用缓存
from langchain.globals import set_llm_cache
from langchain.cache import InMemoryCache, SQLiteCache

set_llm_cache(InMemoryCache())  # 内存缓存
# 或
set_llm_cache(SQLiteCache(database_path=".langchain.db"))  # 持久化缓存

# 3. 使用更小的模型做简单任务
from langchain_openai import ChatOpenAI

# 路由：简单问题用小模型，复杂问题用大模型
def route_question(question: str):
    if len(question) < 50:
        return ChatOpenAI(model="gpt-4o-mini")
    return ChatOpenAI(model="gpt-4o")

# 4. 批量处理
from langchain_core.runnables import RunnableLambda

batch_chain = chain.map()  # 自动并行处理列表输入
results = batch_chain.invoke([{"input": q1}, {"input": q2}, {"input": q3}])
```

### 14.2 错误处理

```python
from langchain_core.runnables import RunnableLambda
import time

# 带重试的 Chain
def with_retry(chain, max_retries=3, delay=1):
    def retry_fn(input):
        for attempt in range(max_retries):
            try:
                return chain.invoke(input)
            except Exception as e:
                if attempt == max_retries - 1:
                    raise
                print(f"重试 {attempt + 1}/{max_retries}: {e}")
                time.sleep(delay * (2 ** attempt))
    return RunnableLambda(retry_fn)

# 带超时的 Chain
chain_with_timeout = chain.with_config({"timeout": 30})

# 带回退的 Chain
chain_with_fallback = primary_chain.with_fallbacks([backup_chain])
```

### 14.3 安全实践

```python
# 1. 输入验证
from pydantic import BaseModel, Field, validator

class SafeInput(BaseModel):
    query: str = Field(..., max_length=1000)

    @validator("query")
    def validate_query(cls, v):
        # 过滤危险字符
        dangerous = ["DROP", "DELETE", "INSERT", "UPDATE"]
        for word in dangerous:
            if word.lower() in v.lower():
                raise ValueError(f"检测到危险关键词: {word}")
        return v

# 2. 输出过滤
def filter_output(text: str) -> str:
    # 移除敏感信息
    import re
    # 移除邮箱
    text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
                  '[EMAIL]', text)
    # 移除手机号
    text = re.sub(r'\b1[3-9]\d{9}\b', '[PHONE]', text)
    return text

# 3. 权限控制
class PermissionedTool:
    def __init__(self, tool, required_permission: str):
        self.tool = tool
        self.required_permission = required_permission

    def run(self, user_permissions: set, **kwargs):
        if self.required_permission not in user_permissions:
            return f"权限不足: 需要 {self.required_permission}"
        return self.tool.run(**kwargs)
```

### 14.4 成本控制

```python
# 1. Token 计数
from langchain.callbacks import get_openai_callback

with get_openai_callback() as cb:
    result = chain.invoke({"input": "..."})
    print(f"总 Token: {cb.total_tokens}")
    print(f"总成本: ${cb.total_cost:.4f}")

# 2. 设置 Token 限制
llm = ChatOpenAI(
    model="gpt-4o",
    max_tokens=500,  # 限制输出长度
)

# 3. 使用更便宜的模型做预处理
def smart_chain(input_text: str):
    # 先用便宜模型判断是否需要复杂处理
    router = ChatOpenAI(model="gpt-4o-mini", max_tokens=10)
    complexity = router.invoke(f"判断复杂度(simple/complex): {input_text[:100]}")

    if "simple" in complexity.content.lower():
        return simple_chain.invoke(input_text)
    return complex_chain.invoke(input_text)
```

---

## 附录：快速参考

### A. 常用类速查

| 类/函数 | 用途 | 模块 |
|---------|------|------|
| `ChatOpenAI` | OpenAI 聊天模型 | `langchain_openai` |
| `ChatPromptTemplate` | 对话提示词模板 | `langchain_core.prompts` |
| `StrOutputParser` | 字符串输出解析 | `langchain_core.output_parsers` |
| `RecursiveCharacterTextSplitter` | 文本分割器 | `langchain_text_splitters` |
| `OpenAIEmbeddings` | OpenAI 嵌入模型 | `langchain_openai` |
| `Chroma` | 向量数据库 | `langchain_chroma` |
| `AgentExecutor` | Agent 执行器 | `langchain.agents` |
| `ConversationBufferMemory` | 对话记忆 | `langchain.memory` |
| `StateGraph` | 状态图工作流 | `langgraph.graph` |
| `tool` | 工具装饰器 | `langchain_core.tools` |

### B. Chain 类型速查

| Chain | 用途 |
|-------|------|
| `LLMChain` | 基础 LLM 调用链 |
| `ConversationChain` | 带记忆的对话链 |
| `RetrievalQA` | 检索问答链 |
| `SummarizationChain` | 文档摘要链 |
| `SQLDatabaseChain` | 数据库查询链 |
| `RouterChain` | 路由分发链 |
| `TransformChain` | 数据转换链 |

### C. Agent 类型速查

| Agent | 特点 |
|-------|------|
| `create_react_agent` | ReAct 模式，通用性强 |
| `create_openai_functions_agent` | OpenAI Function Calling，最稳定 |
| `create_tool_calling_agent` | Tool Calling，多模型支持 |
| `create_structured_chat_agent` | 结构化输出，适合多工具 |

### D. Memory 类型速查

| Memory | 特点 |
|--------|------|
| `ConversationBufferMemory` | 保存全部对话 |
| `ConversationBufferWindowMemory` | 只保留最近 K 轮 |
| `ConversationSummaryMemory` | LLM 摘要历史 |
| `ConversationSummaryBufferMemory` | 窗口 + 摘要混合 |
| `ConversationTokenBufferMemory` | 按 Token 数限制 |

---

> **与 Vercel AI SDK 的对比**：LangChain 生态更成熟、组件更丰富，适合构建复杂的后端 Agent 系统；Vercel AI SDK 更轻量、前端集成更友好，适合快速搭建 AI 聊天应用。两者可以互补使用——后端用 LangChain 构建 Agent 逻辑，前端用 Vercel AI SDK 的 hooks 处理流式渲染。