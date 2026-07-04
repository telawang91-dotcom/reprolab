## 〖第 23 份〗 文件路径：tasks/M11-skills.md

# M11 学科技能包（P2）

## 目标

把 "跑通的分析流程" 固化为可复用、可注册的学科技能包（工具 + 提示词 + 渲染器 / 脚本模板），并做到 "换学科 = 装包"：新学科只需注册一个技能包即可复用同一套编排与溯源能力。

⚠️ 定位铁律（对齐 AGENTS.md §2.8）：技能包是可选的加速模板，不是分析的必经路径。基础的数据分析能力由 M3 执行 Agent 动态生成代码完成，本就通用、学科无关；没有技能包也能做任何分析。技能包只是把某类常见分析做得更快更稳，严禁因为本模块把分析实现成 "固定学科菜单"。

## 前置依赖

M3 对话分析（技能包在分析编排中被选用 / 执行；固化时的 "跑通流程" 来自 M3 → M5 的产物）。

## 上下文加载提示（给 Codex）

开发本卡只需加载：AGENTS.md + 本卡 +（如需精确契约）docs/03-DATA-MODEL.md 的 skills 表 /docs/04-API.md 的 GET,POST /skills/docs/05-PROVENANCE.md §5「长期记忆三层」的 "技能" 行。不要加载其它模块任务卡或整份 docs。

## 涉及数据表

skills（本模块唯一负责表）

字段：name（技能名称）、discipline（学科筛选标签）、template（代码 / 提示词模板骨架）、meta（JSONB：工具列表、渲染标识、参数占位、来源 run_id）

表结构以 docs/03-DATA-MODEL.md 为准，不重复 DDL。

## 涉及接口

### GET /skills

查询参数：project_id（可选）、discipline（可选过滤学科）

前端技能库面板、编排流程选包调用，返回技能基础摘要列表（id/name/discipline/meta）

### POST /skills

请求体：project_id、name、discipline、template、meta（可选）

能力：

1. 手动注册全新学科技能包

2. 从已跑通的 M3 run 自动固化生成技能包

   

   契约对齐 docs/04-API.md「M11 技能包」，接口字段与数据表列名完全一致。

## 相关机制

docs/05-PROVENANCE.md §5「长期记忆三层」：

- memories.skill 层仅为候选记忆文本；可固化执行流程统一存储在 skills 表，与 episodic/semantic 记忆分层隔离
- 技能固化来源 run_id 存储于 meta，全程绑定溯源账本，无来路不明脚本模板

## 实现步骤

### 后端新增目录：backend/app/services/skills/（与 memory/agents 同级）

1. registry.py 插件注册表

   - SkillPack 数据结构定义：name /discipline/tools [] /prompt_template/renderer /code_template
   - 方法：register (pack)、list (discipline=None)、get (id)
   - 应用启动自动 upsert 内置技能包，库无同名记录则新增

2. builtin/general_ds.py 内置通用数据科学技能包（demo 必备）

   

   模板内容：描述统计 + 分组箱线图 + 显著性检验完整 Python 骨架，含数据集读取、计算、绘图产出 artifact 占位符；配套提示词模板、图表渲染标识

   

   额外提供 1 个生物 / 材料学科示例包，演示「切换学科」能力

3. Schema `backend/app/schemas/skills.py`

   - SkillCreate：POST 注册入参

   - SkillRead：接口返回结构体

     

     meta 使用可选字典类型

4. Model `backend/app/models/skills.py` skills 表 ORM 映射；无表则新增 Alembic 迁移脚本，禁止手动改库

5. API `backend/app/api/skills.py`

   - GET /skills：合并注册表内存数据 + 数据库持久化记录，支持学科过滤

   - POST /skills：参数校验、落库，携带 run_id 则写入 meta.source_run_id

     

     API 层仅做 I/O 转发，业务逻辑下沉 service

6. harvest.py 流程固化工具：`from_run(run_id) -> SkillCreate`

   

   从成功执行的 M3 run 抽取完整代码模板、参数配置、渲染规则，生成可注册技能包，meta 记录原始 run 溯源 id；对接 M9 记忆技能层候选文本

### 前端

1. 分析页面侧边栏新增 `components/skills/SkillPanel.tsx` 技能库面板
2. 按 discipline 分组展示技能卡片，点击一键注入当前编排流程
3. 顶部学科切换下拉框，筛选对应学科技能包，演示「换学科 = 装包」扩展能力
4. `frontend/lib/api.ts` 封装 skills 接口请求

### demo 简化点

技能插件仅 Python 模块启动注册，无动态热插拔、独立进程隔离；tools 复用 M4 沙箱现有工具集，不新增运行时；多租户简化，仅按 project_id 做数据隔离。

## demo 表现

1. 分析页技能库默认加载通用数据科学包，一键调用自动生成箱线图 + 显著性检验，产物自带完整溯源锚点。
2. 🎯 高光动作「换学科 = 装包」：下拉切换生物 / 材料学科，或调用 POST /skills 注册新学科包，面板立刻加载对应领域技能；底层编排、溯源、校验逻辑完全不变，无需修改核心代码即可适配新学科分析任务。

## 验收 DoD（给定 → 操作 → 期望）

1. 空技能库启动后端，GET /skills 至少返回 1 个内置通用数据科学技能包，discipline、template 字段非空。
2. 已成功执行的 M3 run，调用 harvest.from_run 或 POST /skills 固化技能，GET /skills 可查询，meta.source_run_id 与原始 run 一致。
3. POST /skills 注册 discipline="biology" 技能包，GET /skills?discipline=biology 仅返回该学科包，通用包不混入结果。
4. 前端选中技能包应用至分析编排，执行后产物完整写入溯源账本，数字绑定 dataset→run→artifact 全链路，无裸数字。
5. 接口请求、返回字段与 skills 数据表列名完全对齐，无自定义私有字段。