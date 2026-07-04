## 〖第 19 份〗 文件路径：tasks/M7c-reflexion-repair.md

# M7c 反思式自修复循环（Reflexion 式）（P1・算法先进性・评审加权关键）

## 目标

把校验从 "标红就结束" 升级为闭环自修复：校验发现问题 → 结构化反思（哪里错、为什么、怎么改）→ 反馈给执行 / 写作 Agent 自动修正 → 再校验，有限次循环直到三查通过或达上限。理论可引用 Reflexion / Self-Refine。

## 前置依赖

M7 校验（三查 + POST /verify 结构化裁定）；M3 编排（planner/executor/critic）；M8 写作（结论文本载体）。本卡是编排层的闭环增强。

## 上下文加载提示（给 Codex）

开发本卡只需加载：AGENTS.md + 本卡 + tasks/M7-verifier.md（三查产出结构化 fail 项）+ tasks/M3-analysis.md（编排循环）+（如需契约）docs/02-ARCHITECTURE.md §3.1 runAgent + docs/04-API.md 的 POST /verify。不要加载其它模块任务卡或整份 docs。

## 涉及数据表

1. claims：状态流转 `unverified → flagged →（修复后）→ verified`；记录修复次数。

2. 复用 runs/artifacts（修复若需重跑分析走 M4/M5）。不新增表；修复轨迹可存 messages.meta 或 claims 的附加字段（用 JSONB/meta，不改表结构）。

   

   表结构以 docs/03-DATA-MODEL.md 为准。

## 涉及接口

复用 POST /verify（M7）与内部编排；不强制新增端点。可选：POST /verify 增 query `repair=true` 触发自修复循环，返回结构：

json









```
{
  "final_verdict": "pass"|"flagged",
  "iterations": [{"round": 1, "fails": [], "repair_action": ""}],
  "claim_status": "verified"|"flagged"
}
```

修复若需重跑代码 → 内部调 M4 POST /runs；若只改文字引用 → 调写作 / 执行 Agent 重写。

## 相关机制

1. docs/02-ARCHITECTURE.md §3.1 runAgent：修复循环就是在 critic 之后加一条 "反思→修正→再校验" 的回环。
2. 算法核心伪代码 Reflexion / Self-Refine 循环：

python



运行







```
def repair_loop(claim, max_iters=2):
    for i in range(max_iters):
        report = verify(claim)                       # M7 三查
        if report.verdict == "pass":
            return verified(claim)
        # 结构化反思：每个 fail → 原因 + 修改指令
        reflection = build_reflection(report.fails)
        # 执行/写作 Agent 按反思修正
        claim = repair_agent(claim, reflection)
        # 数字类 fail → 用产物真实值替换/重跑
        # 引用类 fail → 换命中且支持的文献或删除该引用
    # 达上限仍未通过，保留标红
    return flagged(claim, last_report)
```

1. 关键约束（对齐铁律）：修复不得凭空造数 —— 数字类问题只能用溯源账本里的真实产物值替换或重新跑分析取值；引用类问题只能改用库内命中且经 M7b 判为支持的文献。修复后必须重新过三查才置 verified。

## 实现步骤

1. `backend/app/services/agents/reflexion.py`
   - 实现 `repair_loop(claim_id, max_iters=2)` 完整伪代码逻辑
   - `build_reflection(fails)`：把 /verify 的 fail 项转结构化修复指令
2. 修复 Agent 复用现有 executor / 写作能力：
   - 数字类 fail：定位 ⟦art_*⟧，使用真实产物订正，或触发 M4 重跑
   - 引用类 fail：调用 M2 检索替换文献，并经过 M7b NLI 复核
3. claims 状态机：`unverified→flagged→verified`，记录 repair_count、每轮 repair_action（存储于 meta JSONB）
4. API 可选扩展：POST /verify?repair=true 暴露闭环入口，返回迭代轨迹给前端
5. 前端（写作面板 / 对话页）：展示 "自动修复中" 轨迹 —— 第 N 轮发现什么、改了什么、再校验结果；最终 pass 显示绿勾，达上限未过则保留标红。
6. demo 简化点：max_iters 默认 2，防死循环；每轮增加超时限制；修复仅覆盖数字 / 引用两类高频问题（图表不匹配仅告警，不自动修复）。

## demo 表现

🎯 现场：给一段含 1 处编造数字 + 1 条张冠李戴引用的草稿 → 运行 "校验并自修复" → 界面逐轮展示：第 1 轮抓出两处 → 反思 → 用真实产物值订正数字、替换为库内支持的引用 → 第 2 轮三查通过、置 verified。体现 "会自我批判并修好自己" 的 agent 算法深度。

## 验收 DoD（给定 → 操作 → 期望）

1. 给定含 1 处 "与产物值不符" 的数字的 claim → 触发自修复 → 循环内用真实产物值订正 → 最终 verify pass、claims.status=verified、repair_count≥1。
2. 给定 1 条张冠李戴引用（M7b 判 neutral）→ 自修复换为命中且支持的库内文献或移除 → 再校验 citation pass。
3. 不造假：断言修复后正文所有数字仍绑定真实 ⟦art_*⟧（经 M7 数字溯源全 pass），无新增来路不明数字。
4. 有限次 + 不静默：无法修复的问题在达 max_iters 后保留标红并上报（status=flagged），不假装通过。
5. 轨迹可见：返回 / 界面能看到每轮 fails 与 repair_action，证明是闭环而非一次性。