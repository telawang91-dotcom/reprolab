# ReproLab

> 面向研究生的可信、可复现科研工作台：把多源资料、复杂 RAG、动态数据分析和长期记忆连成一条可核查、可重跑的研究链。

[![Product quality](https://github.com/telawang91-dotcom/reprolab/actions/workflows/quality.yml/badge.svg?branch=main)](https://github.com/telawang91-dotcom/reprolab/actions/workflows/quality.yml?query=branch%3Amain)
![Python 3.11](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![Next.js 14](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)
![PostgreSQL 16](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)

ReproLab 不是给科研流程再套一层聊天界面，而是把“结论是否有证据、数字能否重算、数据变化后结果是否仍成立”变成系统必须执行的检查。

![ReproLab 工作台](docs/images/workbench-home.png)

## 导航

- [核心能力与差异](#核心能力覆盖)
- [五分钟启动](#五分钟启动)
- [产品概念与完整使用路径](#产品概念)
- [产品能力](#产品能力)
- [技术核心与架构](#技术核心)
- [项目结构](#项目结构)
- [详细安装与配置](#启动)
- [API 与平台调用](#api-与平台调用)
- [验证、备份与仓库卫生](#验证)
- [演示建议](#三分钟演示建议)
- [安全边界、FAQ 与项目状态](#安全与数据边界)

## 核心能力覆盖

| 用户需求 | 当前实现 | 可验证入口 |
| --- | --- | --- |
| 复杂检索（RAG） | 元数据预过滤、BM25、pgvector、RRF 融合、交叉编码重排、原文锚点 | `/knowledge` |
| 数据分析 | Planner / Executor / Critic 按真实数据动态生成并执行 Python | `/analysis` |
| 长期记忆 | 项目隔离的情节、语义、技能三层记忆，使用前核验 | `/memory` |
| 多源异构管理 | PDF、CSV、XLSX、Markdown、TXT、Python、Notebook 统一入库和查询 | `/knowledge`、`/projects` |
| 科研建议与写作 | 建议绑定证据；数字与引用使用机器可解析锚点，校验通过后才能回写 | `/results` |

从 `/demo` 可以先查看真实运行状态和六步能力证据，再进入明确标识、与真实研究空间隔离的 Palmer Penguins 演示项目。

## 五分钟启动

最省心的方式是使用 Docker Desktop。仓库自带应用、数据库和迁移流程，不需要在宿主机单独安装 Python、Node.js 或 PostgreSQL。

```powershell
git clone https://github.com/telawang91-dotcom/reprolab.git
Set-Location reprolab

# 检查 Docker 与当前服务；首次尚未启动时显示提示是正常的
.\scripts\reprolab.ps1 doctor

# 自动创建本地 .env、构建镜像、迁移数据库并等待健康
.\scripts\reprolab.ps1 start
```

启动完成后：

| 入口 | 地址 | 用途 |
| --- | --- | --- |
| 工作台 | <http://localhost:3000> | 日常研究入口与项目进度 |
| 首次演示 | <http://localhost:3000/demo> | 创建与真实项目隔离的示例项目 |
| API 文档 | <http://localhost:8000/docs> | 查看并试调 REST/SSE 接口 |
| 健康检查 | <http://localhost:8000/health> | 自动化部署探针 |

如果暂时没有模型密钥，资料管理、结构化数据查看、既有成果、溯源和复现报告仍然可用；配置模型后才启用 Agent 分析、语义检索增强和模型校验。完整安装方式见[启动](#启动)。

## 产品概念

ReproLab 刻意把几个容易混淆的概念分开：

| 概念 | 负责什么 | 用户如何理解 |
| --- | --- | --- |
| 研究项目（Project） | 隔离资料、分析、成果、记忆和结论 | 一项长期课题的完整工作空间 |
| 研究文件夹（Collection） | 限定当前 Agent 可读取的资料范围 | 当前实验、数据批次或子课题 |
| 对话（Conversation） | 保留同一研究范围内的连续追问 | 一条可续接的研究思路 |
| 数据集 / 文档 | 提供计算输入或文献证据 | 结论的原始来源 |
| 运行（Run） | 保存代码、输入、环境和执行结果 | 一次可以重放的分析实验 |
| 成果（Artifact） | 数字、系数、表格、图或文本结果 | 可以进入报告的证据单元 |
| 结论（Claim） | 带 `⟦art_*⟧` / `⟦src_*⟧` 锚点的正文 | 经过机器对账的研究表述 |

一个项目可以有多个研究文件夹，一个文件夹可以有多轮对话；切换文件夹不会删除历史，切换项目则会切换整个资料、记忆和成果边界。

## 从资料到可信报告

第一次使用建议按下面顺序完成，不需要先理解所有技术模块：

1. **创建或选择项目**：项目保存整个课题的资料和历史。
2. **导入资料**：上传论文、笔记、CSV/XLSX、Markdown、代码或完整文件夹。
3. **建立研究文件夹**：把本轮分析需要使用的资料放入同一范围，避免 Agent 混用数据。
4. **提出自然语言问题**：不需要选择固定学科菜单，Agent 会检查真实字段并动态规划 Python。
5. **观察执行状态**：页面持续展示当前步骤、进度、运行时间和所使用的资料；失败时保留问题和可重试入口。
6. **检查成果**：只保存真正支持研究结论的数字、表格和图；来源不完整的成果会被拦截。
7. **查看血缘**：从 Artifact 回到 Run、代码、环境与 Dataset，必要时一键重跑并比较漂移。
8. **形成报告**：批量加入可信成果，编辑正文并运行数字、引用和图表三查。
9. **发布可信结论**：只有锚点和来源校验通过后才能写入项目账本。

前端把这条路径持续显示为：

```text
添加资料 → 运行分析 → 检查成果 → 形成报告
```

## 核心差异

| 常见科研 AI | ReproLab |
| --- | --- |
| 返回一段看似合理的回答 | 回答中的引用可回到原文片段 |
| 生成图表，但输入与代码容易丢失 | 每个产物绑定 Dataset → Run → Artifact 与环境快照 |
| 先把结果写进报告，最后才发现来源缺失 | 来源未完整时直接锁住保存、写作和工作流复用入口 |
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

每一步都产生可持久化记录，而不是只保留聊天文本；因此用户可以从报告反向定位到成果、运行、环境和原始输入。

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
- 流式展示执行计划、代码、运行状态、产物和结论；
- 长分析持续显示当前步骤、完成进度与已运行时间，任务中心提供返回分析现场的入口；
- 分析结束只突出一个最合适的下一步：有成果时检查成果，没有成果时继续追问；
- 每轮回答公开“用了哪些数据、原文、项目记忆或技能，以及为什么使用”，但不暴露隐藏推理。

### 成果箱与写作

- 集中查看真实数字、表格、图形和可信状态；
- 支持按名称搜索、按成果类型筛选，并把多项来源完整的成果一次加入报告；
- 查看来源、导出产物、加入报告；来源不完整或暂时无法核对时，只允许检查溯源，不允许进入成果库或写作；
- 写作草稿按项目隔离；
- 窄屏写作提供“编辑 / 预览 / 问题”三视图，校验失败时集中展示问题，定位后自动回到正文；
- 数字使用 `⟦art_*⟧`、文献使用 `⟦src_*⟧` 机器可解析锚点；
- 校验通过且包含真实分析产物后，才能回写为可信结论。

### 项目与交付

- 创建、切换、重命名、归档和恢复研究项目；
- 首次使用引导明确区分“研究项目（全部资料与历史）”和“研究文件夹（当前 Agent 范围）”；
- 归档项目只读保留历史资料与血缘；
- 项目时间线、导师只读审阅、长期科研记忆；
- 可打印复现报告、两次运行差异比较、图表与 JSON 产物导出；
- 全局任务中心持续显示上传和 Agent 分析状态；保存、导出、发布等关键操作提供统一反馈，可恢复操作支持一键撤销。

### 长期记忆与技能复用

- 情节记忆记录做过什么，语义记忆保存已核验偏好与事实；
- 技能记忆沉淀可复用分析方法，不把分析限制成固定学科菜单；
- 记忆、技能、建议和产物都以项目为隔离边界；
- 技能可导入、导出、应用到新数据，字段映射不确定时安全回退动态分析；
- 新会话召回前检查来源和适用范围，避免把旧结论直接当作当前事实。

### 用户体验与可恢复性

- 工作台根据真实项目记录只推荐一个优先下一步，减少“功能很多但不知道先做什么”；
- 首次引导解释项目与文件夹的作用域，完成一次真实分析后自动结束；
- 分析结束时，有成果则引导检查成果，没有成果则引导继续追问；
- 长任务同时在分析页和全局任务中心显示，明确哪些任务可以离开页面、哪些需要保持页面打开；
- 成果库支持搜索、类型筛选、可信状态门禁、多选和批量加入报告；
- 移出成果库不会删除血缘账本，并提供即时撤销；
- 报告在窄屏下拆分为编辑、预览、问题三视图，校验问题可以一键定位正文；
- Sheet、对话框和提示支持 Escape、焦点恢复、焦点约束和 `aria-live` 状态播报；
- 网络、模型、数据库或沙箱异常都会转换为可理解的受影响能力和恢复动作，不直接暴露 `Failed to fetch`。

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
├─ docker/             # 应用镜像、容器入口与科学计算沙箱镜像
├─ benchmarks/         # 评测样例、烟雾测试数据和基准结果
├─ docs/               # 产品、架构、API、溯源和设计契约
├─ tasks/              # 分模块任务卡与验收标准
├─ scripts/            # 产品验证脚本
├─ .github/workflows/  # CI 与手动完整集成验收
├─ .models/            # 本地模型缓存，不提交
├─ .downloads/         # 本地数据下载缓存，不提交
├─ .runtime/           # 日志、报告和临时验收工作区，不提交
├─ deliverables/       # Docker 离线包与比赛提交材料；内容不提交
└─ docker-compose.yml  # 应用、PostgreSQL + pgvector 与按 profile 构建的沙箱
```

本地目录的用途、保留规则和清理边界见
[`docs/11-LOCAL-WORKSPACE.md`](docs/11-LOCAL-WORKSPACE.md)。运行日志统一写入
`.runtime/logs/`，不要在项目根目录生成日志文件。

## 启动

推荐使用 Docker 方式。只需要 Docker Desktop 和 PowerShell，不需要单独安装
Python、Node.js 或 PostgreSQL：

```powershell
# 可选：启动前检查 Docker、Compose 配置和当前服务健康状态
.\scripts\reprolab.ps1 doctor

# 首次启动会在缺少 .env 时从 .env.example 创建一份
.\scripts\reprolab.ps1 start

# 查看状态、日志或停止（停止不会删除数据卷）
.\scripts\reprolab.ps1 status
.\scripts\reprolab.ps1 logs
.\scripts\reprolab.ps1 stop
```

启动成功后访问：

- 工作台：[http://localhost:3000](http://localhost:3000)
- API 文档：[http://localhost:8000/docs](http://localhost:8000/docs)
- 健康检查：[http://localhost:8000/health](http://localhost:8000/health)
- 首次演示：[http://localhost:3000/demo](http://localhost:3000/demo)

第一次使用建议按这条最短路径体验真实闭环：打开 `/demo` 检查环境并创建隔离演示项目，
在“资料”中确认示例数据，进入“分析”提交研究问题，最后从“成果”打开
Dataset → Run → Artifact 血缘。模型密钥不是启动必需项；没有密钥时仍可管理资料、
查看既有产物与溯源，配置密钥后才会启用 Agent 分析和语义校验。

需要修改源码并热更新时，使用“本地开发模式”：Docker 只运行 PostgreSQL，后端和
前端分别在两个终端运行。

```powershell
# 首次安装
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm.cmd --prefix frontend install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }

# 终端 1：数据库和后端；start_api.ps1 会自动执行 Alembic 迁移
docker compose up -d postgres
.\scripts\start_api.ps1 -SandboxBackend host

# 终端 2：前端热更新
npm.cmd --prefix frontend run dev
```

完整的首次安装、Docker/本地开发切换、端口冲突、停止恢复和故障排查见
[启动与运行手册](docs/12-RUNBOOK.md)。离线镜像交付见
[Docker 镜像交付](docs/10-DOCKER-DELIVERY.md)。

![首次使用引导](docs/images/getting-started.png)

## 模型配置

资料入库、检索、代码执行和溯源复现不依赖 LLM 密钥。问答和 Agent 分析可在设置页面配置，也可使用环境变量：

| 配置 | 作用 | 默认/建议 |
| --- | --- | --- |
| `LLM_BASE_URL` / `LLM_API_KEY` | OpenAI 兼容模型的通用入口 | 可留空，或指向兼容服务 |
| `DEEPSEEK_BASE_URL` / `DEEPSEEK_API_KEY` | DeepSeek 专用配置 | 默认 `https://api.deepseek.com` |
| `HUNYUAN_BASE_URL` / `HUNYUAN_API_KEY` | 腾讯混元专用配置 | 使用 OpenAI 兼容端点 |
| `PLANNER_MODEL` | 规划研究步骤 | 建议低成本、指令稳定模型 |
| `EXECUTOR_MODEL` | 生成数据处理与分析代码 | 建议代码能力较强模型 |
| `CRITIC_MODEL` | 检查结果与修复 | 建议推理能力更强模型 |
| `EMBEDDING_MODEL` | 文档与查询向量 | `BAAI/bge-m3` 或本地路径 |
| `RERANKER_MODEL` | 混合检索精排 | `BAAI/bge-reranker-v2-m3` |
| `SANDBOX_BACKEND` | `docker` 或可信本机 `host` | 演示/交付使用 `docker` |
| `AGENT_API_TOKEN` | 保护对外 Agent API | 对外可访问时必须设置 |

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

Docker 对外端口可通过 `REPROLAB_PORT`、`REPROLAB_API_PORT`、`REPROLAB_DB_PORT` 修改。模型文件较大时，可以把 `EMBEDDING_MODEL` / `RERANKER_MODEL` 指向本地绝对路径，或预先放入 `.models/`；该目录不会进入 Git 和 Docker 构建上下文。

## API 与平台调用

所有业务接口使用 `/api/v1` 前缀，Swagger 契约位于 <http://localhost:8000/docs>。UI 只负责展示，项目、检索、分析、溯源、校验和 Agent 调用都能脱离前端使用。

创建项目：

```powershell
$project = Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:8000/api/v1/projects `
  -ContentType 'application/json' `
  -Body '{"name":"空气质量研究","description":"长期可复现分析"}'

$project.id
```

执行混合检索：

```powershell
$body = @{
  project_id = $project.id
  query = 'PM2.5 与风速有什么关系？'
  mode = 'hybrid'
  k = 8
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:8000/api/v1/search `
  -ContentType 'application/json' `
  -Body $body
```

调用无界面 Agent：

```powershell
$headers = @{ Authorization = "Bearer $env:AGENT_API_TOKEN" }
$body = @{
  project_id = $project.id
  task = '检查当前项目的数据质量，并给出带来源的结论'
  inputs = @{}
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:8000/api/v1/agent/invoke `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body $body
```

`POST /chat` 返回 SSE 流，事件顺序通常为 `context → plan → thinking/code → run → artifact → message → done`。后台入口 `POST /agent/jobs` 支持 `Idempotency-Key`，但 demo 阶段使用进程内任务表，服务重启后任务状态不会保留。完整契约见 [REST API](docs/04-API.md) 和 [Agent REST 调用](docs/09-AGENT-API.md)。

## 验证

一键运行常规质量门禁：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\verify_product.ps1 `
  -Python "$PWD\.venv\Scripts\python.exe"
```

质量门依次检查：

1. 仓库卫生、明显密钥、README 本地链接和误提交的大文件；
2. 后端单元测试；
3. 前端 TypeScript 类型检查；
4. Agent 时间线和 API/本地状态契约测试；
5. Next.js 生产构建；
6. 桌面与窄屏 Playwright 产品流程。

只检查仓库结构与提交边界：

```powershell
.\.venv\Scripts\python.exe .\scripts\check_repository_hygiene.py
git diff --check
```

仓库卫生检查会阻止提交 `.env`、本地模型、虚拟环境、运行日志、数据库/内容存储、交付大包、明显凭证、超过 25 MiB 的普通 Git 文件以及 README 断链。大模型、Docker 离线镜像和比赛材料应分别保留在 `.models/`、`deliverables/docker/` 和 `deliverables/submission/`。

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

运行隔离量化评测（会创建并默认归档一个独立评测项目）：

```powershell
.\.venv\Scripts\python.exe .\scripts\evaluate_product.py
```

报告写入 `.runtime/product-evaluation.json`，包含 30 条标注检索的
Recall@5、MRR、nDCG@5，以及复现一致率、漂移发现、数字校验准确率、
修复轮次和端到端 p50/p95 时延。模型服务可用时增加 `--include-nli`，
会运行 9 条支持、无关和矛盾引用样例，并给出三分类准确率与建议阈值。

### 备份与恢复演练

数据库与内容寻址存储必须作为同一个恢复点保存：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\backup_reprolab.ps1
```

备份包含 PostgreSQL 自定义格式 dump、`backend/storage` 内容和逐文件
SHA-256 清单。恢复脚本先校验清单，并且只允许恢复到全新的
`reprolab_restore_*` 数据库和独立存储目录，不覆盖当前项目：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\restore_reprolab.ps1 `
  -BackupPath .\.backups\reprolab-YYYYMMDD-HHMMSS
```

如果 `reprolab_test` 已存在，可以跳过 `createdb`。集成测试在数据库 URL 不含 `test` 时会主动拒绝运行，避免污染真实研究状态。

GitHub Actions 会在推送和 Pull Request 时执行仓库卫生、单元测试、类型检查、生产构建、浏览器验收和可信核心集成测试；完整 P0 验收可手动触发。质量报告默认写入 `.runtime/quality-report.json`，不会进入 Git。

## 常见问题排查

| 现象 | 优先检查 | 恢复动作 |
| --- | --- | --- |
| Docker 命令不可用 | Docker Desktop 是否启动 | 启动 Docker，等待引擎就绪后运行 `doctor` |
| 页面打不开 | `reprolab.ps1 status`、3000 端口 | 修改 `.env` 的 `REPROLAB_PORT` 后重启 |
| API 不健康 | `reprolab.ps1 logs`、8000 端口 | 检查迁移和数据库日志，必要时修改 API 端口 |
| PostgreSQL 不健康 | 5432 占用、数据卷权限 | 修改 `REPROLAB_DB_PORT`；不要直接删除数据卷 |
| 模型不可用 | 设置页模型测试、密钥与 Base URL | 修正配置；资料与溯源功能仍可继续使用 |
| 语义索引未生成 | 文档详情的解析状态 | 模型恢复后点击“重建语义索引” |
| 分析中断 | 分析页恢复卡、任务中心 | 保留原问题直接重试；已登记的运行不会伪装成成功 |
| 成果不能加入报告 | 来源完整状态 | 打开溯源，补全 Dataset → Run → Artifact 链 |
| 报告不能发布 | 校验问题列表 | 定位正文，补齐锚点或运行自动修复后重新校验 |

更完整的命令和故障顺序见 [启动与运行手册](docs/12-RUNBOOK.md)。

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
- [Docker 构建与离线交付](docs/10-DOCKER-DELIVERY.md)
- [本地目录与文件边界](docs/11-LOCAL-WORKSPACE.md)
- [启动、停止与故障恢复](docs/12-RUNBOOK.md)
- [版本升级记录](CHANGELOG.md)
- [安全说明与已知边界](SECURITY.md)

开发前请阅读 [AGENTS.md](AGENTS.md)。契约冲突时，以 `docs/03-DATA-MODEL.md`、`docs/04-API.md`、`docs/05-PROVENANCE.md` 和 `docs/06-DESIGN.md` 为准。

## 安全与数据边界

ReproLab 当前采用本地优先、单机可信使用者模型，但“本地优先”不等于所有信息永远不离开设备：

- PostgreSQL、内容寻址存储、模型缓存和运行日志默认保存在本机 Docker 卷或本地目录；
- 使用 DeepSeek、混元或其他远程模型时，当前任务所需的提示、字段和证据片段会发送到你配置的模型服务，具体数据处理规则取决于该服务；
- Agent 会生成并执行 Python。Docker 沙箱适合本机和受信任演示，不应直接作为不受信任用户的公网多租户执行环境；
- 站内接口在 demo 阶段没有完整身份系统；对外 `POST /agent/invoke` / `/agent/jobs` 必须配置 `AGENT_API_TOKEN`；
- 项目隔离是应用层数据作用域，不等同于独立租户、独立数据库或操作系统级安全边界；
- `.env`、备份、数据库卷、内容存储和导出的复现包都可能包含敏感研究信息，不应上传到公开仓库；
- 日常停止使用 `.\scripts\reprolab.ps1 stop`。`docker compose down -v` 会删除数据卷，只能在已备份且明确要清空数据时使用。

面向公网或多人环境前，至少还需要身份认证、角色权限、项目级授权、独立执行节点、网络出口限制、配额、持久任务队列、集中审计和并发压测。

## FAQ

### ReproLab 是固定统计分析菜单吗？

不是。执行 Agent 根据用户问题和真实字段动态生成 Python；技能包只是可选模板和工具，不限制学科或分析种类。

### 为什么成果不会自动全部进入成果库？

运行日志和中间指标不等于研究证据。只有用户主动保存、且来源完整的成果才进入成果库和报告，避免低价值过程产物污染结论。

### 删除对话或移出成果会破坏复现记录吗？

不会。移出成果库只改变展示状态；删除对话只删除消息入口。已经登记的 Run、Artifact 和血缘账本继续保留。

### 没有 GPU 可以运行吗？

可以。默认方案支持 CPU，但首次加载 embedding/reranker 和复杂分析会更慢。离线或低配置环境可使用本地模型路径，并通过运行状态查看降级能力。

### 可以更换模型吗？

可以。业务逻辑统一通过 `ModelAdapter` 调用，模型切换不改变内容寻址、运行捕获、血缘和校验规则。

### 为什么图表复现不直接比较 PNG 哈希？

同一数据和代码在不同渲染环境下可能产生不同图片字节。ReproLab 比较绘图底层结构化数据和语义指纹，文件型产物才使用内容哈希。

### 如何参与开发？

先阅读 [AGENTS.md](AGENTS.md) 和对应 `tasks/` 任务卡。数据表、接口、可信机制和 UI 分别以 `docs/03-DATA-MODEL.md`、`docs/04-API.md`、`docs/05-PROVENANCE.md`、`docs/06-DESIGN.md` 为准。提交前运行 `verify_product.ps1`，数据库变更必须包含 Alembic 迁移；提交信息使用中文简述并标注模块号。

## 当前定位

ReproLab 当前适合作为单机科研工作台、科研工作流 Demo、比赛展示、课程项目与内部
Beta。Docker 默认在应用容器内运行持久 Jupyter kernel，适合本机和受信任使用者；不要把
任意代码执行能力直接暴露给不受信任的公网用户。项目已提供健康诊断、质量门禁、数据备份与
恢复演练；面向公开多用户生产环境前，仍需补充身份认证、细粒度权限、独立强隔离执行节点、
集中监控和并发压测。
