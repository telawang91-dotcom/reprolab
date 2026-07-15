import { strict as assert } from "node:assert";
import { readActivities, setActiveProjectId, streamChat } from "./api";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const listeners = new Map<string, Array<(event: Event) => void>>();
Object.defineProperty(globalThis, "window", { value: {
  addEventListener: (name: string, listener: (event: Event) => void) => listeners.set(name, [...(listeners.get(name) ?? []), listener]),
  dispatchEvent: (event: Event) => { for (const listener of listeners.get(event.type) ?? []) listener(event); return true; },
} });
Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage() });
setActiveProjectId("00000000-0000-0000-0000-000000000001");

function sse(body: string) {
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

async function run() {
  globalThis.fetch = (async () => sse("event: done\ndata: {\"conversation_id\":\"c1\"}\n\n")) as typeof fetch;
  const events: string[] = [];
  await streamChat({ message: "计算均值", dataset_ids: ["d1"] }, (event) => events.push(event.event));
  assert.deepEqual(events, ["done"]);
  assert.equal(readActivities()[0].state, "success");

  globalThis.fetch = (async () => sse("event: thinking\ndata: {\"text\":\"处理中\"}\n\n")) as typeof fetch;
  await assert.rejects(
    streamChat({ message: "计算均值", dataset_ids: ["d1"] }, () => undefined),
    /完成前中断/,
  );
  assert.equal(readActivities()[0].state, "error");

  globalThis.fetch = (async () => { throw new DOMException("cancelled", "AbortError"); }) as typeof fetch;
  await assert.rejects(streamChat({ message: "计算均值", dataset_ids: ["d1"] }, () => undefined));
  assert.equal(readActivities()[0].state, "cancelled");
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
