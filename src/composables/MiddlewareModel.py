'''
Author: lujinwei lujinwei@hikvision.com.cn
Date: 2026-09-07 10:00:00
LastEditors: lujinwei lujinwei@hikvision.com.cn
LastEditTime: 2026-09-08 12:39:35
Description: LangChain Python 中间件（Middleware）演示脚本
'''
"""
MiddlewareModel.py — LangChain Python 中间件（Middleware）演示
============================================================
本脚本演示 LangChain Python 的中间件机制，包含 11 个中间件：
    1. Before 中间件（调用前）：参数校验、鉴权、注入上下文
    2. After 中间件（调用后）：结果处理、缓存写入、指标采集
    3. Around 中间件（环绕）：同时包裹前后逻辑，可捕获异常
    4. 脱敏中间件：敏感数据脱敏
    5. 指标中间件：统计调用次数与耗时
    6. 重试中间件：调用失败自动重试
    7. 摘要中间件（官方内置）：SummarizationMiddleware — 长文本自动摘要
    8. 人机协同中间件（官方内置）：HumanInTheLoopMiddleware — 关键节点人工审核
    9. PII 中间件（官方内置）：PIIMiddleware — 检测过滤敏感信息
    10. 待办列表中间件（官方内置）：TodoListMiddleware — 自动提取行动项
    11. 调用限制中间件（官方内置）：ModelCallLimitMiddleware — 限制调用次数

架构说明：
- 前 6 个为「自定义中间件」，继承 BaseCallbackHandler，通过 ChatOpenAI(callbacks=) 传递
- 后 5 个为「官方内置中间件」，继承 AgentMiddleware，通过 create_agent(middleware=) 传递
- 两种中间件通过 create_agent() 统一编排，协同工作

安装依赖：
    pip install langchain langchain-openai langchain-core python-dotenv

运行方式：
    # 交互模式（默认问题）
    python src/composables/MiddlewareModel.py

    # 命令行传入问题
    python src/composables/MiddlewareModel.py "你好，请介绍一下你自己"

    # 通过后端 API 调用（JSON 模式）
    python src/composables/MiddlewareModel.py --json '{"message":"你好","temperature":0.7,"model":"EB-DeepSeek-V4-Pro"}'
============================================================
"""

# ============================================================
# 第一部分：导入依赖模块
# ============================================================

# --- 标准库（Python 自带，无需安装）---
import os        # 操作系统相关：读取环境变量、拼接文件路径
import sys       # 系统相关：命令行参数(sys.argv)、标准输出/错误流(sys.stdout/sys.stderr)
import json      # JSON 处理：json.loads() 解析 JSON 字符串 → Python 字典
                 #           json.dumps() 将 Python 字典 → JSON 字符串
import time      # 时间相关：time.time() 获取当前时间戳（秒），用于计时
import re        # 正则表达式：re.sub() 用于文本替换（如手机号脱敏）

# --- 第三方库（需要 pip install）---
from dotenv import load_dotenv
# load_dotenv: 从 .env 文件中读取配置（如 API Key），加载到环境变量中

# 加载项目根目录的 .env 文件
# os.path.dirname(__file__)  → 当前文件所在目录 = src/composables/
# os.path.join(..., '..', '..', '.env') → 向上两级 = 项目根目录/.env
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

# 从环境变量读取 API 配置（内网大模型）
# os.getenv("KEY", "默认值")：读取环境变量，如果不存在则使用默认值
API_KEY = os.getenv("INNER_API_KEY")
BASE_URL = os.getenv("INNER_BASE_URL", "http://lanz.hikvision.com/v3/openai/model")

# 如果没有 API Key，输出错误 JSON 并退出程序
# sys.exit(1)：退出程序，1 表示异常退出（0 表示正常退出）
if not API_KEY:
    print(json.dumps({"error": "未找到 INNER_API_KEY，请检查 .env 文件"}))
    sys.exit(1)

# --- LangChain 相关库 ---
from langchain_openai import ChatOpenAI
# ChatOpenAI: LangChain 中用于调用 OpenAI 兼容 API 的类
# 内网大模型提供了 OpenAI 兼容接口，所以可以用 ChatOpenAI 调用

from langchain_core.messages import HumanMessage, SystemMessage
# HumanMessage: 代表用户发送的消息
# SystemMessage: 代表系统提示词（设定 AI 的角色和行为）

from langchain_core.callbacks import BaseCallbackHandler
# BaseCallbackHandler: 回调处理器基类
# 自定义中间件继承这个类，重写其中的钩子方法（如 on_llm_start、on_llm_end）

