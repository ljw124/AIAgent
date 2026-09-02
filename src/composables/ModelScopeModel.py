'''
Author: lujinwei lujinwei@hikvision.com.cn
Date: 2026-09-01 12:45:00
LastEditors: lujinwei lujinwei@hikvision.com.cn
LastEditTime: 2026-09-02 09:35:33
Description: 
'''
"""
ModelScopeModel.py — 魔搭社区大模型调用（Python 方式）
============================================================
安装依赖：
    pip install langchain langchain-openai langchain-core python-dotenv

运行方式：
    # 交互模式（默认问题）
    python src/composables/ModelScopeModel.py

    # 命令行传入问题
    python src/composables/ModelScopeModel.py "你好，请介绍一下你自己"

    # 通过后端 API 调用（JSON 模式）
    python src/composables/ModelScopeModel.py --json '{"message":"你好","temperature":0.7}'
============================================================
"""
import os
import sys
import json
import time
from dotenv import load_dotenv

# 加载项目根目录的 .env 文件（包含 MODELSCOPE_API_KEY 和 LangSmith 配置）
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

# LangSmith 追踪：LangChain Python SDK 会自动读取以下环境变量，
# 无需额外代码即可自动上报 trace 到 LangSmith 平台。
# - LANGSMITH_TRACING=true
# - LANGSMITH_ENDPOINT=https://api.smith.langchain.com
# - LANGSMITH_API_KEY=lsv2_pt_...
# - LANGSMITH_PROJECT=ai-agent
# 参考：https://docs.smith.langchain.com/observability/how_to_guides/trace_with_langchain_python

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

# 魔搭社区 API 配置（OpenAI 兼容模式）
MODELSCOPE_API_KEY = os.getenv("MODELSCOPE_API_KEY")
MODELSCOPE_BASE_URL = os.getenv("MODELSCOPE_BASE_URL", "https://api-inference.modelscope.cn/v1")
MODELSCOPE_MODEL = "deepseek-ai/DeepSeek-V4-Flash-0731"


def chat(message, temperature=0.7, max_retries=5):
    """调用魔搭社区大模型并返回回复"""
    if not MODELSCOPE_API_KEY:
        raise ValueError("未找到 MODELSCOPE_API_KEY，请检查 .env 文件")

    # 使用 LangChain 的 ChatOpenAI 调用魔搭 API（OpenAI 兼容模式）。
    # 这样 LangSmith 会自动追踪每次调用（无需额外代码）。
    # 注意：不传 max_tokens，魔搭 API 不强制要求该参数。
    llm = ChatOpenAI(
        model=MODELSCOPE_MODEL,
        api_key=MODELSCOPE_API_KEY,
        base_url=MODELSCOPE_BASE_URL,
        temperature=temperature,
    )

    # 魔搭 API 偶发返回空响应（choices 为 null），且连续快速请求时容易触发限流。
    # 因此采用「递增退避」重试策略：每次失败后等待时间逐渐加长，给 API 恢复时间。
    for attempt in range(1, max_retries + 1):
        try:
            response = llm.invoke([
                SystemMessage(content="你是一个有用的AI助手，请用中文回答。"),
                HumanMessage(content=message),
            ])
            # 检查响应是否有效
            if response and response.content:
                return response.content
        except Exception as e:
            # 魔搭 API 偶发返回空响应（choices 为 null），LangChain 会抛出 TypeError
            if "null value for 'choices'" in str(e) or "choices" in str(e):
                pass  # 空响应，走重试逻辑
            else:
                raise  # 其他异常直接抛出

        # 空响应，按递增退避策略等待后重试（2s、4s、8s、16s...）
        if attempt < max_retries:
            backoff = 2 ** attempt  # 2, 4, 8, 16...
            print(f"[ModelScope] 第 {attempt} 次请求返回空响应，{backoff} 秒后重试...", file=sys.stderr)
            time.sleep(backoff)

    raise ValueError("魔搭 API 多次返回空响应，请稍后重试")


if __name__ == "__main__":
    # JSON 模式：供后端 API 调用
    if len(sys.argv) >= 3 and sys.argv[1] == "--json":
        try:
            params = json.loads(sys.argv[2])
            message = params.get("message", "你好")
            temperature = params.get("temperature", 0.7)
            result = chat(message, temperature)
            print(json.dumps({"content": result}, ensure_ascii=False))
        except Exception as e:
            print(json.dumps({"error": str(e)}, ensure_ascii=False))
            sys.exit(1)
    # 命令行参数模式
    elif len(sys.argv) >= 2:
        message = sys.argv[1]
        result = chat(message)
        print(result)
    # 默认交互模式
    else:
        result = chat("你好，请用一句话介绍你自己")
        print(result)