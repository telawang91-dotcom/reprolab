# 〖第 17 份〗 文件路径：tasks/M7-verifier.md

## M7 对抗式校验 Agent 三查（P1）

### 目标

以 "审稿人默认怀疑一切" 的对抗姿态扫描一段结论正文的所有锚点，逐条完成①引用核查②数字溯源③图码一致三查，把挂空 / 挂错 / 图码不符的结论标红并给出可定位的失败原因。

### 前置依赖

M5 溯源 + 复现引擎完整实现（复用账本血缘查询、沙箱干净重放、分类型比对逻辑）；M8 写作文档模块提供 doc_id 富文本为加分项，演示可直接传入纯文本临时测试。

### 上下文加载提示（给 Codex）

开发本卡只需加载：AGENTS.md + 本卡 +（如需精确契约）docs/03-DATA-MODEL.md claims/artifacts/runs/edges/documents 表 + docs/04-API.md POST /verify 接口 + docs/05-PROVENANCE.md §3 三查伪代码、§2.3 比对规则。不要加载其它模块任务卡或整份 docs。

### 涉及数据表

表结构以 docs/03-DATA-MODEL.md §2/§4 为准，不重复 DDL

1. claims：校验目标结论条目；三查全 pass 更新 status=verified，任意校验失败置 flagged；M7 仅更新状态，不新增 / 修改正文文本
2. artifacts：解析⟦art_*⟧锚点，读取 kind、value_json、tol、run_id 做数值、图表校验
3. runs：产物绑定的执行记录，校验 run.status=success；图码一致校验读取 code/seed/env_snapshot 重放
4. edges：血缘边校验，完整链路 Dataset→Run→Artifact→Claim、Claim→Document，链路断裂判定来路不明
5. documents：文献库记录，引用核查读取 DOI、标题、文本块，语义校验文献是否支撑论断

### 涉及接口

#### POST /verify（docs/04-API.md M7 规范）

**请求体**

json









```
{
  "project_id": "string",
  "text?": "结论纯文本",
  "doc_id?": "写作文档ID",
  "checks?": ["citation","number","figure"]
}
```

text 与 doc_id 二选一；checks 不传默认执行全部三项校验

**响应体**

json









```
{
  "verdict": "pass/fail",
  "items": [
    {
      "check": "citation/number/figure",
      "target_anchor": "⟦art_xxxx⟧/⟦src_xxxx⟧/null",
      "verdict": "pass/fail",
      "severity": "warn/error",
      "reason": "失败原因文本",
      "locate": "文本字符偏移/上下文片段，前端标红定位"
    }
  ]
}
```

任意单条 item verdict=fail，顶层总 verdict 强制为 fail

### 相关机制

docs/05-PROVENANCE.md §3 对抗式三查校验规则，Agent 仅校验不生成内容，可路由至强能力大模型

1. §3.1 引用核查

   - 文献库存在该⟦src_xxxx⟧文档
   - DOI 可解析（离线环境降级为 warn，不直接 fail）
   - 强模型语义判断文献文本是否支撑当前论断，杜绝张冠李戴虚假引用

2. §3.2 数字溯源校验

   - 正文所有数值必须绑定合法⟦art_*⟧锚点；无锚点裸数字直接 error 失败，最高优先级
   - 锚点绑定 artifact 必须关联 status=success 的 run 执行记录
   - 正文展示数字与 artifact 存储数值在 tol 容差范围内一致，超出容差判定数字造假
   - 锚点仅绑定标量数值 / 系数，不允许直接引用整张表格

3. §3.3 图码一致校验

   

   读取 run 原始代码、固定种子、环境快照干净重放，复用 §2.3 分类型比对；图表仅对比结构化绘图数据指纹，禁止 PNG 字节比对

### 实现步骤

1. **Schema 层 backend/app/schemas/verify.py**

   

   定义 VerifyRequest、VerifyItem、VerifyResponse；字段与接口契约一一对应

2. **API 层 backend/app/api/verify.py**

   

   注册 POST /verify 路由；仅完成入参校验（text/doc_id 二选一）、调用校验服务、组装标准化响应；无业务逻辑，挂载主路由 main.py

3. **锚点解析工具 backend/app/services/agents/anchors.py**

   

   正则扫描正文文本，提取两类锚点⟦art_xxxx⟧、⟦src_xxxx⟧，记录每个锚点字符偏移 locate；区分带锚点数值、无锚点裸数字，输出结构化列表供给校验

4. **校验核心服务 backend/app/services/agents/verifier.py**

   

   拆分三大独立校验函数，全部复用 M5 账本查询、M4 沙箱重放能力

   - check_citation (claim_text, src_anchor)：查询 document、DOI 解析、ModelAdapter.chat 强模型语义支撑判断（铁律 6：仅调用 ModelAdapter，不直连厂商 SDK）
   - check_numbers (doc_text)：遍历锚点与裸数字，校验锚点存在性、run 执行状态、数值容差匹配
   - check_figure (art)：读取 run 完整执行上下文，干净环境重绘图产物，结构化数据比对

5. **强模型路由控制**

   

   语义支撑判断显式指定高阶强模型（DeepSeek / 混元，预留 Claude 兼容）；system prompt 设定审稿人怀疑视角，输出结构化布尔判断 + 理由

6. **claim 状态回写**

   

   正文可映射至 claims 库记录时，批量更新 status=verified/flagged；纯临时 text 演示场景跳过数据库更新，仅返回校验明细

7. demo 简化约束

   - 离线环境 DOI 解析失败仅标记 warn，不判定 fail 阻断校验
   - 图表重放耗时较长，演示阶段可仅对评委指定图表执行 figure 校验
   - 文献语义校验仅取文献 top-k 文本块输入大模型，不加载全文

### demo 表现

评审演示高光场景：人为在结论正文植入三类错误：不存在的文献引用、无锚点裸数字、篡改与产物不符的数值；点击校验按钮调用 POST /verify；前端按 locate 字段定位标红所有错误文本，弹窗展示失败原因：「裸数字无⟦art_*⟧锚点，来路不明」「引用不在知识库，幻觉引用」「正文数值与产物真实值超出容差」；完整证明项目架构天然拦截虚假数据、虚假引用，保证报告可信。

### 验收 DoD（给定 → 操作 → 期望）

1. 虚假引用校验：正文携带⟦src_xxxx⟧指向库内不存在 document
   - POST /verify 返回 item check=citation，verdict=fail，reason 提示文献不在知识库；顶层 verdict=fail
2. 张冠李戴引用校验：引用存在库内，但文献内容与论断无关
   - citation 项 fail，reason 包含「文献内容不支撑该结论」（强模型语义判定结果）
3. 裸数字拦截校验：正文出现无⟦art_*⟧的纯数字
   - number 类 item fail，target_anchor=null，severity 最高，reason 提示来路不明
4. 数值不匹配校验：锚点合法、run 执行成功，但正文展示数字与 artifact.value 差值超过 tol
   - number 项 fail，reason 输出正文数值与产物真实数值对比
5. 合法数字校验：锚点完整、血缘链路正常、数值在容差内 → number 项 verdict=pass
6. 图表一致性校验：figure 类型 artifact 重放结构化数据匹配 → figure pass；篡改绘图代码造成数值漂移 → figure fail，不因图片渲染差异误判
7. 全量合规校验：正文所有锚点、引用、图表全部校验通过
   - 顶层 verdict=pass
   - 可匹配的 claims 记录 status 更新为 verified