# ★ 官方内置中间件（来自 langchain.agents.middleware）
# 这些中间件继承 AgentMiddleware，通过 create_agent(middleware=) 传递
from langchain.agents.middleware import (
    SummarizationMiddleware,      # 摘要中间件：自动摘要长对话历史
    HumanInTheLoopMiddleware,     # 人机协同中间件：关键操作需人工确认
    PIIMiddleware,                # PII 中间件：检测和脱敏个人身份信息
    TodoListMiddleware,           # 待办列表中间件：提供 write_todos 工具
    ModelCallLimitMiddleware,     # 调用限制中间件：限制模型调用次数
)

# ★ create_agent：LangChain 官方 Agent 创建函数
# 支持 middleware= 参数传入 AgentMiddleware 列表
from langchain.agents import create_agent


# ============================================================
# 第二部分：日志工具函数
# ============================================================

def log(msg):
    """
    将中间件日志输出到 stderr（标准错误流），而不是 stdout（标准输出流）。

    【为什么不用 print()？】
    - stdout 用于输出最终 JSON 结果给 Node.js 后端解析
    - 如果日志也输出到 stdout，会混入 JSON 中导致解析失败
    - stderr 是独立的输出通道，不会污染 stdout

    【参数说明】
    - file=sys.stderr：输出到标准错误流
    - flush=True：立即刷新缓冲区，确保日志实时显示（不缓冲）
    """
    print(msg, file=sys.stderr, flush=True)


# ============================================================
# 第三部分：六个自定义中间件类（继承 BaseCallbackHandler）
# ============================================================
# 【什么是中间件？】
# 中间件就像"拦截器"，在大模型调用前后自动执行额外逻辑。
# 类比：就像进出小区时，保安（中间件）在门口检查（Before）、登记（After）。
#
# 【BaseCallbackHandler 是什么？】
# LangChain 提供的"回调钩子"基类。当 LLM 调用发生时，LangChain 会自动
# 调用这些钩子方法。我们只需要继承它并重写需要的方法即可。
#
# 【执行顺序】
# 所有中间件的 on_llm_start 按列表顺序依次执行
# → 实际调用大模型 API
# → 所有中间件的 on_llm_end 按列表顺序依次执行
# ============================================================


# ----------------------------------------------------------
# 中间件一：Before 中间件 — 调用前执行
# ----------------------------------------------------------
class BeforeMiddleware(BaseCallbackHandler):
    """
    Before 中间件：在 LLM 调用之前执行。

    【Python 语法说明】
    - class Xxx(BaseCallbackHandler):  定义类，继承 BaseCallbackHandler
    - def __init__(self):              构造函数，创建实例时自动调用
    - super().__init__():              调用父类的构造函数（必须！）
    - self.start_time                  实例变量，每个实例独立拥有

    【用途】
    - 参数校验：检查用户输入是否合法
    - 鉴权：验证调用权限
    - 注入上下文：在提示词中自动添加系统信息
    - 记录请求开始时间
    """

    def __init__(self):
        """构造函数：初始化实例变量"""
        super().__init__()          # 调用父类 BaseCallbackHandler 的 __init__
        self.start_time = None      # 记录调用开始时间，初始为 None

    def on_llm_start(self, serialized, prompts, **kwargs):
        """
        LLM 开始调用时，LangChain 自动调用此方法。

        【参数说明】
        - serialized: 字典，包含 LLM 的配置信息（模型名、参数等）
        - prompts: 列表，包含要发送给 LLM 的提示词（已转为字符串）
        - **kwargs: 接收其他可能的关键字参数（** 表示任意数量）

        【Python 语法说明】
        - time.time(): 返回当前 Unix 时间戳（1970-01-01 至今的秒数，浮点数）
        - time.strftime('%H:%M:%S'): 将时间格式化为 "时:分:秒" 字符串
        - len(prompts): 返回列表长度（提示词数量）
        - f"...{变量}...": f-string 格式化字符串，{} 内可以写变量或表达式
        """
        self.start_time = time.time()
        log(f"[Before 中间件] ⏱️ LLM 调用开始，时间戳: {time.strftime('%H:%M:%S')}")
        log(f"[Before 中间件] 📝 输入消息数: {len(prompts)}")
        # super().on_llm_start(...) 调用父类的同名方法，保证回调链正常传递
        return super().on_llm_start(serialized, prompts, **kwargs)


