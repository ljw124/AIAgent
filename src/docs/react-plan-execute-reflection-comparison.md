# AI Agent 三种核心模式详解与对比：ReAct、Plan-and-Execute、Reflection

> 本文档详细讲解 AI Agent 领域三种最核心的设计模式，分析其原理、工作流程、适用场景，并进行横向对比。

---

## 目录

1. [ReAct 模式](#1-react-模式)
2. [Plan-and-Execute 模式](#2-plan-and-execute-模式)
3. [Reflection 模式](#3-reflection-模式)
4. [三种模式对比](#4-三种模式对比)
5. [如何选择](#5-如何选择)

---

## 1. ReAct 模式

### 1.1 概述

**ReAct**（Reasoning + Acting，推理与行动）由 Google Research 在 2022 年的论文《ReAct: Synergizing Reasoning and Acting in Language Models》中提出。它是目前 AI Agent 领域最基础、应用最广泛的模式。

ReAct 的核心理念是：**将推理（Reasoning）和行动（Acting）交织在一起**，让 LLM 在每一步都先思考再行动，然后根据行动结果继续思考，形成一个动态的"思考→行动→观察→思考→…"循环。

### 1.2 工作流程

```
┌─────────────────────────────────────────────────────┐
│                    ReAct 循环                         │
│                                                       │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐       │
│   │  Thought  │───▶│  Action  │───▶│Observation│      │
│   │  (思考)   │    │  (行动)   │    │  (观察)   │      │
│   └──────────┘    └──────────┘    └──────────┘       │
│         ▲                               │             │
│         └───────────────────────────────┘             │
│                  循环直到任务完成                       │
└─────────────────────────────────────────────────────┘
```

每一步包含三个关键组件：

| 组件 | 说明 | 示例 |
|------|------|------|
| **Thought（思考）** | LLM 分析当前状态，推理下一步该做什么 | "我需要先查找这个函数的文档" |
| **Action（行动）** | LLM 执行具体操作（调用工具、搜索等） | `search("Python list append")` |
| **Observation（观察）** | 获取行动结果，作为下一步思考的输入 | 搜索结果返回了文档链接 |

### 1.3 示例流程

以"帮我查找北京今天的天气并发送邮件给张三"为例：

```
第1轮:
  Thought: 我需要先获取北京今天的天气信息
  Action: get_weather(city="北京")
  Observation: 北京今天晴，15°C~25°C

第2轮:
  Thought: 已获取天气信息，现在需要发送邮件给张三
  Action: send_email(to="zhangsan@example.com", content="北京今天晴，15°C~25°C")
  Observation: 邮件发送成功

第3轮:
  Thought: 任务已完成
  Action: finish("已获取天气并发送邮件")
```

### 1.4 核心特点

- **交织推理**：思考与行动交替进行，每一步都基于前一步的观察结果
- **动态决策**：不预设完整计划，根据实时反馈灵活调整
- **可解释性强**：每一步的 Thought 提供了清晰的推理链
- **错误恢复**：观察到错误后可以立即调整策略

### 1.5 适用场景

- 需要与外部环境频繁交互的任务
- 步骤无法预先确定的开放式问题
- 需要实时反馈来指导下一步行动的场景
- 工具调用密集型的任务（搜索、API 调用、数据库查询等）

### 1.6 局限性

- 缺乏全局规划，可能在复杂任务中走弯路
- 每一步都需要 LLM 调用，token 消耗较大
- 对于需要多步前瞻性规划的任务效率较低
- 容易陷入局部最优

---

## 2. Plan-and-Execute 模式

### 2.1 概述

**Plan-and-Execute**（先规划后执行）模式借鉴了经典 AI 规划的思想，将任务处理分为两个明确的阶段：**规划阶段**和**执行阶段**。这种模式强调"三思而后行"，在执行之前先制定完整的行动计划。

### 2.2 工作流程

```
┌─────────────────────────────────────────────────────┐
│              Plan-and-Execute 流程                     │
│                                                       │
│  ┌──────────────────┐                                │
│  │   用户输入任务     │                                │
│  └────────┬─────────┘                                │
│           ▼                                           │
│  ┌──────────────────┐                                │
│  │   Plan 阶段       │  LLM 制定完整计划               │
│  │   生成计划列表     │  Step 1: ...                   │
│  │                  │  Step 2: ...                   │
│  │                  │  Step 3: ...                   │
│  └────────┬─────────┘                                │
│           ▼                                           │
│  ┌──────────────────┐                                │
│  │   Execute 阶段    │  逐步执行计划                    │
│  │  ┌────────────┐  │                                │
│  │  │ Step 1 ✓   │  │                                │
│  │  │ Step 2 ✓   │  │                                │
│  │  │ Step 3 ✓   │  │                                │
│  │  └────────────┘  │                                │
│  └────────┬─────────┘                                │
│           ▼                                           │
│  ┌──────────────────┐                                │
│  │   汇总结果输出     │                                │
│  └──────────────────┘                                │
└─────────────────────────────────────────────────────┘
```

### 2.3 示例流程

以"分析这个 GitHub 仓库的代码质量并生成报告"为例：

```
Plan 阶段:
  1. 克隆仓库到本地
  2. 统计代码行数和文件结构
  3. 运行 lint 检查
  4. 分析代码复杂度
  5. 检查测试覆盖率
  6. 汇总生成报告

Execute 阶段:
  Step 1: git clone https://github.com/example/repo.git → 成功
  Step 2: cloc . → 共 15000 行代码，120 个文件
  Step 3: eslint . → 发现 23 个警告，5 个错误
  Step 4: radon cc . → 平均复杂度 B 级
  Step 5: pytest --cov → 覆盖率 78%
  Step 6: 汇总以上信息 → 生成 Markdown 报告
```

### 2.4 核心特点

- **全局视角**：在执行前对任务有整体把握
- **结构化**：计划清晰，步骤明确，便于追踪
- **可预测性**：执行路径确定，结果可预期
- **效率高**：减少不必要的 LLM 调用（执行阶段可用简单逻辑）

### 2.5 适用场景

- 任务步骤可以预先规划的结构化问题
- 需要多步骤协调的复杂工作流
- 对执行顺序有严格要求的任务
- 需要人工审核计划后再执行的场景
- 批处理类任务

### 2.6 局限性

- 计划是静态的，难以应对执行过程中的意外情况
- 如果初始计划有误，可能浪费大量执行时间
- 对于高度不确定的任务，预先规划可能不切实际
- 缺乏执行过程中的动态调整能力

### 2.7 变体：动态 Plan-and-Execute

一些实现会在执行阶段加入**重新规划（Replan）**机制：

```
Plan → Execute Step 1 → 检查结果 → 需要调整？
                                         ├── 否 → 继续 Step 2
                                         └── 是 → 重新 Plan（基于当前状态）
```

这种变体结合了 Plan-and-Execute 的结构化优势和 ReAct 的灵活性。

---

## 3. Reflection 模式

### 3.1 概述

**Reflection**（反思）模式由 Shinn 等人在 2023 年的论文《Reflexion: Language Agents with Verbal Reinforcement Learning》中提出。它的核心思想是：**让 Agent 对自己的输出进行自我评估和迭代改进**，通过"生成→评估→反思→改进"的循环不断提升输出质量。

Reflection 模式模拟了人类"写草稿→自我审查→修改→再审查"的迭代过程。

### 3.2 工作流程

```
┌─────────────────────────────────────────────────────┐
│                  Reflection 循环                       │
│                                                       │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐       │
│   │ Generate  │───▶│ Evaluate │───▶│ Reflect  │       │
│   │  (生成)   │    │  (评估)   │    │  (反思)   │       │
│   └──────────┘    └──────────┘    └──────────┘       │
│         ▲                               │             │
│         │                               ▼             │
│         │                        ┌──────────┐        │
│         └────────────────────────│ Improve  │        │
│                    满足条件则退出  │  (改进)   │        │
│                                  └──────────┘        │
└─────────────────────────────────────────────────────┘
```

每一步包含四个关键组件：

| 组件 | 说明 | 示例 |
|------|------|------|
| **Generate（生成）** | LLM 生成初始输出 | 写一段代码或一篇文章 |
| **Evaluate（评估）** | 对输出进行质量评估 | 检查代码是否有 bug、文章是否流畅 |
| **Reflect（反思）** | 分析问题根因，形成改进策略 | "变量命名不够清晰，需要重构" |
| **Improve（改进）** | 基于反思结果重新生成 | 根据反馈修改代码或文章 |

### 3.3 示例流程

以"写一个高效的快速排序实现"为例：

```
第1轮:
  Generate: def quicksort(arr):
               if len(arr) <= 1:
                   return arr
               pivot = arr[0]
               left = [x for x in arr[1:] if x <= pivot]
               right = [x for x in arr[1:] if x > pivot]
               return quicksort(left) + [pivot] + quicksort(right)

  Evaluate: 
    - 功能正确 ✓
    - 使用了额外的列表空间，不是原地排序 ✗
    - 每次递归创建新列表，内存效率低 ✗
    - 选择第一个元素作为 pivot，最坏情况 O(n²) ✗

  Reflect: 需要改为原地排序，使用双指针分区，随机选择 pivot

第2轮:
  Generate: def quicksort(arr, low=0, high=None):
               if high is None:
                   high = len(arr) - 1
               if low < high:
                   pi = partition(arr, low, high)
                   quicksort(arr, low, pi - 1)
                   quicksort(arr, pi + 1, high)
               return arr
            
            def partition(arr, low, high):
                import random
                pivot_idx = random.randint(low, high)
                arr[pivot_idx], arr[high] = arr[high], arr[pivot_idx]
                pivot = arr[high]
                i = low - 1
                for j in range(low, high):
                    if arr[j] <= pivot:
                        i += 1
                        arr[i], arr[j] = arr[j], arr[i]
                arr[i + 1], arr[high] = arr[high], arr[i + 1]
                return i + 1

  Evaluate:
    - 原地排序 ✓
    - 随机 pivot，避免最坏情况 ✓
    - 代码清晰，有注释 ✓
    - 通过所有测试用例 ✓

  → 满足条件，输出最终结果
```

### 3.4 核心特点

- **自我改进**：Agent 能够识别自身输出的问题并修正
- **质量导向**：通过多轮迭代不断提升输出质量
- **长期记忆**：反思结果可以存储为经验，指导未来任务
- **口头强化学习**：通过语言反馈实现类似强化学习的效果

### 3.5 适用场景

- 对输出质量要求高的任务（代码生成、文案写作、翻译）
- 有明确评估标准的任务
- 需要迭代优化的创造性工作
- 复杂推理任务（数学证明、逻辑推理）
- 可以自动验证结果的场景（代码执行、测试用例）

### 3.6 局限性

- 多轮迭代导致延迟和成本增加
- 需要设计有效的评估标准
- 可能陷入无限循环（需要设置最大迭代次数）
- 评估器本身可能出错，导致错误方向上的"改进"
- 对于简单任务，过度反思可能适得其反

### 3.7 变体

- **Reflexion**：在反思中加入长期记忆，将经验存储到 episodic memory 中
- **Self-Refine**：更轻量的自我改进，直接让 LLM 对自己的输出提出改进建议
- **CRITIC**：让 LLM 通过与外部工具（如代码解释器）交互来验证和修正输出

---

## 4. 三种模式对比

### 4.1 核心维度对比

| 维度 | ReAct | Plan-and-Execute | Reflection |
|------|-------|------------------|------------|
| **核心思想** | 推理与行动交织 | 先规划后执行 | 生成→评估→改进循环 |
| **决策方式** | 逐步动态决策 | 预先全局规划 | 迭代自我改进 |
| **规划粒度** | 单步（下一步做什么） | 全局（整个任务计划） | 多轮（每轮改进上一轮） |
| **灵活性** | ⭐⭐⭐⭐⭐ 极高 | ⭐⭐ 较低 | ⭐⭐⭐ 中等 |
| **结构化程度** | ⭐⭐ 较低 | ⭐⭐⭐⭐⭐ 极高 | ⭐⭐⭐ 中等 |
| **输出质量** | ⭐⭐⭐ 中等 | ⭐⭐⭐ 中等 | ⭐⭐⭐⭐⭐ 极高 |
| **执行效率** | ⭐⭐⭐ 中等 | ⭐⭐⭐⭐ 较高 | ⭐⭐ 较低 |
| **错误恢复** | ⭐⭐⭐⭐ 较好 | ⭐⭐ 较差 | ⭐⭐⭐⭐⭐ 极好 |
| **Token 消耗** | 中等 | 较低 | 较高 |
| **可解释性** | ⭐⭐⭐⭐⭐ 极高 | ⭐⭐⭐⭐ 较高 | ⭐⭐⭐ 中等 |

### 4.2 架构对比图

```
ReAct:
  Thought → Action → Observation → Thought → Action → ...
  └──────────────── 逐步推进，灵活应变 ────────────────┘

Plan-and-Execute:
  Plan(全局) → Execute(Step1) → Execute(Step2) → ... → Done
  └──── 结构化，可预测 ────┘

Reflection:
  Generate₁ → Evaluate₁ → Reflect₁ → Generate₂ → Evaluate₂ → ... → Done
  └──────────── 迭代优化，质量导向 ────────────┘
```

### 4.3 典型使用场景对比

| 场景 | 推荐模式 | 原因 |
|------|----------|------|
| 网页搜索与信息检索 | ReAct | 搜索结果不可预测，需要动态调整 |
| 多步骤数据处理流水线 | Plan-and-Execute | 步骤明确，可预先规划 |
| 代码生成与优化 | Reflection | 需要多轮迭代提升质量 |
| 客户服务对话 | ReAct | 对话流程灵活多变 |
| 自动化测试执行 | Plan-and-Execute | 测试步骤固定 |
| 文案撰写与翻译 | Reflection | 需要反复打磨 |
| 复杂数学推理 | Reflection | 需要验证和修正推理过程 |
| API 编排调用 | Plan-and-Execute | 调用顺序可预先确定 |
| 开放式问题解答 | ReAct | 需要根据中间结果调整策略 |

### 4.4 组合使用

三种模式并非互斥，实际应用中经常组合使用：

```
组合示例 1: ReAct + Reflection
  在 ReAct 的每一步中加入 Reflection，确保每步输出质量

组合示例 2: Plan-and-Execute + ReAct
  先用 Plan-and-Execute 制定计划，执行阶段用 ReAct 处理每个子任务

组合示例 3: Plan-and-Execute + Reflection
  先规划，执行后对最终结果进行 Reflection 改进

组合示例 4: 三者结合
  Plan(全局规划) → ReAct(执行每个步骤) → Reflection(评估改进最终结果)
```

---

## 5. 如何选择

### 5.1 决策流程图

```
任务是否可以预先规划所有步骤？
├── 是 → 步骤是否固定不变？
│        ├── 是 → Plan-and-Execute
│        └── 否 → Plan-and-Execute + Replan 变体
│
└── 否 → 是否需要极高质量输出？
         ├── 是 → 是否有明确评估标准？
         │        ├── 是 → Reflection（或 ReAct + Reflection）
         │        └── 否 → ReAct
         │
         └── 否 → ReAct
```

### 5.2 选择建议

1. **从 ReAct 开始**：作为最通用的模式，ReAct 适合大多数场景。如果它工作良好，就不需要增加复杂性。

2. **当任务结构化程度高时**，考虑 Plan-and-Execute：
   - 你知道完成任务需要哪些步骤
   - 步骤之间的依赖关系清晰
   - 执行过程中不太可能出现意外

3. **当输出质量至关重要时**，考虑 Reflection：
   - 任务有明确的"好"与"坏"标准
   - 可以通过自动化方式评估输出
   - 愿意用时间和成本换取更高质量

4. **组合使用**：复杂系统通常需要多种模式的组合，根据具体子任务选择合适的模式。

### 5.3 实践建议

- **先简单后复杂**：从最简单的模式开始，只在必要时增加复杂度
- **设置边界**：为循环设置最大迭代次数，防止无限循环
- **记录日志**：详细记录每一步的推理和决策，便于调试
- **评估驱动**：用指标衡量每种模式的实际效果，数据驱动选择
- **人机协作**：在关键决策点引入人工审核，降低风险

---

## 参考资料

- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629) — Yao et al., 2022
- [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366) — Shinn et al., 2023
- [Self-Refine: Iterative Refinement with Self-Feedback](https://arxiv.org/abs/2303.17651) — Madaan et al., 2023
- [Plan-and-Solve Prompting](https://arxiv.org/abs/2305.04091) — Wang et al., 2023
- [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) — Anthropic Engineering Blog