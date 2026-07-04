## 〖第 20 份〗 文件路径：tasks/M8-writing.md

# M8 结论回写 + 写作面板（P1）

## 目标

让 "验证过的结论带溯源一键回写知识库"（回写后可被 M2 检索），并提供 Markdown+LaTeX 写作面板：左编辑右预览、边写边引用分析结果（⟦art_*⟧/⟦src_*⟧）、无法溯源项标红下划线。

## 前置依赖

1. M7 校验：写作面板的标红 / 溯源判定复用 POST /verify。

2. M2 检索：回写的结论要能被检索命中；插入引用面板复用 POST /search。

   

   （M1/M4/M5 已提供 documents/chunks/artifacts/runs 与血缘边。）

## 上下文加载提示（给 Codex）

开发本卡只需加载：AGENTS.md + 本卡 +（如需精确契约）docs/03-DATA-MODEL.md 的 documents/chunks/claims/artifacts 表 /docs/04-API.md 的 POST /conclusions（及复用的 /verify、/search） /docs/05-PROVENANCE.md §1.4 富文本锚点、§3 对抗式三查 /docs/06-DESIGN.md §4 P5、§6 锚点渲染。不要加载其它模块任务卡或整份 docs。

## 涉及数据表

（表结构以 docs/03-DATA-MODEL.md §2、§4 为准，不重复 DDL）

1. claims：回写时若结论尚无 claim，创建一条并置 status='verified'；记录其 doc_id（指向本次回写生成的 note 文档）。
2. documents (type=note)：回写落库载体 —— 结论文本 + 锚点存储为 type='note'，写作面板持久化复用该表。
3. chunks：note 文档自动切块 + 向量化入库，供 M2 /search 检索。
4. artifacts：只读；校验 / 渲染锚点时解析 ⟦art_xxxx⟧ 获取产物与血缘，本模块不写入。

## 涉及接口

（契约以 docs/04-API.md 为准）

### 1. 新增 POST /conclusions

请求体：

json









```
{
  "project_id": "uuid",
  "claim_text": "带锚点的Markdown正文",
  "anchors": ["art_xxxx", "src_xxxx"],
  "status": "verified"
}
```

响应：

json









```
{"document_id": "uuid"}
```

业务要点：

- claim_text 包含内联富文本锚点；anchors 存储所有引用短码
- 落一条 documents (type=note)，自动生成 chunks 向量入库
- 新增 / 更新 claims 行，回填 doc_id、status=verified
- 可选：基于 anchors 生成血缘边 claim-supports→artifact、claim-cites→document

### 2. 复用 POST /verify（M7）

写作面板保存 / 防抖校验调用，返回标红判定信息，前端渲染告警。

### 3. 复用 POST /search（M2）

插入文献 / 分析产物弹窗检索候选，一键插入锚点到光标位置。

## 相关机制

1. docs/05-PROVENANCE.md §1.4 富文本锚点：数字强制 ⟦art_xxxx⟧、文献强制 ⟦src_xxxx⟧；无锚点裸数字判定为来路不明，前端渲染可点击上标。
2. docs/05-PROVENANCE.md §3 对抗式三查：回写前置条件为 /verify 全 pass；标红下划线来源于数字溯源、引用核查 fail 项，回写不重复执行校验逻辑，仅消费校验结果。

## 实现步骤

### 后端

1. Schema：`backend/app/schemas/conclusions.py`（Pydantic 2.7）
   - ConclusionCreate：入参结构体
   - ConclusionOut：返回体结构体
2. Service 层 `backend/app/services/memory/` 新增回写函数：

python



运行







```
def write_back_conclusion(project_id, claim_text, anchors, status):
    # 1 创建 note 文档，内容哈希寻址存储
    doc = create_document(
        project_id=project_id,
        type="note",
        filename=f"conclusion-{short_id}.md",
        storage_hash=sha256_of(claim_text)
    )
    # 2 切块 + bge-m3 向量化入库，复用 M1 导入管线
    ingest_chunks(doc.id, claim_text)
    # 3 更新/创建 claims 记录
    upsert_claim(project_id, text=claim_text, doc_id=doc.id, status=status)
    # 4 可选：基于 anchors 构建血缘关联边
    return doc.id
```

1. 复用 M5 血缘写入函数，创建 claim→artifact、claim→document 关联边，禁止重复实现血缘逻辑
2. API：`backend/app/api/conclusions.py`，路由挂载 `/api/v1/conclusions`，仅做入参校验、转发 service
3. demo 简化：note 直接存储纯文本，不解析 PDF；整块文本作为单 chunk，不细粒度切分

### 前端

1. 页面文件 `frontend/app/(main)/writing/page.tsx`，导航栏新增「写作面板」入口
2. 布局：左侧 Markdown 编辑框、右侧 react-markdown + katex LaTeX 实时预览（对齐 docs/06-DESIGN §4 P5）
3. 锚点渲染插件（remark 自定义组件）：
   - ⟦art_xxxx⟧：蓝色可点击上标，弹窗展示产物血缘卡片（调用 M5 `/artifacts/{id}/lineage`）
   - ⟦src_xxxx⟧：灰色可点击上标，跳转文献详情预览页
4. 防抖校验：onSave / 输入防抖调用 /verify，fail 项渲染红色波浪下划线，hover 展示失败原因
5. 插入弹窗：调用 /search 检索产物 / 文献，选中后在光标插入对应锚点标记
6. 回写按钮：仅选中 verified 通过的结论可点击，调用 POST /conclusions，成功弹出 toast「已回写知识库，可检索」
7. `frontend/lib/api.ts` 新增 postConclusion 请求封装
8. 本地缓存编辑内容，仅「回写」动作持久化至 documents (note)

## demo 表现

1. 写作面板左写右预览，β=0.083 类 LaTeX 公式实时渲染；⟦art_0a1f⟧/⟦src_9c2e⟧ 渲染可点击上标，点击弹窗血缘 / 文献详情。
2. 🎯 现场动作：正文写入裸数字 / 库外引用，保存触发校验，对应位置红色波浪下划线，hover 提示「无法溯源」「未命中知识库」。
3. 🎯 现场动作：选中校验全通过结论，点击回写；切换知识库页面 /search 检索关键词，可命中该 note 文档。

## 验收 DoD（给定 → 操作 → 期望）

1. 回写可检索：给定带完整锚点、/verify pass 的结论，调用 POST /conclusions (status="verified") 返回 document_id；随后 /search 检索关键词，命中该 note，claims 表对应记录 status=verified、doc_id 回填。
2. 标红准确：正文包含裸数字 + 库外引用，保存触发校验，两处精准渲染红色标记，hover 提示区分；合规锚点无告警。
3. 锚点可交互：点击有效 ⟦art_xxxx⟧ 弹出完整血缘卡片；点击 ⟦src_xxxx⟧ 跳转文献预览。
4. LaTeX 渲染：输入行内 / 块级数学公式，右侧预览 Katex 正常渲染无乱码。