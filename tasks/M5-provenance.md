# 〖第 14 份〗 文件路径：tasks/M5-provenance.md

## M5 溯源引擎 + 一键复现（P0，招牌）

### 目标

让每次代码执行都自动登记到溯源账本（runs/artifacts/edges/env_snapshots，内容寻址），提供产物溯源 DAG 查询，并实现「一键复现」：干净环境重放 + 固定种子 + 分类型容差比对，返回 match/drift 及逐产物 diff—— 改数据即可现场标红漂移。

### 前置依赖

M4 代码执行沙箱（提供 sandbox_run (code, inputs, seed, env)、pip freeze、产物 / 图捕获能力）；M5 复用 M4 底层执行能力，账本登记、血缘建边逻辑下沉至本模块 lineage service，由 M4 POST /runs 内部调用。

### 上下文加载提示（给 Codex）

开发本卡只需加载：AGENTS.md + 本卡 +（如需精确契约）docs/03-DATA-MODEL.md §4（runs /artifacts/edges /env_snapshots）与 §2（datasets）/docs/04-API.md M5 接口段 /docs/05-PROVENANCE.md §1（账本）与 §2（复现引擎）。不要加载其它模块任务卡或整份 docs。

### 涉及数据表

表结构以 docs/03-DATA-MODEL.md §4/§2 为准，不重复 DDL

1. env_snapshots（读写）：存储 Python 版本、依赖包列表、env_hash；同哈希复用存量记录
2. runs（读写）：不可变执行记录，存储 code_hash/input_hash/env_hash/seed/stdout/status
3. artifacts（读写）：结构化产物（数值 / 系数 / 表格 / 图表），value_json 存数值，图表文件绑定 content_hash，支持自定义容差 tol
4. edges（读写）：统一血缘关系边表，关系类型 reads/produces/supports/cites，构建完整 DAG
5. datasets（只读）：通过 storage_hash 解析输入数据集；dataset_overrides 使用旧哈希映射新哈希替换输入源

### 涉及接口

契约见 docs/04-API.md M5 章节

1. **GET /artifacts/{id}/lineage**

   

   返回产物完整溯源 DAG

   json

   

   

   

   

   ```
   {
     "nodes": [{"id": "节点ID", "type": "dataset/run/artifact/claim/document", "label": "展示名称", "meta": {哈希/时间/版本等元数据}}],
     "edges": [{"from": "起点ID", "to": "终点ID", "relation": "reads/produces/supports/cites"}]
   }
   ```

   遍历逻辑：从 artifact 反向追溯 run→dataset，正向延伸至 claim/document

2. **POST /runs/{id}/reproduce 一键复现**

   

   请求体

   json

   

   

   

   

   ```
   {
     "dataset_overrides?": {"旧数据集storage_hash": "新数据集storage_hash"}
   }
   ```

   响应体

   json

   

   

   

   

   ```
   {
     "status": "match/drift",
     "comparisons": [
       {
         "artifact_id": "产物ID",
         "kind": "产物类型",
         "old": "原始值",
         "new": "复现新值",
         "within_tol": true/false,
         "diff": "差值/差异详情"
       }
     ],
     "new_run_id": "复现执行生成的runID"
   }
   ```

3. 内部账本登记逻辑：无对外新增接口，封装为 lineage service 内部函数，供 M4 调用

### 相关机制

1. docs/05-PROVENANCE.md §1 溯源账本实体模型

   

   四层实体链路：Dataset →reads→ Run →produces→ Artifact →supports→ Claim；Claim 可 cites→Document 文献；全部关联关系统一存入 edges 表；信任锚点 code_hash 必须包含 env_hash，环境 / 数据 / 代码任一变化哈希变更。

2. docs/05-PROVENANCE.md §2 复现引擎规则

   - 重放前置：固定随机种子 runs.seed，完整注入所有随机库种子
   - 分类型比对规则：
     - number/coefficient：相对容差 `abs(new-old) <= tol*max(1,abs(old))`，默认 tol=1e-6，演示场景可放宽至 1e-3
     - table：逐单元格数值容差比对
     - figure：对比 value_json 内结构化绘图数据、统计指纹；禁止直接比对 PNG 字节哈希（时间戳、字体、渲染后端会造成无意义差异）
   - 全部产物 within_tol=true 返回 match；任意产物超出容差返回 drift，并输出逐行 diff

### 实现步骤

