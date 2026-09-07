<!--
 * @Author: lujinwei lujinwei@hikvision.com.cn
 * @Date: 2026-09-07
 * @Description: LangChain Python 版中间件（Middleware）学习教程
 *   对比：LangChain.js 目前尚无 middleware API（@langchain/core 1.2.9）
-->

# LangChain Python 版中间件（Middleware）详解

> 本文总结 LangChain **Python 版**的中间件（Middleware）机制，帮助你理解如何在模型调用前后插入自定义逻辑。**注意**：LangChain.js 目前尚未提供 `middleware` API，本文以 Python 版为准。

---

## 📖 目录

- [一、什么是中间件](#一什么是中间件)
- [二、为什么需要中间件](#二为什么需要中间件)
- [三、中间件的类型](#三中间件的类型)
- [四、如何定义中间件](#四如何定义中间件)
- [五、如何应用中间件](#五如何应用中间件)
- [六、内置中间件](#六内置中间件)
- [七、实际应用场景](#七实际应用场景)
- [八、与 LangChain.js 的对比](#八与-langchainjs-的对比)
- [九、最佳实践](#九最佳实践)

---

## 一、什么是中间件

**中间件（Middleware）** 是 LangChain Python 版（`langchain` 0.3.x 后期 / 0.4.x）引入的一种机制，允许你在 **LLM 调用之前、之后或环绕调用** 插入自定义逻辑，而无需修改模型调用代码本身。

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

## 三、中间件的类型

LangChain Python 中间件分为三种类型：

| 类型 | 时机 | 用途 |
|---|---|---|
| **Before** | 模型调用**之前** | 输入处理、脱敏、日志、限流 |
| **After** | 模型调用**之后** | 输出处理、缓存、日志 |
| **Around** | **环绕**调用（前后都执行） | 计时、重试、统一日志 |

```python
from langchain.middleware import BeforeMiddleware, AfterMiddleware, AroundMiddleware

# Before：调用前执行
class MyBeforeMiddleware(BeforeMiddleware):
    def before(self, input):
        # 处理输入
        return input

# After：调用后执行
class MyAfterMiddleware(AfterMiddleware):
    def after(self, output):
        # 处理输出
        return output

# Around：环绕执行
class MyAroundMiddleware(AroundMiddleware):
    def before(self, input):
        return input
    def after(self, output):
        return output
```

---

## 四、如何定义中间件

### 4.1 继承中间件基类

```python
from langchain.middleware import BeforeMiddleware, AfterMiddleware, AroundMiddleware

class LoggingMiddleware(AroundMiddleware):
    """记录每次调用的耗时"""
    def before(self, input):
        import time
        self.start_time = time.time()
        print(f"[Middleware] 开始调用，输入: {input}")
        return input

    def after(self, output):
        import time
        duration = time.time() - self.start_time
        print(f"[Middleware] 调用完成，耗时: {duration:.2f}s")
        return output
```

### 4.2 使用装饰器（更简洁）

```python
from langchain.middleware import middleware

@middleware
def logging_middleware(call_next, input):
    """call_next 是下一个中间件或实际模型调用"""
    print(f"调用前: {input}")
    output = call_next(input)  # 调用下一个
    print(f"调用后: {output}")
    return output
```

---

## 五、如何应用中间件

### 5.1 在创建模型时传入

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    model="gpt-4o",
    middleware=[LoggingMiddleware(), CacheMiddleware()]  # 传入中间件列表
)
```

### 5.2 在调用时传入

```python
response = llm.invoke(
    "你好",
    config={"middleware": [LoggingMiddleware()]}  # 调用时临时指定
)
```

### 5.3 中间件执行顺序

多个中间件按**声明顺序**执行，形成"洋葱模型"：

```python
llm = ChatOpenAI(
    model="gpt-4o",
    middleware=[MiddlewareA(), MiddlewareB(), MiddlewareC()]
)
# 执行顺序：A.before → B.before → C.before → 模型调用 → C.after → B.after → A.after
```

---

## 六、内置中间件

LangChain Python 提供了一些开箱即用的内置中间件：

| 中间件 | 作用 |
|---|---|
| `CacheMiddleware` | 缓存相同请求的结果，减少重复调用 |
| `RetryMiddleware` | 调用失败时自动重试 |
| `RateLimitMiddleware` | 限制调用频率（限流） |
| `LoggingMiddleware` | 记录调用日志 |

```python
from langchain.middleware import CacheMiddleware, RetryMiddleware

llm = ChatOpenAI(
    model="gpt-4o",
    middleware=[
        CacheMiddleware(),      # 缓存
        RetryMiddleware(max_retries=3),  # 失败重试 3 次
    ]
)
```

---

## 七、实际应用场景

### 7.1 敏感信息脱敏

```python
from langchain.middleware import BeforeMiddleware

class SensitiveDataMiddleware(BeforeMiddleware):
    """对输入中的敏感信息（如手机号、身份证）脱敏"""
    def before(self, input):
        import re
        text = str(input)
        text = re.sub(r'1[3-9]\d{9}', '[手机号已脱敏]', text)  # 手机号
        text = re.sub(r'\d{17}[\dXx]', '[身份证已脱敏]', text)  # 身份证
        return text
```

### 7.2 调用统计与监控

```python
from langchain.middleware import AroundMiddleware

class MetricsMiddleware(AroundMiddleware):
    """统计调用次数、token 消耗、耗时"""
    def before(self, input):
        self.start = time.time()
        return input

    def after(self, output):
        duration = time.time() - self.start
        # 上报到监控系统
        metrics.record(duration=duration, tokens=output.usage_metadata)
        return output
```

### 7.3 统一错误处理

```python
from langchain.middleware import AroundMiddleware

class ErrorHandlingMiddleware(AroundMiddleware):
    """统一捕获异常，返回友好提示"""
    def after(self, output):
        return output

    def on_error(self, error):
        print(f"调用出错: {error}")
        return "抱歉，服务暂时不可用，请稍后重试。"
```

---

## 八、与 LangChain.js 的对比

| 维度 | LangChain Python | LangChain.js |
|---|---|---|
| `middleware` API | ✅ 已支持（0.3.x 后期 / 0.4.x） | ❌ 尚未提供 |
| 中间件类型 | Before / After / Around | — |
| 内置中间件 | 缓存、重试、限流、日志 | — |
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

1. **单一职责**：每个中间件只做一件事（日志、缓存、限流分开写）
2. **保持顺序**：注意中间件声明顺序，before 按顺序、after 逆序执行
3. **避免副作用**：中间件应尽量无状态，或使用可重入设计
4. **性能考量**：中间件会增加调用开销，避免在热路径中做重操作
5. **关注版本**：中间件是较新特性，使用前确认 `langchain` 版本支持

---

## 总结

- **中间件** 是 LangChain Python 版在模型调用前后插入自定义逻辑的机制
- 分为 **Before / After / Around** 三种类型
- 通过继承基类或装饰器定义，在创建模型或调用时传入
- 内置了缓存、重试、限流、日志等常用中间件
- **LangChain.js 目前没有 `middleware` API**，可用 `RunnableLambda` 链式组合或 `callbacks` 回调实现类似功能