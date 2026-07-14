# 升级记录

## 2026-07-14：系统托管数据访问与分析失败恢复

### 背景

分析 Agent 曾把上传文件名或 `/data/...` 当作可自行生成的路径，导致内容寻址存储中的真实数据无法读取；失败发生在 SSE 已建立后，前端只能显示不明确的网络错误。

### 升级内容

- 沙箱注入 `load_dataset(index)`，由系统解析宿主机或 Docker 内的内容哈希路径，并自动读取 CSV/XLSX。
- Executor 提示词只允许通过 `load_dataset(index)` 读取数据，不再要求模型构造路径。
- 执行前使用 AST 校验 `load_dataset`、`emit_artifact`、`DATASET_PATHS`、`SEED` 等保留符号，阻止生成代码覆盖系统能力。
- 保留 `DATASET_PATHS[index]` 的只读兼容入口，已有 Run、测试和技能模板可以继续复现。
- 两次代码修复仍失败时，SSE 返回结构化 `error` 事件并保留 Conversation 与 Run；前端显示失败步骤和可重试提示。
- 更新内置通用数据技能，统一使用 `load_dataset(0)`。
- 开放响应模型已有的 `text` Artifact，并把 DataFrame/Series 规范化为带列名与行数据的 JSON，避免表格只保存列名。
- 分析页按标题渲染自然语言、数字和可读表格，原始 JSON 默认折叠；Artifact SSE 同步返回标题。
- 分析过程仅在执行期间显示；完成后对话区只保留用户问题和最终回答，证据成果继续保留在右侧面板与溯源记录中。
- 最终回答必须针对用户当前问题，禁止复述智能体规划、代码、工具输出、重试等内部过程。
- Critic 现在接收数据集 schema 与真实 Artifact 标题和值（带长度限制），避免只看到 stdout 和锚点而生成空泛结论。

### 验证范围

- 无扩展名内容哈希 CSV 的自动加载。
- 系统保留符号覆盖拦截。
- 旧 `DATASET_PATHS` 读取兼容性。
- Executor 提示词与 SSE `error` 契约。
- 后端测试、前端类型检查和生产构建。