# ----------------------------------------------------------
# 中间件二：After 中间件 — 调用后执行
# ----------------------------------------------------------
class AfterMiddleware(BaseCallbackHandler):
    """
    After 中间件：在 LLM 调用之后执行。

    【用途】
    - 结果处理：格式化、过滤、后处理
    - 缓存写入：将结果存入缓存，下次相同问题直接返回
    - 指标采集：记录输出长度、token 消耗等
    - 日志记录：记录完整的请求-响应日志
    """

    def on_llm_end(self, response, **kwargs):
        """
        LLM 调用成功结束时，LangChain 自动调用此方法。

        【参数说明】
        - response: LLMResult 对象，包含生成的回复
            - response.generations: 二维列表，generations[第几个提示词][第几个候选]
            - response.generations[0][0].text: 第一个提示词的第一个候选文本

        【Python 语法说明】
        - hasattr(obj, 'attr'): 检查对象是否有某个属性（安全访问）
        - response.generations[0][0]: 列表索引，[0] 取第一个元素
        """
        # 安全地提取生成的文本
        if hasattr(response, 'generations') and response.generations:
            text = response.generations[0][0].text
            log(f"[After 中间件] ✅ LLM 调用结束")
            log(f"[After 中间件] 📊 输出长度: {len(text)} 字符")
            log(f"[After 中间件] 💾 可将结果写入缓存/数据库")
        return super().on_llm_end(response, **kwargs)

    def on_llm_error(self, error, **kwargs):
        """
        LLM 调用出错时，LangChain 自动调用此方法。

        【参数说明】
        - error: 异常对象，包含错误信息
        """
        log(f"[After 中间件] ❌ LLM 调用出错: {error}")
        return super().on_llm_error(error, **kwargs)


# ----------------------------------------------------------
# 中间件三：Around 中间件 — 环绕执行
# ----------------------------------------------------------
class AroundMiddleware(BaseCallbackHandler):
    """
    Around 中间件：同时包裹调用前后逻辑，可捕获异常。

    【与 Before/After 的区别】
    - Before + After 是两个独立的中间件，各管各的
    - Around 是同一个中间件同时处理前后，可以共享状态（如 start_time）

    【用途】
    - 统一计时：记录每次调用的耗时
    - 统一异常处理：捕获并处理所有异常
    - 统一日志：记录完整的调用生命周期
    """

    def __init__(self):
        super().__init__()
        self.start_time = None  # 记录开始时间，供 on_llm_end 计算耗时

    def on_llm_start(self, serialized, prompts, **kwargs):
        """调用开始：记录起始时间"""
        self.start_time = time.time()
        log(f"[Around 中间件] 🔄 开始计时")
        return super().on_llm_start(serialized, prompts, **kwargs)

    def on_llm_end(self, response, **kwargs):
        """调用结束：计算并输出耗时"""
        # 三元表达式：如果 start_time 有值则计算耗时，否则为 0
        elapsed = time.time() - self.start_time if self.start_time else 0
        log(f"[Around 中间件] ⏱️ 调用耗时: {elapsed:.2f} 秒")
        return super().on_llm_end(response, **kwargs)

    def on_llm_error(self, error, **kwargs):
        """调用出错：记录错误和耗时"""
        elapsed = time.time() - self.start_time if self.start_time else 0
        log(f"[Around 中间件] ❌ 调用失败，耗时: {elapsed:.2f} 秒，错误: {error}")
        return super().on_llm_error(error, **kwargs)


# ----------------------------------------------------------
# 中间件四：敏感数据脱敏中间件
# ----------------------------------------------------------
class SensitiveDataMiddleware(BaseCallbackHandler):
    """
    敏感数据脱敏中间件：在调用前对输入进行脱敏处理。

    【用途】
    - 防止 API Key、手机号、身份证号等敏感信息泄露到日志中
    - 在日志记录前将敏感信息替换为占位符（如 138****0000）

    【注意】
    这个中间件只脱敏日志输出，不会修改实际发送给 LLM 的内容。
    """

    def on_llm_start(self, serialized, prompts, **kwargs):
        """
        遍历所有提示词，对其中的敏感信息进行脱敏后输出日志。

        【Python 语法说明】
        - enumerate(prompts): 同时获取索引 i 和值 prompt
            for i, prompt in enumerate(["a", "b"]):
                # i=0, prompt="a"; i=1, prompt="b"
        - str(prompt): 将 prompt 对象转为字符串
        - re.sub(正则, 替换文本, 原文本): 正则替换
            r'1[3-9]\\d{9}' 匹配：1开头 + 3-9第二位 + 9位数字 = 11位手机号
        - masked[:80]: 切片，取前 80 个字符（防止日志过长）
        """
        for i, prompt in enumerate(prompts):
            masked = str(prompt)
            # 将手机号替换为脱敏版本
            masked = re.sub(r'1[3-9]\d{9}', '138****0000', masked)
            log(f"[脱敏中间件] 🔒 输入 #{i} 已脱敏: {masked[:80]}...")
        return super().on_llm_start(serialized, prompts, **kwargs)


