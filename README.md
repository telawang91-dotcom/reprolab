# ReproLab

面向研究生的可信、可复现科研工作台。每个数字和图表均绑定数据、代码与环境，可一键重放并检测漂移。

## 环境

- Python 3.11
- Node.js（前端使用 Next.js 14.2）
- Docker Desktop（PostgreSQL 16 + pgvector 0.7、执行沙箱）

## 首次启动

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm.cmd --prefix frontend install
Copy-Item .env.example .env
```

模型默认使用 `BAAI/bge-m3` 与 `BAAI/bge-reranker-v2-m3`。离线部署时，把 `EMBEDDING_MODEL`、`RERANKER_MODEL` 改为本地模型目录。

启动数据库并迁移：

```powershell
docker compose up -d postgres
Set-Location backend
..\.venv\Scripts\python.exe -m alembic upgrade head
Set-Location ..
```

构建沙箱镜像：

```powershell
docker compose --profile sandbox build sandbox
```

启动后端与前端：

```powershell
# 终端 1
Set-Location backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000

# 终端 2
npm.cmd --prefix frontend run dev
```

打开 `http://localhost:3000/knowledge`。默认 demo project_id 为 `00000000-0000-0000-0000-000000000101`。

## 模型配置

M1/M2 与 M4/M5 不需要 LLM 密钥。M2 `/qa`、M3 `/chat` 和 `/agent/invoke` 通过模型无关路由读取配置：

```env
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=
LLM_MODEL=deepseek-chat
DEEPSEEK_API_KEY=
HUNYUAN_API_KEY=
PLANNER_MODEL=deepseek:deepseek-chat
EXECUTOR_MODEL=deepseek:deepseek-chat
CRITIC_MODEL=deepseek:deepseek-chat
```

未配置密钥时接口会明确报错，不会返回 mock 内容。

Headless 调用示例：

```powershell
$body = @{ project_id = "00000000-0000-0000-0000-000000000101"; task = "计算所选数据的均值"; inputs = @{ dataset_ids = @() } } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/v1/agent/invoke -ContentType application/json -Body $body
```

## 验证

```powershell
$env:PYTHONPATH="$PWD\backend"
$env:SANDBOX_BACKEND="host"
.\.venv\Scripts\python.exe -m pytest backend\tests -q
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend run build
```

Docker/PostgreSQL 可用后再运行集成验收：

```powershell
$env:RUN_INTEGRATION="1"
.\.venv\Scripts\python.exe -m pytest backend\tests\integration -q -s
```
