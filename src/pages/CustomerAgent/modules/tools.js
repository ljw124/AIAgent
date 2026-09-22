/**
 * 智能客服 Agent — 工具模块（Stage5: Tool Calling）
 *
 * 提供 3 个通用演示工具：
 *   - calculator: 数学计算
 *   - get_weather: 天气查询（模拟数据）
 *   - search_knowledge: RAG 知识库搜索（Stage7 入口）
 */

import { tool } from '@langchain/core/tools'
import { z } from 'zod'

// ============================================================
// 工具 1：计算器
// ============================================================
export function createCalculatorTool() {
  return tool(
    async ({ expression }) => {
      const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '')
      try {
        // eslint-disable-next-line no-eval
        const result = eval(sanitized)
        return `计算结果: ${expression} = ${result}`
      } catch (e) {
        return `计算错误: ${e.message}`
      }
    },
    {
      name: 'calculator',
      description: '执行数学计算。支持加减乘除、括号、百分比。当用户需要进行数学运算时使用此工具。',
      schema: z.object({
        expression: z.string().describe('数学表达式，如 "(123 + 456) * 789 / 10"')
      })
    }
  )
}

// ============================================================
// 工具 2：天气查询（模拟数据）
// ============================================================
export function createWeatherTool() {
  return tool(
    async ({ city }) => {
      const weatherData = {
        '北京': { temp: 28, condition: '晴', humidity: '45%' },
        '上海': { temp: 32, condition: '多云', humidity: '65%' },
        '广州': { temp: 35, condition: '雷阵雨', humidity: '80%' },
        '深圳': { temp: 33, condition: '阵雨', humidity: '75%' },
        '杭州': { temp: 30, condition: '阴', humidity: '60%' },
        '成都': { temp: 26, condition: '小雨', humidity: '70%' },
        '武汉': { temp: 34, condition: '晴', humidity: '55%' },
        '南京': { temp: 31, condition: '多云', humidity: '58%' }
      }
      const data = weatherData[city] || {
        temp: Math.floor(Math.random() * 20) + 10,
        condition: ['晴', '多云', '小雨', '阴天'][Math.floor(Math.random() * 4)],
        humidity: `${Math.floor(Math.random() * 30) + 40}%`
      }
      return `${city}天气：${data.condition}，温度 ${data.temp}°C，湿度 ${data.humidity}`
    },
    {
      name: 'get_weather',
      description: '查询指定城市的天气信息。当用户询问天气相关问题时使用此工具。',
      schema: z.object({
        city: z.string().describe('城市名称，如"北京"、"上海"')
      })
    }
  )
}

// ============================================================
// 工具 3：知识库搜索（Stage7 RAG 入口）
// 依赖外部的 ragService 实例，通过闭包注入
// ============================================================
let _ragService = null

export function setRAGService(service) {
  _ragService = service
}

export function createKnowledgeSearchTool() {
  return tool(
    async ({ query }) => {
      if (!_ragService) {
        return '知识库未初始化，请先初始化知识库。'
      }
      const results = await _ragService.search(query, 3)
      if (!results || results.length === 0) {
        return '未找到相关文档。'
      }
      return JSON.stringify(
        results.map((item) => ({
          content: item.content.substring(0, 300),
          source: item.metadata?.source || '未知来源',
          score: Math.round(item.score * 100) / 100
        }))
      )
    },
    {
      name: 'search_knowledge',
      description:
        '在知识库中搜索相关文档。当用户询问技术问题、概念解释、使用方法、政策规定等需要参考资料的问题时，优先使用此工具检索知识库。',
      schema: z.object({
        query: z.string().describe('搜索查询内容，使用关键词')
      })
    }
  )
}

// ============================================================
// 根据工具名称列表创建工具实例
// ============================================================
export function createTools(toolNames = ['calculator', 'get_weather', 'search_knowledge']) {
  const toolFactories = {
    calculator: createCalculatorTool,
    get_weather: createWeatherTool,
    search_knowledge: createKnowledgeSearchTool
  }

  return toolNames
    .filter((name) => toolFactories[name])
    .map((name) => toolFactories[name]())
}