# ----------------------------------------------------------
# 中间件五：指标采集中间件
# ----------------------------------------------------------
class MetricsMiddleware(BaseCallbackHandler):
    """
    指标采集中间件：统计调用次数、平均耗时等指标。

    【Python 语法说明 — 类变量 vs 实例变量】
    - call_count = 0      ← 类变量，所有实例共享（用 MetricsMiddleware.call_count 访问）
    - self.start_time     ← 实例变量，每个实例独立（用 self.start_time 访问）
    这里用类变量是因为每次请求都会创建新的中间件实例，
    但统计数据需要跨请求累计。

    【用途】
    - 监控 LLM 调用性能
    - 成本核算（按调用次数计费）
    - 性能优化（发现慢查询）
    """

    # 类变量：所有 MetricsMiddleware 实例共享
    call_count = 0       # 累计调用次数
    total_time = 0.0     # 累计总耗时（秒）

    def __init__(self):
        super().__init__()
        self.start_time = None  # 实例变量：当前这次调用的开始时间

    def on_llm_start(self, serialized, prompts, **kwargs):
        """记录本次调用开始时间"""
        self.start_time = time.time()
        return super().on_llm_start(serialized, prompts, **kwargs)

    def on_llm_end(self, response, **kwargs):
        """累加调用次数和耗时，计算平均值"""
        # 通过类名访问类变量（不是 self.xxx）
        MetricsMiddleware.call_count += 1
        if self.start_time:
            MetricsMiddleware.total_time += time.time() - self.start_time
        # 计算平均耗时（总耗时 / 总次数）
        avg = MetricsMiddleware.total_time / MetricsMiddleware.call_count
        log(f"[指标中间件] 📈 累计调用: {MetricsMiddleware.call_count} 次，平均耗时: {avg:.2f} 秒")
        return super().on_llm_end(response, **kwargs)


# ----------------------------------------------------------
# 中间件六：重试中间件
# ----------------------------------------------------------
class RetryMiddleware(BaseCallbackHandler):
    """
    重试中间件：调用失败时自动重试。

    【注意】
    当前实现仅记录重试日志，实际的重试逻辑由 LangChain 内部处理。
    这里主要演示如何通过中间件感知和记录重试行为。

    【用途】
    - 提高 LLM 调用的可靠性
    - 应对临时性网络错误、服务限流等
    """

    def __init__(self, max_retries=2):
        """
        构造函数。

        【参数说明】
        - max_retries: 最大重试次数，默认 2 次
        """
        super().__init__()
        self.max_retries = max_retries  # 最大重试次数
        self.retry_count = 0            # 当前已重试次数

    def on_llm_error(self, error, **kwargs):
        """调用出错时，记录重试信息"""
        if self.retry_count < self.max_retries:
            self.retry_count += 1
            log(f"[重试中间件] 🔁 第 {self.retry_count} 次重试，错误: {error}")
        return super().on_llm_error(error, **kwargs)


# ============================================================
# 第四部分：中间件组装函数
# ============================================================

def build_custom_middlewares(enable_before=True, enable_after=True, enable_around=True,
                              enable_sensitive=True, enable_metrics=True, enable_retry=True):
    """
    根据配置开关，组装「自定义中间件」列表（继承 BaseCallbackHandler 的 6 个）。

    【参数说明】
    每个参数对应一个自定义中间件的开关，True=启用，False=禁用

    【返回值】
    自定义中间件实例列表，传给 ChatOpenAI 的 callbacks 参数
    """
    middlewares = []

    if enable_before:
        middlewares.append(BeforeMiddleware())
    if enable_after:
        middlewares.append(AfterMiddleware())
    if enable_around:
        middlewares.append(AroundMiddleware())
    if enable_sensitive:
        middlewares.append(SensitiveDataMiddleware())
    if enable_metrics:
        middlewares.append(MetricsMiddleware())
    if enable_retry:
        middlewares.append(RetryMiddleware())

    return middlewares


