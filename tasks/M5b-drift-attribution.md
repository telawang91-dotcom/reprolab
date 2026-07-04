# 〖第 15 份〗 文件路径：tasks/M5b-drift-attribution.md

## M5b 差异归因 Drift Attribution（P1・算法先进性核心・评审加权关键）

### 目标

当一次复现判定为 drift（结果漂移）时，算法定位是哪些输入维度（数据列 / 行子集 / 参数）导致了目标产物的变化，按贡献度排序输出 —— 把 "结果变了" 升级成 "是 X 变量的这些样本把系数从 0.083 拉到 0.05 的"。

### 前置依赖

M5 溯源引擎 + 一键复现（复用 reproduce、resolve_inputs、compare、sandbox_run 干净重放能力）；归因模块为复现引擎上层算法扩展，不新增独立执行链路。

### 上下文加载提示（给 Codex）

开发本卡只需加载：AGENTS.md + 本卡 + tasks/M5-provenance.md（复用其底层能力）+（如需契约）docs/04-API.md M5b 接口段 + docs/07-SCORING.md §3.2①。不要加载其它模块任务卡或整份 docs。

### 涉及数据表

1. 不新增数据表；归因结果仅作为接口响应输出
2. 可选持久化：归因明细写入对应 artifact.value_json.meta.attribution/suggestions（演示可选，非强制）
3. 只读依赖表：runs /artifacts/datasets（全部复用 M5 读取逻辑）

### 涉及接口

#### POST /runs/{id}/attribute-drift（M5b 新增接口，docs/04-API.md 规范）

**请求体**

json









```
{
  "dataset_overrides": {"旧hash": "新hash"},
  "target_artifact_id?": "指定分析的漂移产物ID",
  "granularity?": "column/rowgroup",
  "top_k?": 5
}
```

**响应体**

json









```
{
  "target_artifact_id": "目标漂移产物ID",
  "baseline": "原始产物数值",
  "drifted": "修改数据集后复现数值",
  "attributions": [
    {
      "dimension": "数据列名/行分组名称",
      "contribution": 0~1归一化贡献度（总和≈1）,
      "direction": "推高/推低",
      "detail": "维度变化详情说明"
    }
  ]
}
```

contribution 代表该维度对产物漂移的贡献占比；direction 描述维度改动对目标数值的偏移方向。

### 相关机制

#### 核心算法：受控消融敏感性归因（demo 轻量化实现，可扩展完整 Shapley）

设定：X_old 原始数据集、X_new 修改后数据集（触发 drift）、v (・) 代表代码执行后目标产物数值

1. 逐维回滚消融：对每个候选维度 d（单列 / 行分组），构造混合数据集 X_new [d→X_old [d]]，其余维度保持新数据集不变
2. 干净环境固定种子重跑得到 v_d
3. 单维度原始贡献值 = abs (v (X_new) - v_d)；回滚 d 后漂移缩小越多，贡献越大
4. 全部维度贡献值归一化至 0~1 区间，按 contribution 降序取 top_k 输出
5. 偏移方向判定：对比 v_d 与 v (X_new) 符号，判定该维度推高 / 推低目标产物

#### 复杂度说明

- column 列粒度：维度数量 × 单次完整重跑；小型数据集（penguins）性能完全满足演示
- rowgroup 行粒度：按分类字段分组，控制分组数量降低重跑次数

#### 扩展说明

演示版本为单维消融近似；正式迭代可升级组合采样近似 Shapley 值提升精度，demo 无需实现

### 实现步骤

1. **归因服务 backend/app/services/lineage/attribution.py**

   

   主函数 

   ```
   attribute_drift(run_id, dataset_overrides, target_artifact_id=None, granularity="column", top_k=5)
   ```

   - 复用 M5 resolve_inputs 解析新旧数据集哈希
   - 遍历所有候选维度执行消融替换，调用 M4 sandbox_run 干净重放（固定种子、隔离环境）
   - 计算单维度原始贡献、归一化、排序截取 top_k
   - 判定每个维度偏移方向，组装归因明细列表返回

2. **Schema 层 backend/app/schemas/attribution.py**

   

   定义 AttributeRequest、Attribution 明细结构、AttributeResponse，严格对齐接口返回字段

3. **接口扩展 backend/app/api/lineage.py**

   

   新增 POST /runs/{id}/attribute-drift 路由；api 层仅参数校验、异常捕获，算法逻辑下沉 attribution 服务

4. **前端适配**：溯源 / 分析页面漂移提示区新增归因入口，用条形图可视化 top_k 维度贡献度；点击维度展开详情说明；接口请求后台执行，前端展示加载进度

### demo 简化点

1. 仅复现判定 drift 时开放归因入口，无漂移场景隐藏入口
2. 默认优先 column 列粒度（直观易懂，评审展示优先）
3. 重跑任务使用 FastAPI BackgroundTasks 后台执行，前端展示进度条
4. rowgroup 行粒度仅支持已有分类字段分组，不自动分箱

### demo 表现

进阶标杆演示：替换修改后的企鹅数据集触发系数漂移；点击「为什么变了」触发归因接口；页面渲染贡献度条形图，展示 body_mass_g 列贡献 72%、整体将回归系数推低；一句话定位漂移根因，体现项目算法先进性，作为答辩核心加分功能。

### 验收 DoD（给定 → 操作 → 期望）

1. 完整漂移场景校验：penguins→penguins_modified 数据集替换，目标系数产物触发 drift；调用 attribute-drift granularity=column
   - attributions 数组非空，按 contribution 降序排列
   - 全部维度 contribution 总和≈1，误差 ±0.05 以内
2. 归因正确性校验：仅人为修改数据集单一列，其余字段完全不变
   - 该修改列 contribution 数值远高于其他列，贡献占比超过所有其他列总和
3. 偏移方向校验：单列修改使目标数值下降 → attribution.direction 标记为「推低」
4. 底层复用校验：归因所有重跑逻辑统一调用 M5 封装 sandbox_run，生成 run_id 可在 runs 表查询，无独立执行代码路径
5. 无漂移拦截校验：不替换数据集直接复现（status=match），归因接口返回空 attributions 列表，不误报根因