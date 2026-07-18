# ReproLab

> 面向研究生的可信、可复现科研工作台：把多源资料、复杂 RAG、动态数据分析和长期记忆连成一条可核查、可重跑的研究链。

[![Product quality](https://github.com/telawang91-dotcom/reprolab/actions/workflows/quality.yml/badge.svg?branch=dev)](https://github.com/telawang91-dotcom/reprolab/actions/workflows/quality.yml?query=branch%3Adev)
![Python 3.11](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![Next.js 14](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)
![PostgreSQL 16](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)

ReproLab 不是给科研流程再套一层聊天界面，而是把“结论是否有证据、数字能否重算、数据变化后结果是否仍成立”变成系统必须执行的检查。

![ReproLab 工作台](docs/images/workbench-home.png)

## 核心能力覆盖

| 用户需求 | 当前实现 | 可验证入口 |
| --- | --- | --- |
| 复杂检索（RAG） | 元数据预过滤、BM25、pgvector、RRF 融合、交叉编码重排、原文锚点 | `/knowledge` |
| 数据分析 | Planner / Executor / Critic 按真实数据动态生成并执行 Python | `/analysis` |
| 长期记忆 | 项目隔离的情节、语义、技能三层记忆，使用前核验 | `/memory` |
| 多源异构管理 | PDF、CSV、XLSX、Markdown、TXT、Python、Notebook 统一入库和查询 | `/knowledge`、`/projects` |
| 科研建议与写作 | 建议绑定证据；数字与引用使用机器可解析锚点，校验通过后才能回写 | `/results` |

从 `/demo` 可以先查看真实运行状态和六步能力证据，再进入明确标识、与真实研究空间隔离的 Palmer Penguins 演示项目。

## 核心差异

| 常见科研 AI | ReproLab |
| --- | --- |
| 返回一段看似合理的回答 | 回答中的引用可回到原文片段 |
| 生成图表，但输入与代码容易丢失 | 每个产物绑定 Dataset → Run → Artifact 与环境快照 |
| 数据更新后依赖人工重新检查 | 一键重跑、容差比较、漂移标红并定位贡献来源 |
| 发现错误后只提示用户重试 | 引用 NLI、数字/图表三查与 Reflexion 多轮自修复 |
| 记忆跨任务混用，来源不清 | 记忆按项目隔离，召回前检查来源与适用范围 |

## 为什么需要 ReproLab

研究生常见的问题不是缺少一个聊天机器人，而是科研过程“记不住、说不清、重不来”：

- 半年前的分析不知道使用了哪份数据、哪段代码和哪个环境；
- 导师追问“这个数字从哪里来”，无法快速回答；
- 数据更新后，不知道旧图表和旧结论是否仍然成立；
- 通用大模型可能生成无来源数字、错误引用或与代码不一致的图表。

ReproLab 把这些问题变成系统约束：

> **可信由架构保证，而不是由某个具体模型保证。**

## 使用场景

| 场景 | ReproLab 如何完成 |
| --- | --- |
| 复现论文结果 | 上传论文与数据，生成或执行分析代码，对比新旧结果并定位漂移。 |
| 自然语言数据分析 | 选择数据并描述研究问题，Agent 动态生成 Python 代码和图表。 |
| 回答导师质疑 | 点击数字或图表，查看原始数据、执行代码、环境和完整血缘。 |
| 数据更新后的复核 | 替换数据一键重跑，按照数值容差与绘图数据判断结果是否变化。 |
| 投稿前质量检查 | 检查无来源数字、错误引用、正文与产物不一致、图码不一致。 |
| 长期研究项目管理 | 按项目隔离资料、分析、成果、结论和科研记忆，随时继续上次工作。 |

## 核心工作流

```mermaid
flowchart LR
    A[添加论文与数据] --> B[检索证据]
    B --> C[提出研究问题]
    C --> D[Agent 生成并执行代码]
    D --> E[登记数字、表格与图形]
    E --> F[复现与可信校验]
    F --> G[形成报告与结论]
```

前端将工作流收敛为四步：

```text
添加资料 → 运行分析 → 检查成果 → 形成报告
```

## 产品能力

### 资料与知识空间

- 任意文件、完整文件夹和 ZIP 均可直接入库；系统按内容识别文本、PDF、Office、Notebook 与数据表，暂不可解析的格式保留原文件并明确标记能力状态；
- 按研究项目与知识空间管理资料；
- 关键词 BM25、向量语义检索和 RRF 混合检索；
- bge-reranker-v2-m3 对候选证据进行交叉编码器精排；
- 检索结果可以定位原文段落。

![资料与检索](docs/images/knowledge-space.png)

### 对话式数据分析

- 自然语言描述统计、绘图或建模任务；
- Planner → Executor → Critic 轻量 Agent 编排；
- 根据问题和真实数据动态生成 Python，而不是固定学科菜单；
- Docker/Jupyter 隔离执行，默认固定随机种子并捕获结构化产物；
- 流式展示执行计划、代码、运行状态、产物和结论。

### 成果箱与写作

- 集中查看真实数字、表格、图形和可信状态；
- 查看来源、导出产物、加入报告；
- 写作草稿按项目隔离；
- 数字使用 `⟦art_*⟧`、文献使用 `⟦src_*⟧` 机器可解析锚点；
- 校验通过且包含真实分析产物后，才能回写为可信结论。

### 项目与交付

- 创建、切换、重命名、归档和恢复研究项目；
- 归档项目只读保留历史资料与血缘；
- 项目时间线、导师只读审阅、长期科研记忆；
- 可打印复现报告、两次运行差异比较、图表与 JSON 产物导出；
- 全局任务中心持续显示上传和 Agent 分析状态。

### 长期记忆与技能复用

- 情节记忆记录做过什么，语义记忆保存已核验偏好与事实；
- 技能记忆沉淀可复用分析方法，不把分析限制成固定学科菜单；
- 记忆、技能、建议和产物都以项目为隔离边界；
- 技能可导入、导出、应用到新数据，字段映射不确定时安全回退动态分析；
- 新会话召回前检查来源和适用范围，避免把旧结论直接当作当前事实。

## 技术核心

### 1. 溯源账本

```text
Dataset ──reads──▶ Run ──produces──▶ Artifact ──supports──▶ Claim
                                                   ▲
Document ──────────────────────── cites ────────────┘
```

任何被结论引用的数字，都必须追溯到成功的代码执行和真实输入数据。缺少任意一环即视为来源不完整。

### 2. 内容寻址与信任锚点

```text
env_hash   = SHA256(Python 版本 + 依赖包版本)
input_hash = SHA256(所有输入数据内容哈希)
code_hash  = SHA256(代码 + 语言 + input_hash + env_hash)
```

代码、输入数据或运行环境任一变化，信任锚点都会变化。数据和文件产物存储于 `backend/storage/<sha256>`。

### 3. 一键复现与漂移检测

- 数字与表格：按容差比较；
- 图形：比较绘图底层结构化数据，而不是 PNG 字节；
- 文件：比较内容哈希；
- 复现前恢复随机种子、输入版本与环境快照；
- 漂移后可进一步进行列级差异归因。

### 4. 对抗式三查

校验 Agent 以审稿人视角检查：

1. 引用是否存在且真正支持当前论断；
2. 正文数字是否绑定真实分析产物；
3. 图表能否由原始代码、数据和环境重新生成。

三查不是字符串规则集合：引用检查使用 NLI 输出 `entailment / neutral / contradiction`，失败后可进入 Reflexion 修复循环，并记录每轮问题、修复动作与最终状态。

### 5. 漂移归因与反思式修复

- **Drift Attribution**：通过受控消融、逐项回放与敏感性分析，估算字段或分组对结果变化的贡献；
- **Citation NLI**：判断证据是否真正蕴含当前论断，而不只检查引用是否存在；
- **Reflexion Repair**：把质检失败反馈给写作或执行 Agent，多轮修正后重新校验；
- 所有算法输出保留可解释理由和中间状态，便于评委或导师复核。

### 6. 模型无关运行时

业务层统一调用：

```python
ModelAdapter.chat({"model": model, "messages": messages, "tools": tools})
```

当前支持 DeepSeek、腾讯混元及兼容 OpenAI 协议的模型服务。切换模型不改变溯源、执行和校验规则。

同一套 Agent 核心同时服务前端 SSE 会话和 `POST /agent/invoke`，核心能力可以脱离 UI 被脚本或平台调用。

## 系统架构

```mermaid
flowchart TB
    UI[Next.js / React 科研工作台]
    API[FastAPI REST + SSE]
    AGENT[Planner / Executor / Critic + ModelAdapter]
    SERVICES[RAG / Sandbox / Provenance / Memory / Skills]
    PG[(PostgreSQL 16 + pgvector)]
    FS[(本地 SHA-256 内容存储)]

    UI --> API
    API --> AGENT
    AGENT --> SERVICES
    SERVICES --> PG
    SERVICES --> FS
```

- 前端：Next.js 14、React 18、TypeScript、Tailwind CSS、React Flow；
- 后端：Python 3.11、FastAPI、Pydantic、SQLAlchemy、Alembic；
- 数据：PostgreSQL 16 + pgvector；
- 检索：bge-m3、BM25、RRF、bge-reranker-v2-m3；
- 沙箱：持久 Jupyter kernel + Docker Python 3.11 科学计算镜像；
- 存储：本地内容寻址，不依赖 MinIO；
- Demo 异步：FastAPI BackgroundTasks，不引入 Celery、Redis。

## 项目结构

```text
reprolab/
├─ backend/
│  ├─ app/
│  │  ├─ api/          # REST/SSE 输入输出
│  │  ├─ schemas/      # Pydantic 契约
│  │  ├─ models/       # SQLAlchemy 数据模型
│  │  └─ services/     # RAG、Agent、沙箱、溯源、记忆与技能
│  ├─ alembic/         # 数据库迁移
│  ├─ tests/           # 单元与真实集成验收
│  └─ storage/         # 本地内容寻址存储，仅跟踪 .gitkeep
├─ frontend/
│  ├─ app/             # Next.js App Router 页面
│  ├─ components/      # 领域组件与全局外壳
│  └─ lib/             # API 客户端与本地状态
├─ docker/             # 科学计算沙箱镜像
├─ docs/               # 产品、架构、API、溯源和设计契约
├─ tasks/              # 分模块任务卡与验收标准
├─ scripts/            # 产品验证脚本
├─ .github/workflows/  # CI 与手动完整集成验收
└─ docker-compose.yml  # PostgreSQL + pgvector 与沙箱配置
```

## 快速开始

### 环境要求

- Python 3.11
- Node.js 20+
- Docker Desktop
- Windows PowerShell（当前主要开发环境）

### 1. 安装依赖

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm.cmd --prefix frontend install
Copy-Item .env.example .env
```

### 2. 启动 PostgreSQL 并迁移

```powershell
docker compose up -d postgres

Set-Location backend
..\.venv\Scripts\python.exe -m alembic upgrade head
Set-Location ..
```

### 3. 构建分析沙箱

```powershell
docker compose build sandbox
```

### 4. 启动应用

```powershell
# 终端 1：后端
Set-Location backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# 终端 2：前端
npm.cmd --prefix frontend run dev
```

访问：

- 产品界面：[http://localhost:3000](http://localhost:3000)
- OpenAPI：[http://localhost:8000/docs](http://localhost:8000/docs)
- 后端健康检查：[http://localhost:8000/health](http://localhost:8000/health)
- 运行环境诊断：[http://localhost:8000/api/v1/settings/runtime](http://localhost:8000/api/v1/settings/runtime)

首次使用也可以打开 `/demo`：页面会先展示核心能力与真实运行状态，再创建或复用隔离的 Palmer Penguins 演示项目和研究文件夹，不会污染真实研究空间。

![首次使用引导](docs/images/getting-started.png)

## 模型配置

资料入库、检索、代码执行和溯源复现不依赖 LLM 密钥。问答和 Agent 分析可在设置页面配置，也可使用环境变量：

```env
LLM_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=
HUNYUAN_API_KEY=
PLANNER_MODEL=deepseek:deepseek-v4-flash
EXECUTOR_MODEL=deepseek:deepseek-v4-flash
CRITIC_MODEL=deepseek:deepseek-v4-pro
```

不要提交 `.env` 或任何真实密钥。

## 验证

一键运行常规质量门禁：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\verify_product.ps1 `
  -Python "$PWD\.venv\Scripts\python.exe"
```

分别运行：

```powershell
$env:PYTHONPATH="$PWD\backend"
$env:SANDBOX_BACKEND="host"
.\.venv\Scripts\python.exe -m pytest backend\tests -q
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend run build
```

PostgreSQL 与 Docker 可用后运行真实集成验收：

```powershell
# 首次运行时创建专用测试库；禁止让自动化测试连接开发数据库
docker compose exec -T postgres createdb -U reprolab reprolab_test

$env:RUN_INTEGRATION="1"
$env:SANDBOX_BACKEND="docker"
$env:DATABASE_URL="postgresql+psycopg://reprolab:reprolab@localhost:5432/reprolab_test"
Set-Location backend
..\.venv\Scripts\python.exe -m alembic upgrade head
Set-Location ..
.\.venv\Scripts\python.exe -m pytest backend\tests\integration -q -s
```

如果 `reprolab_test` 已存在，可以跳过 `createdb`。集成测试在数据库 URL 不含 `test` 时会主动拒绝运行，避免污染真实研究状态。

GitHub Actions 会在推送和 Pull Request 时执行单元测试、类型检查、生产构建和可信核心集成测试；完整 P0 验收可手动触发。

## 三分钟演示建议

1. **0:00–0:25｜问题与定位**：从 `/demo` 检查真实运行环境，说明“科研需要能追责、能重跑的 AI 结论”；
2. **0:25–0:50｜资料与检索**：进入隔离研究文件夹，展示混合 RAG 与可回到原文的 `⟦src_*⟧` 引用；
3. **0:50–1:35｜真实分析**：提出未预设问题，确认输入数据，展示真实计划、动态代码和产物；
4. **1:35–2:15｜招牌动作**：打开 Dataset → Run → Artifact，替换数据重跑，展示漂移标红与根因贡献；
5. **2:15–2:45｜现场找茬**：加入错误数字或弱引用，运行 NLI 校验与 Reflexion 修复；
6. **2:45–3:00｜长期价值**：展示项目记忆与复现报告，收束到“越用越懂你，但每次复用仍可核验”。

## 文档

- [产品需求](docs/01-PRD.md)
- [技术架构](docs/02-ARCHITECTURE.md)
- [数据模型](docs/03-DATA-MODEL.md)
- [REST API](docs/04-API.md)
- [溯源、复现与校验](docs/05-PROVENANCE.md)
- [UI / UX 设计规范](docs/06-DESIGN.md)
- [评审与技术深度](docs/07-SCORING.md)
- [智能体详细设计](docs/08-AGENT-DESIGN.md)
- [Agent REST 调用](docs/09-AGENT-API.md)

开发前请阅读 [AGENTS.md](AGENTS.md)。契约冲突时，以 `docs/03-DATA-MODEL.md`、`docs/04-API.md`、`docs/05-PROVENANCE.md` 和 `docs/06-DESIGN.md` 为准。

## 当前定位

ReproLab 当前适合作为科研工作流 Demo、比赛展示、课程项目与内部 Beta 使用。面向公开多用户生产环境前，还需要补充身份认证、权限模型、备份恢复、监控与并发压测。
