# Agent 外部调用

ReproLab 的核心 Agent 可脱离前端调用。接口与网页分析共用同一套规划、执行、审阅和溯源逻辑。

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
  -d '{"project_id":"PROJECT_UUID","query":"比较当前研究文件夹内两组数据，并给出可复现结论"}'
```

## Python

```python
import requests

response = requests.post(
    "http://127.0.0.1:8000/api/v1/agent/invoke",
    headers={"Authorization": "Bearer replace-with-a-long-random-token"},
    json={
        "project_id": "PROJECT_UUID",
        "query": "比较当前研究文件夹内两组数据，并给出可复现结论",
    },
    timeout=300,
)
response.raise_for_status()
print(response.json())
```

响应包含最终回答、运行与产物标识；产物仍受 ReproLab 的数据、代码、环境血缘约束。`401` 表示令牌缺失或错误，`429` 表示当前调用来源超过每分钟限额。
