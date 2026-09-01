<template>
  <div id="app">
    <!-- ============================================================
        左侧菜单
        ============================================================ -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <h2>🤖 AI Agent</h2>
        <span class="sidebar-subtitle">基于LangChain.js的AIAgent</span>
      </div>

      <nav class="sidebar-nav">
        <!-- 分组：内网大模型 -->
        <div class="nav-group">
          <div class="nav-group-title">内网 hikvision</div>
          <div
            :class="['nav-item', { active: currentPage === 'inner-js' }]"
            @click="currentPage = 'inner-js'"
          >
            <span class="nav-icon">🇯🇸</span>
            <span class="nav-label">JS 调用</span>
          </div>
          <div
            :class="['nav-item', { active: currentPage === 'inner-python' }]"
            @click="currentPage = 'inner-python'"
          >
            <span class="nav-icon">🇵🇾</span>
            <span class="nav-label">Python 调用</span>
          </div>
        </div>

        <!-- 分组：本地 Ollama -->
        <div class="nav-group">
          <div class="nav-group-title">本地 Ollama</div>
          <div
            :class="['nav-item', { active: currentPage === 'ollama-chat' }]"
            @click="currentPage = 'ollama-chat'"
          >
            <span class="nav-icon">🇯🇸</span>
            <span class="nav-label">JS 调用</span>
          </div>
          <div
            :class="['nav-item', { active: currentPage === 'ollama-python' }]"
            @click="currentPage = 'ollama-python'"
          >
            <span class="nav-icon">🇵🇾</span>
            <span class="nav-label">Python 调用</span>
          </div>
        </div>

        <!-- 分组：百炼大模型 -->
        <div class="nav-group">
          <div class="nav-group-title">百炼 DashScope</div>
          <div
            :class="['nav-item', { active: currentPage === 'bailian-js' }]"
            @click="currentPage = 'bailian-js'"
          >
            <span class="nav-icon">🇯🇸</span>
            <span class="nav-label">JS 调用</span>
          </div>
          <div
            :class="['nav-item', { active: currentPage === 'bailian-python' }]"
            @click="currentPage = 'bailian-python'"
          >
            <span class="nav-icon">🇵🇾</span>
            <span class="nav-label">Python 调用</span>
          </div>
        </div>

        <!-- 分组：魔塔社区 -->
        <div class="nav-group">
          <div class="nav-group-title">魔塔 ModelScope</div>
          <div
            :class="['nav-item', { active: currentPage === 'modelscope-js' }]"
            @click="currentPage = 'modelscope-js'"
          >
            <span class="nav-icon">🇯🇸</span>
            <span class="nav-label">JS 调用</span>
          </div>
        </div>

        <!-- 分组：LangChain.js 学习 -->
        <div class="nav-group">
          <div class="nav-group-title">📚 LangChain.js 知识体系</div>
          <div
            :class="['nav-item', { active: currentPage === 'lc-stage1' }]"
            @click="currentPage = 'lc-stage1'"
          >
            <span class="nav-icon">1️⃣</span>
            <span class="nav-label">Prompt Template</span>
          </div>
          <div
            :class="['nav-item', { active: currentPage === 'lc-stage2' }]"
            @click="currentPage = 'lc-stage2'"
          >
            <span class="nav-icon">2️⃣</span>
            <span class="nav-label">Chain 链式调用</span>
          </div>
          <div
            :class="['nav-item', { active: currentPage === 'lc-stage6' }]"
            @click="currentPage = 'lc-stage6'"
          >
            <span class="nav-icon">3️⃣</span>
            <span class="nav-label">Streaming 流式</span>
          </div>
          <div
            :class="['nav-item', { active: currentPage === 'lc-stage7' }]"
            @click="currentPage = 'lc-stage7'"
          >
            <span class="nav-icon">4️⃣</span>
            <span class="nav-label">Structured 结构化</span>
          </div>
          <div
            :class="['nav-item', { active: currentPage === 'lc-stage3' }]"
            @click="currentPage = 'lc-stage3'"
          >
            <span class="nav-icon">5️⃣</span>
            <span class="nav-label">Tool Calling</span>
          </div>
          <div
            :class="['nav-item', { active: currentPage === 'lc-stage4' }]"
            @click="currentPage = 'lc-stage4'"
          >
            <span class="nav-icon">6️⃣</span>
            <span class="nav-label">Agent 智能体</span>
          </div>
          <div
            :class="['nav-item', { active: currentPage === 'lc-stage5' }]"
            @click="currentPage = 'lc-stage5'"
          >
            <span class="nav-icon">7️⃣</span>
            <span class="nav-label">RAG 检索增强</span>
          </div>
        </div>
      </nav>

      <div class="sidebar-footer">
        <span class="version">v0.2.0</span>
      </div>
    </aside>

    <!-- ============================================================
        右侧内容区
        ============================================================ -->
    <main class="main-content">
      <BailianJSChat v-if="currentPage === 'bailian-js'" />
      <BailianPythonChat v-if="currentPage === 'bailian-python'" />
      <InnerModelChat v-if="currentPage === 'inner-js'" />
      <InnerModelPythonChat v-if="currentPage === 'inner-python'" />
      <ModelScopeChat v-if="currentPage === 'modelscope-js'" />
      <LangChainStage1Prompt v-if="currentPage === 'lc-stage1'" />
      <LangChainStage2Chain v-if="currentPage === 'lc-stage2'" />
      <LangChainStage6Stream v-if="currentPage === 'lc-stage6'" />
      <LangChainStage7Structured v-if="currentPage === 'lc-stage7'" />
      <LangChainStage3Tool v-if="currentPage === 'lc-stage3'" />
      <LangChainStage4Agent v-if="currentPage === 'lc-stage4'" />
      <LangChainStage5RAG v-if="currentPage === 'lc-stage5'" />
      <OllamaChat v-if="currentPage === 'ollama-chat'" />
      <OllamaPythonChat v-if="currentPage === 'ollama-python'" />
    </main>
  </div>