def build_official_middlewares(enable_summarization=True, enable_human_in_the_loop=True,
                                enable_pii=True, enable_todo=True, enable_call_limit=True):
    """
    根据配置开关，组装「官方内置中间件」列表（继承 AgentMiddleware 的 5 个）。

    这些中间件来自 langchain.agents.middleware，通过 create_agent(middleware=) 传递。

    【参数说明】
    每个参数对应一个官方中间件的开关，True=启用，False=禁用

    【返回值】
    官方中间件实例列表，传给 create_agent() 的 middleware 参数
    """
    middlewares = []

    if enable_summarization:
        # SummarizationMiddleware: 当对话历史接近 token 限制时自动摘要
        # 参数：
        #   model: 用于生成摘要的模型（字符串或 BaseChatModel）
        #   trigger: 触发条件，如 ('tokens', 4000) 表示超过 4000 token 时触发
        #   keep: 保留最近的消息数量，如 ('messages', 20) 保留最近 20 条
        middlewares.append(SummarizationMiddleware(
            model=ChatOpenAI(
                model="EB-DeepSeek-V4-Pro",
                api_key=API_KEY,
                base_url=BASE_URL,
                temperature=0.3,  # 摘要用较低温度，更稳定
            ),
            trigger=('tokens', 4000),
            keep=('messages', 20),
        ))

    if enable_human_in_the_loop:
        # HumanInTheLoopMiddleware: 在工具调用前暂停，等待人工确认
        # 参数：
        #   interrupt_on: 指定在哪些节点中断
        #     {'tool_use': True} — 在每次工具调用前中断
        #     {'tool_use': {'allowed_decisions': ['approve', 'reject']}} — 自定义决策选项
        middlewares.append(HumanInTheLoopMiddleware(
            interrupt_on={'tool_use': True},
            description_prefix='工具执行需要人工审批',
        ))

    if enable_pii:
        # PIIMiddleware: 检测和脱敏个人身份信息
        # 参数：
        #   pii_type: PII 类型 — 'email', 'credit_card', 'ip', 'mac_address', 'url'
        #   strategy: 处理策略 — 'block'(阻止), 'redact'(脱敏), 'mask'(掩码), 'hash'(哈希)
        #   apply_to_input: 是否对输入应用（默认 True）
        #   apply_to_output: 是否对输出应用（默认 False）
        middlewares.append(PIIMiddleware(
            pii_type='email',
            strategy='redact',
            apply_to_input=True,
            apply_to_output=True,
        ))

    if enable_todo:
        # TodoListMiddleware: 为 Agent 提供 write_todos 工具
        # Agent 可以自动创建和管理任务列表
        # 无需额外参数，使用默认配置即可
        middlewares.append(TodoListMiddleware())

    if enable_call_limit:
        # ModelCallLimitMiddleware: 限制模型调用次数
        # 参数：
        #   run_limit: 单次运行的最大调用次数
        #   thread_limit: 跨运行（线程级别）的最大调用次数
        #   exit_behavior: 达到限制后的行为 — 'end'(正常结束) 或 'error'(抛出异常)
        middlewares.append(ModelCallLimitMiddleware(
            run_limit=10,
            exit_behavior='end',
        ))

    return middlewares


# ============================================================
# 第五部分：核心聊天函数
# ============================================================

