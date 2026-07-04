## 〖第 21 份〗 文件路径：tasks/M9-memory.md

# M9 科研记忆三层（P1）

## 目标

实现情节 / 语义 / 技能三层长期记忆：会话结束触发「反思」抽取候选记忆、语义去重后分层写入并标 written_at；新会话按语义相关 + 时效召回并注入编排上下文，注入前逐条核验，避免陈旧记忆污染。

## 前置依赖

无（与 M3 对话分析集成：M3 会话结束时调用本模块反思入口，新会话启动时调用召回注入；技能层落 skills 表见 M11）。

## 上下文加载提示（给 Codex）

开发本卡只需加载：AGENTS.md + 本卡 +（如需精确契约）docs/03-DATA-MODEL.md 的 memories 表 /docs/04-API.md 的 GET・POST /memories/docs/05-PROVENANCE.md §5 长期记忆三层。不要加载其它模块任务卡或整份 docs。

## 涉及数据表

1. memories：本模块唯一读写表
   - 字段：layer (episodic|semantic|skill)、content、tags、importance、written_at 默认当前时间
   - semantic 层额外存储 1024 维 embedding 向量（bge-m3）
   - 召回逻辑：语义相似度 × 时效衰减权重排序
   - 索引 idx_memories_embedding 以 docs/03-DATA-MODEL.md §5 为准，不重复 DDL
2. skills 表：由 M11 负责建表与接口；本模块仅在反思产出技能层候选，不直接操作 skills 注册逻辑。

## 涉及接口

契约参考 docs/04-API.md §M9

### GET /memories

查询参数：project_id（必填）、layer（可选）、q（可选检索文本）

- 无 q：按 layer、written_at 倒序列表
- 带 q：仅对 semantic 层做向量召回，按相似度 × 时效综合打分排序返回记忆列表

### POST /memories

请求体：

json









```
{
  "project_id": "uuid",
  "layer": "episodic"|"semantic"|"skill",
  "content": "记忆正文",
  "tags": ["标签1","标签2"]
}
```

写入单条记忆；semantic 层自动计算向量，执行语义去重（重复仅刷新时间戳，不新增行）。

## 相关机制

docs/05-PROVENANCE.md §5「长期记忆三层」：

1. 写入链路：会话结束 → 模型抽取候选记忆 → 语义去重 → 标记 written_at → 分层入库
2. 召回链路：新会话启动 → 语义向量检索 + 时效加权排序 → 逐条核验有效性 → 过滤失效记忆 → 注入编排 planner 上下文
3. 向量复用：与 M2 RAG 共用 BAAI/bge-m3 + pgvector vector_cosine_ops，不重复初始化模型实例

## 实现步骤

### 后端目录：backend/app/services/memory/

1. Schema `backend/app/schemas/memory.py`
   - MemoryCreate：POST 请求入参
   - MemoryOut：接口返回体（id/layer/content/tags/importance/written_at）
   - MemoryQuery：GET 查询参数结构体
   - layer 使用 Literal 强类型限制枚举值
2. embed.py：向量封装函数，复用全局 RAG embedder，输出 1024 维浮点数组
3. store.py 写入 + 去重核心逻辑：

python



运行







```
def write_memory(db, m: MemoryCreate):
    vec = embed(m.content) if m.layer == "semantic" else None
    if m.layer == "semantic":
        # 检索语义近似记忆，阈值默认0.92
        dup = nearest(db, m.project_id, vec, layer="semantic", limit=1)
        if dup and cosine_sim(dup) >= DEDUP_THRESH:
            # 刷新时间、更新重要度，不新增记录
            dup.written_at = now()
            dup.importance = max(dup.importance, m.importance or 0.5)
            return dup
    # 无重复执行插入
    return insert(db, layer=m.layer, content=m.content,
                  embedding=vec, tags=m.tags, written_at=now())
```

1. reflect.py 会话反思入口（供 M3 会话结束调用）
   - 读取本次会话 messages、结论、产物摘要
   - ModelAdapter.chat 结构化输出候选记忆数组 `[{layer, content, tags, importance}]`
   - Prompt 约束：episodic = 会话摘要、semantic = 方法 / 偏好 / 领域事实、skill = 可固化流程
   - 逐条调用 write_memory 入库
   - demo 简化：使用 FastAPI BackgroundTasks 异步后台任务，禁止 Celery/Redis
2. recall.py 召回 + 前置核验（供 M3 新会话启动调用）

python



运行







```
def recall(db, project_id, query, k=6, half_life_days=30):
    vec = embed(query)
    # pgvector 检索语义候选20条
    cands = pgvector_search(db, project_id, vec, layer="semantic", n=20)
    for c in cands:
        age = (now() - c.written_at).days
        # 综合权重 = 相似度 * 时效衰减系数
        c.rank = sim(c) * 0.5 ** (age / half_life_days)
    top = sorted(cands, key=lambda x: -x.rank)[:k]
    # 前置核验过滤陈旧低权重记忆
    return [c for c in top if verify_before_use(c)]
```

- verify_before_use：时效阈值过滤 + 可选轻量 LLM 一致性校验
- 通过校验的记忆拼接文本注入编排上下文

1. API `backend/app/api/memory.py`：挂载 GET/POST/memories，仅做参数校验，业务下沉 service 层

## demo 表现

1. 会话 A 用户留存固定分析偏好（t 检验、优先中文文献），会话结束后台异步反思，semantic 层新增对应记忆。
2. 新开会话 B 输入同类分析任务，系统自动召回记忆注入上下文，Agent 执行逻辑贴合用户历史偏好，实现自适应行为。
3. 前端记忆面板 / 接口可分层查看记忆，每条携带 written_at 时间戳。

## 验收 DoD（给定 → 操作 → 期望）

1. 写入去重：同一 project 连续 POST 两段语义高度近似的 semantic 记忆，memories 表仅新增 1 行，重复项仅刷新 written_at，无重复数据。
2. 语义召回：写入多条语义记忆后，GET /memories?q = 差异检验方法，返回列表按相关性排序，命中目标偏好记忆，数量≤k。
3. 时效排序：两条语义一致、新旧时间不同的记忆，召回结果中新记忆排序靠前，时效衰减逻辑生效。
4. 反思写入：会话摘要触发后台反思任务，执行完成后 memories 至少新增 1 条 episodic 记忆，按需新增 semantic，全部携带 written_at。
5. 用前核验：超时效阈值、低 importance 的陈旧记忆，不会出现在 recall 返回列表，不会注入编排上下文。
6. 铁律合规：无 Celery/Redis 依赖，向量使用 bge-m3 1024 维，检索底层基于 pgvector。