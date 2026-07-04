# 05・招牌机制深挖：溯源账本・复现引擎・对抗式质检・复杂检索

本文件为 ReproLab 技术核心，路演技术深度专用稿；开发 M2/M5/M7 模块必读。

### 核心叙事

可信由架构保证，而非由模型保证。闭环信任链：

复杂检索保证 "喂给模型的证据是对的" → 溯源账本保证 "模型产出的每条结论都挂在证据上" → 对抗式质检保证 "挂错 / 挂空 / 图码不符会被抓出" → 记忆保证 "不重复劳动"

## 1. 溯源账本（Provenance Ledger）

### 1.1 四类实体 + 文献，构成有向血缘

plaintext









```
Dataset（原始数据文件, sha256）
   │ reads
   ▼
Run（一次代码执行：代码 + 环境快照 + 输入哈希 + code_hash）
   │ produces
   ▼
Artifact（产物：数字/系数/表/图, ⟦art_*⟧）
   │ supports
   ▼
Claim（正文中一条结论）
   ▲ cites
   │
Document(type=paper)（文献来源, ⟦src_*⟧, 含 DOI）
```

**血缘规则**：

1. Claim 结论必须绑定至少 1 个 Artifact 数值产物；

2. Artifact 必须归属一条 Run 执行记录；

3. Run 必须关联读取的 Dataset 原始数据；

4. 引用文献则侧向绑定 Document；

5. 任意环节缺失判定为「来路不明」，质检拦截。

   

   表结构参考 docs/03-DATA-MODEL.md §4，全部血缘关系统一存储于 edges 边表。

### 1.2 信任锚点 code_hash（核心，必须包含环境快照）

伪代码哈希计算逻辑：

python



运行







```
env_hash  = sha256(json.dumps(sorted(packages)) + python_version)
input_hash = sha256("".join(sorted(dataset_storage_hashes)))
code_hash  = sha256(code + lang + input_hash + env_hash)
```

关键约束：env_hash 必须纳入 code_hash；若仅用代码 + 输入哈希，更换依赖库版本后哈希不变，破坏可复现严谨性，为本项目差异化技术亮点。

### 1.3 执行捕获（M4→M5 衔接流程）

单次代码执行完整捕获步骤：

1. 强制固定随机种子（详见 2.1 小节）；
2. 沙箱隔离执行，捕获 stdout 标准输出、结构化数值产物、图表文件；
3. 批量计算 env_hash、input_hash、output_hashes、code_hash；
4. 持久化 runs 执行记录 + artifacts 产物（图表文件存储至 storage/<content_hash> 目录）+ env_snapshots 环境快照；
5. 构建血缘边关系：Dataset --reads--> Run；Run --produces--> Artifact。

### 1.4 富文本锚点 ⟦art_*⟧ / ⟦src_*⟧

正文（报告 / 综述 / 结论）为带内联锚点富文本，强制规范：

- 所有数值、图表标注插入 `⟦art_xxxx⟧`

- 所有文献引用插入 `⟦src_xxxx⟧`

  

  示例文本：

> 三物种体重差异显著（系数 0.083⟦art_0a1f⟧，p<0.01），与既有研究一致⟦src_9c2e⟧。

渲染规则：

1. 锚点渲染为可点击上标；
2. 点击`⟦art_*⟧`：弹窗展示完整产物血缘链（数值→Run 源码→原始 Dataset）；
3. 点击`⟦src_*⟧`：跳转知识库文献并定位对应原文段落；
4. 锚点机器可解析，校验 Agent 全文扫描锚点自动对账；
5. 无锚点裸数字 / 裸引用，质检最高优先级标记「来路不明」。

## 2. 复现引擎（一键复现）—— 核心演示高光底层逻辑

### 2.1 固定随机种子（可复现前置条件）

执行前统一注入种子，存入 runs.seed 字段：

python



运行







