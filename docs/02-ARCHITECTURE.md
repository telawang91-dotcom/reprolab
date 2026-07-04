# 02・技术架构（含路演技术讲解稿）

本章回答一个核心命题：为什么 ReproLab 的可信不依赖某个具体大模型，而由架构保证。 系统分 "底座 — 核心 — 护城河 — 输出" 四层，层间以显式契约（JSON schema、溯源血缘）解耦。

### 1. 四层总体架构

plaintext









```
┌───────────────────────────────────────────────────────────────┐
│ ④ 输出闭环层  智能问答 / 数据分析报告 / 结论回写 / 写作面板        │
│    正文富文本锚点：⟦art_*⟧→产物(表/图/系数)  ⟦src_*⟧→文献，点击回溯 │
└───────────────────────────────────────────────────────────────┘
        ▲ 结构化产物(JSON)+锚点        │ 调用/委派
┌───────────────────────────────────────────────────────────────┐
│ ③ 护城河层  溯源账本(血缘图) │ 对抗式质检(审稿人视角三查)           │
│   数据→代码→数字→结论←文献   │ ①引用核查 ②数字溯源 ③图码一致        │
│   "可信由架构保证，而非由模型保证"                                 │
└───────────────────────────────────────────────────────────────┘
        ▲ 每条结论/数字携带血缘引用    │ 委派子任务
┌───────────────────────────────────────────────────────────────┐
│ ② 核心层  Agent 编排（planner → retriever? → executor → critic）  │
│   ModelAdapter 模型无关运行时（混元/DeepSeek/Claude 统一 tool 调用）│
└───────────────────────────────────────────────────────────────┘
        ▲ 混合检索结果+元数据          │ 检索/写入/召回记忆
┌───────────────────────────────────────────────────────────────┐
│ ① 底座层  知识库                                                  │
│   多源导入 PDF/CSV/代码/笔记 → 解析切块 → bge-m3 向量化            │
│   混合检索: 向量(pgvector)+BM25 → RRF 融合 → bge-reranker 精排     │
│   存储: Postgres+pgvector(向量/元数据/溯源边) + 本地内容寻址(产物)  │
│   长期记忆三层: 情节 / 语义 / 技能                                 │
└───────────────────────────────────────────────────────────────┘
        ▲ 全栈本地，仅 LLM API 出网（数据不出端）
```

关键点：护城河层不是可选插件，而是数据必经之路。 分析产出的任何数字若未登记 数据→代码→数字 血缘，就无法被写作层引用；写作层的引用若未命中知识库，会被校验层判为幻觉并驳回。

### 2. 系统架构图（组件）

flowchart









```
    subgraph FE["前端 Next.js + React + TS"]
        F1[知识库]; F2[分析对话]; F3[溯源图谱]; F4[写作面板]
    end
    subgraph BE["后端 FastAPI（单进程）"]
        GW[API 层]; ORCH[Agent 编排]
    end
    subgraph AG["Agents"]
        P[规划]; E[执行]; C[校验]; ADP[ModelAdapter]
    end
    subgraph CAP["核心能力 services/"]
        RAG[检索/RAG]; SBX[执行沙箱]; PRV[溯源引擎+复现]; MEM[记忆]
    end
    subgraph ST["存储"]
        PG[(Postgres + pgvector)]; FS[(本地内容寻址 storage/)]
    end
    FE -->|REST/SSE| GW --> ORCH --> AG
    P --> RAG; E --> SBX; C --> PRV; ORCH --> MEM
    AG --> ADP
    RAG --> PG; SBX --> FS; PRV --> PG; PRV --> FS; MEM --> PG
```

### 3. 技术核心讲解稿（路演三段论）

路演时按 "技术深度" 这样讲 —— 三处协同，缺一不可。

#### 3.1 模型无关运行时（技术深度・亮点一）

不绑定任何厂商 SDK，自研轻量适配层把 "模型能力" 与 "编排逻辑" 解耦：

python



运行







