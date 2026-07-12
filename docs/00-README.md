# 00・README：文档索引与 Codex 使用规则

这套文档是 ReproLab 的唯一事实来源。它被刻意拆成多个文件，目的是让编码 AI（Codex/Claude Code）每次只加载少量内容，避免上下文过长。

### 🤖 给编码 AI 的加载规则（重要）

不要一次性读入全部文档。 按下面的最小集加载：

表格







|           你在做什么           |                         加载什么                         |     不要加载     |
| :----------------------------: | :------------------------------------------------------: | :--------------: |
|        任何任务（常驻）        |                        AGENTS.md                         |        —         |
|          开发某个模块          |              AGENTS.md + tasks/<该模块>.md               | 其它模块的任务卡 |
| 任务卡里说 "涉及 XX 表 / 接口" | 只读 docs/03-DATA-MODEL.md/docs/04-API.md 里对应的那几段 | 整份 schema/api  |
|     实现溯源 / 复现 / 校验     |                加读 docs/05-PROVENANCE.md                |        —         |
|           写前端页面           |              加读 docs/06-DESIGN.md 对应页               |        —         |

每张任务卡都自包含：它会写清楚 "要做什么、引用哪几张表、哪几条接口、验收标准"。你几乎只靠 AGENTS.md + 一张任务卡就能开工；需要精确契约时才去查 docs/ 的对应片段。

冲突处理：任务卡与 docs/ 不一致时，以 docs/ 为准，并提示人类修正文档。

### 📖 给人类的阅读顺序

1. docs/01-PRD.md —— 想清楚：做什么、为什么、范围与优先级、竞品差异。
2. docs/02-ARCHITECTURE.md —— 定架构：四层结构 + 技术核心（这是路演要讲的）。
3. docs/07-SCORING.md —— 评审对齐：四维权重（科学价值 / 技术深度各 30%）+ 如何精准命中 + 算法增强。决定往哪使劲，务必先读。
4. docs/05-PROVENANCE.md —— 招牌机制深挖：溯源账本、复现引擎、对抗式质检（路演技术亮点）。
5. docs/03-DATA-MODEL.md/docs/04-API.md —— 契约参考，随用随查。
6. docs/06-DESIGN.md —— UI 规范。
7. docs/08-AGENT-DESIGN.md —— 智能体角色、编排、模型路由、错误恢复与扩展设计。
8. tasks/ —— 逐模块施工。

### 🗂 目录结构（monorepo）

plaintext









```
reprolab/
├── AGENTS.md                  # 常驻规范（每次都读）
├── docs/                      # 参考手册（按需查）
│   ├── 00-README.md
│   ├── 01-PRD.md
│   ├── 02-ARCHITECTURE.md
│   ├── 03-DATA-MODEL.md
│   ├── 04-API.md
│   ├── 05-PROVENANCE.md
│   ├── 06-DESIGN.md
│   ├── 07-SCORING.md          # 评审对齐（四维权重 → 机制/抓手；技术深度算法增强）
│   └── 08-AGENT-DESIGN.md     # 智能体详细设计与当前实现边界
├── tasks/                     # 逐张任务卡（每次做一张）
│   ├── M1-ingest.md ... M11-skills.md, M-Platform.md
│   ├── M5b-drift-attribution.md   # 算法增强(P1)：差异归因，扩展 M5
│   ├── M0-product-quality-gate.md # P0：全站可诊断、可恢复与可信状态门禁
│   ├── M12-project-workspaces.md  # P1：研究项目隔离与工作区切换
│   ├── M7b-citation-nli.md        # 算法增强(P1)：引用支持度 NLI，强化 M7
│   └── M7c-reflexion-repair.md    # 算法增强(P1)：反思式自修复，编排闭环
├── docker-compose.yml         # 只有一个 postgres+pgvector 容器（+可选沙箱镜像）
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/               # documents.py search.py chat.py runs.py lineage.py verify.py ...
│   │   ├── core/              # config.py db.py deps.py
│   │   ├── models/            # SQLAlchemy 表
│   │   ├── schemas/           # Pydantic 契约
│   │   └── services/
│   │       ├── rag/           # 入库/检索
│   │       ├── sandbox/       # 执行沙箱
│   │       ├── lineage/       # 溯源引擎 + 复现
│   │       ├── agents/        # 编排 + ModelAdapter + 校验
│   │       ├── memory/
│   │       └── suggest/
│   ├── requirements.txt
│   ├── alembic/
│   └── storage/               # 内容寻址本地对象存储：<sha256>
└── frontend/
    ├── app/                   # Next.js 页面
    ├── components/            # shadcn/ui 封装 + 业务组件
    └── lib/                   # api client、类型
```

### 优先级图例（贯穿所有文档）

- P0：demo 必做闭环，不做无法演示。
- P1：拿高分 / 讲故事的高光功能。
- P2：有余力再做。
- 🎯 标记 = demo 现场高光动作。
