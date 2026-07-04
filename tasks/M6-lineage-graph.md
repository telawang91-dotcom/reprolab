# 〖第 16 份〗 文件路径：tasks/M6-lineage-graph.md

## M6 溯源图谱可视化（P1，门面）

### 目标

用 reactflow 画出产物的溯源 DAG（数据→代码→产物→结论 / 文献），节点按类型着色、可缩放、点击看详情（代码 / 环境 / 哈希 / 时间）；点结论沿上游链路 "流水点亮"；顶部 "一键复现" 触发重放，返回绿勾 / 红叉并滑出差异面板。

### 前置依赖

M5 溯源复现模块；M6 仅消费 M5 对外暴露两个接口 GET /artifacts/{id}/lineage、POST /runs/{id}/reproduce；本模块不新增任何后端接口，纯前端展示层。

### 上下文加载提示（给 Codex）

开发本卡只需加载：AGENTS.md + 本卡 +（如需精确契约）docs/03-DATA-MODEL.md edges/artifacts/runs/datasets/documents 表 + docs/04-API.md M5 接口 + docs/06-DESIGN.md §4 P4 页面、§5 动效规范。不要加载其它模块任务卡或整份 docs。

### 涉及数据表（仅用于理解接口返回语义，前端不直连数据库）

表结构以 docs/03-DATA-MODEL.md 为准，不重复 DDL

1. edges：血缘关系边，reads/produces/supports/cites 控制连线逻辑、流水点亮遍历路径
2. artifacts：产物节点，kind 区分数值 / 图表 / 结论，详情面板展示 value、tol、哈希
3. runs：代码执行节点，展示完整代码、code_hash、seed、环境快照、创建时间
4. datasets：数据源节点，展示 storage_hash
5. documents：文献节点，结论 cites 关联论文文献

### 涉及接口

仅复用 M5 已有接口，无新增接口

1. GET /artifacts/{id}/lineage：将返回 nodes/edges 完整映射为 ReactFlow 图元；type 字段控制节点配色，meta 填充详情面板

2. POST /runs/{id}/reproduce：图谱顶部一键复现按钮调用，接收 match/drift 结果渲染动效与差异面板

   

   接口契约严格遵循 docs/04-API.md，M6 不修改、不扩展接口字段

### 相关机制

1. 复现比对规则复用 docs/05-PROVENANCE.md §2：干净环境 + 固定种子，数值容差比对，图表不对比 PNG 字节；前端标准化渲染状态色：match 绿色 #16A34A、drift 红色 #DC2626、进行中橙色 #F59E0B
2. DAG 遍历规则（流水点亮）：Claim ←supports← Artifact ←produces← Run ←reads← Dataset；结论引用文献链路 Claim →cites→ Document；点击结论节点反向 BFS 遍历上游全链路，实现逐节点流水高亮动效

### 实现步骤

1. **API 客户端 frontend/lib/api.ts**

   

   封装两个请求函数 getLineage (artifactId)、reproduceRun (runId, datasetOverrides)；同步定义 TS 类型 LineageNode/LineageEdge/ReproduceResult，对齐后端响应结构

2. **图谱页面 frontend/app/lineage/[artifactId]/page.tsx（P4 全屏路由页）**

   

   外层包裹 ReactFlowProvider，引入 LineageGraph 核心组件；顶部工具栏：缩放、适配画布、一键复现按钮；内置 MiniMap、Background、Controls 控件

3. **核心图谱组件 frontend/components/lineage/LineageGraph.tsx**

   - 映射后端 nodes 数组为 ReactFlow 自定义节点，注册 nodeTypes；按实体类型分配固定配色：dataset 靛蓝、run 代码蓝 #2563EB、artifact 按类型区分、conclusion 强调色、document 灰色
   - demo 简化布局：dagre 分层布局，从左至右按 reads→produces→supports 顺序排布；不持久化用户拖拽布局
   - edges 渲染：relation 文本作为边标签，平滑曲线 smoothstep

4. **详情抽屉组件 frontend/components/lineage/NodeDetailPanel.tsx**

   

   点击节点 onNodeClick 右侧弹出 Drawer 面板，展示 meta 元数据：

   - run 代码块：JetBrains Mono 等宽字体，展示 code_hash、seed、环境哈希、执行时间

   - dataset：storage_hash

   - artifact：数值 / 图表预览、tol 容差配置

   - document：文献标题、DOI

     

     哈希字段增加一键复制按钮

5. **流水点亮动效（§5 规范）**

   

   点击 conclusion 结论节点 → 反向 BFS 遍历上游所有关联 node/edge； stagger 延时 120ms 逐帧提升节点 zIndex、添加主色描边、边开启 animated 流动动画；点击空白画布重置所有高亮状态

6. **一键复现动效与差异面板**

   

   点击顶部复现按钮 → 按钮切换橙色脉冲加载态；调用 reproduceRun：

   - status=match：绿色弹性动画 Toast 提示「复现结果完全一致」，无差异面板
   - status=drift：红色抖动动画，右侧滑出 DiffPanel；within_tol=true 行绿色展示，漂移行标红展示 old/new/diff

7. demo 简化约束

   - 无长任务轮询、消息队列逻辑，后端同步返回复现结果
   - 仅渲染单个 artifact 子图谱，不支持跨项目全局血缘大图
   - 不实现权限控制、多人协同编辑布局

### demo 表现

P4 全屏溯源图谱页面完整渲染结构化 DAG；两大核心演示动作：

1. 点击结论节点，上游「数据集→代码执行→数值产物→结论」链路逐节点流水点亮，直观证明所有数值均可回溯完整血缘
2. 一键复现：无数据修改返回绿色匹配动效；替换数据集触发漂移，红叉抖动 + 滑出差异面板标红漂移数值，直观展示项目核心可信复现能力

### 验收 DoD（给定 → 操作 → 期望）

1. 完整血缘 artifact_id 访问 P4 图谱页
   - ReactFlow 正常渲染 dataset/run/artifact/claim/document 多类型节点 DAG
   - 滚轮缩放、fit-view 画布适配按钮正常生效
   - 图谱节点、边数量与 GET /artifacts/{id}/lineage 返回数据完全一致
2. 点击 run 代码节点
   - 右侧详情抽屉完整展示 code 代码、code_hash、seed、python 版本 + env_hash、创建时间
   - 所有哈希字段支持一键复制
3. 点击 conclusion 结论节点
   - 上游全链路节点、边在 1.5s 内按顺序流水高亮，非链路元素自动变暗
   - 点击画布空白区域，全部高亮状态复位
4. 一键复现无数据集覆盖
   - 返回 status=match，弹出绿色动画 Toast，无差异面板
   - 响应字段结构完全匹配 POST /runs/{id}/reproduce 契约
5. 传入 dataset_overrides 触发漂移
   - status=drift 展示红色抖动动效，右侧滑出差异面板
   - within_tol=false 对比行标红展示新旧差值，within_tol=true 绿色展示；对比条目数量等于 comparisons 数组长度