```
ModelAdapter.chat({ model, messages, tools }) -> { content, tool_calls[] }
```

内部三件事：① 把统一的 messages/tools 翻译成各厂商原生请求（混元 / DeepSeek 走 OpenAI 兼容、Claude 走 tool_use block）；② 把工具调用返回归一化；③ 归一化流式、token 计数、错误重试。

换模型 = 改一行 model 配置。

分角色路由：演示默认全链路走混元（便宜）；编排者与校验 Agent 可路由到更强模型（判断力比生成量值钱）。

单个 Agent 的执行收敛成一个确定性循环（易审计）：

python



运行







```
def runAgent(agent, task):
  messages = [system(agent.role), user(task)]
  while True:
    resp = ModelAdapter.chat({model: agent.model, messages, tools: agent.tools})
    if resp.tool_calls:
       for tc in resp.tool_calls:
          result = execute(tc)   # 检索 / 代码执行 / 写溯源账本
          messages += [assistant(tc), tool_result(result)]
       continue
    else:
       return resp.content
```

编排者本身也跑这个循环，但它的 "工具" 是委派子智能体（规划→检索→执行→校验），带来独立上下文、可并行、结构化收口三重收益。

demo 简化：编排可先用朴素 Python 函数串联 planner/executor/critic，无需引入状态机框架；runAgent 循环与 ModelAdapter 是必须保留的技术亮点。

#### 3.2 溯源账本 + 复现引擎（技术深度・亮点二・招牌）

详见 docs/05-PROVENANCE.md。一句话讲：每次代码执行都被登记为一条不可变记录（代码 + 环境快照 + 输入哈希 + 输出哈希 + code_hash），产物按内容寻址存储，实体间连成有向血缘图；一键复现 = 在干净环境重放该 run，用容差比对判定一致 / 漂移。

信任锚点：code_hash = sha256 (code + lang + input_hash + env_hash) —— 代码、输入或环境任一变动，哈希即变。

#### 3.3 对抗式质检三查（科学价值・亮点三）

详见 docs/05-PROVENANCE.md § 对抗式质检。校验 Agent 以审稿人身份默认怀疑，扫描正文所有锚点逐一对账：

1. 引用核查：⟦src_*⟧ 是否命中库内 + DOI / 来源可解析 → 抓幻觉引用；

2. 数字溯源：每个数字是否绑定合法 ⟦art_*⟧ 且追得到成功的 run → 抓来路不明数字；

3. 图码一致：重跑图表对应的 run，容差比对输出 → 抓图码不符。

   

   🎯 现场高光：评委亲手塞入假引用 / 假数字，运行校验当场标红。

### 4. 检索管线（复杂检索，技术深度支撑）

六段流水线，第 6 段是深度所在：

1. 查询理解    中英 / 同义扩展、抽取可结构化过滤条件（年份 / 方法）
2. 多源检索    库内为主；可选联邦检索 OpenAlex/arXiv 免费源（P2）
3. 去重排序    标题 / DOI 去重
4. 取全文入库  见 M1
5. 向量化      bge-m3 → pgvector
6. 复杂检索    向量 + BM25 → RRF 融合 → bge-reranker 精排 → 元数据前置过滤

第 6 段核心逻辑见 docs/05-PROVENANCE.md § 复杂检索（含 RRF 伪代码）。要点：元数据前置过滤缩小候选；RRF 只依赖排名、对分数量纲不敏感；reranker 是 cross-encoder，只对融合后 top-N 精排。

### 5. 部署形态（demo）

1. 单机：docker-compose up 起 pg+pgvector 一个容器；后端 uvicorn、前端 next dev 本地跑；沙箱用一个预装科学库的 Docker 镜像。
2. 数据不出端：知识库全量落本地磁盘，唯一出网是 LLM API。
3. 平台可调用：核心能力全部经 REST 暴露（见 docs/04-API.md），M-Platform 适配层可把外部调用协议转成内部 Agent 调用 ——UI 只是核心的一个前端。