# 04・REST API 契约（唯一事实来源）

前缀 /api/v1。所有请求 / 响应用 Pydantic schema（放 backend/app/schemas/）。流式接口用 SSE。

本文件是接口的唯一事实来源；任务卡只引用需要的接口，不重复定义。

阅读提示（给 Codex）：只读你当前模块涉及的接口段落（见文末《模块 × 接口映射》）。

### 约定

1. 认证：站内接口在 demo 阶段可省略；对外 `POST /agent/invoke` 支持固定 Bearer token（`AGENT_API_TOKEN`）并按来源限流。生产部署必须配置 token，轮换环境变量即可撤销旧 token；保留 project_id 作为作用域参数。
2. 错误：统一 `{ "error": {"code": str, "message": str} }`，HTTP 4xx/5xx。
3. 时间：ISO8601 UTC。
4. 锚点：正文里的 ⟦art_xxxx⟧ / ⟦src_xxxx⟧ 为机器可解析标记（xxxx = artifact/document id 短码）。

### M12 研究项目工作区

```
GET  /projects?include_archived=false
  -> [ { id, name, description?, archived_at?, created_at } ]
POST /projects
  body: { name, description? }
PATCH /projects/{id}
  body: { name?, description? }
POST /projects/{id}/archive
POST /projects/{id}/restore
POST /projects/demo              # 创建/复用隔离演示项目、研究文件夹、Penguins CSV 与显式演示说明
```

前端保存当前项目 ID 并将它作为所有既有项目作用域接口的 `project_id`。归档项目可被列表和只读查看，但任何上传、分析、写作回写、记忆或建议写入必须返回 409；不得物理删除项目及其血缘。

`POST /projects/demo` 只操作固定的演示项目；它会创建/修复固定的演示研究文件夹，并将 Palmer Penguins 数据集与明确标识的演示说明放入该范围，以便同时验证结构化数据和证据检索。它不得向当前真实项目写入资料、记忆、建议或产物。

### 研究交付与审阅（P1）

```
GET /projects/{project_id}/timeline
  -> { events: [{ kind, title, detail, created_at, href?, trusted }] }
GET /projects/{project_id}/review
  -> { project, counts, risks: [], next_actions: [] }
GET /projects/{project_id}/artifacts?limit=50
  -> { items: [{ id, run_id?, kind, title?, value?, content_hash?, created_at, source_complete, run_status? }] }
GET /runs/{run_id}/report?project_id={id}
  -> { run, datasets, environment, artifacts, reproduction_note }
GET /runs/{run_id}/bundle?project_id={id}
  -> application/zip（代码、数据清单与原文件、环境、产物、血缘、校验清单及 sha256 manifest）
GET /runs/{run_id}/compare?project_id={id}&other_run_id={id}
  -> { baseline, candidate, code_changed, input_changed, environment_changed, artifact_changes }
GET /documents/{document_id}/evidence?project_id={id}
  -> { document_id, excerpts: [{ section?, position?, content }] }
GET /projects/{project_id}/quality-report
  -> { project_id, generated_at, ready_for_demo, metrics: [], blockers: [], next_actions: [] }
```

这些接口只读取现有账本实体，不创建第二套“报告/时间线”事实来源。所有按 ID 读取的文档、运行和产物必须校验 `project_id`；跨项目统一返回 404，避免泄露存在性。

### M1 知识库入库

plaintext









```
POST /documents            # multipart 上传并入库；接收任意文件，服务端按内容识别能力
  form: file, project_id, type?
  -> { id, type, filename, storage_hash, chunks_count?, dataset_id?, duplicate,
       parse_status: "indexed"|"structured"|"stored"|"needs_attention", parser?, message? }

GET  /documents            # 列表/筛选
  query: project_id, type?, tag?, q?
  -> [ { id, type, filename, title, year, created_at } ]

GET  /documents/{id}       # 详情 + 预览元数据
DELETE /documents/{id}
PATCH /documents/{id}      # body: { project_id, title?, collection_id? }；支持重命名或移动/取消归档
PATCH /documents/organize  # body: { project_id, document_ids: [], collection_id? }；批量移动资料
```

### M1b 知识空间与批量入库

```
POST /collections
  body: { project_id, name, description? }
  -> { id, project_id, name, description, document_count, created_at }

GET /collections?project_id={id}
PATCH /collections/{id}          # body: { name?, description? }
DELETE /collections/{id}         # 文件保留并解除分组

POST /documents/batch            # multipart；files 可含 ZIP
  form: files[], project_id, collection_id?, type?
  -> 202 { batch_id, status, total, completed, failed,
           items: [{ filename, status, document_id?, dataset_id?, duplicate,
                     parse_status?, parser?, message?, error? }] }
GET /documents/batch/{batch_id}?project_id={id}

# 以下均为向后兼容的可选字段；不传时行为不变
POST /documents                  # form 新增 collection_id?
GET  /documents                  # query 新增 collection_id?
POST /search                     # body 新增 collection_id?
POST /qa                         # body 新增 collection_id?
```

