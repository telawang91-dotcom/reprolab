# Agent 外部调用

ReproLab 的核心 Agent 可脱离前端调用。接口与网页分析共用同一套规划、执行、审阅和溯源逻辑。

## 不使用 Docker 部署后端

后端本身不是必须运行在 Docker 中。准备好 Python 3.11 与可访问的 PostgreSQL 16 + pgvector 后，可直接启动：

```powershell
$env:AGENT_API_TOKEN = "replace-with-a-long-random-token"
.\scripts\start_api.ps1 `
  -DatabaseUrl "postgresql+psycopg://USER:PASSWORD@HOST:5432/reprolab" `
  -ListenAddress "127.0.0.1"
```

启动后访问：

- 服务发现：`GET http://127.0.0.1:8000/`
- 健康检查：`GET http://127.0.0.1:8000/health`
- Swagger：`http://127.0.0.1:8000/docs`
- OpenAPI：`http://127.0.0.1:8000/openapi.json`

脚本默认使用宿主机 Python kernel，适合本机或受信调用者。对公网监听时必须设置 `AGENT_API_TOKEN`；宿主机执行后端默认禁止公网暴露。生产环境建议让 FastAPI 直接运行在宿主机或 PaaS 上，但仍使用隔离的 Docker 沙箱执行分析代码。

## 安全配置

在后端环境变量中配置：

```env
AGENT_API_TOKEN=replace-with-a-long-random-token
AGENT_RATE_LIMIT_PER_MINUTE=30
```

未配置 `AGENT_API_TOKEN` 时保持本地开发兼容；对外提供服务前必须配置。令牌只通过 `Authorization: Bearer ...` 传入。

## cURL

```bash
curl -X POST http://127.0.0.1:8000/api/v1/agent/invoke \
  -H "Authorization: Bearer replace-with-a-long-random-token" \
  -H "Content-Type: application/json" \
  -d '{"project_id":"PROJECT_UUID","task":"比较当前研究文件夹内两组数据，并给出可复现结论","inputs":{"dataset_ids":[]}}'
```

## Python

```python
import requests

response = requests.post(
    "http://127.0.0.1:8000/api/v1/agent/invoke",
    headers={"Authorization": "Bearer replace-with-a-long-random-token"},
    json={
        "project_id": "PROJECT_UUID",
        "task": "比较当前研究文件夹内两组数据，并给出可复现结论",
        "inputs": {"dataset_ids": []},
    },
    timeout=300,
)
response.raise_for_status()
print(response.json())
```

响应包含最终回答、运行与产物标识；产物仍受 ReproLab 的数据、代码、环境血缘约束。`401` 表示令牌缺失或错误，`429` 表示当前调用来源超过每分钟限额。
