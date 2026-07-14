# ReproLab

> 面向研究生的可信、可复现科研工作台：从资料检索、数据分析到结果验证与论文写作，让每个数字和图表都能找到数据、代码与运行环境。

[![Product quality](https://github.com/telawang91-dotcom/reprolab/actions/workflows/quality.yml/badge.svg)](https://github.com/telawang91-dotcom/reprolab/actions/workflows/quality.yml)
![Python 3.11](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![Next.js 14](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)
![PostgreSQL 16](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)

![ReproLab 工作台](docs/images/workbench-home.png)

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

- 上传 PDF、CSV、Excel、代码、Markdown、文件夹和 ZIP；
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

### 5. 模型无关运行时

业务层统一调用：

```python
ModelAdapter.chat({"model": model, "messages": messages, "tools": tools})
```

当前支持 DeepSeek、腾讯混元及兼容 OpenAI 协议的模型服务。切换模型不改变溯源、执行和校验规则。

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

首次使用也可以打开 `/demo`：页面会先展示赛道必备能力与真实运行状态，再创建或复用隔离的 Palmer Penguins 演示项目和研究文件夹，不会污染真实研究空间。

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
$env:RUN_INTEGRATION="1"
$env:SANDBOX_BACKEND="docker"
.\.venv\Scripts\python.exe -m pytest backend\tests\integration -q -s
```

GitHub Actions 会在推送和 Pull Request 时执行单元测试、类型检查、生产构建和可信核心集成测试；完整 P0 验收可手动触发。

## 三分钟演示建议

1. 从 `/demo` 检查运行环境并进入隔离演示研究文件夹；
2. 在知识空间展示混合 RAG 与可回到原文的 `⟦src_*⟧` 引用；
3. 用自然语言提出未预设的分析问题，展示真实计划、代码和产物；
4. 打开图表来源，查看 Dataset → Run → Artifact 与环境快照；
5. 替换数据重新运行，展示自动标红的结果漂移与根因贡献；
6. 在写作页加入错误数字或弱引用，运行 NLI 校验与反思式修复；
7. 最后展示项目长期记忆和可导出的复现报告。

## 文档

- [产品需求](docs/01-PRD.md)
- [技术架构](docs/02-ARCHITECTURE.md)
- [数据模型](docs/03-DATA-MODEL.md)
- [REST API](docs/04-API.md)
- [溯源、复现与校验](docs/05-PROVENANCE.md)
- [UI / UX 设计规范](docs/06-DESIGN.md)
- [评审与技术深度](docs/07-SCORING.md)
- [智能体详细设计](docs/08-AGENT-DESIGN.md)

开发前请阅读 [AGENTS.md](AGENTS.md)。契约冲突时，以 `docs/03-DATA-MODEL.md`、`docs/04-API.md`、`docs/05-PROVENANCE.md` 和 `docs/06-DESIGN.md` 为准。

## 当前定位

ReproLab 当前适合作为科研工作流 Demo、比赛展示、课程项目与内部 Beta 使用。面向公开多用户生产环境前，还需要补充身份认证、权限模型、备份恢复、监控与并发压测。