`collection_id` 仅作为 M2 SQL 元数据前置过滤条件；BM25、向量、RRF、reranker 与 `⟦src_*⟧` 引用契约保持不变。批量处理使用 FastAPI BackgroundTasks，后台逐文件复用 M1 `ingest()`。同一项目与研究文件夹内按内容哈希去重，重复内容复用原 Document/Dataset 并显式返回 `duplicate=true`。

上传层不设扩展名白名单：单文件、文件夹与 ZIP 中的每个文件都先按原始字节进行内容寻址保存，再由解析器识别 PDF、Office Open XML、Notebook、JSON、文本、分隔数据表或通用二进制。`structured` 表示可结构化查询，`indexed` 表示可全文检索，`stored` 表示原文件已保存但当前无文本可提取，`needs_attention` 表示原文件已保存且已给出 OCR、损坏格式等增强解析提示。后两种状态不得伪装成检索成功，也不得导致同批其他文件失败。单批最多 100 个文件和 100 MB 解压后内容；ZIP 拒绝路径穿越与加密条目。

Excel schema 同时返回 `default_sheet` 与所有 `sheets`。CSV 默认严格校验每行列数；对于可无歧义识别的科研仪器成对谱线导出（多行元数据 + 固定宽度数值区），系统将每组谱线规范化为 `<series>_axis` 与 `<series>_intensity` 字段，并在 schema 中标记 `source_format=paired_series_csv` 与原始表头行数。无法满足该结构契约的错列文件不得静默跳行或猜测合并单元格：原文件正常入库并标记 `needs_attention`，但不创建可查询 Dataset。

### M1c 异构数据目录与结构化查询

```
GET /datasets?project_id={id}&collection_id?={id}
  -> [{ id, name, storage_hash, collection_id?, schema_json, created_at }]

POST /datasets/query
  body: {
    project_id,
    queries: [{
      dataset_id, sheet?, columns?: [],
      filters?: [{ column, op: "eq"|"ne"|"contains"|"gt"|"gte"|"lt"|"lte"|"is_null"|"not_null", value? }],
      search?, sort?: { column, direction: "asc"|"desc" }, offset?=0, limit?=50
    }]
  }
  -> { results: [{ dataset_id, name, storage_hash, sheet?, columns, rows, matched_rows, returned_rows, receipt }] }
```

CSV、TSV 与 Excel 共用声明式查询契约；一次请求最多查询 20 个项目内 Dataset，每个结果最多返回 100 行。服务端只接受真实字段名和固定运算符，不执行用户 SQL、Python 或表达式；所有 Dataset 先校验 `project_id`，跨项目统一返回 404。Excel 查询可显式选择工作表，未指定时使用入库 schema 的 `default_sheet`。响应中的 `receipt` 必须包含内容哈希与实际查询参数，供 Agent 工具回执、审计和后续运行绑定；查询本身只读，不创建 Artifact，也不得绕过分析运行的血缘登记。

### M2 混合检索 / 问答

plaintext









```
POST /search               # 混合检索
  body: { project_id, query, mode: "keyword"|"semantic"|"hybrid", filters?: {year_gte?, type?}, k?=8 }
  -> { hits: [ { chunk_id, document_id, content, section, position, score } ] }

POST /qa                   # RAG 问答（可 SSE 流式）
  body: { project_id, query }
  -> { answer, citations: [ { document_id, chunk_id, anchor: "⟦src_xxxx⟧" } ] }
```

### M3 对话式分析（SSE 流式）

plaintext









