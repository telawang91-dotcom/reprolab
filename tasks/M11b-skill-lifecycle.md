# M11b 技能生命周期（P1）

## 目标

把一次成功分析的产物固化为用户技能：保存时提炼“意图 + 输入角色 + 参数化代码模板”，换数据时只做字段角色映射并直接复用模板，减少从零规划与生成代码的 token。复用必须重新进入 M4 沙箱并由 M5 登记全新 run/artifact/edge，禁止复制旧产物。

技能可导出为带版本与内容哈希的 JSON 包、从 SkillHub 目录或文件导入，并通过 REST 被其他 Agent 调用。字段映射只允许调用 `ModelAdapter`；映射不完整或不可信时回退 M3 动态分析。

## 增量约束

- 保留 `skills` 旧列、`GET/POST /skills` 行为和 `registry.py`、`harvest.from_run` 签名。
- 新迁移只对 `skills` 执行 `ADD COLUMN`。
- 新增 `harvest.from_artifact`、`apply.py`、`exchange.py`、`hub.py`。
- 不引入 Celery、Redis、MinIO；SkillHub demo 使用可替换的本地目录适配器。

## 数据表

`skills` 新增：

- `intent TEXT NOT NULL DEFAULT ''`：用户可读的复用意图。
- `input_roles JSONB NOT NULL DEFAULT '{}'`：角色定义、原始列及类型提示。
- `version INTEGER NOT NULL DEFAULT 1`：交换包格式内的技能版本。
- `origin TEXT NOT NULL DEFAULT 'local'`：`local | builtin | imported | hub`。
- `package_hash TEXT`：导入包的规范化 SHA-256；本地技能可空。

## 接口

- `POST /skills/from-artifact`：由成功 artifact 固化技能。
- `POST /skills/{skill_id}/apply`：模型映射字段、渲染模板、沙箱执行；失败回退 M3。
- `GET /skills/{skill_id}/export`：导出版本化 JSON 包。
- `POST /skills/import`：校验哈希并导入 JSON 包。
- `GET /skills/hub`：查询 SkillHub 目录。
- `POST /skills/hub/{hub_id}/import`：导入目录技能。

## 实现步骤

1. 保存：从 artifact 反查成功 run 和输入数据 schema；`ModelAdapter` 把代码参数化为 `{{role}}` 占位模板，并产出角色契约。
2. 应用：`ModelAdapter` 根据新数据 schema 返回角色→真实列名映射；服务端校验列存在后替换占位符。
3. 执行：调用现有 `run_with_retry`，返回新 run、artifact、字段映射与 token 节省估算。
4. 回退：映射缺失、列不存在或置信度不足时，携带技能意图调用现有 `run_chat` 动态编排。
5. 交换：规范 JSON 序列化并计算 SHA-256；导入时校验格式、版本、哈希和模板角色一致性。
6. 前端：在现有技能库增加我的技能、应用、导入、导出、SkillHub；在产物卡增加“存为我的技能”；展示节省 token 与回退状态。

## 验收 DoD

1. 旧 M11 测试和 `GET/POST /skills` 继续通过。
2. 成功 artifact 可固化，且 `source_run_id/source_artifact_id` 可追溯。
3. 新数据列名变化时，应用接口只经 `ModelAdapter` 完成字段映射并产生新 run；新 artifact 血缘完整。
4. 无法完成映射时不执行半成品模板，自动回退 M3。
5. 应用响应包含映射 token、估算基线和节省 token。
6. 导出→导入往返保持模板、意图、角色和版本；篡改包被拒绝。
7. SkillHub 技能可导入当前项目；其他 Agent 可直接调用 apply REST。
8. 后端测试、前端 typecheck/build 通过。
