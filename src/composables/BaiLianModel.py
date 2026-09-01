"""
BaiLianModel.py — 百炼大模型调用（Python 方式）
============================================================
安装依赖：
    pip install langchain langchain-openai langchain-core python-dotenv

运行方式：
    python src/composables/BaiLianModel.py
============================================================
"""
import os
import sys
from dotenv import load_dotenv

# 加载项目根目录的 .env 文件
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

API_KEY = os.getenv("DASHSCOPE_API_KEY")
BASE_URL = os.getenv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")

if not API_KEY:
    print("[ERROR] 未找到 DASHSCOPE_API_KEY，请检查 .env 文件")
    sys.exit(1)

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

# 初始化模型
llm = ChatOpenAI(
    model="qwen-plus",
    api_key=API_KEY,
    base_url=BASE_URL,
    temperature=0.7,
)

# 测试调用
if __name__ == "__main__":
    response = llm.invoke("你好，请用一句话介绍你自己")
    print(response.content)
