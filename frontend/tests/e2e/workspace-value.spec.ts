import { expect, test } from "@playwright/test";

const projectId = "00000000-0000-0000-0000-000000000201";
const collectionId = "00000000-0000-0000-0000-000000000202";
const runtime = {
  state: "ready",
  summary: "运行环境已就绪",
  components: [
    { key: "database", title: "数据库", state: "ready", message: "可用", action: null },
    { key: "model", title: "模型", state: "ready", message: "可用", action: null },
    { key: "sandbox", title: "沙箱", state: "ready", message: "可用", action: null },
  ],
};
const project = { id: projectId, name: "真实研究", description: null, archived_at: null, created_at: "2026-07-15T00:00:00Z" };
const documents = [
  { id: "d1", type: "other", filename: "experiment.csv", title: null, year: null, created_at: "2026-07-15T00:00:00Z", collection_id: null },
  { id: "d2", type: "paper", filename: "methods.pdf", title: "实验方法", year: 2026, created_at: "2026-07-15T00:00:00Z", collection_id: null },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ id }) => localStorage.setItem("reprolab-active-project", id), { id: projectId });
  await page.route("**/api/v1/settings/runtime", (route) => route.fulfill({ json: runtime }));
  await page.route("**/api/v1/projects?*", (route) => route.fulfill({ json: [project] }));
});

test("已有未归档资料时直接续接为研究范围", async ({ page }) => {
  await page.route("**/api/v1/collections?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/documents?*", (route) => route.fulfill({ json: documents }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "让现有资料成为可分析的研究范围。" })).toBeVisible();
  await page.getByRole("button", { name: "整理这 2 份资料" }).click();
  await expect(page.getByText("已选择 2 项")).toBeVisible();
  await expect(page.getByRole("button", { name: "新建并移入" })).toBeVisible();
});

test("异构数据详情提供真实字段目录与声明式查询", async ({ page }) => {
  const datasetId = "00000000-0000-0000-0000-000000000203";
  const collection = { id: collectionId, project_id: projectId, name: "实验数据", description: null, document_count: 1, created_at: "2026-07-15T00:00:00Z" };
  const listed = [{ ...documents[0], collection_id: collectionId }];
  await page.route("**/api/v1/collections?*", (route) => route.fulfill({ json: [collection] }));
  await page.route("**/api/v1/documents?*", (route) => route.fulfill({ json: listed }));
  await page.route("**/api/v1/documents/d1?*", (route) => route.fulfill({ json: {
    ...listed[0], project_id: projectId, storage_hash: "a".repeat(64), authors: null, doi: null, source_url: null,
    metadata: { kind: "dataset" }, chunks_count: 0, dataset_id: datasetId,
    schema_json: { row_count: 2, column_count: 3, columns: [{ name: "sample", dtype: "object" }, { name: "group", dtype: "object" }, { name: "value", dtype: "float64" }] },
  } }));
  await page.route("**/api/v1/datasets/query", async (route) => {
    const body = route.request().postDataJSON();
    const searched = body.queries[0].search === "treated";
    const rows = searched ? [{ sample: "B", group: "treated", value: 4.5 }] : [{ sample: "A", group: "control", value: 1 }, { sample: "B", group: "treated", value: 4.5 }];
    await route.fulfill({ json: { results: [{
      dataset_id: datasetId, name: "experiment.csv", storage_hash: "a".repeat(64), sheet: null,
      columns: [{ name: "sample", dtype: "object" }, { name: "group", dtype: "object" }, { name: "value", dtype: "float64" }],
      rows, matched_rows: rows.length, returned_rows: rows.length, receipt: { storage_hash: "a".repeat(64) },
    }] } });
  });
  await page.goto("/knowledge");
  await page.getByRole("button", { name: /experiment\.csv/ }).click();
  await expect(page.getByText("结构化数据查询")).toBeVisible();
  await expect(page.getByText("2 行匹配")).toBeVisible();
  await page.getByPlaceholder("在当前数据表中搜索").fill("treated");
  await page.getByRole("button", { name: "查询" }).click();
  await expect(page.getByText("1 行匹配")).toBeVisible();
  await expect(page.getByText("4.5")).toBeVisible();
});

