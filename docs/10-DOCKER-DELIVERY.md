# Docker 镜像交付

ReproLab 只构建一个自有应用镜像 `reprolab:latest`。镜像内包含 Next.js、FastAPI、Alembic、Jupyter kernel 和科学计算依赖；PostgreSQL/pgvector 使用官方基础镜像并由 Compose 自动启动。

## 一键启动

```powershell
.\scripts\reprolab.ps1 start
.\scripts\reprolab.ps1 status
```

若 Docker Hub 暂时不可访问，但机器已有兼容的 Node/Python 基础镜像，可以通过
`REPROLAB_NODE_BASE` 和 `REPROLAB_PYTHON_BASE` 指定本地镜像后构建；默认仍使用官方
`node:20-bookworm-slim` 与 `python:3.11-slim-bookworm`。只有确认本地基础镜像已经包含
全部 `backend/requirements.txt` 与科学计算依赖时，才可同时设置
`REPROLAB_INSTALL_OS_PACKAGES=0` 和 `REPROLAB_INSTALL_PYTHON_DEPS=0`。若本地 Node
基础镜像中的 `/app/node_modules` 与当前 `package-lock.json` 完全一致，还可设置
`REPROLAB_INSTALL_FRONTEND_DEPS=0`。

服务健康后访问：

- 工作台：<http://localhost:3000>
- 直接调用 API：<http://localhost:8000/api/v1>
- 健康检查：<http://localhost:8000/health>
- Swagger：<http://localhost:8000/docs>
- OpenAPI：<http://localhost:8000/openapi.json>

工作台端口也会代理 `/api/v1/*`、`/health`、`/docs` 和
`/openapi.json`，因此只允许一个端口时仍可通过 `3000` 调用。需要修改
映射端口时，可分别设置 `REPROLAB_PORT` 和 `REPROLAB_API_PORT`。

直接调用示例：

```powershell
Invoke-RestMethod http://localhost:8000/health
Invoke-RestMethod http://localhost:8000/api/v1/projects

$body = @{ name = "可复现研究项目"; description = "API 创建" } | ConvertTo-Json
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:8000/api/v1/projects `
  -ContentType application/json `
  -Body $body
```

停止服务：

```powershell
.\scripts\reprolab.ps1 stop
```

项目数据保存在 `postgres_data` 和 `reprolab_storage` 两个命名卷中；设置页保存的模型运行配置位于
`reprolab_config`。普通更新不要附加 `-v`；只有明确需要清空全部项目数据与持久配置时才使用
`docker compose down -v`。运行配置文件只允许应用用户读取，镜像构建上下文不会包含宿主机 `.env`。

## 配置模型

在项目根目录 `.env` 中填写所需供应商密钥后重新启动：

```env
DEEPSEEK_API_KEY=
HUNYUAN_API_KEY=
AGENT_API_TOKEN=
```

可以通过 `REPROLAB_PORT=8080` 修改应用端口，通过 `REPROLAB_DB_PORT=55432`
修改数据库映射端口。应用镜像默认在自身容器内运行持久 Jupyter kernel，因此不要求挂载
Docker Socket，适合比赛演示与可信调用者部署。环境包清单仍会进入 `env_hash`，但面向
不受信任的公网任意代码执行场景应另行使用独立的强隔离执行节点。

本地开发或完整集成验收需要独立 Docker 沙箱镜像时运行：

```bash
docker compose --profile sandbox build sandbox
```

`sandbox` 使用 Compose profile，仅作为镜像构建与安全契约入口；普通
`docker compose up` 不会启动它。容器化应用使用镜像内的 host kernel，不挂载 Docker Socket。

## 构建和离线交付镜像

```bash
docker compose build app
```

PowerShell 一键导出会把应用镜像与固定版本的 pgvector 镜像放进同一个
归档，并生成 SHA-256 校验文件：

```powershell
.\scripts\export_docker_delivery.ps1
```

脚本会在 `deliverables/docker/current/` 中放入镜像归档、SHA-256、`docker-compose.yml`、
`.env.example` 和本说明文件，可直接整体交付。
接收方无需重新构建或访问 Docker Hub：

```powershell
Copy-Item .env.example .env
Get-FileHash -Algorithm SHA256 .\reprolab-docker-images.tar
docker load --input .\reprolab-docker-images.tar
docker compose up --detach --no-build
docker compose ps
```

确认 `docker compose ps` 中两个服务均为 `healthy` 后，调用
`http://localhost:8000/health` 或打开 `http://localhost:8000/docs`。
