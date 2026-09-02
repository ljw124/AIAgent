<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-01 11:30:00
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-02 17:15:01
 * @Description: 阶段四：Structured Output — 结构化输出
 *   学习目标：让 LLM 输出符合预定义结构的数据（JSON Schema）
 *   核心 API：withStructuredOutput()、zod、StructuredOutputParser
 *   三种方式：① withStructuredOutput + Zod（推荐）② StructuredOutputParser ③ response_format
-->
<template>
  <div>
    <h1>阶段四：Structured Output 结构化输出 <span class="badge stage">学习</span></h1>
    <div class="info-box">
      <strong>学习目标：</strong>让 LLM 输出符合预定义 JSON 结构的数据，而非自由文本<br />
      <strong>核心 API：</strong><code>withStructuredOutput()</code>、<code>zod</code>、<code>StructuredOutputParser</code><br />
      <strong>应用场景：</strong>信息提取、表单填充、数据分类、API 响应格式化
    </div>

    <!-- 方式选择 -->
    <div class="config-section">
      <div class="config-row">
        <label>输出方式：</label>
        <label class="radio-label">
          <input type="radio" v-model="method" value="withStructuredOutput" />
          <span>withStructuredOutput + Zod（推荐）</span>
        </label>
        <label class="radio-label">
          <input type="radio" v-model="method" value="parser" />
          <span>StructuredOutputParser</span>
        </label>
        <label class="radio-label">
          <input type="radio" v-model="method" value="responseFormat" />
          <span>response_format（JSON Mode）</span>
        </label>
      </div>
    </div>

    <!-- 示例选择 -->
    <div class="config-section">
      <div class="config-row">
        <label>示例场景：</label>
        <select v-model="scenario">
          <option value="person">人物信息提取</option>
          <option value="sentiment">情感分析</option>
          <option value="classify">文本分类</option>
        </select>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-section">
      <textarea
        v-model="input"
        :placeholder="scenarioPlaceholder"
        rows="3"
        @keydown.ctrl.enter="send"
      ></textarea>
      <button @click="send" :disabled="loading">
        {{ loading ? '提取中...' : '提取结构化数据 (Ctrl+Enter)' }}
      </button>
      <button @click="clear" class="btn-clear">清空</button>
    </div>

    <div v-if="error" class="error-msg">{{ error }}</div>

    <!-- 结构化结果展示 -->
    <div v-if="structuredResult" class="result-section">
      <div class="result-header">
        <span>📋 结构化输出结果</span>
        <span class="method-badge">{{ methodLabel }}</span>
      </div>
      <div class="result-body">
        <pre class="json-output">{{ formattedResult }}</pre>
      </div>
    </div>

    <!-- 原始响应（调试用） -->
    <details v-if="rawResponse" class="raw-details">
      <summary>查看原始响应</summary>
      <pre class="raw-content">{{ rawResponse }}</pre>
    </details>
  </div>
</template>

<script>
/* global INNER_API_KEY */
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { StructuredOutputParser } from '@langchain/core/output_parsers'
import { z } from 'zod'

// ============================================================
// Zod Schema 定义（三种场景共用）
// ============================================================

// 场景1：人物信息提取
const PersonSchema = z.object({
  name: z.string().describe('人物姓名'),
  age: z.number().optional().describe('年龄（如果提到）'),
  occupation: z.string().describe('职业'),
  skills: z.array(z.string()).describe('技能列表'),
  summary: z.string().describe('一句话总结'),
})

// 场景2：情感分析
const SentimentSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']).describe('情感倾向'),
  confidence: z.number().min(0).max(1).describe('置信度 0-1'),
  keywords: z.array(z.string()).describe('关键情感词'),
  reason: z.string().describe('判断理由'),
})

// 场景3：文本分类
const ClassifySchema = z.object({
  category: z.string().describe('分类类别'),
  subCategory: z.string().optional().describe('子类别'),
  tags: z.array(z.string()).describe('标签列表'),
  priority: z.enum(['high', 'medium', 'low']).describe('优先级'),
})

const SCHEMA_MAP = {
  person: PersonSchema,
  sentiment: SentimentSchema,
  classify: ClassifySchema,
}

const SCHEMA_NAMES = {
  person: 'Person',
  sentiment: 'Sentiment',
  classify: 'Classify',
}

