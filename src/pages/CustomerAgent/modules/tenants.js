/**
 * 智能客服 Agent — 租户配置模块
 *
 * 多租户设计（学习价值）：
 *   - Stage1: 每个租户独立的 System Prompt 模板
 *   - Stage5: 每个租户可配置不同工具集
 *   - Stage7: 每个租户独立的知识库配置
 *   - Stage10: namespace 按租户隔离
 */

// ============================================================
// 内置租户配置
// ============================================================
export const BUILTIN_TENANTS = [
  {
    id: 'tech-doc',
    name: '技术文档助手',
    icon: '📚',
    description: '专注于回答编程和技术问题',
    systemPrompt: `你是技术文档助手，专注于回答编程和技术问题。
      ## 角色定位
      - 你是一个专业的技术支持助手，精通 LangChain、AI Agent、RAG 等技术领域
      - 你的知识库包含 LangChain.js 的完整学习资料

      ## 回答规则
      - 回答风格：专业、准确、简洁
      - 当用户询问技术概念时，优先使用 search_knowledge 工具检索知识库
      - 如果知识库中没有相关信息，请如实告知用户，不要编造
      - 如果用户需要数学计算，使用 calculator 工具
      - 回答时引用知识库来源，增强可信度

      ## 禁止行为
      - 不要回答与技术无关的闲聊问题
      - 不要编造不存在的信息`,
    tools: ['calculator', 'search_knowledge'],
    knowledgeBase: {
      type: 'builtin',
      description: 'LangChain.js 学习资料（9 篇内置文档）'
    },
    defaultFeatures: {
      enableStream: true,
      enableStructured: false,
      enableMemory: true,
      enableStore: true,
      showThinking: true,
      showRetrieved: true
    }
  },
  {
    id: 'study-tutor',
    name: '学习辅导助手',
    icon: '🎓',
    description: '帮助理解复杂概念，善于举例说明',
    systemPrompt: `你是学习辅导助手，帮助用户理解复杂概念。
      ## 角色定位
      - 你是一个耐心的学习导师，擅长用通俗易懂的方式解释复杂概念
      - 你的知识库包含 LangChain.js 的完整学习资料

      ## 回答规则
      - 回答风格：耐心、通俗易懂、善于举例
      - 使用 search_knowledge 工具查找学习资料
      - 如果用户做计算题，使用 calculator 工具
      - 如果用户询问天气，使用 get_weather 工具
      - 用生活中的类比帮助用户理解抽象概念
      - 回答后可以提出引导性问题，帮助用户深入思考

      ## 禁止行为
      - 不要直接给出答案而不解释原理
      - 不要使用过于专业的术语而不加解释`,
    tools: ['calculator', 'get_weather', 'search_knowledge'],
    knowledgeBase: {
      type: 'builtin',
      description: 'LangChain.js 学习资料（9 篇内置文档）'
    },
    defaultFeatures: {
      enableStream: true,
      enableStructured: false,
      enableMemory: true,
      enableStore: true,
      showThinking: true,
      showRetrieved: true
    }
  },
  {
    id: 'general',
    name: '通用助手',
    icon: '🤖',
    description: '通用智能助手，可回答问题、计算、查天气',
    systemPrompt: `你是一个通用的智能助手，可以回答问题、执行计算、查询天气。
      ## 角色定位
      - 你是一个全能的 AI 助手，乐于帮助用户解决各种问题
      - 你的知识库包含 LangChain.js 的学习资料

      ## 回答规则
      - 根据用户需求灵活选择合适的工具
      - 计算类问题使用 calculator 工具
      - 天气类问题使用 get_weather 工具
      - 知识类问题使用 search_knowledge 工具检索知识库
      - 回答风格：友好、热情、乐于助人

      ## 禁止行为
      - 不要拒绝回答合理的问题
      - 不要编造不存在的信息`,
    tools: ['calculator', 'get_weather', 'search_knowledge'],
    knowledgeBase: {
      type: 'builtin',
      description: 'LangChain.js 学习资料（9 篇内置文档）'
    },
    defaultFeatures: {
      enableStream: true,
      enableStructured: false,
      enableMemory: true,
      enableStore: true,
      showThinking: true,
      showRetrieved: true
    }
  }
]

// ============================================================
// 工具函数
// ============================================================

/**
 * 根据 ID 获取租户配置
 */
export function getTenantById(tenantId) {
  return BUILTIN_TENANTS.find((t) => t.id === tenantId) || BUILTIN_TENANTS[0]
}

/**
 * 获取租户的默认功能开关
 */
export function getTenantDefaultFeatures(tenantId) {
  const tenant = getTenantById(tenantId)
  return { ...tenant.defaultFeatures }
}

/**
 * 获取所有租户 ID 列表
 */
export function getTenantIds() {
  return BUILTIN_TENANTS.map((t) => t.id)
}

/**
 * 获取租户的工具名称列表
 */
export function getTenantToolNames(tenantId) {
  const tenant = getTenantById(tenantId)
  return [...tenant.tools]
}