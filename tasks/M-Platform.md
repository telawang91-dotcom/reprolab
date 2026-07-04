## 〖第 24 份〗 文件路径：tasks/M-Platform.md

# M-Platform 模型无关运行时 + 平台适配层（运行时 P0 / 适配层 P2）

## 目标

交付一套模型无关的 Agent 运行时：ModelAdapter 统一混元 / DeepSeek/Claude 的对话与 tool-calling、runAgent 确定性循环、分角色模型路由；并在其上叠一层 headless 平台适配层（POST /agent/invoke），让外部脚本脱离前端走完 "输入 → 分析 → 带溯源结论"。

## 前置依赖

无（运行时是最先搭的骨架，其它所有 Agent 模块都依赖它）。适配层部分依赖 M3/M4/M5 提供的分析与溯源能力，但接口与骨架可先行。

## 上下文加载提示（给 Codex）

开发本卡只需加载：AGENTS.md + 本卡 +（如需精确契约）docs/04-API.md 的 POST /agent/invoke 段 + docs/02-ARCHITECTURE.md 的 §3.1（模型无关运行时）与 §5（部署形态）。不要加载其它模块任务卡或整份 docs。

## 涉及数据表

无（本模块贯穿全局、不新增表；ModelAdapter 是被各 Agent 调用的运行时基础设施，溯源 / 产物落表由 M4/M5 负责）。

## 涉及接口

### POST /agent/invoke（M-Platform 适配层）

请求体：

json









```
{
  "project_id": "uuid",
  "task": "用户科研任务描述文本",
  "inputs": {} // 可选附加输入参数
}
```

响应体：

json









```
{
  "result": "最终结论文本",
  "artifacts": [], // 本次生成全部产物列表
  "lineage": {}, // 完整溯源血缘树
  "verify_report": {} // M7 三查完整校验报告
}
```

关键说明：headless 单次同步调用，内部完整驱动 planner → executor → critic 分析全链路；非流式接口，区别于 M3 /chat SSE 流式对话。

## 相关机制

1. docs/02-ARCHITECTURE.md §3.1 ModelAdapter 统一抽象层
   - 统一 chat 入参：model、messages、tools
   - 统一输出结构：content、标准化 tool_calls 数组
   - 厂商适配：混元 / DeepSeek 兼容 OpenAI 协议；Claude 单独映射 tool_use block
   - 全局错误统一捕获、指数退避重试、token 计数归一化
2. runAgent 确定性循环：限制最大执行步数防死循环；自动分发工具调用至 M2/M4/M5 等服务；工具执行结果回填 messages 持续迭代模型
3. 分角色模型路由：planner/executor 使用性价比高的基础模型（混元）；critic / 编排质检路由至更强大模型，路由配置存放 core/config.py，无需修改业务代码切换模型
4. docs/02-ARCHITECTURE.md §5 部署形态：核心能力全部 REST 暴露，前端仅为可视化客户端；仅 LLM API 出网，项目数据本地闭环存储。

## 实现步骤

### 1. ModelAdapter 基础设施 `backend/app/services/agents/model_adapter.py`

统一返回结构体定义：

python



运行







```
class ChatResult(TypedDict):
    content: str | None
    tool_calls: list[ToolCall]

class ToolCall(TypedDict):
    id: str
    name: str
    args: dict

def chat(model: str, messages: list[dict], tools: list[dict] | None = None) -> ChatResult:
    pass
```

- model 路由键格式 `provider:model_name`（hunyuan、deepseek、claude）
- 配置读取 core/config.py 各厂商 base_url、api_key
- OpenAI 兼容分支（P0 混元 / DeepSeek）：标准 openai SDK，归一化 function tool_calls
- Claude 预留分支（P2）：转换 tools schema、映射 tool_use/tool_result block，demo 可预留 NotImplementedError，不阻塞核心功能
- 网络 / 限流异常统一捕获，有限次指数退避重试，对外抛出标准化业务异常

### 2. runAgent 运行循环 `backend/app/services/agents/runtime.py`

伪代码骨架：

python



运行







```
MAX_STEPS = 10
def run_agent(role_model: str, messages: list, tools: list):
    for _ in range(MAX_STEPS):
        res = ModelAdapter.chat(model=role_model, messages=messages, tools=tools)
        if not res.tool_calls:
            return res.content
        # 分发执行所有工具调用
        tool_results = []
        for call in res.tool_calls:
            output = execute_tool(call.name, call.args)
            tool_results.append(wrap_tool_result(call.id, output))
        # 工具结果回填会话消息
        messages.append(format_tool_message(res.content, tool_results))
    # 超过最大步数强制终止
    return "执行步数超限，任务终止"
```

execute_tool：工具名分发至 M2 检索、M4 沙箱代码、M5 溯源等业务服务。

### 3. 分角色路由配置 core/config.py

python



运行







```
AGENT_MODEL_ROUTE = {
    "planner": "hunyuan:standard",
    "executor": "hunyuan:standard",
    "critic": "deepseek:strong"
}
```

修改配置即可切换各角色使用的模型，无业务代码改动。

### 4. 编排简化层 `backend/app/services/agents/orchestrator.py`

串联 planner → executor → critic 完整链路，无复杂状态机框架，demo 轻量化实现。

### 5. Headless 适配层（P2）

1. Schema `backend/app/schemas/agent.py`：AgentInvokeRequest、AgentInvokeResponse Pydantic 结构体
2. API `backend/app/api/agent.py`，路由 `/api/v1/agent/invoke`
   - 接收任务参数，调用 orchestrator 完整分析链路
   - 聚合 M4 产物、M5 血缘、M7 校验报告组装响应
   - API 层仅参数校验，业务逻辑下沉 orchestrator
3. demo 运维简化：认证可固定静态 token；异步任务仅使用 FastAPI BackgroundTasks，禁止 Celery/Redis

## demo 表现

1. 系统默认全链路使用混元，前端对话正常生成图表、数字、完整溯源，用户无感知底层模型厂商。
2. Headless 接口演示：curl 直接 POST /api/v1/agent/invoke 提交任务，脱离前端获取结构化 result/artifacts/lineage/verify_report，证明前端仅可视化载体。
3. 🎯 切换验证：修改配置文件 critic 模型由混元切换为 DeepSeek，同一任务重新调用 /agent/invoke；所有数字、图表血缘完整不变，M7 校验规则完全生效，架构与模型解耦。

## 验收 DoD（给定 → 操作 → 期望）

1. 同一 messages+tools，分别配置 hunyuan:* /deepseek:*，调用 ModelAdapter.chat，两者返回标准化 ChatResult，tool_calls 字段结构完全统一，上层业务零修改兼容。
2. 携带工具调用的任务执行 run_agent，自动触发多次工具调用、回填结果迭代；达到 MAX_STEPS 安全终止，无死循环。
3. 路由配置区分 critic/executor 模型，运行编排流程，日志 / 断言可验证各角色实际命中配置模型；切换模型仅修改配置文件，无需改动业务代码。
4. 合法参数调用 POST /api/v1/agent/invoke，HTTP 200，响应包含 result /artifacts/lineage /verify_report 四个必填字段；非法入参返回标准化 `{"error": {"code": "", "message": ""}}`。
5. 模型切换验证：配置从混元改为 DeepSeek，同一任务重跑 /agent/invoke，所有数字均可在 lineage 追溯 dataset→run→artifact 完整链路，verify_report 校验判定逻辑不变。