```
SEED = run.seed or 42
import os, random
os.environ["PYTHONHASHSEED"] = str(SEED)
random.seed(SEED)
import numpy as np
np.random.seed(SEED)
# 深度学习框架补充
# torch.manual_seed(SEED)
# tf.random.set_seed(SEED)
```

### 2.2 复现算法（接口：POST /runs/{id}/reproduce）

python



运行







```
def reproduce(run_id, dataset_overrides=None):
    run = ledger.get_run(run_id)
    # 解析输入，支持替换数据集做对照实验
    inputs = resolve_inputs(run, dataset_overrides)
    # 沙箱干净环境完整重放
    fresh = sandbox_run(
        run.code, 
        inputs, 
        seed=run.seed,
        env=run.env_snapshot
    )
    comparisons = []
    # 逐条比对新旧产物
    for old_art in ledger.artifacts_of(run_id):
        new_val = fresh.artifact_like(old_art)
        comparisons.append(compare(old_art, new_val))
    # 判定复现状态
    status = "match" if all(c.within_tol for c in comparisons) else "drift"
    return {
        "status": status, 
        "comparisons": comparisons, 
        "new_run_id": fresh.run_id
    }
```

### 2.3 分类型比对规则（禁止图表逐字节哈希比对）

python



运行







```
def compare(old_art, new_val):
    # 标量数字、系数：相对容差比对
    if old_art.kind in ("number", "coefficient"):
        tol = old_art.tol or DEFAULT_TOL  # 默认相对容差1e-6，可放宽至1e-3
        within = abs(new_val - old_art.value) <= tol * max(1, abs(old_art.value))
        return Comparison(
            within_tol=within, 
            old=old_art.value, 
            new=new_val,
            diff=new_val - old_art.value
        )
    # 表格：逐元素容差比对
    if old_art.kind == "table":
        return compare_tables_elementwise(old_art.value_json, new_val, tol)
    # 图表：比对绘图原始结构化数据，而非PNG字节
    if old_art.kind == "figure":
        return compare_figure_data(old_art, new_val, tol)
```

技术说明：matplotlib 生成图片自带时间戳、字体、后端环境差异，逐字节哈希会大量误报不一致；本项目比对绘图底层数值指纹，为差异化严谨设计。

### 2.4 演示动作

替换数据集 penguins_modified.csv 传入 dataset_overrides 参数，调用复现接口；数值超出容差返回 status:"drift"；前端漂移产物标红，展示新旧数值差值面板。完整演示「修改数据→一键重跑→自动标记差异」。

## 3. 对抗式质检（三查模块・M7）

校验 Agent 模拟审稿人逻辑，默认不信任所有结论，可路由至强 LLM；仅校验不生成内容，每条校验输出结构体：`{check, target_anchor, verdict, severity, reason, locate}`

### 3.1 引用核查（拦截幻觉引用）

python



运行







```
def check_citation(claim_text, src_anchor):
    doc = ledger.get_document(src_anchor)
    # 校验1：文献是否存在于知识库
    if doc is None:
        return fail("引用不在知识库中，疑似幻觉引用")
    # 校验2：DOI标识符有效性（离线环境可跳过）
    if doc.doi and not resolve_doi(doc.doi):
        return fail("文献标识符无法解析")
    # 校验3：语义蕴含校验，判断文献是否支撑当前论断
    if not semantically_supports(doc, claim_text):
        return fail("文献存在但内容不支持该论断，疑似张冠李戴")
    return ok()
```

### 3.2 数字溯源校验（拦截无来源裸数字）

python



运行







```
def check_numbers(doc_text):
    for num, anchor in extract_numbers_with_anchors(doc_text):
        # 无锚点裸数字直接报错
        if anchor is None:
            yield fail(num, "裸数字无 ⟦art_*⟧ 锚点，来路不明")
            continue
        art = ledger.get_artifact(anchor)
        run = ledger.get_run(art.run_id) if art else None
        # 产物无有效执行记录
        if run is None or run.status != "success":
            yield fail(num, "产物未绑定成功的代码执行")
        # 正文数值与原始产物数值超出容差
        elif abs(num - art.value) > (art.tol or DEFAULT_TOL):
            yield fail(num, f"正文数字 {num} 与产物值 {art.value} 不符")
        else:
            yield ok(num)
```

