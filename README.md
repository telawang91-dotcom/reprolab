# ReproLab

面向研究生的研究工作台：在一个项目里管理资料、提出数据问题、整理结果并完成写作。

> 从一个问题开始。资料、数据与结果始终留在同一个可继续的工作区。

![ReproLab 工作台](docs/images/workbench-home.png)

## 你可以用它做什么

| 场景 | 在 ReproLab 中完成 |
| --- | --- |
| 整理资料 | 上传论文、笔记、数据或代码；按项目和知识空间管理，并检索原文。 |
| 分析数据 | 用自然语言描述问题，选择数据后运行分析，查看图表、数值与过程。 |
| 写作报告 | 将资料与分析结果整理进正文，在写作面板中检查引用与数字。 |
| 回看项目 | 通过时间线、审阅摘要、运行报告和结果对比继续上一次工作。 |

### 资料与检索

![资料与检索](docs/images/knowledge-space.png)

### 第一次使用

新用户不需要预先理解所有概念。按照上传资料、提出问题、查看结果、完成写作四步即可跑通一次研究流程；项目的可回溯能力会在需要时自动参与。

![新手引导](docs/images/getting-started.png)

## 核心能力

- **项目工作区**：项目隔离资料、数据、分析、结论与个人偏好；支持归档和恢复。
- **知识空间**：支持文件、文件夹和 ZIP 入库，提供关键词、语义与混合检索，以及带原文定位的问答。
- **动态分析**：根据用户问题和选中数据动态生成 Python 分析代码，在可控环境中运行并保存结果。
- **结果与写作**：图表、数值和引用可回到来源；写作页支持检查、修复和保存结论。
- **研究交付**：提供项目时间线、只读审阅摘要、可打印运行报告与两次运行的结果比较。

## 工作方式

```mermaid
flowchart LR
  A[添加资料或数据] --> B[检索与提出问题]
  B --> C[运行分析]
  C --> D[查看结果]
  D --> E[整理写作]
  E --> F[继续项目或导出报告]
```

对于需要核对的结果，ReproLab 会保留数据、代码与环境之间的关系，用于结果回看、重跑和差异定位；这些细节不会阻挡日常使用。

## 技术栈

- 前端：Next.js 14、React 18、TypeScript、Tailwind CSS、shadcn/ui、React Flow
- 后端：FastAPI、SQLAlchemy、Alembic、Pydantic
- 数据：PostgreSQL 16 + pgvector，本地内容寻址对象存储
- 分析：持久 Jupyter kernel + Docker Python 3.11 科学计算沙箱
- 检索：pgvector、BM25、bge-m3、bge-reranker-v2-m3

## 快速开始

### 1. 安装依赖

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm.cmd --prefix frontend install
Copy-Item .env.example .env
```

默认 embedding 与 reranker 分别使用 `BAAI/bge-m3`、`BAAI/bge-reranker-v2-m3`。离线部署时可将 `EMBEDDING_MODEL`、`RERANKER_MODEL` 改为本地模型目录。

### 2. 启动基础服务

```powershell
docker compose up -d postgres

Set-Location backend
..\.venv\Scripts\python.exe -m alembic upgrade head
Set-Location ..

docker compose --profile sandbox build sandbox
```

### 3. 启动应用

```powershell
# 终端 1：后端
Set-Location backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# 终端 2：前端
npm.cmd --prefix frontend run dev
```

打开 [http://localhost:3000](http://localhost:3000)。后端 OpenAPI 文档位于 [http://localhost:8000/docs](http://localhost:8000/docs)。

## 模型配置

M1/M2 与 M4/M5 不依赖 LLM 密钥。问答、分析对话与 Agent 调用使用模型无关配置层，可按环境配置 DeepSeek、腾讯混元或兼容 OpenAI 的服务：

```env
LLM_MODEL=deepseek-v4-flash
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_API_KEY=
HUNYUAN_API_KEY=
PLANNER_MODEL=deepseek:deepseek-v4-flash
EXECUTOR_MODEL=deepseek:deepseek-v4-flash
CRITIC_MODEL=deepseek:deepseek-v4-pro
```

## 验证

快速验证：

```powershell
.\scripts\verify_product.ps1 -Python .\.venv\Scripts\python.exe
```

或分别执行：

```powershell
$env:PYTHONPATH="$PWD\backend"
$env:SANDBOX_BACKEND="host"
.\.venv\Scripts\python.exe -m pytest backend\tests -q
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend run build
```

Docker/PostgreSQL 可用后，可运行完整集成验收：

```powershell
$env:RUN_INTEGRATION="1"
.\.venv\Scripts\python.exe -m pytest backend\tests\integration -q -s
```

## 文档

- [产品需求](docs/01-PRD.md)
- [数据模型](docs/03-DATA-MODEL.md)
- [REST API](docs/04-API.md)
- [溯源与复现](docs/05-PROVENANCE.md)
- [UI / UX 设计规范](docs/06-DESIGN.md)

## 开发约定

开始改动前请阅读 [AGENTS.md](AGENTS.md)。数据表变更必须经 Alembic 迁移；对外接口使用 Pydantic schema；所有主分支提交应保持可启动、可演示。
