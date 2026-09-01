# 学习 LangChain 所需的 Python 知识

> 本文档梳理了学习 LangChain 框架前需要掌握的 Python 知识点，按优先级分为**基础知识**、**必知必会**、**重要掌握**和**进阶了解**四个层次。

---

## 目录

0. [Python 基础知识（零基础入门）](#0-python-基础知识)
   - [0.1 变量与基本数据类型](#01-变量与基本数据类型)
   - [0.2 字符串操作](#02-字符串操作)
   - [0.3 内置数据结构](#03-内置数据结构)
   - [0.4 控制流](#04-控制流)
   - [0.5 函数定义与参数](#05-函数定义与参数)
   - [0.6 文件操作](#06-文件操作)
   - [0.7 异常处理](#07-异常处理)
   - [0.8 常用内置函数](#08-常用内置函数)
   - [0.9 环境搭建与包管理](#09-环境搭建与包管理)
1. [必知必会（基础不牢，寸步难行）](#1-必知必会)
   - [1.1 Python 进阶语法](#11-python-进阶语法)
   - [1.2 函数与 Lambda 表达式](#12-函数与-lambda-表达式)
   - [1.3 类与面向对象编程](#13-类与面向对象编程)
   - [1.4 类型注解（Type Hints）](#14-类型注解type-hints)
   - [1.5 模块与包管理](#15-模块与包管理)
2. [重要掌握（LangChain 核心依赖）](#2-重要掌握)
   - [2.1 迭代器与生成器](#21-迭代器与生成器)
   - [2.2 装饰器](#22-装饰器)
   - [2.3 上下文管理器](#23-上下文管理器)
   - [2.4 异步编程（async/await）](#24-异步编程asyncawait)
   - [2.5 Pydantic 数据模型](#25-pydantic-数据模型)
   - [2.6 回调与可调用对象](#26-回调与可调用对象)
3. [进阶了解（深入 LangChain 内部）](#3-进阶了解)
   - [3.1 描述符协议](#31-描述符协议)
   - [3.2 元类](#32-元类)
   - [3.3 泛型与类型变量](#33-泛型与类型变量)
   - [3.4 并发编程](#34-并发编程)
   - [3.5 流式处理](#35-流式处理)

---

## 0. Python 基础知识

> 如果你已经熟悉 Python 基础，可以直接跳到[第 1 章](#1-必知必会)。本章面向编程初学者或从其他语言转过来的开发者。

### 0.1 变量与基本数据类型

Python 是**动态类型**语言，变量不需要声明类型，解释器会自动推断。

```python
# ========== 数字类型 ==========
age = 25                      # int（整数）
price = 19.99                 # float（浮点数）
complex_num = 3 + 4j          # complex（复数）

# 算术运算
total = age + 10              # 35
half = price / 2              # 9.995（浮点除法）
quotient = age // 3           # 8（整除）
remainder = age % 3           # 1（取余）
power = 2 ** 10               # 1024（幂运算）

# ========== 布尔类型 ==========
is_active = True              # bool（首字母大写！）
is_empty = False

# 布尔运算
result = (age > 18) and is_active   # True
result = (age < 18) or is_active    # True
result = not is_empty               # True

# 真值判断：以下值被视为 False
# None, False, 0, 0.0, ""（空字符串）, []（空列表）, {}（空字典）, set()（空集合）

# ========== None 类型 ==========
result = None                 # 表示"无值"，类似其他语言的 null/nil

# ========== 类型检查与转换 ==========
print(type(age))              # <class 'int'>
print(isinstance(age, int))   # True

text = str(age)               # "25"（整数转字符串）
num = int("42")               # 42（字符串转整数）
pi = float("3.14")            # 3.14（字符串转浮点数）
flag = bool(1)                # True（非零为 True）
```

#### LangChain 中的实际应用

```python
# LangChain 中大量使用基本类型做配置
from langchain_openai import ChatOpenAI

model = ChatOpenAI(
    model="gpt-4o",           # str
    temperature=0.7,          # float
    max_tokens=2048,          # int
    streaming=True,           # bool
    api_key=None,             # None 表示使用环境变量
)
```

---

### 0.2 字符串操作

字符串在 LangChain 中无处不在——Prompt 模板、文档内容、API 响应都是字符串。

```python
# ========== 字符串创建 ==========
s1 = 'hello'                  # 单引号
s2 = "world"                  # 双引号（推荐）
s3 = '''多行
字符串'''                     # 三引号保留换行
s4 = "it's a book"            # 内含单引号时用双引号包裹

# ========== 字符串拼接 ==========
greeting = "Hello" + " " + "World"     # "Hello World"
repeated = "ha" * 3                     # "hahaha"

# ========== 字符串格式化（f-string，Python 3.6+，最推荐）==========
name = "Alice"
age = 25
info = f"{name} is {age} years old"    # "Alice is 25 years old"
calc = f"2 + 3 = {2 + 3}"             # "2 + 3 = 5"

# 格式化数字
pi = 3.1415926
formatted = f"Pi ≈ {pi:.2f}"           # "Pi ≈ 3.14"

# 其他格式化方式（了解即可）
info2 = "{} is {} years old".format(name, age)   # .format() 方法
info3 = "%s is %d years old" % (name, age)       # % 格式化（旧式）

# ========== 常用字符串方法 ==========
text = "  Hello, LangChain World!  "

text.strip()                  # "Hello, LangChain World!"（去除首尾空白）
text.lstrip()                 # "Hello, LangChain World!  "（去左侧空白）
text.rstrip()                 # "  Hello, LangChain World!"（去右侧空白）
text.lower()                  # "  hello, langchain world!  "
text.upper()                  # "  HELLO, LANGCHAIN WORLD!  "
text.replace("World", "Python")  # "  Hello, LangChain Python!  "
text.split(",")               # ['  Hello', ' LangChain World!  ']
",".join(["a", "b", "c"])     # "a,b,c"
text.startswith("  Hello")    # True
text.endswith("!  ")          # True
"LangChain" in text           # True（成员检查）
text.find("LangChain")        # 9（返回索引，找不到返回 -1）
text.count("l")               # 3（统计出现次数）
text.isdigit()                # False（是否全为数字）
text.isalpha()                # False（是否全为字母）

# ========== 字符串切片 ==========
s = "Hello, LangChain!"
s[0]        # 'H'（第一个字符）
s[-1]       # '!'（最后一个字符）
s[0:5]      # 'Hello'（索引 0 到 4）
s[7:]       # 'LangChain!'（索引 7 到末尾）
s[:5]       # 'Hello'（开头到索引 4）
s[::2]      # 'Hlo aghi!'（每隔一个字符）
s[::-1]     # '!niahCgnaL ,olleH'（反转字符串）

# ========== 转义字符 ==========
print("第一行\n第二行")       # \n 换行
print("列1\t列2")             # \t 制表符
print("He said \"Hello\"")    # \" 转义引号
path = r"C:\Users\name"       # r"" 原始字符串，不转义反斜杠
```

#### LangChain 中的实际应用

```python
# Prompt 模板中的字符串处理
from langchain_core.prompts import ChatPromptTemplate

# 字符串拼接构建 Prompt
system_prompt = "你是一个专业的{role}助手。"
user_prompt = f"请帮我分析以下文本：\n{text.strip()}"

# 字符串方法清洗文档内容
raw_text = "  这是一段需要处理的文本。\n\n"
clean_text = raw_text.strip().replace("\n", " ")
```

---

### 0.3 内置数据结构

Python 有四种核心内置数据结构，LangChain 中全部高频使用。

#### 列表（List）— 有序、可变

```python
# ========== 创建列表 ==========
fruits = ["apple", "banana", "cherry"]
numbers = [1, 2, 3, 4, 5]
mixed = [1, "hello", 3.14, True]     # 可混合不同类型
empty = []                            # 空列表
nested = [[1, 2], [3, 4]]            # 嵌套列表

# ========== 访问元素 ==========
fruits[0]          # "apple"（索引从 0 开始）
fruits[-1]         # "cherry"（负数索引从末尾开始）
fruits[1:3]        # ["banana", "cherry"]（切片）

# ========== 修改列表 ==========
fruits.append("orange")              # 末尾追加
fruits.insert(1, "mango")            # 指定位置插入
fruits.extend(["grape", "kiwi"])     # 扩展多个元素
fruits.remove("banana")              # 按值删除（只删第一个）
popped = fruits.pop()                # 弹出末尾元素
popped = fruits.pop(0)               # 弹出指定位置元素
fruits.sort()                        # 原地排序
fruits.reverse()                     # 原地反转
fruits.clear()                       # 清空列表

# ========== 列表操作 ==========
len(fruits)                          # 列表长度
"apple" in fruits                    # True（成员检查）
fruits.index("cherry")               # 返回索引（找不到抛异常）
fruits.count("apple")                # 统计出现次数

# ========== 列表推导式（List Comprehension）==========
squares = [x**2 for x in range(10)]                    # [0, 1, 4, 9, ..., 81]
evens = [x for x in range(20) if x % 2 == 0]           # 带条件过滤
pairs = [(x, y) for x in range(3) for y in range(3)]   # 嵌套循环
```

#### 元组（Tuple）— 有序、不可变

```python
# ========== 创建元组 ==========
point = (3, 4)
single = (1,)              # 单元素元组必须有逗号！
empty = ()                 # 空元组
packed = 1, 2, 3           # 括号可省略

# ========== 访问元素（同列表）==========
x, y = point               # 元组解包：x=3, y=4
first, *rest = (1, 2, 3, 4)  # first=1, rest=[2, 3, 4]

# ========== 不可变性 ==========
# point[0] = 5             # ❌ 报错！元组不可修改
# 但元组内的可变元素（如列表）仍可修改
t = ([1, 2], 3)
t[0].append(3)             # ✅ 列表是可变的
```

#### 字典（Dict）— 键值对、无序（Python 3.7+ 保持插入顺序）

```python
# ========== 创建字典 ==========
person = {
    "name": "Alice",
    "age": 25,
    "skills": ["Python", "LangChain"]
}
empty = {}                            # 空字典
from_dict = dict(name="Bob", age=30)  # dict() 构造函数
pairs = dict([("a", 1), ("b", 2)])    # 从键值对列表创建

# ========== 访问与修改 ==========
person["name"]                        # "Alice"（键不存在抛 KeyError）
person.get("email", "N/A")            # "N/A"（安全访问，提供默认值）
person["email"] = "alice@test.com"    # 添加/修改键值对
person.update({"age": 26, "city": "NYC"})  # 批量更新
del person["age"]                     # 删除键值对
popped = person.pop("skills")         # 弹出并返回值

# ========== 字典操作 ==========
person.keys()                         # dict_keys(['name', 'skills', ...])
person.values()                       # dict_values(['Alice', [...], ...])
person.items()                        # dict_items([('name', 'Alice'), ...])
"name" in person                      # True（检查键是否存在）
len(person)                           # 键值对数量

# ========== 字典推导式 ==========
squares = {x: x**2 for x in range(5)}  # {0: 0, 1: 1, 2: 4, 3: 9, 4: 16}
```

#### 集合（Set）— 无序、不重复

```python
# ========== 创建集合 ==========
tags = {"python", "langchain", "ai"}
empty = set()                         # 空集合（注意：{} 是空字典！）
from_list = set([1, 2, 2, 3])         # {1, 2, 3}（自动去重）

# ========== 集合操作 ==========
tags.add("llm")                       # 添加元素
tags.remove("ai")                     # 删除元素（不存在抛 KeyError）
tags.discard("ai")                    # 安全删除（不存在不报错）

# 集合运算
a = {1, 2, 3}
b = {2, 3, 4}
a | b          # {1, 2, 3, 4}（并集）
a & b          # {2, 3}（交集）
a - b          # {1}（差集）
a ^ b          # {1, 4}（对称差集）

# ========== 集合推导式 ==========
unique_lengths = {len(word) for word in ["hi", "hello", "hey"]}  # {2, 5, 3}
```

#### LangChain 中的实际应用

```python
# 列表：存储文档、消息、工具列表
from langchain_core.documents import Document
docs = [Document(page_content="..."), Document(page_content="...")]

# 字典：配置参数、输入输出、元数据
config = {"model": "gpt-4o", "temperature": 0.7}
metadata = {"source": "web", "page": 1, "author": "Alice"}

# 元组：不可变配置、坐标
from langchain_core.prompts import ChatPromptTemplate
template = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant"),   # 元组定义消息
    ("human", "{input}"),
])

# 集合：去重、标签管理
unique_sources = {doc.metadata["source"] for doc in docs}
```

---

### 0.4 控制流

#### 条件判断（if / elif / else）

```python
# ========== 基本条件判断 ==========
temperature = 0.8

if temperature == 0:
    print("确定性输出")
elif 0 < temperature < 1:
    print("平衡模式")
elif temperature >= 1:
    print("创造性输出")
else:
    print("无效的 temperature 值")

# ========== 条件表达式（三元运算符）==========
model = "gpt-4o" if use_premium else "gpt-4o-mini"
status = "active" if is_connected else "offline"

# ========== match 语句（Python 3.10+）==========
role = "system"
match role:
    case "system":
        print("系统消息")
    case "human" | "user":
        print("用户消息")
    case "ai" | "assistant":
        print("AI 消息")
    case _:
        print("未知角色")
```

#### 循环（for / while）

```python
# ========== for 循环 ==========
# 遍历列表
for fruit in ["apple", "banana", "cherry"]:
    print(fruit)

# 遍历字典
config = {"model": "gpt-4o", "temperature": 0.7}
for key, value in config.items():
    print(f"{key} = {value}")

# range() 生成数字序列
for i in range(5):           # 0, 1, 2, 3, 4
    print(i)
for i in range(2, 6):        # 2, 3, 4, 5
    print(i)
for i in range(0, 10, 2):    # 0, 2, 4, 6, 8（步长为 2）
    print(i)

# enumerate() 同时获取索引和值
for i, doc in enumerate(docs):
    print(f"文档 {i}: {doc.page_content[:50]}...")

# zip() 并行遍历多个序列
questions = ["Q1", "Q2", "Q3"]
answers = ["A1", "A2", "A3"]
for q, a in zip(questions, answers):
    print(f"{q}: {a}")

# ========== while 循环 ==========
count = 0
while count < 5:
    print(count)
    count += 1

# ========== 循环控制 ==========
for i in range(10):
    if i == 3:
        continue          # 跳过本次迭代
    if i == 7:
        break             # 终止循环
    print(i)

# ========== for...else 语法 ==========
for item in items:
    if item == target:
        print("找到了")
        break
else:
    print("没找到")        # 循环正常结束（未被 break）时执行
```

#### LangChain 中的实际应用

```python
# 遍历文档列表
for doc in documents:
    print(f"来源: {doc.metadata.get('source', 'unknown')}")

# 条件判断选择模型
if task == "creative":
    model = ChatOpenAI(temperature=0.9)
elif task == "precise":
    model = ChatOpenAI(temperature=0.1)
else:
    model = ChatOpenAI(temperature=0.7)

# 批量处理
results = []
for question in questions:
    result = chain.invoke({"question": question})
    results.append(result)
```

---

### 0.5 函数定义与参数

函数是 Python 中最基本的代码组织单元，LangChain 中 Tool、Chain、Callback 本质上都是函数。

```python
# ========== 基本函数定义 ==========
def greet(name):
    """向指定的人打招呼。（这是 docstring）"""
    return f"Hello, {name}!"

result = greet("Alice")     # "Hello, Alice!"

# ========== 参数类型 ==========
# 位置参数
def add(a, b):
    return a + b

# 默认参数（默认值参数必须放在非默认值参数之后）
def create_model(model="gpt-4o", temperature=0.7):
    return {"model": model, "temperature": temperature}

create_model()                      # 使用全部默认值
create_model("gpt-4o-mini")         # 覆盖 model
create_model(temperature=0.9)       # 按名称覆盖 temperature

# 可变位置参数 *args（接收任意数量的位置参数，打包为元组）
def log_all(*messages):
    for msg in messages:
        print(f"[LOG] {msg}")

log_all("开始处理", "加载文档", "生成回答")

# 可变关键字参数 **kwargs（接收任意数量的关键字参数，打包为字典）
def build_config(**kwargs):
    config = {"model": "gpt-4o", "temperature": 0.7}
    config.update(kwargs)
    return config

build_config(temperature=0.9, max_tokens=2048, streaming=True)

# 组合使用（顺序必须是：位置参数 → *args → 关键字参数 → **kwargs）
def flexible_func(a, b, *args, option="default", **kwargs):
    print(f"a={a}, b={b}")
    print(f"args={args}")
    print(f"option={option}")
    print(f"kwargs={kwargs}")

flexible_func(1, 2, 3, 4, 5, option="custom", x=10, y=20)
# 输出：
# a=1, b=2
# args=(3, 4, 5)
# option=custom
# kwargs={'x': 10, 'y': 20}

# ========== 仅限关键字参数（* 之后）==========
def configure(*, model, temperature, max_tokens=2048):
    """所有参数必须通过关键字传递"""
    return {"model": model, "temperature": temperature, "max_tokens": max_tokens}

# configure("gpt-4o", 0.7)          # ❌ 报错
configure(model="gpt-4o", temperature=0.7)  # ✅ 正确

# ========== 返回值 ==========
def process(text):
    if not text:
        return None               # 单一返回值
    return text.strip(), len(text)  # 返回多个值（实际是元组）

cleaned, length = process("  hello  ")  # 元组解包接收
```

#### LangChain 中的实际应用

```python
# Tool 定义本质上就是函数
from langchain_core.tools import tool

@tool
def search_database(query: str, limit: int = 10) -> str:
    """搜索数据库。"""
    # 函数体
    return f"找到 {limit} 条关于 '{query}' 的结果"

# Chain 的 invoke 方法接收 **kwargs
chain.invoke({"question": "..."}, config={"timeout": 30})

# 回调函数
def my_callback(response):
    print(f"收到响应: {response}")
```

---

### 0.6 文件操作

LangChain 的 Document Loader 底层依赖文件操作，理解文件 I/O 有助于自定义文档加载器。

```python
# ========== 读取文件 ==========
# 方式一：手动 open/close
file = open("document.txt", "r", encoding="utf-8")
content = file.read()
file.close()

# 方式二：with 语句（推荐，自动关闭文件）
with open("document.txt", "r", encoding="utf-8") as f:
    content = f.read()                    # 读取全部内容

with open("document.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()                 # 读取所有行，返回列表

with open("document.txt", "r", encoding="utf-8") as f:
    for line in f:                        # 逐行迭代（节省内存）
        print(line.strip())

# ========== 写入文件 ==========
with open("output.txt", "w", encoding="utf-8") as f:
    f.write("Hello, LangChain!\n")        # 写入字符串
    f.writelines(["line1\n", "line2\n"])  # 写入多行

# ========== 文件模式 ==========
# "r"  - 只读（默认，文件必须存在）
# "w"  - 只写（覆盖已有内容，文件不存在则创建）
# "a"  - 追加（在文件末尾添加，文件不存在则创建）
# "r+" - 读写（文件必须存在）
# "b"  - 二进制模式（如 "rb", "wb"，用于图片、PDF 等）

# ========== 路径操作（pathlib，推荐）==========
from pathlib import Path

# 构建路径（跨平台）
doc_dir = Path("data") / "documents" / "input.txt"

# 检查与遍历
if doc_dir.exists():
    for file in doc_dir.parent.glob("*.txt"):   # 遍历所有 txt 文件
        print(file.name)

# 读取与写入
content = Path("config.json").read_text(encoding="utf-8")
Path("output.txt").write_text("Hello!", encoding="utf-8")

# 路径信息
print(doc_dir.name)           # "input.txt"（文件名）
print(doc_dir.stem)           # "input"（不含后缀）
print(doc_dir.suffix)         # ".txt"（后缀）
print(doc_dir.parent)         # Path("data/documents")（父目录）
```

#### LangChain 中的实际应用

```python
# LangChain 的 TextLoader 内部实现类似：
from pathlib import Path

class SimpleTextLoader:
    def __init__(self, file_path: str):
        self.file_path = Path(file_path)
    
    def load(self):
        text = self.file_path.read_text(encoding="utf-8")
        return [{"content": text, "source": str(self.file_path)}]

# 批量加载目录下的所有文件
from pathlib import Path
docs = []
for txt_file in Path("data/").glob("*.txt"):
    with open(txt_file, "r", encoding="utf-8") as f:
        docs.append({"content": f.read(), "source": txt_file.name})
```

---

### 0.7 异常处理

LangChain 中网络请求、API 调用、文件读取都可能出错，异常处理是编写健壮代码的基础。

```python
# ========== try / except / else / finally ==========
try:
    # 可能出错的代码
    result = 10 / 0
except ZeroDivisionError:
    # 捕获特定异常
    print("不能除以零！")
except (TypeError, ValueError) as e:
    # 捕获多种异常
    print(f"类型或值错误: {e}")
except Exception as e:
    # 捕获所有异常（兜底）
    print(f"未知错误: {e}")
else:
    # try 块成功执行后运行
    print(f"计算成功，结果: {result}")
finally:
    # 无论是否异常都会执行（清理资源）
    print("清理完成")

# ========== 常见内置异常 ==========
# ValueError       - 值错误（如 int("abc")）
# TypeError        - 类型错误（如 "a" + 1）
# KeyError         - 字典键不存在
# IndexError       - 列表索引越界
# FileNotFoundError- 文件不存在
# ImportError      - 导入模块失败
# AttributeError   - 属性不存在
# RuntimeError     - 运行时错误

# ========== 主动抛出异常 ==========
def validate_temperature(temp: float):
    if not 0 <= temp <= 2:
        raise ValueError(f"temperature 必须在 0~2 之间，当前值: {temp}")
    return temp

# ========== 自定义异常 ==========
class LangChainError(Exception):
    """LangChain 自定义异常基类"""
    pass

class ModelNotAvailableError(LangChainError):
    """模型不可用异常"""
    def __init__(self, model_name: str):
        self.model_name = model_name
        super().__init__(f"模型 '{model_name}' 不可用")

# 使用自定义异常
try:
    raise ModelNotAvailableError("gpt-5")
except ModelNotAvailableError as e:
    print(f"模型错误: {e.model_name}")
```

#### LangChain 中的实际应用

```python
# LangChain 中常见的异常处理模式
from langchain_openai import ChatOpenAI

try:
    model = ChatOpenAI(model="gpt-4o")
    response = model.invoke("Hello")
except Exception as e:
    print(f"API 调用失败: {e}")
    # 降级策略：使用备用模型
    model = ChatOpenAI(model="gpt-4o-mini")
    response = model.invoke("Hello")

# 带重试的调用
import time

def invoke_with_retry(chain, input_data, max_retries=3):
    for attempt in range(max_retries):
        try:
            return chain.invoke(input_data)
        except Exception as e:
            if attempt == max_retries - 1:
                raise  # 最后一次重试仍失败，抛出异常
            print(f"第 {attempt + 1} 次尝试失败: {e}，等待重试...")
            time.sleep(2 ** attempt)  # 指数退避
```

---

### 0.8 常用内置函数

Python 内置了大量实用函数，LangChain 代码中高频出现。

```python
# ========== 类型转换 ==========
int("42")              # 42
float("3.14")          # 3.14
str(100)               # "100"
bool(1)                # True
list("abc")            # ['a', 'b', 'c']
tuple([1, 2, 3])       # (1, 2, 3)
dict([("a", 1)])       # {'a': 1}
set([1, 2, 2, 3])      # {1, 2, 3}

# ========== 数学运算 ==========
abs(-5)                # 5（绝对值）
round(3.14159, 2)      # 3.14（四舍五入）
max(1, 5, 3)           # 5（最大值）
min(1, 5, 3)           # 1（最小值）
sum([1, 2, 3])         # 6（求和）
pow(2, 10)             # 1024（幂运算，等价于 2**10）
divmod(10, 3)          # (3, 1)（商和余数）

# ========== 序列操作 ==========
len([1, 2, 3])         # 3（长度）
sorted([3, 1, 2])      # [1, 2, 3]（排序，返回新列表）
sorted([3, 1, 2], reverse=True)  # [3, 2, 1]（降序）
reversed([1, 2, 3])    # 返回反向迭代器
enumerate(["a", "b"])  # 返回 (索引, 值) 迭代器
zip([1, 2], ["a", "b"])  # 返回 (1,'a'), (2,'b') 迭代器
range(5)               # 0,1,2,3,4 的迭代器
filter(lambda x: x > 0, [-1, 0, 1, 2])  # 过滤，返回迭代器
map(str, [1, 2, 3])    # 映射，返回迭代器 ['1','2','3']
any([False, True, False])  # True（任一为真）
all([True, True, False])   # False（全部为真）

# ========== 对象信息 ==========
type("hello")          # <class 'str'>
isinstance("hello", str)  # True
hasattr(obj, "invoke")    # 检查对象是否有某属性
getattr(obj, "name", "default")  # 安全获取属性
dir(obj)               # 列出对象所有属性和方法
id(obj)                # 对象内存地址
hash("hello")          # 哈希值

# ========== 输入输出 ==========
name = input("请输入你的名字: ")  # 从控制台读取输入
print("Hello", name, sep=", ", end="!\n")  # 打印输出

# ========== 其他常用 ==========
isinstance(obj, type)  # 类型检查
issubclass(Dict, Mapping)  # 检查继承关系
callable(func)         # 检查是否可调用
eval("1 + 2")          # 执行字符串表达式（谨慎使用！）
exec("x = 1 + 2")      # 执行字符串代码（谨慎使用！）
```

#### LangChain 中的实际应用

```python
# isinstance 检查消息类型
from langchain_core.messages import HumanMessage, AIMessage

def process_message(msg):
    if isinstance(msg, HumanMessage):
        return f"用户说: {msg.content}"
    elif isinstance(msg, AIMessage):
        return f"AI 说: {msg.content}"

# hasattr / getattr 动态访问
if hasattr(model, "streaming"):
    model.streaming = True

# callable 检查回调
if callable(callback):
    callback(result)

# len 检查文档数量
if len(documents) == 0:
    raise ValueError("没有加载到任何文档")
```

---

### 0.9 环境搭建与包管理

```python
# ========== 虚拟环境（项目隔离，必备技能）==========
# 创建虚拟环境
# python -m venv .venv

# 激活虚拟环境
# Windows CMD:  .venv\Scripts\activate.bat
# Windows PS:   .venv\Scripts\Activate.ps1
# macOS/Linux:  source .venv/bin/activate

# 退出虚拟环境
# deactivate

# ========== pip 包管理 ==========
# 安装包
# pip install langchain langchain-openai

# 安装指定版本
# pip install langchain==0.3.0

# 从 requirements.txt 安装
# pip install -r requirements.txt

# 导出当前环境依赖
# pip freeze > requirements.txt

# 卸载包
# pip uninstall langchain

# 查看已安装的包
# pip list

# ========== requirements.txt 示例 ==========
# langchain>=0.3.0,<0.4.0
# langchain-openai>=0.2.0
# langchain-community>=0.3.0
# pydantic>=2.0
# python-dotenv>=1.0

# ========== 环境变量管理（python-dotenv）==========
# .env 文件（不要提交到 Git！）
# OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
# LANGCHAIN_TRACING_V2=true
# LANGCHAIN_API_KEY=ls_xxxxxxxxxxxxxxxxxxxx

from dotenv import load_dotenv
import os

load_dotenv()  # 加载 .env 文件中的环境变量
api_key = os.environ.get("OPENAI_API_KEY")
```

---

## 1. 必知必会

### 1.1 Python 进阶语法

LangChain 代码大量使用 Python 进阶语法，以下知识点必须熟练掌握：

#### 列表推导式（List Comprehension）

```python
# LangChain 中常见：批量处理文档、构建消息列表
docs = [Document(page_content=text) for text in texts]

# 带条件的列表推导
filtered_docs = [doc for doc in docs if len(doc.page_content) > 100]

# 字典推导式
metadata_map = {doc.metadata["source"]: doc for doc in docs}
```

#### 字符串格式化（f-string）

```python
# LangChain Prompt 模板中大量使用
from langchain_core.prompts import ChatPromptTemplate

template = ChatPromptTemplate.from_messages([
    ("system", "你是一个{role}助手"),
    ("user", "请帮我{task}，要求：{requirements}"),
])

# f-string 在构建动态 prompt 时非常常用
system_prompt = f"你是一个{role}专家，请用{language}回答"
```

#### 解包（Unpacking）

```python
# *args 和 **kwargs 在 LangChain 中无处不在
def invoke(self, input, config=None, **kwargs):
    ...

# 字典解包传递参数
chain.invoke({"question": "什么是 LangChain？", **extra_params})

# 列表/元组解包
prompt, model, output_parser = components
```

#### 三元表达式与短路运算

```python
# LangChain 中常见的条件逻辑
model = chat_model if temperature > 0 else llm
api_key = config.get("api_key") or os.environ.get("OPENAI_API_KEY")
```

---

### 1.2 函数与 Lambda 表达式

LangChain 中大量使用函数作为参数传递，Lambda 表达式用于快速定义简单逻辑。

#### 函数是一等公民

```python
# LangChain 中 RunnableLambda 接受任意函数
from langchain_core.runnables import RunnableLambda

def custom_transform(x: str) -> str:
    return x.strip().upper()

chain = prompt | model | RunnableLambda(custom_transform)
```

#### Lambda 表达式

```python
# LCEL 链中快速定义转换逻辑
from langchain_core.runnables import RunnableLambda

chain = (
    prompt
    | model
    | RunnableLambda(lambda x: x.content.strip())
    | RunnableLambda(lambda x: {"result": x, "length": len(x)})
)

# 在 Tool 定义中使用 lambda
from langchain_core.tools import tool

@tool
def multiply(a: int, b: int) -> int:
    """Multiply two numbers."""
    return a * b

# 或者用 lambda 快速创建简单工具
tools = [
    tool(lambda x: x * 2, name="double"),
]
```

#### 偏函数（functools.partial）

```python
from functools import partial

# LangChain 中预配置某些参数
from langchain_openai import ChatOpenAI

# 创建预配置了 temperature 的模型工厂
create_creative_model = partial(ChatOpenAI, temperature=0.9)
create_precise_model = partial(ChatOpenAI, temperature=0.1)
```

---

### 1.3 类与面向对象编程

LangChain 是一个高度面向对象的框架，几乎所有组件都是类。

#### 继承与多态

```python
# LangChain 中所有 Chain 都继承自 Runnable
from langchain_core.runnables import RunnableSerializable
from langchain_core.language_models import BaseChatModel

# 自定义 Chain 需要继承基类
class MyCustomChain(RunnableSerializable):
    """自定义链需要实现 invoke 方法"""
    
    prompt: ChatPromptTemplate
    model: BaseChatModel
    
    def invoke(self, input, config=None, **kwargs):
        formatted = self.prompt.invoke(input)
        return self.model.invoke(formatted)
```

#### 属性装饰器（@property）

```python
# LangChain 中大量使用 @property 提供只读属性
from langchain_core.language_models import BaseLLM

class MyLLM(BaseLLM):
    @property
    def _llm_type(self) -> str:
        """必须实现的属性，返回 LLM 类型标识"""
        return "my-custom-llm"
    
    @property
    def _identifying_params(self):
        """返回标识参数，用于缓存和追踪"""
        return {"model_name": self.model_name}
```

#### 类方法与静态方法

```python
# LangChain 中常见的工厂模式
from langchain_core.prompts import ChatPromptTemplate

# @classmethod 用于创建替代构造函数
template = ChatPromptTemplate.from_messages([
    ("system", "You are a helpful assistant"),
    ("human", "{input}"),
])

# 多种工厂方法
template = ChatPromptTemplate.from_template("Tell me about {topic}")
template = ChatPromptTemplate.from_messages([...])
```

#### 特殊方法（Dunder Methods）

```python
# __call__ 使对象可调用
class CountTokens:
    def __call__(self, text: str) -> int:
        return len(text.split())

counter = CountTokens()
counter("hello world")  # 2

# __str__ 和 __repr__ 用于调试输出
# __getitem__ 支持索引访问
# __iter__ 支持迭代
```

---

### 1.4 类型注解（Type Hints）

LangChain 大量使用类型注解，配合 Pydantic 进行数据验证。

#### 基本类型注解

```python
from typing import List, Dict, Optional, Union, Any

# LangChain 中常见的类型注解
from langchain_core.messages import BaseMessage
from langchain_core.documents import Document

def process_documents(
    docs: List[Document],
    chunk_size: int = 1000,
    metadata: Optional[Dict[str, Any]] = None,
) -> List[Document]:
    """处理文档列表"""
    ...

# Union 类型：多种可能类型
def get_response(
    prompt: Union[str, List[BaseMessage]]
) -> Union[str, BaseMessage]:
    ...
```

#### TypedDict 与 NamedTuple

```python
from typing import TypedDict, NamedTuple

# TypedDict：定义字典结构（LangGraph State 常用）
class GraphState(TypedDict):
    question: str
    documents: List[Document]
    answer: Optional[str]
    iteration: int

# NamedTuple：不可变数据结构
class ModelConfig(NamedTuple):
    model_name: str
    temperature: float
    max_tokens: int
```

#### Literal 类型

```python
from typing import Literal

# LangChain 中限制参数取值
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

MessageRole = Literal["system", "human", "ai", "function"]

def create_message(role: MessageRole, content: str):
    if role == "system":
        return SystemMessage(content=content)
    elif role == "human":
        return HumanMessage(content=content)
    elif role == "ai":
        return AIMessage(content=content)
```

---

### 1.5 模块与包管理

#### 虚拟环境

```bash
# 创建虚拟环境（LangChain 项目必备）
python -m venv .venv

# 激活虚拟环境
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate
```

#### 依赖管理

```bash
# 安装 LangChain 核心包
pip install langchain langchain-core

# 安装常用集成
pip install langchain-openai langchain-community

# 使用 requirements.txt 或 pyproject.toml 管理依赖
```

#### 导入规范

```python
# LangChain 的导入路径规范
# 核心接口从 langchain_core 导入
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

# 具体实现从对应包导入
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_community.document_loaders import TextLoader
```

---

## 2. 重要掌握

### 2.1 迭代器与生成器

LangChain 处理大量数据（文档、token）时依赖迭代器和生成器来节省内存。

#### 生成器函数（yield）

```python
# LangChain 中流式输出依赖生成器
from langchain_core.language_models import BaseChatModel

async def stream_response(model: BaseChatModel, prompt: str):
    """流式获取 LLM 响应"""
    async for chunk in model.astream(prompt):
        yield chunk.content  # 逐块产出内容

# 文档加载器也是生成器
from langchain_community.document_loaders import TextLoader

loader = TextLoader("large_file.txt")
for doc in loader.lazy_load():  # 惰性加载，不一次性读入内存
    process(doc)
```

#### itertools 常用函数

```python
import itertools

# chain: 连接多个可迭代对象
from itertools import chain
all_docs = list(chain(docs_from_pdf, docs_from_txt, docs_from_csv))

# islice: 切片迭代器（处理大文件时有用）
from itertools import islice
first_100_docs = list(islice(loader.lazy_load(), 100))
```

---

### 2.2 装饰器

LangChain 大量使用装饰器实现横切关注点（日志、重试、缓存、工具注册）。

#### 函数装饰器

```python
# @tool 装饰器：将函数注册为 LangChain Tool
from langchain_core.tools import tool

@tool
def search_web(query: str) -> str:
    """Search the web for information."""
    return f"Results for: {query}"

# 等价于：
# search_web = tool(search_web)
```

#### 带参数的装饰器

```python
# LangChain 中 @tool 可以带参数
@tool(return_direct=True)  # 工具结果直接返回给用户
def get_weather(city: str) -> str:
    """Get current weather for a city."""
    return f"Weather in {city}: Sunny, 25°C"

# 理解装饰器原理有助于阅读 LangChain 源码
def retry(max_attempts: int = 3):
    """重试装饰器（LangChain 内部类似实现）"""
    def decorator(func):
        def wrapper(*args, **kwargs):
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if attempt == max_attempts - 1:
                        raise
            return None
        return wrapper
    return decorator
```

#### 类装饰器

```python
# LangChain 中 Runnable 的注册机制
from langchain_core.runnables import RunnableLambda

@RunnableLambda
def my_transform(x: str) -> str:
    return x.upper()

# 等价于：my_transform = RunnableLambda(my_transform)
```

---

### 2.3 上下文管理器

LangChain 中使用上下文管理器管理资源生命周期（回调、追踪、会话）。

#### with 语句

```python
# LangSmith 追踪上下文
from langchain_core.tracers.context import tracing_v2_enabled

with tracing_v2_enabled(project_name="my-project"):
    # 此代码块内的所有调用都会被追踪
    result = chain.invoke({"question": "What is LangChain?"})

# 回调管理器
from langchain_core.callbacks import CallbackManager

with CallbackManager([my_handler]) as manager:
    model = ChatOpenAI(callbacks=manager)
    model.invoke("Hello")
```

#### 自定义上下文管理器

```python
from contextlib import contextmanager
import time

@contextmanager
def timer(name: str):
    """计时上下文管理器"""
    start = time.time()
    yield
    elapsed = time.time() - start
    print(f"[{name}] 耗时: {elapsed:.2f}s")

# 使用
with timer("RAG Pipeline"):
    result = rag_chain.invoke({"question": "..."})
```

#### 异步上下文管理器

```python
# LangChain 中异步回调使用
from contextlib import asynccontextmanager

@asynccontextmanager
async def async_session():
    session = await create_session()
    try:
        yield session
    finally:
        await session.close()

async with async_session() as session:
    await session.run(chain)
```

---

### 2.4 异步编程（async/await）

LangChain 全面支持异步，`ainvoke`、`astream`、`abatch` 等方法是异步版本的标配。

#### 基本异步语法

```python
import asyncio

# LangChain 异步调用
async def main():
    # 异步调用链
    result = await chain.ainvoke({"question": "什么是异步编程？"})
    
    # 异步流式输出
    async for chunk in model.astream("讲个故事"):
        print(chunk.content, end="", flush=True)
    
    # 异步批量处理
    results = await chain.abatch([
        {"question": "问题1"},
        {"question": "问题2"},
        {"question": "问题3"},
    ])

asyncio.run(main())
```

#### 并发执行

```python
import asyncio

async def process_questions(questions: list[str]):
    """并发处理多个问题"""
    tasks = [
        chain.ainvoke({"question": q})
        for q in questions
    ]
    # asyncio.gather 并发执行所有任务
    results = await asyncio.gather(*tasks)
    return results

# 带超时的并发
async def process_with_timeout(questions: list[str], timeout: float = 30.0):
    tasks = [chain.ainvoke({"question": q}) for q in questions]
    return await asyncio.wait_for(
        asyncio.gather(*tasks),
        timeout=timeout
    )
```

#### 同步与异步的区别

```python
# LangChain 中每个 Runnable 都有同步和异步两个版本
from langchain_core.runnables import Runnable

# 同步版本
result = runnable.invoke(input)
results = runnable.batch(inputs)
for chunk in runnable.stream(input):
    ...

# 异步版本（方法名前加 a）
result = await runnable.ainvoke(input)
results = await runnable.abatch(inputs)
async for chunk in runnable.astream(input):
    ...
```

---

### 2.5 Pydantic 数据模型

Pydantic 是 LangChain 的基石，所有组件配置、Tool 参数、Output Parser 都依赖 Pydantic。

#### BaseModel 基础

```python
from pydantic import BaseModel, Field
from typing import Optional, List

# LangChain 中 Tool 的参数定义
class SearchInput(BaseModel):
    """搜索工具输入参数"""
    query: str = Field(description="搜索关键词")
    max_results: int = Field(default=10, description="最大结果数")
    source: Optional[str] = Field(default=None, description="搜索来源")

# Output Parser 使用 Pydantic 定义输出结构
from langchain_core.output_parsers import PydanticOutputParser

class PersonInfo(BaseModel):
    """人物信息结构化输出"""
    name: str = Field(description="人物姓名")
    age: int = Field(description="年龄")
    occupation: str = Field(description="职业")
    skills: List[str] = Field(description="技能列表")

parser = PydanticOutputParser(pydantic_object=PersonInfo)
```

#### Field 验证器

```python
from pydantic import BaseModel, Field, field_validator

class ModelConfig(BaseModel):
    """模型配置"""
    model_name: str = Field(default="gpt-4o")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)  # 范围约束
    max_tokens: int = Field(default=1024, gt=0)  # 大于 0
    
    @field_validator("model_name")
    @classmethod
    def validate_model_name(cls, v: str) -> str:
        allowed = {"gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"}
        if v not in allowed:
            raise ValueError(f"不支持的模型: {v}，可选: {allowed}")
        return v
```

#### ConfigDict 配置

```python
from pydantic import BaseModel, ConfigDict

class MyRunnableConfig(BaseModel):
    model_config = ConfigDict(
        arbitrary_types_allowed=True,  # 允许任意类型
        extra="forbid",                # 禁止额外字段
        frozen=False,                  # 是否不可变
        validate_assignment=True,      # 赋值时验证
    )
```

---

### 2.6 回调与可调用对象

LangChain 的回调系统（Callbacks）是其扩展机制的核心。

#### 可调用对象（Callable）

```python
from typing import Callable

# LangChain 中 RunnableLambda 接受 Callable
from langchain_core.runnables import RunnableLambda

# 函数作为 Callable
def my_func(x: str) -> str:
    return x.upper()

runnable = RunnableLambda(my_func)

# 类实例作为 Callable（实现 __call__）
class TextProcessor:
    def __init__(self, prefix: str):
        self.prefix = prefix
    
    def __call__(self, text: str) -> str:
        return f"{self.prefix}: {text}"

processor = TextProcessor("[PROCESSED]")
runnable = RunnableLambda(processor)
```

#### 回调处理器

```python
from langchain_core.callbacks import BaseCallbackHandler

class MyCallbackHandler(BaseCallbackHandler):
    """自定义回调处理器"""
    
    def on_llm_start(self, serialized, prompts, **kwargs):
        print(f"LLM 开始调用，prompts: {prompts}")
    
    def on_llm_end(self, response, **kwargs):
        print(f"LLM 调用完成，token 用量: {response.llm_output}")
    
    def on_tool_start(self, serialized, input_str, **kwargs):
        print(f"工具开始执行: {serialized['name']}")
    
    def on_tool_end(self, output, **kwargs):
        print(f"工具执行完成: {output}")

# 使用回调
from langchain_openai import ChatOpenAI

model = ChatOpenAI(callbacks=[MyCallbackHandler()])
```

---

## 3. 进阶了解

### 3.1 描述符协议

描述符是 Python 中控制属性访问的底层机制，LangChain 内部使用描述符实现惰性加载和属性验证。

```python
# 描述符基本实现
class LazyLoader:
    """惰性加载描述符（LangChain 内部类似模式）"""
    def __init__(self, loader_func):
        self.loader_func = loader_func
        self._value = None
    
    def __get__(self, obj, objtype=None):
        if self._value is None:
            self._value = self.loader_func()
        return self._value

class MyComponent:
    embeddings = LazyLoader(lambda: OpenAIEmbeddings())
    # 首次访问时才初始化 embeddings
```

---

### 3.2 元类

元类控制类的创建过程，LangChain 使用元类实现组件注册和自动发现。

```python
# 元类基本概念
class RunnableMeta(type):
    """元类：在类创建时自动注册"""
    _registry = {}
    
    def __new__(mcs, name, bases, namespace):
        cls = super().__new__(mcs, name, bases, namespace)
        if hasattr(cls, 'name'):
            mcs._registry[cls.name] = cls
        return cls

# LangChain 中 Tool 的注册机制类似
# 理解元类有助于深入阅读 LangChain 源码
```

---

### 3.3 泛型与类型变量

LangChain 使用泛型来保持类型安全，特别是在 Runnable 的输入输出类型推导中。

```python
from typing import TypeVar, Generic

# 类型变量
Input = TypeVar("Input")
Output = TypeVar("Output")

class Runnable(Generic[Input, Output]):
    """LangChain Runnable 的简化版"""
    
    def invoke(self, input: Input) -> Output:
        ...
    
    def __or__(self, other: "Runnable[Output, T]") -> "Runnable[Input, T]":
        """管道操作符 | 的类型安全实现"""
        ...

# 使用泛型约束类型
from langchain_core.messages import BaseMessage

class ChatModel(Runnable[str, BaseMessage]):
    """输入字符串，输出消息"""
    ...
```

---

### 3.4 并发编程

处理高并发请求时需要了解线程和进程模型。

#### 线程池

```python
from concurrent.futures import ThreadPoolExecutor, as_completed

def process_batch(questions: list[str], max_workers: int = 5):
    """使用线程池并发处理"""
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(chain.invoke, {"question": q}): q
            for q in questions
        }
        results = {}
        for future in as_completed(futures):
            question = futures[future]
            results[question] = future.result()
    return results
```

#### 信号量与限流

```python
import asyncio

async def rate_limited_process(items: list, max_concurrent: int = 3):
    """限流并发处理（避免 API 限流）"""
    semaphore = asyncio.Semaphore(max_concurrent)
    
    async def process_one(item):
        async with semaphore:
            return await chain.ainvoke({"question": item})
    
    tasks = [process_one(item) for item in items]
    return await asyncio.gather(*tasks)
```

---

### 3.5 流式处理

LangChain 的 `stream` 和 `astream` 方法返回迭代器/异步迭代器，理解流式处理有助于构建响应式应用。

#### 同步流式

```python
# LangChain 流式调用
for chunk in chain.stream({"question": "解释量子计算"}):
    print(chunk, end="", flush=True)

# 自定义流式生成器
def stream_with_metadata(chain, input_data):
    """流式输出并附带元数据"""
    yield {"type": "start"}
    for i, chunk in enumerate(chain.stream(input_data)):
        yield {"type": "token", "index": i, "content": chunk}
    yield {"type": "end", "total_tokens": i + 1}
```

#### 异步流式

```python
import asyncio

async def async_stream_example():
    """异步流式处理"""
    async for event in chain.astream_events(
        {"question": "写一首诗"},
        version="v2"
    ):
        kind = event["event"]
        if kind == "on_chat_model_stream":
            content = event["data"]["chunk"].content
            if content:
                print(content, end="", flush=True)
        elif kind == "on_tool_start":
            print(f"\n[调用工具: {event['name']}]")
        elif kind == "on_tool_end":
            print(f"\n[工具结果: {event['data']['output']}]")

asyncio.run(async_stream_example())
```

---

## 4. 学习路径建议

### 阶段零：Python 入门（1-2 周，零基础必看）

| 知识点 | 重要程度 | 对应章节 | 学习资源 |
|--------|----------|----------|----------|
| 变量与基本数据类型 | ⭐⭐⭐⭐⭐ | [0.1](#01-变量与基本数据类型) | [Python 官方教程](https://docs.python.org/zh-cn/3/tutorial/) |
| 字符串操作 | ⭐⭐⭐⭐⭐ | [0.2](#02-字符串操作) | 同上 |
| 内置数据结构 | ⭐⭐⭐⭐⭐ | [0.3](#03-内置数据结构) | 同上 |
| 控制流 | ⭐⭐⭐⭐⭐ | [0.4](#04-控制流) | 同上 |
| 函数定义与参数 | ⭐⭐⭐⭐⭐ | [0.5](#05-函数定义与参数) | 同上 |
| 文件操作 | ⭐⭐⭐⭐ | [0.6](#06-文件操作) | 同上 |
| 异常处理 | ⭐⭐⭐⭐ | [0.7](#07-异常处理) | 同上 |
| 常用内置函数 | ⭐⭐⭐⭐ | [0.8](#08-常用内置函数) | 同上 |
| 环境搭建与包管理 | ⭐⭐⭐⭐⭐ | [0.9](#09-环境搭建与包管理) | [Python 虚拟环境指南](https://docs.python.org/zh-cn/3/tutorial/venv.html) |

### 阶段一：基础夯实（1-2 周）

| 知识点 | 重要程度 | 对应章节 | 学习资源 |
|--------|----------|----------|----------|
| Python 进阶语法 | ⭐⭐⭐⭐⭐ | [1.1](#11-python-进阶语法) | [Python 官方教程](https://docs.python.org/zh-cn/3/tutorial/) |
| 函数与 Lambda | ⭐⭐⭐⭐⭐ | [1.2](#12-函数与-lambda-表达式) | 同上 |
| 类与 OOP | ⭐⭐⭐⭐⭐ | [1.3](#13-类与面向对象编程) | [Real Python - OOP](https://realpython.com/python3-object-oriented-programming/) |
| 类型注解 | ⭐⭐⭐⭐ | [1.4](#14-类型注解type-hints) | [mypy 文档](https://mypy.readthedocs.io/) |
| 模块与包管理 | ⭐⭐⭐⭐⭐ | [1.5](#15-模块与包管理) | [Python 虚拟环境指南](https://docs.python.org/zh-cn/3/tutorial/venv.html) |

### 阶段二：核心技能（2-3 周）

| 知识点 | 重要程度 | 对应章节 | 学习资源 |
|--------|----------|----------|----------|
| 迭代器与生成器 | ⭐⭐⭐⭐ | [2.1](#21-迭代器与生成器) | [Real Python - Iterators](https://realpython.com/python-iterators-iterables/) |
| 装饰器 | ⭐⭐⭐⭐ | [2.2](#22-装饰器) | [Real Python - Decorators](https://realpython.com/primer-on-python-decorators/) |
| 上下文管理器 | ⭐⭐⭐ | [2.3](#23-上下文管理器) | [Python 文档 - contextlib](https://docs.python.org/zh-cn/3/library/contextlib.html) |
| 异步编程 | ⭐⭐⭐⭐⭐ | [2.4](#24-异步编程asyncawait) | [Real Python - AsyncIO](https://realpython.com/async-io-python/) |
| Pydantic | ⭐⭐⭐⭐⭐ | [2.5](#25-pydantic-数据模型) | [Pydantic 官方文档](https://docs.pydantic.dev/) |

### 阶段三：进阶深入（按需学习）

| 知识点 | 重要程度 | 对应章节 | 学习资源 |
|--------|----------|----------|----------|
| 描述符协议 | ⭐⭐ | [3.1](#31-描述符协议) | [Python 描述符指南](https://docs.python.org/zh-cn/3/howto/descriptor.html) |
| 元类 | ⭐⭐ | [3.2](#32-元类) | [Real Python - Metaclasses](https://realpython.com/python-metaclasses/) |
| 泛型 | ⭐⭐⭐ | [3.3](#33-泛型与类型变量) | [Python 文档 - typing](https://docs.python.org/zh-cn/3/library/typing.html) |
| 并发编程 | ⭐⭐⭐ | [3.4](#34-并发编程) | [Python 并发文档](https://docs.python.org/zh-cn/3/library/concurrency.html) |

---

## 5. 常见问题

### Q1: 不会异步编程能学 LangChain 吗？

**可以。** LangChain 的所有功能都有同步版本（`invoke`、`stream`、`batch`），异步版本（`ainvoke`、`astream`、`abatch`）是可选的。但掌握异步编程后可以构建更高性能的应用。

### Q2: Pydantic 必须学吗？

**强烈建议。** LangChain 的 Tool 定义、Output Parser、模型配置都依赖 Pydantic。不理解 Pydantic 会很难自定义 LangChain 组件。

### Q3: 需要多深的 Python 知识？

- **零基础**：从[第 0 章](#0-python-基础知识)开始，掌握变量、数据结构、控制流、函数、文件操作等基础内容
- **有基础**：直接看[第 1 章](#1-必知必会)和[第 2 章](#2-重要掌握)，这两个层次足以使用 LangChain 构建应用
- **想深入**：[第 3 章](#3-进阶了解)在阅读 LangChain 源码或开发自定义集成时才需要

### Q4: 有没有推荐的练习方式？

建议按以下顺序练习：

1. 用 Pydantic 定义一个数据结构（如 `Article`）
2. 写一个异步函数调用 OpenAI API
3. 实现一个带 `@tool` 装饰器的自定义工具
4. 用 LCEL（`|` 管道操作符）串联一个简单的 RAG 链
5. 实现一个自定义回调处理器记录 token 用量

---

> **提示**：本文档应与 [`langchain-guide.md`](../src/docs/langchain-guide.md) 配合阅读。先确保 Python 基础扎实，再深入学习 LangChain 框架本身。