def chat(message, temperature=0.7, model="EB-DeepSeek-V4-Pro", middleware_config=None):
    """
    使用中间件调用内网大模型并返回回复。

    这是整个脚本的核心函数，被主入口和外部调用。

    【架构说明】
    本函数使用双层中间件架构：
    1. 自定义中间件（6个）→ 通过 ChatOpenAI(callbacks=) 传递，在 LLM 调用级别工作
    2. 官方内置中间件（5个）→ 通过 create_agent(middleware=) 传递，在 Agent 级别工作
    3. 两者通过 create_agent() 统一编排

    【参数说明】
    - message: str，用户输入的消息
    - temperature: float，温度参数（0~2）
        - 0 = 确定性输出（适合代码生成、事实问答）
        - 1 = 平衡
        - 2 = 创造性输出（适合创意写作）
    - model: str，模型名称（内网大模型）
        - "EB-DeepSeek-V4-Pro"：DeepSeek V4 Pro（推荐）
    - middleware_config: dict，中间件开关配置
        格式：{"before": True, "after": False, ...}
        不传则默认启用所有中间件

    【返回值】
    str，大模型的回复文本
    """
    # 如果没有传 middleware_config，使用空字典（即全部使用默认值 True）
    if middleware_config is None:
        middleware_config = {}

    # 第一步：组装自定义中间件（BaseCallbackHandler 子类）
    custom_middlewares = build_custom_middlewares(
        enable_before=middleware_config.get("before", True),
        enable_after=middleware_config.get("after", True),
        enable_around=middleware_config.get("around", True),
        enable_sensitive=middleware_config.get("sensitive", True),
        enable_metrics=middleware_config.get("metrics", True),
        enable_retry=middleware_config.get("retry", True),
    )

    # 第二步：组装官方内置中间件（AgentMiddleware 子类）
    official_middlewares = build_official_middlewares(
        enable_summarization=middleware_config.get("summarization", True),
        enable_human_in_the_loop=middleware_config.get("human_in_the_loop", True),
        enable_pii=middleware_config.get("pii", True),
        enable_todo=middleware_config.get("todo", True),
        enable_call_limit=middleware_config.get("call_limit", True),
    )

    # 第三步：创建 ChatOpenAI 实例（带自定义中间件回调）
    # 自定义中间件通过 callbacks= 参数注入，在每次 LLM API 调用前后触发
    llm = ChatOpenAI(
        model=model,
        api_key=API_KEY,
        base_url=BASE_URL,
        temperature=temperature,
        callbacks=custom_middlewares,  # ★ 自定义中间件通过 callbacks 传递
    )

    # 第四步：使用 create_agent 创建 Agent（带官方内置中间件）
    # create_agent 是 LangChain 官方推荐的 Agent 创建方式
    # - model: 传入已配置好 callbacks 的 ChatOpenAI 实例
    # - middleware: 传入官方内置中间件列表
    # - system_prompt: 系统提示词
    agent = create_agent(
        model=llm,
        middleware=official_middlewares,  # ★ 官方中间件通过 middleware 参数传递
        system_prompt="你是一个有用的AI助手，请用中文回答。",
    )

    # 第五步：调用 Agent
    # agent.invoke() 返回包含 messages 和中间件状态（如 todos）的字典
    result = agent.invoke({
        "messages": [HumanMessage(content=message)],
    })

    # 第六步：提取最终回复文本
    # result["messages"] 是完整的消息列表，最后一条是 AI 的回复
    messages = result.get("messages", [])
    if messages:
        last_msg = messages[-1]
        return last_msg.content
    return ""


# ============================================================
# 第六部分：主入口
# ============================================================

# 【Python 语法说明】
# if __name__ == "__main__": 是 Python 的"程序入口"判断
# - 当直接运行此文件时（python MiddlewareModel.py），__name__ 的值为 "__main__"
# - 当被其他文件 import 时，__name__ 的值为模块名 "MiddlewareModel"
# 这样保证了：直接运行时有交互逻辑，被 import 时只提供函数和类

if __name__ == "__main__":
    # sys.argv 是命令行参数列表
    # sys.argv[0] = 脚本文件名
    # sys.argv[1] = 第一个参数
    # sys.argv[2] = 第二个参数
    # ...

    # --- 模式一：JSON 模式（供 Node.js 后端 API 调用）---
    # 命令示例：python MiddlewareModel.py --json '{"message":"你好",...}'
    if len(sys.argv) >= 3 and sys.argv[1] == "--json":
        try:
            # json.loads()：将 JSON 字符串解析为 Python 字典
            params = json.loads(sys.argv[2])
            message = params.get("message", "你好")
            temperature = params.get("temperature", 0.7)
            model = params.get("model", "EB-DeepSeek-V4-Pro")
            middleware_config = params.get("middleware", {})

            # 调用核心函数
            result = chat(message, temperature, model, middleware_config)

            # 将结果以 JSON 格式输出到 stdout（供 Node.js 解析）
            # ensure_ascii=False：允许输出中文（不转义为 \uXXXX）
            print(json.dumps({"content": result}, ensure_ascii=False))

        except Exception as e:
            # 捕获所有异常，以 JSON 格式输出错误信息
            print(json.dumps({"error": str(e)}, ensure_ascii=False))
            sys.exit(1)  # 异常退出

    # --- 模式二：命令行参数模式 ---
    # 命令示例：python MiddlewareModel.py "你好，请介绍一下你自己"
    elif len(sys.argv) >= 2:
        message = sys.argv[1]
        result = chat(message)
        print(result)

    # --- 模式三：默认交互模式 ---
    # 命令示例：python MiddlewareModel.py
    else:
        result = chat("你好，请用一句话介绍你自己")
        print(result)