export default {
  name: 'LangChainStage4Structured',

  data() {
    return {
      input: '',
      loading: false,
      error: null,
      method: 'withStructuredOutput', // 'withStructuredOutput' | 'parser' | 'responseFormat'
      scenario: 'person',
      structuredResult: null,
      rawResponse: null,
    }
  },

  computed: {
    scenarioPlaceholder() {
      const map = {
        person: '输入一段人物描述，如：张三是一名35岁的全栈工程师，精通Vue.js、Python和Docker...',
        sentiment: '输入一段文本进行情感分析，如：这个产品太棒了，使用体验非常好，客服也很耐心...',
        classify: '输入一段文本进行分类，如：用户反馈登录页面在iOS 17上无法正常显示验证码...',
      }
      return map[this.scenario] || ''
    },

    methodLabel() {
      const map = {
        withStructuredOutput: 'withStructuredOutput + Zod',
        parser: 'StructuredOutputParser',
        responseFormat: 'response_format JSON Mode',
      }
      return map[this.method] || ''
    },

    formattedResult() {
      if (!this.structuredResult) return ''
      return JSON.stringify(this.structuredResult, null, 2)
    },
  },

  methods: {
    async send() {
      const text = this.input.trim()
      if (!text || this.loading) return

      this.input = ''
      this.error = null
      this.loading = true
      this.structuredResult = null
      this.rawResponse = null

      try {
        const schema = SCHEMA_MAP[this.scenario]
        const schemaName = SCHEMA_NAMES[this.scenario]

        const llm = new ChatOpenAI({
          model: 'EB-DeepSeek-V4-Pro',
          apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
          temperature: 0, // 结构化输出建议用 0 温度
          configuration: {
            baseURL: window.location.origin + '/inner/',
          },
        })

        if (this.method === 'withStructuredOutput') {
          // ============================================================
          // 方式一：withStructuredOutput + Zod（推荐）
          // 直接返回解析好的 JS 对象，无需手动 parse
          // ============================================================
          const structuredLlm = llm.withStructuredOutput(schema, {
            name: schemaName,
          })

          const result = await structuredLlm.invoke([
            new SystemMessage(`你是一个数据提取助手。请从用户输入的文本中提取结构化信息。`),
            new HumanMessage(text),
          ])

          this.structuredResult = result
          this.rawResponse = JSON.stringify(result, null, 2)
        } else if (this.method === 'parser') {
          // ============================================================
          // 方式二：StructuredOutputParser
          // 通过 formatInstructions 将 schema 注入 Prompt，再手动 parse
          // ============================================================
          const parser = StructuredOutputParser.fromZodSchema(schema)

          const response = await llm.invoke([
            new SystemMessage(
              `你是一个数据提取助手。请从用户输入的文本中提取结构化信息。\n{format_instructions}`.replace(
                '{format_instructions}',
                parser.getFormatInstructions()
              )
            ),
            new HumanMessage(text),
          ])

          this.rawResponse = response.content
          this.structuredResult = await parser.parse(response.content)
        } else if (this.method === 'responseFormat') {
          // ============================================================
          // 方式三：response_format JSON Mode
          // 通过 OpenAI 兼容的 response_format 参数强制 JSON 输出
          // 注意：需要模型支持 response_format 参数
          // ============================================================
          const jsonLlm = new ChatOpenAI({
            model: 'EB-DeepSeek-V4-Pro',
            apiKey: typeof INNER_API_KEY !== 'undefined' ? INNER_API_KEY : undefined,
            temperature: 0,
            configuration: {
              baseURL: window.location.origin + '/inner/',
            },
            modelKwargs: {
              response_format: { type: 'json_object' },
            },
          })

          const response = await jsonLlm.invoke([
            new SystemMessage(
              `你是一个数据提取助手。请从用户输入的文本中提取结构化信息。\n` +
              `请严格按照以下 JSON Schema 输出 JSON：\n` +
              JSON.stringify(schema.shape, null, 2) +
              `\n只输出 JSON，不要包含其他内容。`
            ),
            new HumanMessage(text),
          ])

          this.rawResponse = response.content
          this.structuredResult = JSON.parse(response.content)
        }
      } catch (err) {
        console.error('[Stage7 Error]', err)
        this.error = `提取失败: ${err.message}`
      } finally {
        this.loading = false
      }
    },

    clear() {
      this.structuredResult = null
      this.rawResponse = null
      this.error = null
    },
  },
}
</script>

<style scoped>
.badge.stage {
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  color: #fff;
}

.config-section {
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.config-row > label:first-child {
  font-weight: 600;
  font-size: 14px;
  color: #5b21b6;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: #334155;
  cursor: pointer;
}

.radio-label input[type="radio"] {
  accent-color: #8b5cf6;
}

.config-row select {
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
  outline: none;
}

.config-row select:focus {
  border-color: #8b5cf6;
  box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.1);
}

/* 结果展示 */
.result-section {
  margin-top: 16px;
  border: 1px solid #8b5cf6;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.result-header {
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.method-badge {
  font-size: 11px;
  font-weight: 400;
  background: rgba(255, 255, 255, 0.2);
  padding: 2px 10px;
  border-radius: 10px;
}

.result-body {
  padding: 16px;
}

.json-output {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: #1e293b;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  background: #f8fafc;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

/* 原始响应 */
.raw-details {
  margin-top: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.raw-details summary {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  color: #6b7280;
  background: #f9fafb;
  user-select: none;
}

.raw-details summary:hover {
  background: #f3f4f6;
}

.raw-content {
  padding: 12px 16px;
  font-size: 12px;
  line-height: 1.5;
  color: #6b7280;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  background: #fafafa;
  max-height: 300px;
  overflow-y: auto;
}
</style>