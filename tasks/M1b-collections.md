# M1b 知识空间、批量入库与空间问答（P0）

## 目标

在不重写 M1/M2 的前提下增加可选知识空间：用户可建立多个 collection，把单文件、多文件、文件夹或 ZIP 入库到指定空间，并让检索/问答只使用该空间的文献。未传 `collection_id` 时所有旧行为保持不变。

## 增量约束

- 新建 `collections` 表；只给 `documents`、`datasets` 追加可空 `collection_id`，删除空间时 `SET NULL`。
- 单文件仍调用现有 `ingest()`；批量入库逐文件复用同一入口。
- M2 只在 SQL 元数据前置过滤增加 collection 条件，不改 BM25、向量召回、RRF、reranker 和引用锚点。
- 后台任务使用 FastAPI `BackgroundTasks`，不引入 Celery/Redis。
- 问答继续只调用 `ModelAdapter`。

## 接口

- `POST /collections`、`GET /collections`、`PATCH /collections/{id}`、`DELETE /collections/{id}`。
- `POST /documents/batch`：接收多个文件或 ZIP，返回 `202 + batch_id`。
- `GET /documents/batch/{batch_id}`：查询批量任务进度。
- `POST /documents`、`GET /documents`、`POST /search`、`POST /qa` 增加可选 `collection_id`。

## 实现要求

1. collection 必须与 project 匹配；跨项目访问拒绝。
2. ZIP 拒绝绝对路径、`..`、加密条目、超限文件，只提取支持的 M1 文件格式。
3. 请求返回前读取 UploadFile；后台任务使用独立 Session。
4. 每个批量文件独立记录成功/失败，单个失败不回滚整个批次。
5. collection 过滤必须同时作用于关键词、向量、混合检索及 QA 证据。
6. QA 返回的 `⟦src_*⟧` 和 citation 映射保持原契约。

## 验收 DoD

1. 两个空间分别入库文献后，带 collection 的 documents/search/qa 不发生串库。
2. 不传 collection 时旧 M1/M2 测试与行为全部通过。
3. 多文件和 ZIP 批量任务可查询进度，内容寻址存储仍按 sha256 去重。
4. 删除 collection 后文档、数据集保留且 `collection_id=NULL`。
5. 非法 ZIP 路径或跨项目 collection 被拒绝。
6. 后端测试、前端 typecheck/build 通过。
