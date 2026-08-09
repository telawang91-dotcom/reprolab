# 12・启动与运行手册

本文是 ReproLab 启动方式的唯一操作入口。日常演示优先使用 Docker 模式；只有在
修改源码并需要热更新时才使用本地开发模式。

## 方式一：Docker 一键启动（推荐）

要求：Windows PowerShell、Docker Desktop。首次启动会自动从 `.env.example`
创建 `.env`，但不会覆盖已有配置。

```powershell
.\scripts\reprolab.ps1 doctor
.\scripts\reprolab.ps1 start
```

`doctor` 会检查 Docker 引擎、Compose 配置、当前容器、API、数据库和模型配置状态，
且不会修改数据。`start` 会构建应用镜像，启动 PostgreSQL 和应用，等待两者健康后打印访问地址。

常用命令：

```powershell
.\scripts\reprolab.ps1 status          # 查看容器状态
.\scripts\reprolab.ps1 doctor          # 可执行的环境与服务诊断
.\scripts\reprolab.ps1 logs            # 最近 120 行日志
.\scripts\reprolab.ps1 logs -Follow    # 持续查看日志，Ctrl+C 退出
.\scripts\reprolab.ps1 start -NoBuild  # 镜像未变化时快速启动
.\scripts\reprolab.ps1 stop            # 停止服务，保留全部数据卷
```

首次需要独立 Docker 分析沙箱镜像时：

```powershell
.\scripts\reprolab.ps1 start -BuildSandbox
```

默认地址：

| 用途 | 地址 |
| --- | --- |
| 工作台 | <http://localhost:3000> |
| 演示入口 | <http://localhost:3000/demo> |
| FastAPI | <http://localhost:8000> |
| Swagger | <http://localhost:8000/docs> |
| 健康检查 | <http://localhost:8000/health> |

端口冲突时，在 `.env` 中修改 `REPROLAB_PORT`、`REPROLAB_API_PORT` 或
`REPROLAB_DB_PORT`，然后重新执行 `start`。

## 方式二：本地开发模式

要求：Python 3.11、Node.js 20+、Docker Desktop。Docker 只承载 PostgreSQL；
FastAPI 和 Next.js 在宿主机运行，方便热更新。

首次安装：

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
npm.cmd --prefix frontend install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose --profile sandbox build sandbox
```

每次开发使用两个终端：

```powershell
# 终端 1：数据库 + 后端；脚本会自动执行数据库迁移
docker compose up -d postgres
.\scripts\start_api.ps1 -SandboxBackend host
```

```powershell
# 终端 2：前端
npm.cmd --prefix frontend run dev
```

本地开发结束后，在两个前台进程中按 `Ctrl+C`，再停止数据库容器：

```powershell
docker compose stop postgres
```

`-SandboxBackend host` 只适用于可信的本机开发。对外监听 API 时必须设置
`AGENT_API_TOKEN` 并使用更强隔离，不要直接公开 host 执行后端。

## 数据与停止边界

普通停止只能使用：

```powershell
.\scripts\reprolab.ps1 stop
```

该命令保留以下命名卷：

- `postgres_data`：数据库。
- `reprolab_storage`：数据集和产物。
- `reprolab_config`：设置页保存的模型配置。

不要使用 `docker compose down -v`，除非已经备份并且明确要清空全部数据。

## 启动失败排查

按以下顺序检查：

```powershell
docker version
.\scripts\reprolab.ps1 status
.\scripts\reprolab.ps1 logs
Invoke-RestMethod http://localhost:8000/health
```

- Docker 命令不可用：先启动 Docker Desktop。
- PostgreSQL 不健康：查看日志中是否有端口占用或旧数据库权限问题。
- 应用不健康：确认 PostgreSQL 已健康，并检查 Alembic 迁移输出。
- 3000、8000 或 5432 被占用：修改 `.env` 中对应的 `REPROLAB_*_PORT`。
- 模型调用失败：资料入库和溯源仍可工作；在设置页或 `.env` 补充模型密钥。

离线部署、镜像校验和恢复见 `docs/10-DOCKER-DELIVERY.md`；本地缓存与交付目录
边界见 `docs/11-LOCAL-WORKSPACE.md`。
