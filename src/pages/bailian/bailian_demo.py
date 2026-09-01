"""
============================================================
bailian_demo.py — 百炼大模型调用示例
============================================================
安装依赖：
    pip install langchain langchain-openai python-dotenv openai

环境变量（.env 文件）：
    DASHSCOPE_API_KEY="your-api-key"
    DASHSCOPE_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"

运行方式：
    python src/pages/bailian_demo.py
============================================================
"""

import os
import sys
from dotenv import load_dotenv

# 加载 .env 文件（从项目根目录）
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

API_KEY = os.getenv("DASHSCOPE_API_KEY")
BASE_URL = os.getenv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")

if not API_KEY:
    print("[ERROR] 未找到 DASHSCOPE_API_KEY，请检查 .env 文件")
    sys.exit(1)


# ============================================================
# 方式一：LangChain ChatOpenAI（推荐）
# 百炼兼容 OpenAI 协议，直接用 ChatOpenAI 即可
# ============================================================
def demo_langchain():
    """使用 LangChain 调用百炼大模型"""
    from langchain_openai import ChatOpenAI
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_core.output_parsers import StrOutputParser

    print("=" * 60)
    print("方式一：LangChain ChatOpenAI")
    print("=" * 60)

    # 初始化模型
    model = ChatOpenAI(
        model="qwen-plus",
        temperature=0.7,
        max_tokens=2048,
        api_key=API_KEY,
        base_url=BASE_URL,
    )

    # 1. 简单调用
    print("\n[1] 简单调用：")
    response = model.invoke("你好，请用一句话介绍你自己")
    print(f"   回答: {response.content}")

    # 2. LCEL 链式调用
    print("\n[2] LCEL 链式调用：")
    prompt = ChatPromptTemplate.from_template(
        "你是一个{role}。请用中文回答：{question}"
    )
    chain = prompt | model | StrOutputParser()
    result = chain.invoke({
        "role": "Python 专家",
        "question": "什么是装饰器？用一句话解释"
    })
    print(f"   回答: {result}")

    # 3. 流式输出
    print("\n[3] 流式输出：")
    print("   ", end="")
    for chunk in model.stream("用中文讲一个简短的笑话"):
        print(chunk.content, end="", flush=True)
    print()


# ============================================================
# 方式二：原生 OpenAI SDK（百炼兼容模式）
# ============================================================
def demo_openai_sdk():
    """使用原生 OpenAI SDK 调用百炼大模型"""
    from openai import OpenAI

    print("\n" + "=" * 60)
    print("方式二：原生 OpenAI SDK")
    print("=" * 60)

    client = OpenAI(
        api_key=API_KEY,
        base_url=BASE_URL,
    )

    # 非流式调用
    print("\n[1] 非流式调用：")
    completion = client.chat.completions.create(
        model="qwen-plus",
        messages=[
            {"role": "system", "content": "你是一个有用的助手，请用中文回答"},
            {"role": "user", "content": "解释一下什么是 API"}
        ],
        temperature=0.7,
        max_tokens=2048,
    )
    print(f"   回答: {completion.choices[0].message.content}")

    # 流式调用
    print("\n[2] 流式调用：")
    print("   ", end="")
    stream = client.chat.completions.create(
        model="qwen-plus",
        messages=[
            {"role": "user", "content": "用中文说一段鼓励的话，50字以内"}
        ],
        temperature=0.7,
        max_tokens=512,
        stream=True,
    )
    for chunk in stream:
        if chunk.choices[0].delta.content:
            print(chunk.choices[0].delta.content, end="", flush=True)
    print()


# ============================================================
# 方式三：多轮对话
# ============================================================
def demo_multi_turn():
    """多轮对话示例"""
    from openai import OpenAI

    print("\n" + "=" * 60)
    print("方式三：多轮对话")
    print("=" * 60)

    client = OpenAI(api_key=API_KEY, base_url=BASE_URL)

    messages = [
        {"role": "system", "content": "你是一个Python编程助手，请用中文回答"}
    ]

    questions = [
        "Python中列表和元组有什么区别？",
        "那在什么场景下应该用元组而不是列表？",
    ]

    for i, q in enumerate(questions, 1):
        messages.append({"role": "user", "content": q})
        completion = client.chat.completions.create(
            model="qwen-plus",
            messages=messages,
            temperature=0.7,
            max_tokens=1024,
        )
        answer = completion.choices[0].message.content
        messages.append({"role": "assistant", "content": answer})
        print(f"\n[第{i}轮]")
        print(f"   问: {q}")
        print(f"   答: {answer}")


# ============================================================
# 主入口
# ============================================================
if __name__ == "__main__":
    print("""
╔══════════════════════════════════════════════════════════╗
║           百炼 DashScope 大模型调用示例                    ║
║           模型: qwen-plus                                 ║
║           API: OpenAI 兼容模式                            ║
╚══════════════════════════════════════════════════════════╝
""")

    try:
        demo_langchain()
        demo_openai_sdk()
        demo_multi_turn()

        print("\n" + "=" * 60)
        print("✅ 所有示例运行完成！")
        print("=" * 60)

    except Exception as e:
        print(f"\n[ERROR] 运行失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)