1. **数据模型层 backend/app/models/**

   

   新建 SQLAlchemy 映射文件 env_snapshots.py、runs.py、artifacts.py、edges.py；datasets 复用 M1 模块模型；通过 Alembic 生成数据库迁移脚本，禁止手动修改数据表。

2. **Schema 层 backend/app/schemas/lineage.py**

   

   定义：LineageNode、LineageEdge、LineageResponse、ReproduceRequest、Comparison、ReproduceResponse，字段完全对齐接口契约。

3. **哈希工具 backend/app/services/lineage/hashing.py**

   

   唯一全局实现 env_hash /input_hash/code_hash 三函数，公式逐字遵循 §1.2，全项目统一调用，禁止重复实现。

4. **账本服务 backend/app/services/lineage/ledger.py**

   - register_run (project_id, code, lang, dataset_ids, seed, exec_result)：执行完成后批量写入 env_snapshots、runs、artifacts、血缘 edges
   - get_lineage (artifact_id)：从目标产物反向 BFS 遍历 edges，组装 DAG 节点与边，补充展示标签、哈希元数据
   - artifacts_of (run_id)：查询单次执行所有产物
   - resolve_inputs (run, overrides)：根据 dataset_overrides 替换输入数据集哈希，用于漂移复现

5. **复现引擎 backend/app/services/lineage/reproduce.py**

   

   实现

   ```
   reproduce(run_id, dataset_overrides)
   ```

   完整流程：

   

   resolve_inputs 获取新旧数据集 → 调用 M4 sandbox_run 干净环境重放（固定种子 + 原始环境快照）→ 遍历原始产物调用 compare 做差异比对

6. **比对工具 backend/app/services/lineage/compare.py**

   

   分类型实现 compare_number/compare_table/compare_figure_data；图表仅比对结构化数值指纹，不读取图片二进制；tol 优先取 artifact 自定义容差，无配置使用 DEFAULT_TOL=1e-6

7. **接口层 backend/app/api/lineage.py**

   

   实现 GET /artifacts/{id}/lineage、POST /runs/{id}/reproduce；仅参数校验、异常捕获、响应组装，业务逻辑下沉 service；统一错误返回格式

   ```
   {"error":{"code":"xxx","message":"xxx"}}
   ```

8. demo 简化约束

   - 干净环境重放复用固定 Docker 镜像，不动态重建独立 venv；仅记录并比对 env_hash，环境不一致在响应 meta 告警
   - 异步不引入 Celery/Redis，使用 FastAPI BackgroundTasks 后台执行复现
   - compare_figure_data 仅对比核心统计量（分位数、回归系数），无需完整绘图元数据校验

### demo 表现

标杆演示流程：已有企鹅数据集回归产物系数 0.083（携带⟦art_*⟧锚点）；调用 POST /runs/{id}/reproduce，传入 dataset_overrides 替换修改后的数据集哈希；系统干净环境固定种子重跑，新系数超出容差，接口返回 status:"drift"，comparisons 数组展示新旧数值差值；前端将漂移产物标红展示 diff。不替换数据集直接复现稳定返回 match。点击产物锚点可打开溯源 DAG 图谱，完整展示「数值产物←执行代码←原始数据集」完整链路。

### 验收 DoD（给定 → 操作 → 期望）

1. 账本完整登记校验：单次执行读取 1 个 dataset，产出 1 个 coefficient 数值产物，调用 POST /runs 触发 register_run
   - runs/artifacts/env_snapshots 各新增一条记录
   - edges 表存在 dataset→run (reads)、run→artifact (produces) 两条血缘边
   - code_hash 长度 64 位 sha256，代码 / 输入数据集 / 依赖环境任一修改，哈希值变更
2. 环境纳入哈希校验：代码、数据集完全相同，仅 pip 依赖包列表变更 → env_hash 不同 → code_hash 不同，证明环境已纳入信任锚点
3. 溯源 DAG 校验：传入有效 artifact_id 调用 GET /artifacts/{id}/lineage
   - 返回至少 3 类节点：artifact/run/dataset，2 条合法 relation 边
   - nodes/edges 数量与底层 edges 表记录完全匹配
4. 复现 match 校验：POST /runs/{id}/reproduce 不传 dataset_overrides
   - status="match"，所有 comparisons within_tol=true
   - 返回全新 new_run_id，复现执行落库 runs 表
5. 漂移 drift 标杆校验：dataset_overrides 指向修改后数据集，数值超出容差
   - status="drift"，对应 comparison within_tol=false，diff 字段输出新旧差值
6. 图表防误报校验：包含 figure 产物的 run 连续两次无修改复现
   - figure 比对 within_tol 恒为 true，不会因 PNG 渲染字节差异判定漂移；代码不调用 content_hash 逐字节对比图片