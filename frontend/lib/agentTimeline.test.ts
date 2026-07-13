import { strict as assert } from "node:assert";
import type { ChatEvent } from "./api";
import { reduceAgentTimeline } from "./agentTimeline";

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
  assert.deepEqual(result, { steps: [] });
}

console.log("agentTimeline: 4 cases passed");