```
POST /chat                 # 自然语言 → 规划 → 执行 → 返回图/表/结论
  body: { project_id, conversation_id?, collection_id?, mode?: "analysis"|"workspace",
          message, dataset_ids?: [] }
  -> SSE 事件流：
     event: context  data: { tools: [{ name, label, status, detail, count, items? }] }
     event: plan     data: { steps: [...] }
     event: thinking data: { text }
     event: code     data: { code, lang }
     event: run      data: { run_id, status, stdout }
     event: artifact data: { artifact_id, kind, title?, value_json | figure_url, anchor }
     event: message  data: { text, citations }
     event: error    data: { stage, step?, code, message, retryable, conversation_id? }
     event: done     data: { conversation_id }
  # 多轮迭代：带 conversation_id 继续，如"横坐标改对数"
  # workspace 模式：collection_id 必填；先读取文件清单、内容检索、数据结构和记忆，
  # 普通资料问题直接回答，需要计算/清洗/绘图时自动选择当前文件夹内数据进入可信分析。
  # 文本检索为空不得直接失败；可依据 schema 回答。不可读二进制必须明确能力边界。
  # 分析执行失败时不得伪造结果，回退为基于文件结构的处理建议并保留运行回执。
GET /conversations?project_id={id}
  -> [{ id, title, created_at, updated_at, message_count }]
GET /conversations/{id}?project_id={id}
  -> { id, title, events: [{ event, data }] }

历史回放事件复用 POST /chat 的 SSE event/data schema；只从已持久化的 Message、Run、Artifact 还原，不新增第二套事件模型。
  # error 为流内结构化失败；已创建的 Run 和 Conversation 保留，可带 conversation_id 重试
```

### M4 代码执行沙箱

plaintext









```
POST /runs                 # 执行一段代码（登记 run + 产物 + 血缘，见 M5）
  body: { project_id, conversation_id?, code, lang?="python", dataset_ids?: [], seed? }
  -> { run_id, status, stdout, artifacts: [ {artifact_id, kind, ...} ], code_hash }
  # 内部：校验保留符号 → 注入 load_dataset(index) 与固定 seed → 沙箱执行 → 捕获产物 → 存 env 快照 → 建血缘边
```

### M5 溯源 / 复现

plaintext









```
GET  /artifacts/{id}/lineage   # 取该产物的溯源 DAG
  -> { nodes: [ {id, type, label, meta} ], edges: [ {from, to, relation} ] }

POST /runs/{id}/reproduce      # 🎯 一键复现：干净环境重放，返回对比
  body: { dataset_overrides?: { old_hash: new_hash } }   # 换数据触发漂移
  -> { status: "match"|"drift", comparisons: [
        { artifact_id, kind, old, new, within_tol: bool, diff? } ],
        new_run_id }
```

### M5b 差异归因（drift attribution，P1・见 tasks/M5b）

plaintext









```
POST /runs/{id}/attribute-drift   # 漂移根因归因：定位是哪些列/行/参数导致结果变化
  body: { dataset_overrides: {old_hash:new_hash}, target_artifact_id?,
          granularity?: "column"|"rowgroup", top_k?=5 }
  -> { target_artifact_id, baseline, drifted,
       attributions: [ { dimension, contribution: 0..1, direction: "up"|"down", detail } ] }
```

### M7 校验（对抗式三查）

plaintext









```
POST /verify               # 校验一段结论文本，返回标红项
  body: { project_id, text | doc_id, checks?: ["citation","number","figure"], repair?: bool }
  -> { verdict: "pass"|"fail", items: [
        { check, target_anchor, verdict: "pass"|"fail", severity, reason, locate,
          # citation 项额外(见 tasks/M7b NLI)：
          label?: "entailment"|"neutral"|"contradiction", support_score?: 0..1, evidence_span? } ],
        # 当 repair=true(见 tasks/M7c 反思式自修复)：
        iterations?: [ { round, fails, repair_action } ], claim_status? }
```

### M8 结论回写 / 写作

plaintext









```
POST /conclusions          # 验证过的结论带溯源回写知识库
  body: { project_id, claim_text, anchors: [], status: "verified" }
  -> { document_id }        # 变成可被 M2 检索的条目

# 写作面板内容存前端 + 复用 /verify、/search；文档持久化可复用 documents(type=note)
```

### M9 记忆

plaintext









```
GET  /memories             # 读取（按 layer / 语义召回）
  query: project_id, layer?, q?
  -> [{ id, layer, content, tags, importance, written_at, recallable, source }]
POST /memories             # 写入（反思后落库）
  body: { project_id, layer, content, tags? }
DELETE /memories/{id}?project_id={id} # 明确遗忘；跨项目返回 404
```

### M10 主动建议

plaintext









```
GET  /suggestions          # 基于知识库+进展+记忆的主动建议
  query: project_id
  -> [ { id, type, content, evidence } ]
POST /suggestions/refresh  # 触发重新生成
```

### M11 技能包

plaintext









```
GET  /skills
POST /skills               # 注册/固化一个技能包
```

### M11b 技能生命周期

