# 〖第 12 份〗 文件路径：tasks/M3-analysis.md

## M3 对话式数据分析（P0，核心）

### 目标

把用户自然语言诉求经「规划 → 执行（调 M4 沙箱）→ 结论」的编排循环处理，并以 SSE 逐段推送 plan/thinking/code/run/artifact/message，支持带 conversation_id 的多轮迭代（如 "横坐标改对数"），对话与消息落 conversations/messages，产物血缘由 M4/M5 负责。

### 前置依赖

1. M4 代码执行沙箱（POST /runs：能出图 / 表 / 数字并登记 run + code_hash）
2. M5 溯源 / 复现（run 产出的 artifact 与血缘边由 M4 内部登记，M3 只消费返回的 artifact_id/anchor）
3. 底座：ModelAdapter.chat（模型无关层，铁律 6）须可用

### 上下文加载提示（给 Codex）

开发本卡只需加载：AGENTS.md + 本卡 +（如需精确契约）docs/03-DATA-MODEL.md 的 conversations/messages 表 + docs/04-API.md 的 POST /chat + docs/02-ARCHITECTURE.md §3.1（runAgent 循环与编排）。不要加载其它模块任务卡或整份 docs。

### 涉及数据表

1. **conversations**：新会话时插入一行（首条 user 消息可生成 title）；带 conversation_id 续聊时直接复用。
2. **messages**：每轮把 user 输入、assistant 回复、tool 结果按 role（user|assistant|tool）落库；meta (JSONB) 存本轮的 plan、thinking、run_id、产出的 artifact_id 列表、tool_calls 等流式痕迹，供多轮上下文重建与前端回放。
3. 产物本身（figure/number/table）不由 M3 建表：走 POST /runs 由 M4/M5 落 runs/artifacts/edges。表结构以 docs/03-DATA-MODEL.md 为准。

### 涉及接口

#### POST /chat（SSE，前缀 /api/v1）

**请求体**

json









```
{
  "project_id": "string",
  "conversation_id?": "string",
  "message": "string",
  "dataset_ids?": ["string"]
}
```

**响应为 SSE 事件流，事件与 data 载荷严格对齐 docs/04-API.md**

plaintext









```
event: plan
data: {"steps": [...]}

event: thinking
data: {"text": "推理文本"}

event: code
data: {"code": "代码字符串", "lang": "python"}

event: run
data: {"run_id": "xxx", "status": "success/error", "stdout": "执行输出"}

event: artifact
data: {"artifact_id": "xxx", "kind": "figure/table/number", "value_json": {}, "figure_url": "url", "anchor": "⟦art_xxxx⟧"}

event: message
data: {"text": "总结文本", "citations": ["⟦art_xxxx⟧"]}

event: done
data: {"conversation_id": "会话ID"}
```

**多轮规则**：请求带 conversation_id 则在既有会话上继续；不带则新建会话，done 事件回传新 conversation_id。

**内部依赖**：POST /runs（M4），HTTP / 本地服务调用二选一，契约见 docs/04-API.md。

### 相关机制

编排见 docs/02-ARCHITECTURE.md §3.1 runAgent：单 Agent 收敛为确定性循环 chat → 若有 tool_calls 则 execute 并回填 messages 续跑，否则返回 content；编排者串联 planner/executor/critic。

demo 简化：编排用朴素 Python 函数串联即可，无需状态机框架；但 runAgent 循环 + ModelAdapter.chat 是必须保留的技术亮点（铁律 6 模型无关）。溯源 / 复现细节属 M4/M5，本卡不实现，只消费其返回。

### 实现步骤

1. **Schema 层**：backend/app/schemas/chat.py 定义 ChatRequest（project_id, conversation_id?, message, dataset_ids?）与各 SSE 事件的 data 模型（PlanEvent/ThinkingEvent/CodeEvent/RunEvent/ArtifactEvent/MessageEvent/DoneEvent），字段名严格对齐 docs/04-API.md。
2. **API 层**：backend/app/api/chat.py：POST /chat 只做 I/O 与校验，返回 StreamingResponse (media_type="text/event-stream")，把编排器产出的事件异步 yield 成标准 SSE 帧。
3. **编排服务层**：backend/app/services/agents/orchestrator.py，实现异步生成器 `async def run_chat(req) -> AsyncIterator[Event]`
   - 会话装载：无 conversation_id 则建 conversations 行；读取历史 messages 重建上下文；落本轮 user message。
   - planner：调 ModelAdapter.chat 产出 steps → yield plan；过程性推理 yield thinking。
   - executor：对需要计算的步骤生成代码 → yield code；调用 M4 POST /runs → yield run；遍历执行产物逐个 yield artifact。
   - critic（轻量）：汇总生成自然语言结论 → yield message，文本内嵌产物锚点，citations 绑定产物 ID。
   - 收尾：持久化 assistant/tool 消息与 meta 字段，yield done 事件。

