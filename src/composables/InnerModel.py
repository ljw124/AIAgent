"""
InnerModel.py — 内网大模型调用（Python 方式）
============================================================
安装依赖：
    pip install langchain langchain-openai langchain-core python-dotenv

运行方式：
    # 交互模式（默认问题）
    python src/composables/InnerModel.py

    # 命令行传入问题
    python src/composables/InnerModel.py "你好，请介绍一下你自己"

    # 通过后端 API 调用（JSON 模式）
    python src/composables/InnerModel.py --json '{"message":"你好","temperature":0.7}'
============================================================
"""
import os
import sys
import json
from dotenv import load_dotenv

# 加载项目根目录的 .env 文件（包含 LangSmith 配置）
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

API_KEY = os.getenv("INNER_API_KEY")
BASE_URL = os.getenv("INNER_BASE_URL", "http://lanz.hikvision.com/v3/openai/model")

if not API_KEY:
    print(json.dumps({"error": "未找到 INNER_API_KEY，请检查 .env 文件"}))
    sys.exit(1)

# LangSmith 追踪：LangChain Python SDK 会自动读取以下环境变量，
# 无需额外代码即可自动上报 trace 到 LangSmith 平台。
# - LANGSMITH_TRACING=true
# - LANGSMITH_ENDPOINT=https://api.smith.langchain.com
# - LANGSMITH_API_KEY=lsv2_pt_...
# - LANGSMITH_PROJECT=ai-agent
# 参考：https://docs.smith.langchain.com/observability/how_to_guides/trace_with_langchain_python

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage


def chat(message, temperature=0.7):
    """调用内网大模型并返回回复"""
    llm = ChatOpenAI(
        model="EB-DeepSeek-V4-Pro",
        api_key=API_KEY,
        base_url=BASE_URL,
        temperature=temperature,
    )
    response = llm.invoke([
        SystemMessage(content="你是一个有用的AI助手，请用中文回答。"),
        HumanMessage(content=message),
    ])
    return response.content


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