</template>

<script>
import BailianJSChat from '@/pages/bailian/BailianJSChat.vue'
import BailianPythonChat from '@/pages/bailian/BailianPythonChat.vue'
import InnerModelChat from '@/pages/inner/InnerModelChat.vue'
import InnerModelPythonChat from '@/pages/inner/InnerModelPythonChat.vue'
import ModelScopeChat from '@/pages/modelscope/ModelScopeChat.vue'
import LangChainStage1Prompt from '@/pages/langchain/LangChainStage1Prompt.vue'
import LangChainStage2Chain from '@/pages/langchain/LangChainStage2Chain.vue'
import LangChainStage3Tool from '@/pages/langchain/LangChainStage3Tool.vue'
import LangChainStage4Agent from '@/pages/langchain/LangChainStage4Agent.vue'
import LangChainStage5RAG from '@/pages/langchain/LangChainStage5RAG.vue'
import LangChainStage6Stream from '@/pages/langchain/LangChainStage6Stream.vue'
import LangChainStage7Structured from '@/pages/langchain/LangChainStage7Structured.vue'
import OllamaChat from '@/pages/ollama/OllamaChat.vue'
import OllamaPythonChat from '@/pages/ollama/OllamaPythonChat.vue'

export default {
  name: 'App',

  components: {
    BailianJSChat,
    BailianPythonChat,
    InnerModelChat,
    InnerModelPythonChat,
    ModelScopeChat,
    LangChainStage1Prompt,
    LangChainStage2Chain,
    LangChainStage3Tool,
    LangChainStage4Agent,
    LangChainStage5RAG,
    LangChainStage6Stream,
    LangChainStage7Structured,
    OllamaChat,
    OllamaPythonChat,
  },

  data() {
    return {
      currentPage: 'inner-js',
    }
  },
}
</script>

<style>
/* ============================================================
  全局重置
  ============================================================ */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  overflow: hidden;
}

/* ============================================================
  整体布局：左侧菜单 + 右侧内容
  ============================================================ */
#app {
  display: flex;
  height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
    'Helvetica Neue', Arial, sans-serif;
  color: #2c3e50;
  background: #f5f6fa;
}

/* ============================================================
  左侧菜单
  ============================================================ */
.sidebar {
  width: 240px;
  min-width: 240px;
  background: #1a1a2e;
  color: #e0e0e0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #16213e;
  overflow-y: auto;
}

.sidebar-header {
  padding: 24px 20px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.sidebar-header h2 {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 4px;
}

.sidebar-subtitle {
  font-size: 11px;
  color: #8892b0;
  letter-spacing: 0.5px;
}

.sidebar-nav {
  flex: 1;
  padding: 12px 0;
}

.nav-group {
  margin-bottom: 8px;
}

.nav-group-title {
  padding: 8px 20px 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #5a6a8a;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  margin: 2px 8px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  color: #a8b2d1;
  transition: all 0.15s ease;
  user-select: none;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #ccd6f6;
}

.nav-item.active {
  background: rgba(249, 115, 22, 0.15);
  color: #f97316;
  font-weight: 600;
}

.nav-icon {
  font-size: 16px;
  width: 24px;
  text-align: center;
  flex-shrink: 0;
}

.nav-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-footer {
  padding: 12px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.version {
  font-size: 11px;
  color: #5a6a8a;
}

/* ============================================================
  右侧内容区
  ============================================================ */
.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 28px 32px;
  min-width: 0;
}

/* ============================================================
  共享组件样式（各独立组件通过全局样式复用）
  ============================================================ */
h1 {
  font-size: 22px;
  margin-bottom: 16px;
  color: #1a1a2e;
}

.badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 500;
  padding: 3px 10px;
  border-radius: 12px;
  vertical-align: middle;
  margin-left: 8px;
}

.badge.bailian {
  background: linear-gradient(135deg, #f97316 0%, #ef4444 100%);
  color: #fff;
}

.badge.inner {
  background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
  color: #fff;
}

/* 信息提示 */
.info-box {
  padding: 12px 16px;
  margin-bottom: 16px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.6;
  color: #1e40af;
}

.info-box code {
  background: #dbeafe;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
}

/* 配置区域 */
.config-section {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.config-section label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #374151;
}

.config-section select {
  padding: 6px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  background: #fff;
  outline: none;
}

.config-section select:focus {
  border-color: #f97316;
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.1);
}

