## 〖第 18 份〗 文件路径：tasks/M7b-citation-nli.md

# M7b 引用支持度检测（NLI / 蕴含判断）（P1・算法先进性・评审加权关键）

## 目标

把三查中 "文献是否真支持该论断" 这一步从含糊的语义判断升级为算法化的 claim–source 蕴含判断（NLI）：判定被引文献对正文论断是 entailment（支持）/neutral（不相关）/contradiction（矛盾），专抓 "引用真实但内容不支持" 的张冠李戴。

## 前置依赖

M7 校验 Agent（提供三查框架与 POST /verify）；M1/M2（取被引文献的相关段落）。本卡强化 M7 的引用核查第 3 步。

## 上下文加载提示（给 Codex）

开发本卡只需加载：AGENTS.md + 本卡 + tasks/M7-verifier.md（三查框架，本卡替换其 "语义支持" 步）+（如需契约）docs/05-PROVENANCE.md §3.1 引用核查 + docs/04-API.md 的 POST /verify + docs/07-SCORING.md §3.2②。不要加载其它模块任务卡或整份 docs。

## 涉及数据表

只读 documents（被引文献元数据）、chunks（取文献相关段落做证据）、claims（论断文本）。不新增表。

结果不单独建表，作为 /verify 响应 item 的扩展字段返回（见下）。表结构以 docs/03-DATA-MODEL.md 为准。

## 涉及接口

扩展 POST /verify（不新增端点，见 docs/04-API.md）：citation 类检查项的返回 item 增加：

json









```
{
  ...,
  "label": "entailment"|"neutral"|"contradiction",
  "support_score": 0..1,
  "evidence_span": ""
}
```

entailment 且 support_score ≥ 阈值 → pass；neutral/contradiction → fail（"文献不支持该论断，疑似张冠李戴"）。

## 相关机制

1. docs/05-PROVENANCE.md §3.1 引用核查：本卡实现其第 3 步 semantically_supports (src, claim_text)，从 "含糊判断" 升级为结构化蕴含判断。
2. 算法核心 = 自然语言推理（NLI）：给定前提 = 被引文献相关段落（premise），假设 = 正文论断（hypothesis），判 entailment /neutral/contradiction。
3. 落地二选一：
   - NLI 模型：接一个中英文 NLI/cross-encoder（如 bge 系列或多语 NLI 模型），输出三类概率。
   - 结构化 LLM-as-judge（demo 更省）：用强模型（编排 / 质检档），强制 JSON 输出 `{label, support_score, evidence_span, reason}`，prompt 要求 "仅依据给定段落判断，不得引入外部知识"。
4. 证据段落获取：用被引 document_id + 论断文本走 M2 检索，取该文献内最相关的 1–3 个 chunk 作为 premise（附 evidence_span 定位）。

## 实现步骤

1. 新建文件 `backend/app/services/agents/nli.py`

   python

   

   运行

   

   

   

   ```
   def judge_support(claim_text, document_id) -> dict:
       """输出 {label, support_score, evidence_span}"""
       pass
   ```

2. 接入 M7 引用核查：在 `services/agents/verifier.py` 的 check_citation 第 3 步调用 judge_support，据 label/support_score 给 pass/fail 与 reason。

3. `backend/app/schemas/verify.py`：给 citation item 增 label /support_score/evidence_span 字段（对齐 04-API 扩展）。

4. 阈值可配置（config），默认 `support_score ≥ 0.6 且 label==entailment` 判支持。

5. 前端：标红的引用锚点 tooltip 显示判定（如 "文献不支持该论断（neutral，0.21）"）+ 可展开证据段落。

6. demo 简化点：优先 LLM-as-judge（无需部署 NLI 模型、结果可解释）；证据段落取 top-1 即可；contradiction 与 neutral 都归为 fail 但 reason 区分。

## demo 表现

🎯 找茬升级：正文引用了库内一篇真实存在但主题不符的文献来支撑某论断 → 校验 NLI 判 neutral/contradiction → 标红 "文献存在但内容不支持该论断（张冠李戴）"，并展开它比对的原文证据段落。体现 "抓幻觉" 是算法（蕴含判断）而非关键词匹配。

## 验收 DoD（给定 → 操作 → 期望）

1. 给定一条论断 + 一篇真正支持它的库内文献引用 → /verify citation item 返回 label=entailment、support_score≥0.6、pass，且 evidence_span 指向文献内相关段落。
2. 张冠李戴：给定论断 + 一篇真实但不支持的文献引用 → 返回 neutral 或 contradiction、fail、reason 含 "内容不支持 / 张冠李戴"。
3. 幻觉引用（库内不存在）仍由 M7 第 1 步拦截（本卡不回归破坏该行为）。
4. 证据可溯：每个 citation 判定都带可点击的 evidence_span（定位到 chunk 的 section/position）。
5. 阈值生效：调低阈值配置后，边界样例判定随之变化（证明是打分而非硬编码）。