test("Agent 断流后恢复研究问题并提供重试", async ({ page }) => {
  const collection = { id: collectionId, project_id: projectId, name: "实验数据", description: null, document_count: 1, created_at: "2026-07-15T00:00:00Z" };
  const listed = [{ ...documents[0], collection_id: collectionId }];
  await page.route("**/api/v1/collections?*", (route) => route.fulfill({ json: [collection] }));
  await page.route("**/api/v1/documents?*", (route) => route.fulfill({ json: listed }));
  await page.route("**/api/v1/documents/d1?*", (route) => route.fulfill({ json: {
    ...listed[0], project_id: projectId, storage_hash: "a".repeat(64), authors: null, doi: null, source_url: null,
    metadata: null, chunks_count: 0, dataset_id: "00000000-0000-0000-0000-000000000203",
    schema_json: { row_count: 20, column_count: 3, columns: [{ name: "group", dtype: "object" }, { name: "score", dtype: "float64" }, { name: "age", dtype: "int64" }] },
  } }));
  await page.route("**/api/v1/conversations?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/skills?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/chat", (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: "event: thinking\ndata: {\"text\":\"正在分析\"}\n\n" }));
  await page.goto("/analysis");
  await expect(page.getByRole("button", { name: "比较“group”各组的“score”差异，报告效应量并绘图" })).toBeVisible();
  const question = "比较各组得分并报告效应量";
  await page.getByPlaceholder("直接提出问题，Agent 会自行选择需要的文件和工具…").fill(question);
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByRole("button", { name: "重新发送" })).toBeVisible();
  await expect(page.getByPlaceholder("直接提出问题，Agent 会自行选择需要的文件和工具…")).toHaveValue(question);
});

test("同一文件夹支持稳定的多轮对话且复用会话 ID", async ({ page }) => {
  const collection = { id: collectionId, project_id: projectId, name: "实验数据", description: null, document_count: 0, created_at: "2026-07-15T00:00:00Z" };
  const conversationId = "00000000-0000-0000-0000-000000000299";
  const requests: Record<string, unknown>[] = [];
  await page.route("**/api/v1/collections?*", (route) => route.fulfill({ json: [collection] }));
  await page.route("**/api/v1/documents?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/conversations?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/chat", (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    const round = requests.length;
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: `event: message\ndata: {"text":"第${round}轮回答","citations":[],"status":"complete"}\n\nevent: done\ndata: {"conversation_id":"${conversationId}"}\n\n`,
    });
  });
  await page.goto(`/analysis?collection=${collectionId}`);
  const input = page.getByPlaceholder("直接提出问题，Agent 会自行选择需要的文件和工具…");
  await input.fill("第一问");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("第1轮回答")).toBeVisible();
  await input.fill("继续追问");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("第2轮回答")).toBeVisible();
  expect(requests[0].conversation_id).toBeUndefined();
  expect(requests[1].conversation_id).toBe(conversationId);
  await expect(page).toHaveURL(new RegExp(`conversation=${conversationId}`));
});

