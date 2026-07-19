import { strict as assert } from "node:assert";
import type { ChatEvent } from "./api";
import { reduceAgentTimeline, terminalConversationMessage } from "./agentTimeline";

const event = (name: ChatEvent["event"], data: Record<string, unknown>): ChatEvent => ({ event: name, data });

{
  const result = reduceAgentTimeline([event("plan", { steps: [{ title: "读取数据" }, { title: "绘图" }] }), event("code", { code: "print(1)" }), event("run", { status: "success", run_id: "r1" }), event("code", { code: "print(2)" }), event("run", { status: "success", run_id: "r2" })]);
  assert.equal(result.steps.length, 2); assert.equal(result.steps[0].status, "success"); assert.equal(result.steps[1].status, "success");
}
{
  const result = reduceAgentTimeline([event("plan", { steps: [{ title: "建模" }] }), event("code", { code: "bad" }), event("run", { status: "error", stdout: "boom" }), event("thinking", { text: "修正字段类型" }), event("code", { code: "fixed" }), event("run", { status: "success" })]);
  assert.equal(result.steps[0].attempts.length, 2); assert.equal(result.steps[0].attempts[0].status, "error"); assert.equal(result.steps[0].status, "success");
}
{
  const result = reduceAgentTimeline([event("code", { code: "reused()", reused: true }), event("run", { status: "success" })]);
  assert.equal(result.steps.length, 1); assert.equal(result.steps[0].implicit, true);
}
{
  const result = reduceAgentTimeline([{ event: "mystery", data: { anything: true } } as unknown as ChatEvent, null as unknown as ChatEvent]);
  assert.deepEqual(result, { steps: [], questions: [], contexts: [], conclusions: [] });
}
{
  const result = reduceAgentTimeline([event("context", { tools: [
    { name: "memory.search", label: "检索项目记忆", status: "used", detail: "召回 1 条", count: 1, items: [{ id: "m1", content: "优先使用稳健检验", layer: "semantic" }] },
  ] })]);
  assert.equal(result.contexts[0].tools[0].name, "memory.search");
  assert.equal(result.contexts[0].tools[0].items?.[0].content, "优先使用稳健检验");
}
{
  const result = reduceAgentTimeline([
    event("message", { text: "有哪些资料", user: true }),
    event("context", { tools: [{ name: "file.scope", label: "读取文件夹", status: "used", detail: "2 份", count: 2 }] }),
    event("thinking", { text: "正在结合文件清单组织回答" }),
    event("message", { text: "共有两份资料" }),
  ]);
  assert.equal(result.steps.length, 0);
  assert.equal(result.conclusion?.text, "共有两份资料");
}
{
  const result = reduceAgentTimeline([
    event("message", { text: "第一个问题", user: true }),
    event("plan", { steps: [{ title: "第一轮" }] }),
    event("code", { code: "one()" }),
    event("run", { status: "success" }),
    event("message", { text: "第一轮结论" }),
    event("message", { text: "第二个问题", user: true }),
    event("plan", { steps: [{ title: "第二轮" }] }),
    event("code", { code: "two()" }),
    event("run", { status: "success" }),
    event("message", { text: "第二轮结论" }),
  ]);
  assert.equal(result.steps.length, 2);
  assert.deepEqual(result.conclusions.map((item) => item.text), ["第一轮结论", "第二轮结论"]);
  assert.deepEqual(result.conclusions.map((item) => item.question), ["第一个问题", "第二个问题"]);
  assert.deepEqual(result.conclusions.map((item) => item.status), ["complete", "complete"]);
}
{
  const result = reduceAgentTimeline([
    event("message", { text: "问题", user: true }),
    event("message", { text: "部分报告", status: "partial" }),
  ]);
  assert.equal(result.conclusion?.status, "partial");
}
{
  const fallback = terminalConversationMessage("连接中断");
  const result = reduceAgentTimeline([
    event("message", { text: "问题", user: true }),
    fallback,
  ]);
  assert.equal(result.conclusion?.status, "partial");
  assert.match(result.conclusion?.text ?? "", /连接中断/);
}

console.log("agentTimeline: 9 cases passed");