约束：`⟦art_*⟧`绑定单个标量数值，不可绑定整张数据表。

### 3.3 图码一致性校验（拦截图表数值不匹配）

python



运行







```
def check_figure(art):
    run = ledger.get_run(art.run_id)
    # 使用原始环境、种子重绘图数据
    fresh = sandbox_run(
        run.code, 
        resolve_inputs(run), 
        seed=run.seed, 
        env=run.env_snapshot
    )
    # 复用分类型容差比对逻辑
    return compare_figure_data(art, fresh.artifact_like(art), tol=art.tol or DEFAULT_TOL)
```

### 3.4 演示动作

人工构造缺陷文本：插入不存在的数字、知识库无收录的虚假文献；调用校验接口 /verify，前端标红对应锚点并展示失败原因；支持评委手动输入错误内容，实时检测，证明无硬编码。

## 4. 复杂检索（M2 核心实现逻辑）

单检索方案缺陷：向量检索语义匹配强、术语 / 年份精确匹配弱；BM25 关键词精确匹配强、同义语义识别差。整体链路：元数据前置过滤 → 双路并行召回 → RRF 融合排序 → 交叉编码器精排。

python



运行







```
def complex_retrieve(project_id, query, filters, k=8):
    # 0. 元数据前置过滤，缩小检索候选池（项目隔离、年份、文档类型）
    scope = metadata_prefilter(project_id, filters)
    # 1. 双路并行召回，各取top50候选
    q_vec     = bge_m3_embed(query)
    hits_vec  = pgvector_search(q_vec, scope, n=50)      # 向量检索
    hits_bm25 = bm25_search(query, scope, n=50)          # BM25关键词检索
    # 2. RRF融合排序，仅依赖排名，不受原始分数量纲干扰
    def rrf(rank_lists, k_const=60):
        fused = defaultdict(float)
        for ranked in rank_lists:
            for rank, doc in enumerate(ranked):
                fused[doc.id] += 1.0 / (k_const + rank + 1)
        return sorted(fused.items(), key=lambda x: -x[1])
    fused = rrf([hits_vec, hits_bm25])[:30]
    # 3. bge-reranker-v2-m3交叉编码器精排，仅处理top30节约算力
    reranked = bge_reranker.score(query, fetch_chunks(fused))
    top = sorted(reranked, key=lambda x: -x.score)[:k]
    # 4. 回填文档ID、段落定位信息，用于生成⟦src_*⟧锚点
    return [with_provenance(chunk) for chunk in top]
```

验收评测标准：

1. 评测集≥30 条标注 Query，混合检索 nDCG@5 / Recall@5 优于单独向量 / 单独 BM25；
2. 开启年份过滤后，返回结果无超出年份范围文档。

## 5. 长期记忆三层架构（M9 机制概览）

表格







|   层级   |               存储内容               |               数据表                |                 业务用途                 |
| :------: | :----------------------------------: | :---------------------------------: | :--------------------------------------: |
| 情节记忆 |     单条会话任务、结论、产物摘要     |      memories(layer=episodic)       |    回溯历史分析上下文（上次实验进度）    |
| 语义记忆 | 用户科研偏好、常用统计方法、领域常识 | memories(layer=semantic, embedding) | 个性化生成（固定检验方法、中文文献偏好） |
| 技能记忆 |     可复用固化分析流程、代码模板     |               skills                |       一键复用标准化绘图、检验流程       |

读写规则：

1. 写入：会话结束触发反思模块，LLM 抽取记忆候选，语义去重，记录写入时间分层入库；
2. 召回：新会话按语义相似度 + 时间时效筛选注入编排上下文；所有记忆使用前核验，规避过时信息污染结论。