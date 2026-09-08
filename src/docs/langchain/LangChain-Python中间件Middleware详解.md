<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-07
 * @LastEditors: lujinwei lujinwei@hikvision.com.cn
 * @LastEditTime: 2026-09-08 12:41:23
 * @Description: LangChain Python 版中间件（Middleware）学习教程
 *   对比：LangChain.js 目前尚无 middleware API（@langchain/core 1.2.9）
 *   更新：重构为双层架构 — 自定义中间件（BaseCallbackHandler）+ 官方内置中间件（AgentMiddleware）
-->

# LangChain Python 版中间件（Middleware）详解

> 本文总结 LangChain **Python 版**的中间件（Middleware）机制，帮助你理解如何在模型调用前后插入自定义逻辑。**注意**：LangChain.js 目前尚未提供 `middleware` API，本文以 Python 版为准。

---

## 📖 目录

- [一、什么是中间件](#一什么是中间件)
- [二、为什么需要中间件](#二为什么需要中间件)
- [三、两种中间件架构](#三两种中间件架构)
- [四、自定义中间件（BaseCallbackHandler）](#四自定义中间件basecallbackhandler)
- [五、官方内置中间件（AgentMiddleware）](#五官方内置中间件agentmiddleware)
- [六、双层中间件架构实战](#六双层中间件架构实战)
- [七、实际应用场景](#七实际应用场景)
- [八、与 LangChain.js 的对比](#八与-langchainjs-的对比)
- [九、最佳实践](#九最佳实践)

---

## 一、什么是中间件

**中间件（Middleware）** 是一种允许你在 **LLM 调用之前、之后或环绕调用** 插入自定义逻辑的机制，而无需修改模型调用代码本身。

它类似于 Web 框架（如 Flask、FastAPI）中的中间件概念，但专门针对 **LLM 调用链** 设计。

```python
# 伪代码：中间件包裹模型调用
def middleware(llm):
    # 调用前逻辑
    result = llm.invoke(messages)  # 实际模型调用
    # 调用后逻辑
    return result
```

---

## 二、为什么需要中间件

在实际开发中，我们经常需要在模型调用前后做各种处理：

| 需求 | 传统做法 | 中间件做法 |
|---|---|---|
| 记录每次调用的耗时 | 在每个调用点写日志 | 一个中间件统一处理 |
| 缓存相同请求的结果 | 手动检查缓存 | 中间件自动缓存 |
| 对输入做敏感信息脱敏 | 每次调用前手动处理 | 中间件统一脱敏 |
| 限制调用频率（限流） | 各处手动计数 | 中间件统一限流 |
| 失败自动重试 | 各处写 try/except | 中间件统一重试 |

**核心价值**：把横切关注点（日志、缓存、限流、重试等）从业务代码中抽离出来，实现 **关注点分离**，让业务代码更干净、可复用。

---

## 三、两种中间件架构

LangChain Python 中存在 **两种不同层次** 的中间件机制：

| 维度 | 自定义中间件 | 官方内置中间件 |
|---|---|---|
| **基类** | [`BaseCallbackHandler`](https://reference.langchain.com/python/langchain_core/callbacks) | [`AgentMiddleware`](https://reference.langchain.com/python/langchain/agents/middleware) |
| **导入路径** | `langchain_core.callbacks` | `langchain.agents.middleware` |
| **传递方式** | `ChatOpenAI(callbacks=...)` | `create_agent(middleware=...)` |
| **工作层级** | LLM 调用级别（每次 API 调用触发） | Agent 级别（工具调用、状态管理等） |
| **适用场景** | 日志、计时、脱敏、指标统计 | 摘要、人机协同、PII 检测、待办列表、调用限制 |

### 架构关系图

```
┌─────────────────────────────────────────────┐
│              create_agent()                  │
│  ┌───────────────────────────────────────┐  │
│  │  官方内置中间件（AgentMiddleware）      │  │
│  │  Summarization / HumanInTheLoop /     │  │
│  │  PII / TodoList / ModelCallLimit      │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │  ChatOpenAI (LLM)                     │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │ 自定义中间件（BaseCallbackHandler）│  │  │
│  │  │ Before / After / Around /       │  │  │
│  │  │ SensitiveData / Metrics / Retry │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

---

## 四、自定义中间件（BaseCallbackHandler）

自定义中间件继承 [`BaseCallbackHandler`](https://reference.langchain.com/python/langchain_core/callbacks)，通过重写钩子方法实现拦截逻辑。

### 4.1 三种类型

| 类型 | 钩子方法 | 时机 | 用途 |
|---|---|---|---|
| **Before** | `on_llm_start()` | 模型调用**之前** | 输入处理、脱敏、日志、限流 |
| **After** | `on_llm_end()` | 模型调用**之后** | 输出处理、缓存、日志 |
| **Around** | `on_llm_start()` + `on_llm_end()` | **环绕**调用 | 计时、重试、统一日志 |

### 4.2 定义示例

```python
from langchain_core.callbacks import BaseCallbackHandler
import time

class BeforeMiddleware(BaseCallbackHandler):
    """调用前：参数校验、鉴权、注入上下文"""
    def on_llm_start(self, serialized, prompts, **kwargs):
        print(f"[Before] LLM 调用开始，输入消息数: {len(prompts)}")

class AfterMiddleware(BaseCallbackHandler):
    """调用后：结果处理、缓存写入、指标采集"""
    def on_llm_end(self, response, **kwargs):
        text = response.generations[0][0].text
        print(f"[After] LLM 调用结束，输出长度: {len(text)} 字符")

class AroundMiddleware(BaseCallbackHandler):
    """环绕：统一计时、统一异常处理"""
    def on_llm_start(self, serialized, prompts, **kwargs):
        self.start_time = time.time()

    def on_llm_end(self, response, **kwargs):
        elapsed = time.time() - self.start_time
        print(f"[Around] 调用耗时: {elapsed:.2f} 秒")
```

### 4.3 传递方式

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    model="gpt-4o",
    callbacks=[BeforeMiddleware(), AfterMiddleware(), AroundMiddleware()]
)
# 执行顺序：Before.on_llm_start → Around.on_llm_start → API调用 → Around.on_llm_end → After.on_llm_end
```

---

## 五、官方内置中间件（AgentMiddleware）

从 `langchain` 1.4.0 开始，官方在 [`langchain.agents.middleware`](https://reference.langchain.com/python/langchain/agents/middleware) 模块中提供了 5 个开箱即用的内置中间件，它们继承 [`AgentMiddleware`](https://reference.langchain.com/python/langchain/agents/middleware)，通过 [`create_agent(middleware=)`](https://reference.langchain.com/python/langchain/agents) 传递。

### 5.1 官方内置中间件列表

| 中间件 | 类名 | 作用 |
|---|---|---|
| 摘要中间件 | `SummarizationMiddleware` | 对话历史接近 token 限制时自动摘要 |
| 人机协同中间件 | `HumanInTheLoopMiddleware` | 工具调用前暂停，等待人工确认 |
| PII 中间件 | `PIIMiddleware` | 检测和脱敏个人身份信息（邮箱/信用卡/IP等） |
| 待办列表中间件 | `TodoListMiddleware` | 为 Agent 提供 `write_todos` 工具，自动管理任务 |
| 调用限制中间件 | `ModelCallLimitMiddleware` | 限制模型调用次数，防止滥用超配额 |

### 5.2 导入方式

```python
from langchain.agents.middleware import (
    SummarizationMiddleware,
    HumanInTheLoopMiddleware,
    PIIMiddleware,
    TodoListMiddleware,
    ModelCallLimitMiddleware,
)
```

### 5.3 各中间件用法详解

#### SummarizationMiddleware — 摘要中间件

```python
SummarizationMiddleware(
    model=ChatOpenAI(model="gpt-4o"),  # 用于生成摘要的模型
    trigger=('tokens', 4000),           # 超过 4000 token 时触发摘要
    keep=('messages', 20),              # 保留最近 20 条消息
)
```

#### HumanInTheLoopMiddleware — 人机协同中间件

```python
HumanInTheLoopMiddleware(
    interrupt_on={'tool_use': True},                    # 在工具调用前中断
    description_prefix='工具执行需要人工审批',
)
```

#### PIIMiddleware — PII 中间件

```python
PIIMiddleware(
    pii_type='email',           # PII 类型：email/credit_card/ip/mac_address/url
    strategy='redact',          # 策略：block(阻止)/redact(脱敏)/mask(掩码)/hash(哈希)
    apply_to_input=True,        # 对输入应用
    apply_to_output=True,       # 对输出应用
)
```

#### TodoListMiddleware — 待办列表中间件

```python
TodoListMiddleware()  # 无需额外参数，使用默认配置
# Agent 会自动获得 write_todos 工具，可以创建和管理任务列表
```

#### ModelCallLimitMiddleware — 调用限制中间件

```python
ModelCallLimitMiddleware(
    run_limit=10,               # 单次运行最大调用次数
    thread_limit=None,          # 跨运行（线程级别）最大调用次数
    exit_behavior='end',        # 达到限制后：'end'(正常结束) 或 'error'(抛异常)
)
```

---

## 六、双层中间件架构实战

本项目 [`MiddlewareModel.py`](../../src/composables/MiddlewareModel.py) 演示了如何将两种中间件结合使用：

```python
from langchain_core.callbacks import BaseCallbackHandler
from langchain_openai import ChatOpenAI
from langchain.agents import create_agent
from langchain.agents.middleware import (
    SummarizationMiddleware, HumanInTheLoopMiddleware,
    PIIMiddleware, TodoListMiddleware, ModelCallLimitMiddleware,
)

# ============================================================
# 第一步：定义自定义中间件（BaseCallbackHandler 子类）
# ============================================================
class BeforeMiddleware(BaseCallbackHandler):
    def on_llm_start(self, serialized, prompts, **kwargs):
        print(f"[Before] LLM 调用开始")

class AfterMiddleware(BaseCallbackHandler):
    def on_llm_end(self, response, **kwargs):
        print(f"[After] LLM 调用结束")

# ============================================================
# 第二步：创建 ChatOpenAI 实例（带自定义中间件）
# ============================================================
llm = ChatOpenAI(
    model="EB-DeepSeek-V4-Pro",
    api_key=API_KEY,
    base_url=BASE_URL,
    callbacks=[BeforeMiddleware(), AfterMiddleware()],  # ★ 自定义中间件
)

# ============================================================
# 第三步：创建 Agent（带官方内置中间件）
# ============================================================
agent = create_agent(
    model=llm,  # 已配置自定义中间件的 LLM 实例
    middleware=[  # ★ 官方内置中间件
        SummarizationMiddleware(model=llm, trigger=('tokens', 4000)),
        TodoListMiddleware(),
        ModelCallLimitMiddleware(run_limit=10),
        PIIMiddleware(pii_type='email', strategy='redact'),
        HumanInTheLoopMiddleware(interrupt_on={'tool_use': True}),
    ],
    system_prompt="你是一个有用的AI助手，请用中文回答。",
)

# ============================================================
# 第四步：调用 Agent
# ============================================================
result = agent.invoke({"messages": [HumanMessage(content="你好")]})
print(result["messages"][-1].content)
```

### 执行流程

```
用户消息 → create_agent
  → 官方中间件处理（PII检测、摘要检查、调用计数等）
  → ChatOpenAI.invoke()
    → 自定义中间件.on_llm_start()（Before → Around → SensitiveData）
    → 实际 API 调用
    → 自定义中间件.on_llm_end()（Around → After → Metrics）
  → 官方中间件后处理（TodoList提取、HumanInTheLoop审核等）
  → 返回最终结果
```

---

## 七、实际应用场景

### 7.1 敏感信息脱敏（自定义中间件）

```python
class SensitiveDataMiddleware(BaseCallbackHandler):
    """对输入中的敏感信息（如手机号、身份证）脱敏"""
    def on_llm_start(self, serialized, prompts, **kwargs):
        import re
        for prompt in prompts:
            masked = str(prompt)
            masked = re.sub(r'1[3-9]\d{9}', '[手机号已脱敏]', masked)
            print(f"[脱敏] {masked[:80]}...")
```

### 7.2 调用统计与监控（自定义中间件）

```python
class MetricsMiddleware(BaseCallbackHandler):
    call_count = 0
    total_time = 0.0

    def on_llm_start(self, serialized, prompts, **kwargs):
        self.start_time = time.time()

    def on_llm_end(self, response, **kwargs):
        MetricsMiddleware.call_count += 1
        MetricsMiddleware.total_time += time.time() - self.start_time
        avg = MetricsMiddleware.total_time / MetricsMiddleware.call_count
        print(f"[指标] 累计调用 {MetricsMiddleware.call_count} 次，平均耗时 {avg:.2f}s")
```

### 7.3 PII 检测与脱敏（官方内置中间件）

```python
# 使用官方 PIIMiddleware，一行代码搞定
PIIMiddleware(pii_type='email', strategy='redact')
# 自动检测输入/输出中的邮箱地址并脱敏
```

### 7.4 任务管理（官方内置中间件）

```python
# 使用官方 TodoListMiddleware，Agent 自动获得任务管理能力
agent = create_agent(model=llm, middleware=[TodoListMiddleware()])
result = agent.invoke({"messages": [HumanMessage("帮我规划学习计划")]})
# result["todos"] 包含 Agent 自动创建的任务列表
```

---

## 八、与 LangChain.js 的对比

| 维度 | LangChain Python | LangChain.js |
|---|---|---|
| 自定义中间件 API | ✅ `BaseCallbackHandler` + `callbacks=` | ❌ 无直接等价物 |
| 官方内置中间件 | ✅ `langchain.agents.middleware` (5个) | ❌ 尚未提供 |
| Agent 级别中间件 | ✅ `create_agent(middleware=)` | ❌ 尚未提供 |
| 替代方案 | 原生中间件 | `RunnableLambda` 链式组合、`callbacks` 回调 |

**LangChain.js 的替代实现**（当前 `@langchain/core` 1.2.9）：

```js
import { RunnableLambda } from '@langchain/core/runnables'

// 用 RunnableLambda 模拟中间件（前后处理）
const chain = RunnableLambda.from(async (input) => {
  console.log('调用前：', input)
  return input
})
  .pipe(llm)
  .pipe(RunnableLambda.from(async (output) => {
  console.log('调用后：', output)
  return output
}))
```

---

## 九、最佳实践

1. **分层使用**：自定义中间件处理 LLM 级别关注点（日志、计时），官方中间件处理 Agent 级别关注点（摘要、PII、任务管理）
2. **单一职责**：每个中间件只做一件事（日志、缓存、限流分开写）
3. **注意顺序**：自定义中间件的 `on_llm_start` 按列表顺序执行，`on_llm_end` 逆序执行
4. **避免副作用**：中间件应尽量无状态，或使用可重入设计
5. **性能考量**：中间件会增加调用开销，避免在热路径中做重操作
6. **版本要求**：官方内置中间件需要 `langchain >= 1.4.0`

---

## 总结

- LangChain Python 提供 **两种中间件机制**：自定义（`BaseCallbackHandler`）和官方内置（`AgentMiddleware`）
- **自定义中间件** 通过 `ChatOpenAI(callbacks=)` 传递，在 LLM 调用级别工作
- **官方内置中间件** 通过 `create_agent(middleware=)` 传递，在 Agent 级别工作
- 官方内置了 5 个中间件：`SummarizationMiddleware`、`HumanInTheLoopMiddleware`、`PIIMiddleware`、`TodoListMiddleware`、`ModelCallLimitMiddleware`
- 两种中间件可通过 `create_agent()` 统一编排，形成 **双层中间件架构**
- **LangChain.js 目前没有 `middleware` API**，可用 `RunnableLambda` 链式组合或 `callbacks` 回调实现类似功能