```
POST /skills/from-artifact       # 成功产物 → 参数化用户技能
  body: { artifact_id, name, intent, discipline? }
  -> skill

POST /skills/{id}/apply          # 字段映射 → 沙箱执行 → 新血缘；映射失败回退 M3
  body: { project_id, dataset_ids, conversation_id?, intent_override? }
  -> { skill_id, fallback_used, mapping, mapping_reason, run_id?, status,
       code?, artifacts, conversation_id?, events?,
       token_usage: { mapping_tokens, estimated_from_scratch_tokens, saved_tokens } }

GET  /skills/{id}/export         # 版本化、带 sha256 的 JSON 技能包
POST /skills/import              # body: { project_id, package }
GET  /skills/hub
  -> [{ id, name, intent, discipline, version, author, input_roles,
        tools, outputs, workflow, estimated_from_scratch_tokens, package_hash }]
POST /skills/hub/{hub_id}/import # body: { project_id }
```

### M-Platform 平台适配层

plaintext









```
POST /agent/invoke         # headless 调用：脱离前端，走完"输入→分析→带溯源结论"
  body: { project_id, task: str, inputs?: {} }
  -> { result, artifacts, lineage, verify_report }

POST /agent/jobs           # 同一内核的后台任务入口；请求体与 /agent/invoke 相同
  header: Idempotency-Key? # 相同来源+键+请求返回同一 job；同键不同请求返回 409
  -> { job_id, status, status_url, created_at }
GET /agent/jobs/{job_id}
  -> { job_id, status, created_at, started_at?, finished_at?, result?, error? }
DELETE /agent/jobs/{job_id}
  -> 同上；排队任务立即取消，运行中任务标记 cancelling 并在安全收口点丢弃结果

当 `AGENT_API_TOKEN` 非空时，请求必须携带 `Authorization: Bearer <token>`；单来源默认每分钟最多 `AGENT_RATE_LIMIT_PER_MINUTE` 次。服务记录请求 ID、项目、状态与耗时，但不记录 token、原始数据或完整任务文本。
后台任务使用 FastAPI BackgroundTasks 和进程内状态表，适合单机 demo；服务重启后任务状态不保留，不作为分布式队列承诺。
```

### 运行状态与可恢复错误（产品体验 P0）

```
GET /settings/runtime
  -> {
       state: "ready" | "degraded",
       summary: str,
       components: [
         { key: "database"|"model"|"sandbox", title, state: "ready"|"action_required"|"offline",
           message, action?: str }
       ]
     }

GET /settings/metrics
  -> {
       uptime_seconds, requests_total, failures_total,
       routes: [{ method, path, requests, failures, p50_ms, p95_ms, max_ms }]
     }
```

语义查询向量按原始查询缓存，混合检索的 CrossEncoder 分数按“查询 + 完整候选文本序列”缓存；只有输入完全一致时复用，不跳过项目/文件夹 SQL 作用域，也不改变 BM25、pgvector、RRF 或 reranker 排序。RRF 默认取前 12 个候选进入 CrossEncoder（`RERANK_LIMIT` 可在 5–50 内配置），避免 CPU 环境对 30 个长文本逐一重排造成不可接受的首问延迟；召回仍使用 BM25 与 pgvector 各 50 个候选。文档入库的批量 embedding 不走查询缓存。

前端不得把网络异常原样显示为 `Failed to fetch`。它应调用本接口展示受影响能力、下一步操作和设置入口；接口只检查本机配置与依赖可达性，不主动发送模型请求或泄露密钥。

### 模块 × 接口映射（Codex 按此最小加载）

表格







|     模块     |                          接口                          |
| :----------: | :----------------------------------------------------: |
|      M1      |               POST/GET/DELETE /documents               |
|     M1b      | CRUD /collections, POST/GET /documents/batch, collection 作用域扩展 |
|      M2      |                 POST /search, POST /qa                 |
|      M3      |                    POST /chat (SSE)                    |
|      M4      |                       POST /runs                       |
|      M5      | GET /artifacts/{id}/lineage, POST /runs/{id}/reproduce |
| M5b 差异归因 |            POST /runs/{id}/attribute-drift             |
|      M6      |              GET /artifacts/{id}/lineage               |
|      M7      |                      POST /verify                      |
| M7b 引用 NLI | POST /verify（citation item 扩展 label/support_score） |
|  M7c 自修复  |        POST /verify?repair=true（内部编排循环）        |
|      M8      |       POST /conclusions（+ 复用 /verify/search）       |
|      M9      |                   GET/POST /memories                   |
|     M10      |      GET /suggestions, POST /suggestions/refresh       |
|     M11      |                    GET/POST /skills                    |
|    M11b      | POST /skills/from-artifact, POST /skills/{id}/apply, GET /skills/{id}/export, POST /skills/import, GET/POST /skills/hub* |
|  M-Platform  | POST /agent/invoke, POST/GET/DELETE /agent/jobs, GET /settings/metrics |