#### 编排核心伪代码（遵循 §3.1 runAgent）

python



运行







```
async def run_chat(req):
    # 获取或创建会话
    conv = get_or_create_conversation(req)
    # 保存用户本轮输入
    save_message(conv, "user", req.message)
    # 拼接历史上下文+系统提示词
    messages = build_context(conv)
    
    # 规划阶段，推送plan事件
    plan = planner(messages)
    yield ev("plan", {"steps": plan.steps})

    # 逐步骤执行
    for step in plan.steps:
        # 推送思考过程
        yield ev("thinking", {"text": step.rationale})
        # 根据步骤生成分析代码
        code = executor_codegen(messages, step, req.dataset_ids)
        yield ev("code", {"code": code, "lang": "python"})
        # 调用M4沙箱执行接口
        run = call_runs(
            project_id=req.project_id,
            conversation_id=conv.id,
            code=code,
            dataset_ids=req.dataset_ids
        )
        yield ev("run", {"run_id": run.run_id, "status": run.status, "stdout": run.stdout})
        # 遍历所有执行产物，推送artifact事件
        for a in run.artifacts:
            yield ev("artifact", {
                "artifact_id": a.artifact_id,
                "kind": a.kind,
                **a.payload,
                "anchor": f"⟦art_{a.short}⟧"
            })
        # 把代码、工具执行结果追加到上下文
        messages += [assistant(code), tool_result(run)]
    
    # 汇总生成最终结论
    final = critic_summarize(messages)
    yield ev("message", {"text": final.text, "citations": final.citations})
    # 持久化本轮助手输出与执行元数据
    save_assistant_turn(conv, final, runs=[run.run_id], artifacts=[a.artifact_id for a in run.artifacts])
    # 会话结束事件
    yield ev("done", {"conversation_id": str(conv.id)})
```

1. **多轮迭代逻辑**：续聊请求携带 conversation_id 复用历史会话，build_context 读取历史 messages.meta 内 run_id/artifact 引用，支持基于上一轮代码增量修改绘图参数。
2. **前端实现**：frontend/app/ 分析对话页，EventSource/fetch-stream 消费 SSE 流，按事件类型分区域渲染：
   - plan：步骤进度条
   - thinking：可折叠推理面板
   - code：代码高亮块
   - run：执行状态 + 标准输出
   - artifact：图表 / 数值 / 表格卡片，锚点可点击回溯
   - message：Markdown+Katex 渲染，⟦art_*⟧锚点交互跳转
3. demo 简化约束：单用户 / 单项目固定；异步仅使用 FastAPI 原生 async 生成器，不引入 Celery/Redis；critic 仅做基础汇总，完整三查校验归属 M7。

### demo 表现

现场输入 "分析这份数据里 X 与 Y 的关系并画图"，页面自上而下实时流式输出：规划步骤 → 思考推理文本 → Python 代码块 → 运行状态 / 控制台输出 → 图表卡片（带⟦art_*⟧锚点）→ 带产物引用的自然语言结论。

追问 "横坐标改成对数刻度"，同一会话复用内核变量增量重跑，秒级刷新图表，完整展示对话式、流式、可迭代数据分析能力。

### 验收 DoD（给定 → 操作 → 期望）

1. 给定已入库 dataset，调用 POST /api/v1/chat（无 conversation_id，message="画出 X 与 Y 的散点并给结论"）
   - 客户端接收 SSE 事件序列严格顺序：plan → (thinking/code/run/artifact 循环) → message → done
   - 所有事件 data 字段名完全匹配 docs/04-API.md
   - artifact 携带 artifact_id、figure_url/value_json；message.text 至少包含 1 个⟦art_xxxx⟧锚点
2. 传入上一步返回的 conversation_id，发送消息 "横坐标改对数刻度"
   - 复用原有会话 ID，生成全新 code/run/artifact
   - done 事件内 conversation_id 与入参完全一致
3. 数据库校验：一轮会话完成后，conversations 新增 1 行；messages 行数≥3（user/assistant，至少 1 条 tool 角色消息，meta 包含 run_id+artifact_id 列表）
4. 数据链路校验：run 事件返回 run_id 可在 runs 表查询，证明执行请求真实转发至 M4，非 M3 伪造产物
5. 模型层约束：所有 LLM 调用统一经过 ModelAdapter.chat，业务代码无直接 import openai / 厂商 SDK
6. 流式校验：首条 plan/thinking 事件请求后即时推送，非等待全流程结束一次性返回，验证真流式输出