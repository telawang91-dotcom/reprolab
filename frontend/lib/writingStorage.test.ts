import assert from "node:assert/strict";
import { normalizeWritingDraft, readWritingState, writingKeys, writingTemplate } from "./writingStorage";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  get length() { return this.values.size; }
}

Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });

assert.equal(normalizeWritingDraft(null), writingTemplate);
assert.equal(normalizeWritingDraft("# 自己的报告"), "# 自己的报告");
assert.match(normalizeWritingDraft("# 研究结论\n在此撰写带可追溯锚点的结论。\n结果 ⟦art_abcd⟧"), /⟦art_abcd⟧/);
assert.doesNotMatch(normalizeWritingDraft("行内公式示例：$\\beta = 0.083$"), /0\.083/);

localStorage.setItem("reprolab-writing-draft", "不应跨项目导入的旧草稿");
const project = "project-a";
const state = readWritingState(project);
assert.equal(state.draft, writingTemplate);
assert.equal(localStorage.getItem(writingKeys(project).draft), writingTemplate);
assert.notEqual(state.draft, "不应跨项目导入的旧草稿");

console.log("writing storage checks passed");
