## 〖第 11 份〗 文件路径：tasks/M2-retrieval.md

# M2 混合检索与 RAG 问答（P0 任务卡）

### 模块目标

基于 M1 入库 documents/chunks 数据表，实现「元数据前置过滤 + 向量 / BM25 双路召回 + RRF 融合 + bge-reranker 精排」混合检索；上层封装 RAG 问答接口，输出带`⟦src_xxxx⟧`可溯源引用锚点，支撑写作、对话页面溯源需求。

### 前置依赖

M1 知识库入库模块完成；chunks 表 embedding 向量由 bge-m3 生成、section/position 定位字段完整写入。

### 开发加载约束（Codex）

仅加载：AGENTS.md、本任务卡、docs/03-DATA-MODEL.md（chunks/documents 表）、docs/04-API.md（/search/qa 接口）、docs/05-PROVENANCE.md §4 复杂检索算法；禁止加载其他模块完整任务卡；本模块只读数据表，不执行写入入库逻辑。

### 涉及数据表（只读）

1. chunks：检索核心数据源；读取 embedding 向量、content 文本、section、position、document_id 关联外键；

2. documents：回填文献元数据、年份、文档类型、生成`⟦src_xxxx⟧`短码；实现 project_id 项目数据隔离；

   

   表结构参考 docs/03-DATA-MODEL.md §2，向量维度固定 1024；BM25 不持久化索引，Demo 阶段每次检索内存实时构建 rank_bm25 索引。

### 对外接口 /api/v1

#### 1. POST /search 混合检索接口

请求体：

json









```
{
    "project_id": "str",
    "query": "检索文本",
    "mode": "keyword" | "semantic" | "hybrid",
    "filters": {"year_gte": 2020, "type": "paper"},
    "k": 8
}
```

响应体：hits 数组，单条 hit 包含 chunk_id、document_id、content、section、position、rerank 打分 score。

mode 分支逻辑：keyword 仅 BM25；semantic 仅向量；hybrid 完整混合检索链路（默认主流程）。

#### 2. POST /qa RAG 溯源问答接口

请求体：`{"project_id": "str", "query": "用户问题"}`

响应体：

json









```
{
    "answer": "带⟦src_xxxx⟧锚点的Markdown回答文本",
    "citations": [{"document_id": "xxx", "chunk_id": "xxx", "anchor": "⟦src_xxxx⟧"}]
}
```

内部逻辑：调用 hybrid 混合检索取 top-k 上下文 → 拼装 Prompt → ModelAdapter 统一调用 LLM 生成带锚点答案 → 解析锚点映射文档 ID 返回 citations；可选 SSE 流式输出，Demo 优先实现非流式闭环。

接口请求 / 响应 Pydantic 模型：backend/app/schemas/search.py，契约严格对齐 docs/04-API.md。

### 核心关联机制

完整算法逻辑参考 docs/05-PROVENANCE.md §4 复杂检索，核心链路：元数据过滤缩小候选池 → 双路 top50 召回 → RRF 融合排序 → 交叉编码器精排 top-k；评测指标：nDCG@5、Recall@5。

### 分步实现流程

#### 1. Schema 定义 backend/app/schemas/search.py

SearchRequest（mode 枚举、filters 子模型、默认 k=8）、SearchHit、SearchResponse、QARequest、Citation、QAResponse。

#### 2. 检索核心服务 backend/app/services/rag/retrieval.py

完整实现 complex_retrieve 函数：

1. metadata_prefilter：SQL 联表过滤，强制 project_id 隔离，支持年份、文档类型筛选；
2. pgvector_search：余弦相似度向量检索，scope 内取 top50；复用 M1 的 bge_m3_embed 编码函数；
3. bm25_search：scope 内 chunk 文本内存构建 BM25Okapi 索引，打分取 top50；
4. rrf 融合函数：固定 k_const=60，按排名加权求和排序，取 top30；
5. bge_reranker.score：单例懒加载 bge-reranker-v2-m3，仅对 top30 候选做交叉编码打分；
6. with_provenance：回填文档、段落定位信息，封装完整 hit 结构。

#### 3. /search API 层 backend/app/api/search.py

薄封装接口，仅参数校验、调用 retrieval 服务、序列化返回结果。

#### 4. RAG 问答服务 backend/app/services/rag/qa.py

1. 调用 complex_retrieve 混合检索获取 top-k 文献片段；
2. 上下文 Prompt 拼装，绑定 chunk 与 document 短码映射；
3. 通过 ModelAdapter 调用 LLM，强制 Prompt 要求在引用位置输出`⟦src_xxxx⟧`锚点；
4. 解析回答文本内所有锚点，映射 document_id/chunk_id 生成 citations 数组；
5. 锚点短码规则：`⟦src_xxxx⟧`中 xxxx 为 document.id 前 4 位字符，建立全局映射表供前端定位原文。

#### 5. 前端配套实现

知识库检索面板：输入框、检索模式切换、年份 / 文档类型筛选器；问答区域 react-markdown 渲染回答，AnchorChip 组件将`⟦src_*⟧`转为可点击上标，点击弹窗跳转文档对应段落。

### Demo 简化方案

1. BM25 索引内存临时构建，无持久化缓存；
2. reranker 模型单例加载，不做多实例并发优化；
3. SSE 流式问答后置开发，优先非流式；
4. 评测集固定 30 + 条标注 Query JSON 文件，本地离线计算指标。

### Demo 预期表现

知识库输入语义类问题（如企鹅体重性别差异），hybrid 混合检索返回精准 top-k 文献片段；问答模块输出带可点击`⟦src_*⟧`上标的完整回答；可切换 keyword/semantic/hybrid 模式直观对比单路检索缺陷，演示融合重排技术优势。

### 验收 DoD（给定输入 → 操作 → 预期结果）

1. 混合检索指标：30 条标注 Query 分别跑单路向量、单路 BM25、hybrid 混合；混合检索 nDCG@5、Recall@5 不低于任意单路；
2. 元数据过滤校验：filters.year_gte=2020 检索，返回所有文档年份≥2020 无越界；type=paper 仅返回论文文档；
3. 项目隔离校验：不同 project_id 检索完全隔离，无跨项目数据泄露；
4. RRF 单元测试：构造两组已知排名列表，融合结果加权分数与手工 1/(60+rank+1) 计算完全一致；
5. 问答锚点校验：/qa 返回 answer 包含至少一条`⟦src_xxxx⟧`，每条锚点在 citations 数组存在对应 document_id、chunk_id 映射；前端点击锚点可跳转至原文段落；
6. 接口契约校验：/search、/qa 请求响应字段与 docs/04-API.md 完全匹配，无新增 / 缺失字段。