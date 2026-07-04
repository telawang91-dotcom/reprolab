# AGENTS.md・ReproLab 常驻开发规范

这份文件很短，是唯一 "每次都读" 的规范。详细内容在 docs/ 与 tasks/，按需加载，不要整份塞进上下文（见 docs/00-README.md 的加载规则）。

### 0. 项目一句话

ReproLab —— 面向研究生的、可信可复现、会自我核查、越用越懂你的科研工作台。

招牌能力：每张图 / 每个数字都绑定「数据 + 代码 + 环境」，可一键重跑验证，改数据自动标红漂移。

### 1. 技术栈（锁定，勿擅自升级 / 替换）

后端：Python 3.11・FastAPI 0.111.x・Pydantic 2.7.x・Uvicorn・SQLAlchemy 2.0.x + Alembic

数据库：PostgreSQL 16 + pgvector 0.7.x（单容器，向量 / 元数据 / 溯源边一库承载）

对象存储：本地文件夹内容寻址（storage/<sha256>），不使用 MinIO

检索：pgvector 向量 + rank_bm25 + bge-reranker-v2-m3；embedding 用 BAAI/bge-m3

沙箱：jupyter_client 持久 kernel + Docker（python:3.11-slim 预装科学库）

Agent 编排：轻量自研（planner/executor/critic 函数）+ ModelAdapter 模型无关层

LLM：混元 / DeepSeek（OpenAI 兼容，用 openai SDK）；ModelAdapter 预留 Claude

前端：Next.js 14.2.x + React 18.3.x + TS 5.4.x + Tailwind 3.4.x + shadcn/ui + lucide + reactflow 11.11.x + react-markdown + katex

不使用：Celery、Redis、MinIO（demo 阶段异步任务用 FastAPI BackgroundTasks）

### 2. 架构铁律（不可违背）

1. 可信是数据必经之路，不是插件：任何被正文 / 结论引用的数字，必须在溯源账本里有 数字 (artifact) ← 代码 (run) ← 数据 (dataset) 的完整血缘；无血缘的数字视为 "来路不明"，必须被校验拦截。
2. 内容寻址：数据 / 产物一律按 sha256 (bytes) 存储，文件名即哈希。
3. 信任锚点 code_hash = sha256 (code + lang + input_hash + env_hash)：代码、输入数据、或环境任一变动，哈希即变。必须包含环境哈希（这是复现能成立的前提）。
4. 复现比对：数值型用容差比对（abs (a-b) <= tol）、文件型用内容哈希；重跑前固定随机种子。禁止用逐字节哈希比对图片。
5. 正文锚点：结论 / 综述里凡数字插 ⟦art_xxxx⟧、凡引用插 ⟦src_xxxx⟧，机器可解析，供校验逐一对账。
6. 模型无关：业务代码只调 ModelAdapter.chat ({model, messages, tools})，不直接依赖某厂商 SDK 细节；换模型 = 改配置。
7. UI 是展示层：核心能力通过 REST 暴露，可脱离前端被脚本调用（M-Platform 适配层）。
8. 分析动态生成、学科无关：数据分析一律由执行 Agent 按用户请求动态生成 Python 代码完成，通用、不分学科。技能包（M11）只是可选的加速模板 / 工具，严禁把分析实现成 "固定学科菜单" 或写死的分析清单。"换学科 = 装包" 指的是核心机制学科无关、可选装模板提效，不是限制分析种类。

### 3. 唯一事实来源（冲突时以这些为准）

数据表结构 → docs/03-DATA-MODEL.md

REST 接口 → docs/04-API.md

溯源 / 复现 / 校验机制 → docs/05-PROVENANCE.md

UI 设计令牌 / 页面 → docs/06-DESIGN.md

任务卡只引用这些文档、不重复定义；发现不一致，先改这些文档再改代码。

### 4. 编码约定

1. 目录结构见 docs/00-README.md § 目录结构。
2. 后端：service 层放业务（services/{rag,sandbox,lineage,agents,memory,suggest}），api 层只做 I/O 与校验。
3. 所有对外接口用 Pydantic schema 定义请求 / 响应，放 schemas/。
4. 数据库变更走 Alembic 迁移，不手改表。
5. 每个模块完成前，跑通对应任务卡的 "验收 DoD" 才算 done。
6. 提交信息用中文简述 + 模块号，如 M5: 实现 run 重放与容差比对。

### 5. 开发顺序（demo 闭环优先）

P0 必做闭环：M1 入库 → M2 检索 → M4 沙箱 → M5 溯源 → M3 对话分析（+ 前端知识库页、分析对话页、简版溯源图）。

P0 跑通后再做 P1：M6 溯源图谱 → M7 校验 → M8 写作回写 → M9 记忆 → M10 建议。P2：M11 技能包、M-Platform 适配层。

算法增强（P1，对齐评审 "技术深度 30%"，见 docs/07-SCORING.md）：核心稳定后按 ROI 加 M5b 差异归因 → M7b 引用 NLI → M7c 反思式自修复 —— 这三项是拉高技术深度评分的关键，别只做基础闭环就收工。

任何时刻主分支都要能演示。先跑通竖切，再横向铺功能。