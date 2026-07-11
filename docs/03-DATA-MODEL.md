# 03・数据模型（唯一事实来源）

数据库：PostgreSQL 16 + pgvector。所有表变更走 Alembic 迁移。embedding 维度按 bge-m3 = 1024。

本文件是表结构的唯一事实来源；任务卡只引用本文件的表，不重复定义。

阅读提示（给 Codex）：只读你当前模块涉及的表。每个模块涉及的表见文末《模块 × 表映射》。

### 1. 账户与项目

sql









```
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       TEXT UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID REFERENCES users(id),
  name        TEXT NOT NULL,
  description TEXT,
  archived_at TIMESTAMPTZ,                 -- NULL=当前工作区；归档只读且保留全部血缘
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

demo 单 user，但必须以 project 为资料、运行、产物、结论与记忆的隔离边界。归档项目禁止新的写入，不物理删除，以保证历史可复现。

### 2. 知识库（M1 / M2）

sql









```
-- M1b 知识空间：同一项目内给文献/数据分组；删除空间不删除内容。
CREATE TABLE collections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, name)
);
CREATE INDEX idx_collections_project ON collections(project_id);

-- 上传的文件（论文/笔记/代码）。type=paper 的行同时充当溯源图里的 Source(文献) 节点。
CREATE TABLE documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES projects(id),
  collection_id UUID REFERENCES collections(id) ON DELETE SET NULL, -- M1b，可空即未分组
  type          TEXT NOT NULL,              -- paper | note | code | other
  filename      TEXT NOT NULL,
  storage_hash  TEXT NOT NULL,              -- sha256，指向 storage/<hash>
  -- 文献元数据（type=paper 时填），供引用核查
  title         TEXT,
  authors       JSONB,                      -- 字符串数组
  year          INTEGER,
  doi           TEXT,
  source_url    TEXT,
  metadata      JSONB,                      -- 其它自由元数据/标签
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_project ON documents(project_id);
CREATE INDEX idx_documents_collection ON documents(collection_id);

-- 文本切块 + 向量
CREATE TABLE chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID REFERENCES documents(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  embedding     vector(1024),
  section       TEXT,                        -- 章节标题
  position      INTEGER,                     -- 原文中的位置/页码，供定位回溯
  metadata      JSONB
);
CREATE INDEX idx_chunks_document ON chunks(document_id);
CREATE INDEX idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops);
-- BM25：demo 用 rank_bm25 在内存建索引，或用 pg 的 tsvector 兜底；不额外建表。

-- 数据集（CSV/XLSX），即溯源图里的 DataFile 节点
CREATE TABLE datasets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID REFERENCES projects(id),
  collection_id UUID REFERENCES collections(id) ON DELETE SET NULL, -- M1b，可空即未分组
  name          TEXT NOT NULL,
  storage_hash  TEXT NOT NULL,               -- sha256 文件内容指纹，防"偷换数据"
  schema_json   JSONB,                        -- 列名/类型/行数
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3. 对话（M3）

sql









```
CREATE TABLE conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id),
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL,             -- user | assistant | tool
  content          TEXT,
  meta             JSONB,                     -- 工具调用、产物 id、思考流等
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4. 溯源核心（M5 / M7）—— 招牌，结构要扎实

sql









```
-- 环境快照：复现能成立的前提
CREATE TABLE env_snapshots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  python_version TEXT NOT NULL,
  packages       JSONB NOT NULL,             -- pip freeze 结果
  env_hash       TEXT NOT NULL,              -- sha256(sorted(packages)+python_version)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 一次代码执行（不可变，每次执行落一条）。即血缘图里的 CodeCell 节点。
CREATE TABLE runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID REFERENCES projects(id),
  conversation_id  UUID REFERENCES conversations(id),
  code             TEXT NOT NULL,
  lang             TEXT NOT NULL DEFAULT 'python',
  env_snapshot_id  UUID REFERENCES env_snapshots(id),
  input_hashes     TEXT[] NOT NULL DEFAULT '{}',  -- 依赖的 dataset.storage_hash
  output_hashes    TEXT[] NOT NULL DEFAULT '{}',  -- 产物内容哈希
  input_hash       TEXT NOT NULL,                 -- 归并哈希 = sha256(sorted(input_hashes))
  code_hash        TEXT NOT NULL,                 -- = sha256(code+lang+input_hash+env_hash) 信任锚点
  seed             INTEGER,                        -- 固定的随机种子
  status           TEXT NOT NULL,                  -- success | error
  stdout           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_runs_code_hash ON runs(code_hash);

