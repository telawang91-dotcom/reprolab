## 〖第 10 份〗 文件路径：tasks/M1-ingest.md

# M1 知识库入库（P0 任务卡）

### 模块目标

支持上传 PDF/CSV/XLSX/.py/.ipynb/md/txt 全格式文件；系统自动解析文档内容、抽取表格、结构化数据集元数据、文本切块、bge-m3 向量化入库；为 M2 检索模块提供完整数据源。

### 前置依赖

无业务依赖；基础容器前置条件：Postgres+pgvector 向量库就绪、Alembic 数据库迁移工具初始化完成；本任务卡负责模块专属数据表迁移脚本。

### 开发加载约束（给 Codex）

仅加载文件：AGENTS.md、本任务卡、docs/03-DATA-MODEL.md（documents/chunks/datasets 表结构）、docs/04-API.md（M1 上传 / 增删改查接口契约）；禁止加载其他模块任务卡完整文档；向量检索逻辑归属 M2，本模块仅负责写入向量不实现查询。

### 涉及数据表

1. documents：每条上传文件单条记录；存储文件类型 paper/note/code/other、文件名、sha256 存储哈希、文献元数据标题 / 作者 / 年份 / DOI；删除时级联删除 chunks 子表；

2. chunks：文本切块存储，包含 1024 维 bge-m3 embedding 向量、文本内容、章节 section、页码 / 段落定位 position；

3. datasets：CSV/XLSX 专用数据表；存储文件名哈希、schema_json（列名、数据类型、总行数）；

   

   完整 DDL、字段约束参考 docs/03-DATA-MODEL.md，本卡不重复。

### 模块接口（/api/v1 前缀）

1. `POST /documents` 多文件上传入库

   

   请求表单参数：file、project_id、type (可选)

   

   返回结构体：

   ```
   { id, type, filename, storage_hash, chunks_count?, dataset_id? }
   ```

   

   逻辑：CSV/XLSX 返回 dataset_id；文本 / PDF 返回切块数量 chunks_count

2. `GET /documents` 文档列表筛选

   

   查询参数：project_id、type、tag、q 模糊名称检索

   

   返回文档基础元数据数组：id、type、文件名、标题、年份、创建时间

3. `GET /documents/{id}` 文档详情预览

   

   返回完整元数据，数据集附带 schema_json，文本附带切块数量

4. `DELETE /documents/{id}` 删除文档

   

   级联删除关联 chunks 切块记录

   

   接口请求 / 响应使用 backend/schemas 下 Pydantic 模型，契约严格对齐 docs/04-API.md。

### 关联机制

无依赖外部业务模块；仅负责向量写入，检索、RRF、重排属于 M2 模块。

### 分步实现流程

#### 1. Alembic 数据库迁移脚本

1. 启用 pgvector 扩展 `CREATE EXTENSION IF NOT EXISTS vector`；
2. 创建 documents/chunks/datasets 三张数据表，建立向量索引、外键级联删除约束；
3. SQLAlchemy 模型定义存放路径：backend/app/models/；向量字段类型 `pgvector.sqlalchemy.Vector(1024)`。

#### 2. 内容寻址存储服务 backend/app/services/rag/storage.py

python



运行







```
# 写入文件，返回sha256哈希，幂等去重（重复文件不重复存储）
def save_bytes(data: bytes) -> str:
    h = sha256(data).hexdigest()
    file_path = f"backend/app/storage/{h}"
    if not os.path.exists(file_path):
        with open(file_path, "wb") as f:
            f.write(data)
    return h
# 读取文件字节/获取文件路径
def read_bytes(hash: str) -> bytes: ...
def path_of(hash: str) -> str: ...
```

#### 3. 文件解析器 backend/app/services/rag/parser.py

按文件后缀分发解析逻辑，统一返回 ParsedDoc 结构体：

- `.pdf`：PyMuPDF (fitz) 逐页提取正文，识别表格转为 Markdown 拼接；记录页码 position、启发式识别章节 section；

- `.csv/.xlsx`：pandas 读取，生成 schema_json 字段结构，归类为 dataset 类型，不生成文本切块；

- `.py/.ipynb/.md/.txt`：读取全部文本；ipynb 使用 nbformat 提取代码 + Markdown 单元格拼接；

  

  ParsedDoc 结构体字段：kind (text/dataset)、text、sections、dataset_schema。