test("SkillHub 展示真实契约并防止重复导入", async ({ page }) => {
  const collection = { id: collectionId, project_id: projectId, name: "实验数据", description: null, document_count: 1, created_at: "2026-07-15T00:00:00Z" };
  const listed = [{ ...documents[0], collection_id: collectionId }];
  const packageHash = "b".repeat(64);
  const importedSkill = {
    id: "00000000-0000-0000-0000-000000000204", project_id: projectId, name: "数据质量体检", discipline: "general",
    template: "print(1)", meta: { tools: ["pandas"] }, intent: "检查缺失和重复", input_roles: {}, version: 1,
    origin: "hub", package_hash: packageHash, created_at: "2026-07-15T00:00:00Z",
  };
  let imported = false;
  await page.route("**/api/v1/collections?*", (route) => route.fulfill({ json: [collection] }));
  await page.route("**/api/v1/documents?*", (route) => route.fulfill({ json: listed }));
  await page.route("**/api/v1/documents/d1?*", (route) => route.fulfill({ json: {
    ...listed[0], project_id: projectId, storage_hash: "a".repeat(64), authors: null, doi: null, source_url: null,
    metadata: null, chunks_count: 0, dataset_id: "00000000-0000-0000-0000-000000000203",
    schema_json: { row_count: 20, column_count: 2, columns: [{ name: "group", dtype: "object" }, { name: "score", dtype: "float64" }] },
  } }));
  await page.route("**/api/v1/conversations?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/skills?*", (route) => route.fulfill({ json: imported ? [importedSkill] : [] }));
  await page.route("**/api/v1/skills/hub", (route) => route.fulfill({ json: [{
    id: "community-data-quality", name: "数据质量体检", intent: "在分析前检查缺失值和重复记录", discipline: "general", version: 1,
    author: "ReproLab Community", input_roles: [], tools: ["pandas", "emit_artifact"], outputs: ["质量概览表", "重复行数"],
    workflow: ["读取原始数据", "统计缺失和重复", "登记可信产物"], estimated_from_scratch_tokens: 1200, package_hash: packageHash,
  }] }));
  await page.route("**/api/v1/skills/hub/community-data-quality/import", (route) => { imported = true; return route.fulfill({ status: 201, json: importedSkill }); });
  await page.goto("/analysis");
  await page.getByRole("button", { name: "文件与能力" }).click();
  const skillSurface = page.getByRole("dialog", { name: "当前文件夹 · 实验数据" });
  await expect(skillSurface.getByText("默认由 Agent 根据问题动态规划；技能只是可选工具，不限制学科与分析类型。")).toBeVisible();
  await expect(skillSurface.getByRole("combobox", { name: "全部领域" })).toHaveCount(0);
  await skillSurface.getByRole("button", { name: "SkillHub" }).click();
  await expect(page.getByRole("dialog", { name: "SkillHub · 能力目录" })).toBeVisible();
  await expect(page.getByText("适用输入", { exact: true })).toBeVisible();
  await expect(page.getByText("质量概览表")).toBeVisible();
  await expect(page.getByText("emit_artifact")).toBeVisible();
  await page.getByRole("button", { name: "导入到项目" }).click();
  await expect(page.getByRole("button", { name: "已导入", exact: true })).toBeDisabled();
});

test("成果库只展示用户主动保存的结果并支持安全移出", async ({ page }) => {
  const savedId = "00000000-0000-0000-0000-000000000301";
  const candidateId = "00000000-0000-0000-0000-000000000302";
  const savedState: Record<string, boolean> = { [savedId]: true, [candidateId]: false };
  const artifacts = [
    { id: savedId, run_id: "r1", kind: "number", title: "关键效应量", value: { value: 0.82 }, content_hash: null, saved_at: "2026-07-16T10:00:00Z", created_at: "2026-07-16T09:00:00Z", source_complete: true, run_status: "success" },
    { id: candidateId, run_id: "r1", kind: "table", title: "过程统计", value: { data: [{ group: "A", n: 10 }] }, content_hash: null, saved_at: null, created_at: "2026-07-16T08:00:00Z", source_complete: true, run_status: "success" },
  ];
  await page.route("**/api/v1/collections?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/documents?*", (route) => route.fulfill({ json: [] }));
  await page.route(`**/api/v1/projects/${projectId}/review`, (route) => route.fulfill({ json: {
    project_id: projectId, project_name: "真实研究", counts: { documents: 1, datasets: 1, successful_runs: 1, failed_runs: 0, artifacts: 2, saved_artifacts: 1, verified_claims: 0, flagged_claims: 0 }, risks: [], next_actions: [],
  } }));
  await page.route(`**/api/v1/projects/${projectId}/artifacts?*`, (route) => {
    const view = new URL(route.request().url()).searchParams.get("view") || "saved";
    const selected = artifacts.filter((item) => view === "all" || (view === "saved" ? savedState[item.id] : !savedState[item.id])).map((item) => ({ ...item, saved_at: savedState[item.id] ? (item.saved_at || "2026-07-16T10:00:00Z") : null }));
    const savedCount = Object.values(savedState).filter(Boolean).length;
    return route.fulfill({ json: { items: selected, total_count: artifacts.length, saved_count: savedCount, candidate_count: artifacts.length - savedCount } });
  });
  await page.route("**/api/v1/artifacts/*/library", (route) => {
    const id = route.request().url().split("/artifacts/")[1].split("/library")[0];
    const saved = route.request().postDataJSON().saved as boolean;
    savedState[id] = saved;
    return route.fulfill({ json: { artifact_id: id, saved, saved_at: saved ? "2026-07-16T11:00:00Z" : null } });
  });

  await page.goto("/results");
  await expect(page.getByText("关键效应量")).toBeVisible();
  await expect(page.getByText("过程统计")).toHaveCount(0);
  await page.getByRole("button", { name: "移出成果库：关键效应量" }).click();
  await expect(page.getByRole("dialog", { name: "移出成果库？" })).toBeVisible();
  await page.getByRole("button", { name: "移出成果库", exact: true }).click();
  await expect(page.getByRole("heading", { name: "还没有保存成果" })).toBeVisible();

  await expect(page.getByText("分析过程中产生的代码、日志和中间指标不会自动堆到这里。")).toBeVisible();
  await expect(page.getByRole("button", { name: /整理候选/ })).toHaveCount(0);
  await expect(page.getByText("过程统计")).toHaveCount(0);
  await expect(page.getByText("关键效应量")).toHaveCount(0);
});