-- 产物：数字/系数/表/图。粒度可细到标量（一个系数一条），供数字溯源锚点定位。
CREATE TABLE artifacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID REFERENCES projects(id),
  run_id       UUID REFERENCES runs(id),      -- 由哪次执行产出（图/表/数字）；文献引用类结论可为空
  kind         TEXT NOT NULL,                 -- number | coefficient | table | figure | conclusion
  title        TEXT,
  value_json   JSONB,                         -- 标量值或结构化内容（系数/统计量/表数据）
  content_hash TEXT,                          -- 图/文件型产物的内容哈希；storage/<hash>
  tol          DOUBLE PRECISION,              -- 数值型复现容差（默认见 05-PROVENANCE）
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 结论（正文中的一条论断），校验对账的目标
CREATE TABLE claims (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  text       TEXT NOT NULL,
  doc_id     UUID,                            -- 所在写作文档（M8）
  status     TEXT NOT NULL DEFAULT 'unverified', -- unverified | verified | flagged
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 统一血缘边表：承载所有实体间关系
CREATE TABLE edges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_type  TEXT NOT NULL,   -- dataset | run | artifact | claim | document
  from_id    UUID NOT NULL,
  to_type    TEXT NOT NULL,
  to_id      UUID NOT NULL,
  relation   TEXT NOT NULL    -- reads | produces | supports | cites
);
CREATE INDEX idx_edges_from ON edges(from_type, from_id);
CREATE INDEX idx_edges_to   ON edges(to_type, to_id);
```

血缘读法：Claim ←supports← Artifact (数字) ←produces← Run (code_hash) ←reads← Dataset；结论若援引文献，则 Claim →cites→ Document (type=paper)。任意一环缺失即 "来路不明"，被 M7 拦截。

### 5. 记忆与建议（M9 / M10 / M11）

sql









```
CREATE TABLE memories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id),
  layer       TEXT NOT NULL,        -- episodic | semantic | skill
  content     TEXT NOT NULL,
  embedding   vector(1024),         -- semantic 层用于召回
  tags        JSONB,
  importance  REAL DEFAULT 0.5,
  written_at  TIMESTAMPTZ NOT NULL DEFAULT now()  -- 召回时判断时效
);
CREATE INDEX idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops);

CREATE TABLE suggestions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id),
  type        TEXT NOT NULL,        -- hypothesis | literature | next_step
  content     TEXT NOT NULL,
  evidence    JSONB,                -- 指向具体 document/artifact id，可回溯
  status      TEXT DEFAULT 'new',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 技能包（M11）：跑通的分析流程固化为可复用脚本模板
CREATE TABLE skills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES projects(id),
  name        TEXT NOT NULL,
  discipline  TEXT,                 -- 学科标签
  template    TEXT NOT NULL,        -- 代码/提示词模板
  meta        JSONB,
  intent      TEXT NOT NULL DEFAULT '',       -- M11b：可复用分析意图
  input_roles JSONB NOT NULL DEFAULT '{}',    -- M11b：字段角色契约
  version     INTEGER NOT NULL DEFAULT 1,     -- M11b：技能/交换包版本
  origin      TEXT NOT NULL DEFAULT 'local',  -- local | builtin | imported | hub
  package_hash TEXT,                          -- 导入交换包的规范化 sha256
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_datasets_collection ON datasets(collection_id);
```

### 模块 × 表映射（Codex 按此最小加载）

表格







|      模块      |                          涉及表                           |
| :------------: | :-------------------------------------------------------: |
|    M1 入库     |                documents, chunks, datasets                |
| M1b 知识空间   |             collections, documents, datasets             |
|    M2 检索     |                     chunks, documents                     |
|  M3 对话分析   | conversations, messages, +（产出经 M5 落 runs/artifacts） |
|    M4 沙箱     |             env_snapshots（读写）, runs（写）             |
| M5 溯源 + 复现 |      runs, artifacts, edges, env_snapshots, datasets      |
|    M6 图谱     |    edges, artifacts, runs, datasets, documents（只读）    |
|    M7 校验     |         claims, artifacts, runs, edges, documents         |
|  M8 写作回写   |           claims, artifacts, documents, chunks            |
|    M9 记忆     |                         memories                          |
|    M10 建议    |             suggestions, documents, artifacts             |
|   M11 技能包   |                          skills                           |
| M11b 技能生命周期 |                         skills                           |