.config-section input[type="range"] {
  width: 100px;
}

.config-section input[type="number"] {
  width: 80px;
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
}

/* 代码统计标签 */
.code-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.stat {
  font-size: 12px;
  padding: 4px 12px;
  background: #fef3c7;
  color: #92400e;
  border-radius: 12px;
  border: 1px solid #fde68a;
}

.usechat-stats .stat {
  background: #ede9fe;
  color: #5b21b6;
  border-color: #c4b5fd;
}

/* 输入区域 */
.input-section {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}

.input-section textarea {
  flex: 1 1 100%;
  padding: 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 14px;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s;
}

.input-section textarea:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.input-section button {
  padding: 10px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  background: #3b82f6;
  color: #fff;
  transition: background 0.2s;
}

.input-section button:hover:not(:disabled) {
  background: #2563eb;
}

.input-section button:disabled {
  background: #93c5fd;
  cursor: not-allowed;
}

.btn-stop {
  background: #ef4444 !important;
}
.btn-stop:hover:not(:disabled) {
  background: #dc2626 !important;
}
.btn-stop:disabled {
  background: #fca5a5 !important;
}

.btn-reload {
  background: #f59e0b !important;
}
.btn-reload:hover:not(:disabled) {
  background: #d97706 !important;
}
.btn-reload:disabled {
  background: #fcd34d !important;
}

.btn-clear {
  background: #e5e7eb !important;
  color: #374151 !important;
}
.btn-clear:hover {
  background: #d1d5db !important;
}

/* 错误提示 */
.error-msg {
  padding: 10px 16px;
  margin-bottom: 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  color: #dc2626;
  font-size: 13px;
}

/* 对话历史 */
.chat-history {
  max-height: 500px;
  overflow-y: auto;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  background: #f9fafb;
}

.message {
  margin-bottom: 16px;
  padding: 12px 16px;
  border-radius: 8px;
}

.message.user {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}

.message.assistant {
  background: #fff;
  border: 1px solid #e5e7eb;
}

.role-label {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #6b7280;
  text-transform: uppercase;
}

.content {
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Segments 容器 */
.segments {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.segment {
  border-radius: 6px;
  overflow: hidden;
}

/* 思考过程 */
.thinking-block {
  background: #fefce8;
  border: 1px solid #fde68a;
  border-radius: 6px;
}

.thinking-summary {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: #92400e;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 6px;
}

.thinking-summary:hover {
  background: #fef3c7;
}

.thinking-icon {
  font-size: 14px;
}

.thinking-content {
  padding: 8px 12px 12px;
  font-size: 12px;
  line-height: 1.5;
  color: #78716c;
  white-space: pre-wrap;
  word-break: break-word;
  background: #fffbeb;
  border-top: 1px solid #fde68a;
  max-height: 300px;
  overflow-y: auto;
}

/* 工具调用 */
.tool-use-block {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
}

.tool-use-header {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 500;
  color: #1e40af;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tool-icon {
  font-size: 14px;
}

.tool-name {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  background: #dbeafe;
  padding: 2px 8px;
  border-radius: 4px;
}

.tool-input {
  padding: 8px 12px 12px;
  font-size: 12px;
  line-height: 1.5;
  color: #475569;
  white-space: pre-wrap;
  word-break: break-word;
  background: #f8fafc;
  border-top: 1px solid #bfdbfe;
  max-height: 200px;
  overflow-y: auto;
}

/* 工具结果 */
.tool-result-block {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 6px;
}

.tool-result-header {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 500;
  color: #166534;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tool-result-content {
  padding: 8px 12px 12px;
  font-size: 14px;
  line-height: 1.6;
  color: #374151;
  white-space: pre-wrap;
  word-break: break-word;
  background: #f8fafc;
  border-top: 1px solid #bbf7d0;
}

/* 纯文本 */
.text-content {
  padding: 8px 12px;
  font-size: 14px;
  line-height: 1.6;
  color: #1f2937;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 状态标记 */
.done-badge {
  font-size: 11px;
  color: #16a34a;
  margin-left: auto;
}

.loading-dot {
  font-size: 14px;
  color: #f59e0b;
  margin-left: auto;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* Python 代码展示 */
.code-block {
  margin-top: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.code-block summary {
  padding: 10px 16px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  background: #f9fafb;
  user-select: none;
}

.code-block summary:hover {
  background: #f3f4f6;
}

.code-content {
  padding: 16px;
  font-size: 12px;
  line-height: 1.6;
  background: #1e293b;
  color: #e2e8f0;
  overflow-x: auto;
  white-space: pre;
  margin: 0;
  border-radius: 0;
}

/* 结果展示 */
.result-box {
  margin-top: 16px;
  border: 1px solid #f97316;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}

.result-label {
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #f97316 0%, #ef4444 100%);
}

.result-content {
  padding: 16px;
  font-size: 14px;
  line-height: 1.7;
  color: #1f2937;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 60px;
}
</style>
