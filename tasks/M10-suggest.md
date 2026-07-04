## 〖第 22 份〗 文件路径：tasks/M10-suggest.md

# M10 主动科研建议（P1）

## 目标

基于知识库 + 分析进展 + 长期记忆，主动生成 2-3 条科研建议（假设验证思路 / 相关文献 / 下一步分析），每条建议的 evidence 都指向具体的 document/artifact id，可点击回溯到来源。

## 前置依赖

1. M1 入库：documents/datasets 提供建议素材
2. M5 溯源：artifacts/runs 作为分析产物证据来源
3. 软依赖 M9 记忆：存在 memories 则纳入生成上下文；M9 未就绪自动跳过，不阻塞功能

## 上下文加载提示（给 Codex）

开发本卡只需加载：AGENTS.md + 本卡 +（如需精确契约）docs/03-DATA-MODEL.md 的 suggestions /documents/artifacts 三表 + docs/04-API.md 的 M10 段（GET /suggestions、POST /suggestions/refresh）+ docs/05-PROVENANCE.md §1.4（富文本锚点 ⟦art_*⟧/⟦src_*⟧）与 §5（记忆召回）。不要加载其它模块任务卡或整份 docs。

## 涉及数据表

1. suggestions（模块唯一写入表）
   - type 枚举：hypothesis /literature/next_step
   - content：建议正文
   - evidence：JSONB 存储证据指针数组
   - status 默认 new；created_at 排序依据
   - 表结构以 docs/03-DATA-MODEL.md §5 为准
2. documents（只读）：文献 / 入库材料证据源，evidence 引用 document uuid
3. artifacts（只读）：分析产物证据源，evidence 引用 artifact uuid

### evidence JSONB 标准结构（本卡约定）

json









```
[
  {
    "kind": "document"|"artifact",
    "id": "uuid短码",
    "anchor": "⟦src_xxxx⟧"|"⟦art_xxxx⟧"
  }
]
```

anchor 复用全局富文本锚点规范，前端渲染可点击回溯链接。

## 涉及接口

### GET /suggestions

查询参数：project_id（必填）

过滤规则：status != dismissed，按 created_at 倒序，默认返回前 3 条

返回字段：id, type, content, evidence

### POST /suggestions/refresh

请求体：`{"project_id": "uuid"}`

业务逻辑：

1. 拉取项目全量上下文（产物、文献、记忆）

2. 调用模型生成结构化建议

3. 校验所有 evidence.id 真实存在，剔除幻觉条目

4. 批量写入 suggestions 表

   

   返回：

   ```
   {"generated": 生成条数, "items": [建议列表]}
   ```

## 相关机制

1. docs/05-PROVENANCE.md §1.4：evidence 内 anchor 标准化，机器可解析、前端渲染跳转
2. docs/05-PROVENANCE.md §5：生成前置召回语义记忆，执行前置核验过滤陈旧记忆；M9 未启用则跳过记忆注入
3. 溯源铁律：每条建议绑定真实可溯源 artifact/document，禁止凭空编造证据 ID

## 实现步骤

### 后端

1. Schema `backend/app/schemas/suggest.py`（Pydantic 2.7）
   - Evidence：证据结构体
   - SuggestionOut：列表返回体
   - RefreshRequest / RefreshResponse：刷新接口请求响应
2. Service `backend/app/services/suggest/generator.py`
   - gather_context (project_id)：聚合近期 artifacts、paper 文档、可选召回记忆
   - build_prompt (ctx)：强约束 LLM 仅使用上下文提供的 id 生成 evidence，输出纯 JSON 数组
   - generate(project_id)：
     1. ModelAdapter.chat 获取原始 JSON
     2. 校验每条 evidence.id 存在于 documents/artifacts 库，剔除幻觉建议
     3. 自动生成标准 anchor 短码
     4. 批量插入 suggestions 表（demo 简化：直接追加，不做旧建议标记 stale）
   - 上下文为空 / 生成失败返回空列表，接口正常返回 200，不抛出异常
3. API `backend/app/api/suggest.py`，挂载 `/api/v1`，仅处理入参校验，业务下沉 generator
4. Model 层：backend/app/models/suggestions.py 表映射；无表则新增 Alembic 迁移，禁止手动修改数据库

### 前端

1. 组件 `frontend/components/SuggestionCard.tsx`，放置工作台首页（docs/06-DESIGN §4 P1）
2. 卡片展示：type 分类徽标、建议正文、evidence 锚点可点击跳转血缘 / 文献页面
3. 右上角刷新按钮，调用 POST /suggestions/refresh 实时重生成建议
4. `frontend/lib/api.ts` 封装请求函数

### demo 简化点

单用户单项目隔离；无定时后台刷新，仅页面加载 / 手动刷新触发生成；不做建议相似度去重，按创建时间倒序；M9 记忆未部署时静默跳过记忆注入逻辑。

## demo 表现

工作台首屏主动展示 2-3 条建议示例：

1. "建议对 X 变量做交互项回归验证假设 H1"

2. "文献 ⟦src_1a2b⟧ 与你的结论方向一致，可作为支撑"

3. "下一步：对 artifact ⟦art_9f3c⟧ 做敏感性分析"

   

   点击锚点直接跳转对应文献 / 产物血缘页面；点击刷新基于最新知识库实时重算全部建议。

## 验收 DoD（给定 → 操作 → 期望）

1. 项目包含≥2 篇 documents、≥1 个 artifact，调用 POST /suggestions/refresh，返回 generated ≥1，suggestions 表新增对应记录，type 限定 hypothesis/literature/next_step。
2. 调用 GET /suggestions 获取列表，每条 evidence 非空，所有 id 均可在 documents/artifacts 表查询到，无幻觉 ID。
3. 建议 evidence 绑定 artifact，调用 M5 `/artifacts/{id}/lineage` 可获取完整产物血缘链路。
4. 空项目（无文档无产物）执行 refresh，HTTP 200，generated=0，无非法建议入库。
5. 前端工作台加载自动渲染 2-3 条建议卡片，锚点为可点击交互元素，跳转至对应资源详情页。