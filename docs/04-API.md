# 04・REST API 契约（唯一事实来源）

前缀 /api/v1。所有请求 / 响应用 Pydantic schema（放 backend/app/schemas/）。流式接口用 SSE。

本文件是接口的唯一事实来源；任务卡只引用需要的接口，不重复定义。

阅读提示（给 Codex）：只读你当前模块涉及的接口段落（见文末《模块 × 接口映射》）。

### 约定

1. 认证：demo 阶段可省略或用固定 token；保留 project_id 作为作用域参数。
2. 错误：统一 `{ "error": {"code": str, "message": str} }`，HTTP 4xx/5xx。
3. 时间：ISO8601 UTC。
4. 锚点：正文里的 ⟦art_xxxx⟧ / ⟦src_xxxx⟧ 为机器可解析标记（xxxx = artifact/document id 短码）。

### M1 知识库入库

plaintext









```
POST /documents            # multipart 上传并入库（PDF/CSV/py/ipynb/md/txt）
  form: file, project_id, type?
  -> { id, type, filename, storage_hash, chunks_count?, dataset_id? }

GET  /documents            # 列表/筛选
  query: project_id, type?, tag?, q?
  -> [ { id, type, filename, title, year, created_at } ]

GET  /documents/{id}       # 详情 + 预览元数据
DELETE /documents/{id}
```

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
  body: { project_id, conversation_id?, message, dataset_ids?: [] }
  -> SSE 事件流：
     event: plan     data: { steps: [...] }
     event: thinking data: { text }
     event: code     data: { code, lang }
     event: run      data: { run_id, status, stdout }
     event: artifact data: { artifact_id, kind, value_json | figure_url, anchor }
     event: message  data: { text, citations }
     event: done     data: { conversation_id }
  # 多轮迭代：带 conversation_id 继续，如"横坐标改对数"
```

### M4 代码执行沙箱

plaintext









```
POST /runs                 # 执行一段代码（登记 run + 产物 + 血缘，见 M5）
  body: { project_id, conversation_id?, code, lang?="python", dataset_ids?: [], seed? }
  -> { run_id, status, stdout, artifacts: [ {artifact_id, kind, ...} ], code_hash }
  # 内部：固定 seed → 沙箱执行 → 捕获产物 → 存 env 快照 → 建血缘边
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
POST /memories             # 写入（反思后落库）
  body: { project_id, layer, content, tags? }
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

### M-Platform 平台适配层

plaintext









```
POST /agent/invoke         # headless 调用：脱离前端，走完"输入→分析→带溯源结论"
  body: { project_id, task: str, inputs?: {} }
  -> { result, artifacts, lineage, verify_report }
```

### 模块 × 接口映射（Codex 按此最小加载）

表格







|     模块     |                          接口                          |
| :----------: | :----------------------------------------------------: |
|      M1      |               POST/GET/DELETE /documents               |
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
|  M-Platform  |                   POST /agent/invoke                   |