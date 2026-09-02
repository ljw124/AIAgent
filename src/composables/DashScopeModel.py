'''
Author: lujinwei lujinwei@hikvision.com.cn
Date: 2026-09-01 14:19:34
LastEditors: lujinwei lujinwei@hikvision.com.cn
LastEditTime: 2026-09-02 19:50:38
Description: 
'''
"""
DashScopeModel.py — 百炼大模型调用（Python 方式）
============================================================
安装依赖：
    pip install langchain langchain-openai langchain-core python-dotenv

运行方式：
    # 交互模式（默认问题）
    python src/composables/DashScopeModel.py

    # 命令行传入问题
    python src/composables/DashScopeModel.py "你好，请介绍一下你自己"

    # 通过后端 API 调用（JSON 模式）
    python src/composables/DashScopeModel.py --json '{"message":"你好","temperature":0.7,"model":"qwen-plus"}'
============================================================
"""
import os
import sys
import json
from dotenv import load_dotenv

# 加载项目根目录的 .env 文件
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

API_KEY = os.getenv("DASHSCOPE_API_KEY")
BASE_URL = os.getenv("DASHSCOPE_BASE_URL", "https://ws-j6nf3ofbsu23jbhk.cn-beijing.maas.aliyuncs.com/compatible-mode/v1")

if not API_KEY:
    print(json.dumps({"error": "未找到 DASHSCOPE_API_KEY，请检查 .env 文件"}))
    sys.exit(1)

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage


def chat(message, temperature=0.7, model="qwen-plus"):
    """调用百炼大模型并返回回复"""
    llm = ChatOpenAI(
        model=model,
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
            model = params.get("model", "qwen-plus")
            result = chat(message, temperature, model)
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