#### 4. 文本切块服务 backend/app/services/rag/chunker.py

固定窗口切块，单块约 500token，窗口重叠 80 字符；保留 section、position 定位信息；Demo 阶段可用字符长度近似 token 计数。

#### 5. 向量化服务 backend/app/services/rag/embedder.py

单例懒加载 BAAI/bge-m3 模型（FlagEmbedding/sentence-transformers）；批量文本编码输出 1024 维浮点向量数组；应用启动预热模型解决首请求加载慢问题。

#### 6. 入库编排主逻辑 backend/app/services/rag/ingest.py

python



运行







```
def ingest(file, project_id, type) -> IngestResult:
    raw = file.read()
    # 内容寻址存储
    h = storage.save_bytes(raw)
    parsed = parser.parse(file.filename, raw)
    # 数据集文件分支：写入datasets表
    if parsed.kind == "dataset":
        ds = datasets.insert(name=file.filename, storage_hash=h, schema_json=parsed.dataset_schema)
        doc = documents.insert(type="other", filename=file.filename, storage_hash=h)
        return IngestResult(document_id=doc.id, dataset_id=ds.id, storage_hash=h)
    # 文本/论文/代码分支：写入documents + 切块向量化入库
    doc = documents.insert(
        type=type or infer_type(file.filename), 
        filename=file.filename, 
        storage_hash=h
        # 启发式填充title/year/doi，无数据留空
    )
    chunks_ = chunker.split(parsed.text, parsed.sections)
    vecs = embedder.encode([c.content for c in chunks_])
    chunks.bulk_insert(
        document_id=doc.id, 
        content=[c.content for c in chunks_],
        embedding=vecs,
        section=[c.section for c in chunks_],
        position=[c.position for c in chunks_]
    )
    return IngestResult(document_id=doc.id, chunks_count=len(chunks_), storage_hash=h)

# 文件类型自动推断
def infer_type(filename: str) -> str:
    if filename.endswith(".pdf"): return "paper"
    elif filename.endswith((".py", ".ipynb")): return "code"
    elif filename.endswith((".md", ".txt")): return "note"
    else: return "other"
```

#### 7. API 层 backend/app/api/documents.py

仅做请求校验、参数解析，业务逻辑全部委托 ingest 服务；

- 上传接口使用 FastAPI UploadFile 接收文件；
- 耗时向量化逻辑使用 BackgroundTasks 异步执行；Demo 简化可同步阻塞；
- GET/DELETE 直接调用 CRUD 工具，DELETE 依靠外键级联自动删除 chunks；
- 请求响应 Pydantic 模型存放 backend/app/schemas/documents.py。

### 项目依赖补充 requirements.txt

PyMuPDF、pandas、openpyxl、nbformat、FlagEmbedding/sentence-transformers、pgvector

### Demo 简化方案

1. 单固定 project_id，多项目隔离后置开发；
2. PDF 文献元数据启发式抽取，无识别结果不阻断入库流程；
3. 模型启动预热，规避首请求加载卡顿；
4. 鉴权、限流、大文件分片上传全部省略，demo 无需实现。

### Demo 预期表现

知识库页面拖拽 PDF 论文、CSV 数据集上传：

1. PDF 快速展示文档卡片，显示标题、年份、切块数量；
2. CSV 卡片展示识别到的列名、字段类型、数据总行数；
3. 重复上传相同文件，storage 仅存储单份哈希文件，实现去重；
4. 上传完成后可直接在 M2 检索页面做语义 / 关键词问答。

### 验收 DoD（给定输入 → 操作 → 预期结果）

1. 输入 3 页以上 PDF，调用 POST 上传；返回 chunks_count>0；详情接口可读取标题年份；数据库 chunks 表行数等于切块数量，每条 embedding 非空、维度 1024；
2. 输入≥3 列 10 行 CSV 文件；接口返回 dataset_id；datasets 表 schema_json 包含完整列信息与行数，storage_hash 等于文件 sha256；
3. 同一文件重复上传两次；storage 目录仅存在一份哈希文件，幂等去重生效；
4. 上传.ipynb/.md 文件，成功切块入库，documents.type 分别标记 code/note；
5. 调用 DELETE /documents/{id}；documents 记录删除，关联 chunks 全部级联清空；
6. GET /documents 筛选 type=paper，仅返回论文类文档，元数据字段完整。