test("记忆可解释、可召回也可明确遗忘", async ({ page }) => {
  let deleted = false;
  const memory = {
    id: "00000000-0000-0000-0000-000000000205", layer: "semantic", content: "组间差异优先报告效应量和置信区间。",
    tags: ["manual", "统计"], importance: .8, written_at: "2026-07-15T00:00:00Z", recallable: true, source: "manual",
  };
  await page.route("**/api/v1/collections?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/documents?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/memories?*", (route) => route.fulfill({ json: deleted ? [] : [memory] }));
  await page.route(`**/api/v1/memories/${memory.id}?*`, (route) => { deleted = true; return route.fulfill({ json: { id: memory.id, deleted: true } }); });
  await page.goto("/memory");
  await expect(page.getByText("组间差异优先报告效应量和置信区间。")).toBeVisible();
  await expect(page.getByText("可召回")).toBeVisible();
  await expect(page.getByText(/来源：手动记录/)).toBeVisible();
  await page.getByRole("button", { name: "忘记" }).click();
  await expect(page.getByText("删除后，Agent 不会再召回这条记录。")).toBeVisible();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByRole("heading", { name: "还没有项目记忆" })).toBeVisible();
});

test("Agent 时间线公开记忆工具回执但不暴露隐藏推理", async ({ page }) => {
  const collection = { id: collectionId, project_id: projectId, name: "实验数据", description: null, document_count: 1, created_at: "2026-07-15T00:00:00Z" };
  const conversationId = "00000000-0000-0000-0000-000000000206";
  await page.route("**/api/v1/collections?*", (route) => route.fulfill({ json: [collection] }));
  await page.route("**/api/v1/documents?*", (route) => route.fulfill({ json: [] }));
  await page.route(`**/api/v1/conversations/${conversationId}?*`, (route) => route.fulfill({ json: {
    id: conversationId, title: "回放", events: [
      { event: "message", data: { text: "检查数据", citations: [], user: true } },
      { event: "context", data: { tools: [
        { name: "dataset.scope", label: "读取数据范围", status: "used", detail: "experiment.csv", count: 1 },
        { name: "memory.search", label: "检索项目记忆", status: "used", detail: "召回 1 条", count: 1, items: [{ id: "m1", content: "优先报告效应量", layer: "semantic" }] },
        { name: "skill.load", label: "加载分析技能", status: "empty", detail: "动态分析，不限制为固定模板", count: 0 },
      ] } },
      { event: "plan", data: { steps: [{ title: "检查数据", rationale: "核对字段" }] } },
      { event: "code", data: { code: "print(1)", lang: "python" } },
      { event: "run", data: { run_id: "r1", status: "success", stdout: "ok" } },
      { event: "message", data: { text: "检查完成", citations: [] } },
      { event: "done", data: { conversation_id: conversationId } },
    ],
  } }));
  await page.route("**/api/v1/conversations?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/skills?*", (route) => route.fulfill({ json: [] }));
  await page.goto(`/analysis?conversation=${conversationId}`);
  await page.getByText("运行上下文已核对").click();
  await expect(page.getByText("检索项目记忆")).toBeVisible();
  await expect(page.getByText("优先报告效应量")).toBeVisible();
  await expect(page.getByText("动态分析，不限制为固定模板")).toBeVisible();
  await expect(page.getByText("隐藏推理")).toHaveCount(0);
});
