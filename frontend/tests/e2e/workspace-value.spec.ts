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
  await page.route("**/api/v1/projects?*", (route) => {
    expect(new URL(route.request().url()).searchParams.get("include_archived")).toBe("false");
    return route.fulfill({ json: [project] });
  });
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

test("工作台根据真实记录给出单一下一步并压缩历史会话", async ({ page }, testInfo) => {
  const collection = { id: collectionId, project_id: projectId, name: "实验数据", description: "药物干预实验", document_count: 2, created_at: "2026-07-15T00:00:00Z" };
  await page.route("**/api/v1/collections?*", (route) => route.fulfill({ json: [collection] }));
  await page.route("**/api/v1/documents?*", (route) => route.fulfill({ json: documents.map((item) => ({ ...item, collection_id: collectionId })) }));
  await page.route("**/api/v1/conversations?*", (route) => route.fulfill({ json: Array.from({ length: 7 }, (_, index) => ({
    id: `conversation-${index}`,
    title: `第 ${index + 1} 次分析`,
    collection_id: collectionId,
    message_count: 2,
    created_at: "2026-07-16T08:00:00Z",
    updated_at: `2026-07-16T0${index + 1}:00:00Z`,
  })) }));
  await page.route(`**/api/v1/projects/${projectId}/review`, (route) => route.fulfill({ json: {
    project_id: projectId,
    project_name: "真实研究",
    counts: { documents: 2, datasets: 1, successful_runs: 2, failed_runs: 0, artifacts: 2, saved_artifacts: 1, verified_claims: 0, flagged_claims: 0 },
    risks: [],
    next_actions: ["形成并校验报告"],
  } }));
  await page.route(`**/api/v1/projects/${projectId}/timeline`, (route) => route.fulfill({ json: {
    events: [{ kind: "run", title: "组间差异分析", detail: "运行成功并生成 2 个产物", created_at: "2026-07-16T09:00:00Z", href: "/report/run-1", trusted: true }],
  } }));
  await page.route(`**/api/v1/projects/${projectId}/artifacts?*`, (route) => route.fulfill({ json: {
    items: [{ id: "artifact-1", run_id: "run-1", kind: "number", title: "组间均值差", value: 1.2, content_hash: null, saved_at: "2026-07-16T09:10:00Z", created_at: "2026-07-16T09:00:00Z", source_complete: true, run_status: "success" }],
    total_count: 2,
    saved_count: 1,
    candidate_count: 1,
  } }));

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "形成并校验报告" })).toBeVisible();
  await expect(page.getByRole("link", { name: /形成报告/ }).first()).toHaveAttribute("href", "/results?tab=writing");
  await expect(page.getByText("3/4 已完成")).toBeVisible();
  await expect(page.getByText("来源完整 1/1 项成果")).toBeVisible();
  await expect(page.getByRole("link", { name: "组间差异分析" })).toHaveAttribute("href", "/report/run-1");
  if (testInfo.project.name === "desktop-chromium") {
    await expect(page.getByRole("link", { name: "查看全部 7 个对话" })).toBeVisible();
    await expect(page.getByRole("link", { name: "第 6 次分析" })).toHaveCount(0);
  }
});

test("首次使用说明项目与文件夹的关系并可永久收起", async ({ page }) => {
  const collection = { id: collectionId, project_id: projectId, name: "实验数据", description: null, document_count: 1, created_at: "2026-07-15T00:00:00Z" };
  await page.route("**/api/v1/collections?*", (route) => route.fulfill({ json: [collection] }));
  await page.route("**/api/v1/documents?*", (route) => route.fulfill({ json: [{ ...documents[0], collection_id: collectionId }] }));
  await page.route("**/api/v1/conversations?*", (route) => route.fulfill({ json: [] }));
  await page.route(`**/api/v1/projects/${projectId}/review`, (route) => route.fulfill({ json: {
    project_id: projectId, project_name: "真实研究", counts: { documents: 1, datasets: 1, successful_runs: 0, failed_runs: 0, artifacts: 0, saved_artifacts: 0, verified_claims: 0, flagged_claims: 0 }, risks: [], next_actions: [],
  } }));
  await page.route(`**/api/v1/projects/${projectId}/timeline`, (route) => route.fulfill({ json: { events: [] } }));
  await page.route(`**/api/v1/projects/${projectId}/artifacts?*`, (route) => route.fulfill({ json: { items: [], total_count: 0, saved_count: 0, candidate_count: 0 } }));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "用 3 分钟跑通你的第一条可信研究链" })).toBeVisible();
  await expect(page.getByText(/研究项目保存全部资料与历史/)).toBeVisible();
  await expect(page.getByText(/当前研究文件夹“实验数据”/)).toBeVisible();
  await page.getByRole("button", { name: "不再显示新手引导" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "用 3 分钟跑通你的第一条可信研究链" })).toHaveCount(0);
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

test("向量模型恢复后可在资料详情重建语义索引", async ({ page }) => {
  const collection = { id: collectionId, project_id: projectId, name: "证据资料", description: null, document_count: 1, created_at: "2026-07-15T00:00:00Z" };
  const listed = [{ ...documents[1], collection_id: collectionId, metadata: { parse_status: "needs_attention", message: "语义向量暂未生成" } }];
  let rebuilt = false;
  let reindexRequests = 0;
  await page.route("**/api/v1/collections?*", (route) => route.fulfill({ json: [collection] }));
  await page.route("**/api/v1/documents?*", (route) => route.fulfill({ json: rebuilt ? [{ ...listed[0], metadata: { parse_status: "indexed", message: "语义索引已重建，共更新 2 个文本切块。" } }] : listed }));
  await page.route("**/api/v1/documents/d2?*", (route) => route.fulfill({ json: {
    ...listed[0],
    project_id: projectId,
    storage_hash: "c".repeat(64),
    authors: null,
    doi: null,
    source_url: null,
    metadata: rebuilt
      ? { parse_status: "indexed", message: "语义索引已重建，共更新 2 个文本切块。" }
      : { parse_status: "needs_attention", message: "语义向量暂未生成" },
    chunks_count: 2,
    dataset_id: null,
    schema_json: null,
  } }));
  await page.route("**/api/v1/documents/d2/reindex", (route) => {
    rebuilt = true;
    reindexRequests += 1;
    return route.fulfill({ json: {
      document_id: "d2",
      chunks_count: 2,
      parse_status: "indexed",
      message: "语义索引已重建，共更新 2 个文本切块。",
    } });
  });

  await page.goto("/knowledge");
  await page.getByRole("button", { name: /methods\.pdf/ }).click();
  await expect(page.getByText("语义向量暂未生成")).toBeVisible();
  await page.getByRole("button", { name: "重建语义索引" }).click();
  await expect(page.getByText("语义索引已重建，共更新 2 个文本切块。")).toBeVisible();
  expect(reindexRequests).toBe(1);
});

test("审阅入口展示真实项目质量门而不是失效标签", async ({ page }) => {
  await page.route("**/api/v1/collections?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/documents?*", (route) => route.fulfill({ json: [] }));
  await page.route(`**/api/v1/projects/${projectId}/timeline`, (route) => route.fulfill({ json: {
    events: [{ kind: "run", title: "均值分析", detail: "运行成功并生成 1 个产物", created_at: "2026-07-16T09:00:00Z", href: "/report/run-1", trusted: true }],
  } }));
  await page.route(`**/api/v1/projects/${projectId}/review`, (route) => route.fulfill({ json: {
    project_id: projectId,
    project_name: "真实研究",
    counts: { documents: 2, datasets: 1, successful_runs: 1, failed_runs: 0, artifacts: 1, saved_artifacts: 1, verified_claims: 1, flagged_claims: 0 },
    risks: [],
    next_actions: ["导出复现报告"],
  } }));
  await page.route(`**/api/v1/projects/${projectId}/quality-report`, (route) => route.fulfill({ json: {
    project_id: projectId,
    generated_at: "2026-07-16T10:00:00Z",
    ready_for_demo: true,
    metrics: [
      { key: "datasets", title: "可分析数据集", value: 1, total: null, ratio: null, state: "ready", evidence: "项目内真实 Dataset 数量" },
      { key: "semantic_coverage", title: "语义索引覆盖率", value: 2, total: 2, ratio: 1, state: "ready", evidence: "已有向量的证据文档" },
      { key: "provenance", title: "完整血缘覆盖率", value: 1, total: 1, ratio: 1, state: "ready", evidence: "Dataset → Run → Artifact" },
    ],
    blockers: [],
    next_actions: ["导出复现报告"],
  } }));

  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "可信研究闭环已就绪" })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/results\?tab=records$/, { timeout: 15_000 });
  await expect(page.getByText("语义索引覆盖率")).toBeVisible();
  await expect(page.getByText("100%")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "均值分析" })).toHaveAttribute("href", "/report/run-1");
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

test("长分析持续显示当前状态、耗时与返回入口", async ({ page }) => {
  const collection = { id: collectionId, project_id: projectId, name: "实验数据", description: null, document_count: 0, created_at: "2026-07-15T00:00:00Z" };
  await page.route("**/api/v1/collections?*", (route) => route.fulfill({ json: [collection] }));
  await page.route("**/api/v1/documents?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/conversations?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/skills?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/chat", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    return route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: "event: message\ndata: {\"text\":\"分析完成\",\"citations\":[],\"status\":\"complete\"}\n\nevent: done\ndata: {\"conversation_id\":\"00000000-0000-0000-0000-000000000298\"}\n\n",
    });
  });

  await page.goto(`/analysis?collection=${collectionId}`);
  await page.getByPlaceholder("直接提出问题，Agent 会自行选择需要的文件和工具…").fill("执行完整分析");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText(/请保持此页面打开；任务中心会持续显示已运行时间/)).toBeVisible();
  await page.getByRole("button", { name: "任务" }).click();
  const center = page.getByRole("dialog", { name: "任务中心" });
  await expect(center.getByText("进行中的分析请保持分析页打开。", { exact: false })).toBeVisible();
  await expect(center.getByText("科研分析")).toBeVisible();
  await expect(center.getByText(/进行中 · \d+秒 · 返回查看进度/)).toBeVisible();
  await page.getByRole("button", { name: "关闭任务中心" }).click();
  await expect(page.getByText("分析完成")).toBeVisible();
  await expect(page.getByRole("button", { name: "继续追问" })).toBeVisible();
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
  await page.route("**/api/v1/skills/hub?*", (route) => route.fulfill({ json: [{
    id: "community-data-quality", name: "数据质量体检", intent: "在分析前检查缺失值和重复记录", discipline: "general", version: 1,
    author: "ReproLab Community", input_roles: [], tools: ["pandas", "emit_artifact"], outputs: ["质量概览表", "重复行数"],
    workflow: ["读取原始数据", "统计缺失和重复", "登记可信产物"], estimated_from_scratch_tokens: 1200, package_hash: packageHash,
    recommended: true, recommendation_reason: "适合当前数据",
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
  await page.route("**/api/v1/verify", (route) => route.fulfill({ json: {
    verdict: "fail", claim_status: "flagged", repaired_text: null, iterations: null,
    items: [{ check: "number", target_anchor: "art_0000", verdict: "fail", severity: "warn", reason: "需要补充结果解释。", locate: "关键效应量", label: null, support_score: null, evidence_span: null }],
  } }));

  await page.goto("/results");
  await expect(page.getByRole("heading", { name: "关键效应量" })).toBeVisible();
  await expect(page.getByText("过程统计")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "编辑报告" })).toHaveAttribute("href", "/results?tab=writing");
  await expect(page.getByRole("button", { name: "导出关键效应量" })).toContainText("导出");
  const previewButton = page.getByRole("button", { name: "查看完整内容：关键效应量" });
  await previewButton.click();
  const preview = page.getByRole("dialog", { name: "关键效应量" });
  await expect(preview.getByText("来源完整，可以用于报告")).toBeVisible();
  await expect(preview.getByRole("button", { name: "关闭关键效应量" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(previewButton).toBeFocused();
  await page.getByRole("link", { name: "加入报告" }).click();
  await expect(page.getByRole("heading", { name: "项目研究报告" })).toBeVisible();
  await expect(page.getByText("选择可信成果", { exact: true })).toBeVisible();
  await expect(page.getByText("校验通过后可发布", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "校验报告" }).click();
  await page.getByRole("button", { name: "定位正文" }).click();
  const editor = page.getByRole("textbox", { name: "报告正文" });
  await expect(editor).toBeFocused();
  expect(await editor.evaluate((element) => {
    const field = element as HTMLTextAreaElement;
    return field.value.slice(field.selectionStart, field.selectionEnd);
  })).toBe("关键效应量");
  await page.goto("/results");
  await page.getByRole("button", { name: "移出成果库：关键效应量" }).click();
  await expect(page.getByRole("dialog", { name: "移出成果库？" })).toBeVisible();
  await page.getByRole("button", { name: "移出成果库", exact: true }).click();
  await expect(page.getByRole("heading", { name: "还没有保存成果" })).toBeVisible();
  await expect(page.getByRole("status").getByText("已将“关键效应量”移出成果库")).toBeVisible();
  await page.getByRole("button", { name: "撤销" }).click();
  await expect(page.getByRole("heading", { name: "关键效应量" })).toBeVisible();
  await page.getByRole("button", { name: "移出成果库：关键效应量" }).click();
  await page.getByRole("button", { name: "移出成果库", exact: true }).click();
  await expect(page.getByRole("heading", { name: "还没有保存成果" })).toBeVisible();

  await expect(page.getByText("分析过程中产生的代码、日志和中间指标不会自动堆到这里。")).toBeVisible();
  await expect(page.getByRole("button", { name: /整理候选/ })).toHaveCount(0);
  await expect(page.getByText("过程统计")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "关键效应量" })).toHaveCount(0);
});

test("成果可搜索筛选、批量加入报告，并在窄屏切换编辑预览问题", async ({ page }, testInfo) => {
  const artifacts = [
    { id: "11110000-0000-0000-0000-000000000301", run_id: "r1", kind: "number", title: "回归效应量", value: { value: 0.82 }, content_hash: null, saved_at: "2026-07-16T10:00:00Z", created_at: "2026-07-16T09:00:00Z", source_complete: true, run_status: "success" },
    { id: "22220000-0000-0000-0000-000000000302", run_id: "r1", kind: "table", title: "样本统计表", value: { data: [{ group: "A", n: 10 }] }, content_hash: null, saved_at: "2026-07-16T10:00:00Z", created_at: "2026-07-16T09:00:00Z", source_complete: true, run_status: "success" },
    { id: "33330000-0000-0000-0000-000000000303", run_id: "r1", kind: "figure", title: "趋势图", value: { note: "preview" }, content_hash: null, saved_at: "2026-07-16T10:00:00Z", created_at: "2026-07-16T09:00:00Z", source_complete: false, run_status: "success" },
  ];
  await page.route("**/api/v1/collections?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/documents?*", (route) => route.fulfill({ json: [] }));
  await page.route(`**/api/v1/projects/${projectId}/review`, (route) => route.fulfill({ json: {
    project_id: projectId, project_name: "真实研究", counts: { documents: 1, datasets: 1, successful_runs: 1, failed_runs: 0, artifacts: 3, saved_artifacts: 3, verified_claims: 0, flagged_claims: 0 }, risks: [], next_actions: [],
  } }));
  await page.route(`**/api/v1/projects/${projectId}/artifacts?*`, (route) => route.fulfill({ json: { items: artifacts, total_count: 3, saved_count: 3, candidate_count: 0 } }));

  await page.goto("/results");
  await page.getByRole("textbox", { name: "搜索已保存成果" }).fill("回归");
  await expect(page.getByText("回归效应量")).toBeVisible();
  await expect(page.getByText("样本统计表")).toHaveCount(0);
  await page.getByRole("textbox", { name: "搜索已保存成果" }).fill("");
  await page.getByRole("combobox", { name: "筛选成果类型" }).selectOption("table");
  await expect(page.getByText("样本统计表")).toBeVisible();
  await expect(page.getByText("回归效应量")).toHaveCount(0);
  await page.getByRole("combobox", { name: "筛选成果类型" }).selectOption("all");
  await expect(page.getByRole("checkbox", { name: "选择成果：趋势图" })).toBeDisabled();
  await page.getByRole("checkbox", { name: "选择成果：回归效应量" }).check();
  await page.getByRole("checkbox", { name: "选择成果：样本统计表" }).check();
  await expect(page.getByText("已选择 2 项可信成果")).toBeVisible();
  await page.getByRole("button", { name: "批量加入报告" }).click();

  await expect(page.getByRole("heading", { name: "项目研究报告" })).toBeVisible();
  await expect(page.getByText("已插入 2 项")).toBeVisible();
  await expect(page.getByRole("status").getByText("已将 2 项可信成果加入报告")).toBeVisible();
  if (testInfo.project.name === "narrow-chromium") {
    const tabs = page.getByRole("tablist", { name: "移动端报告视图" });
    await expect(tabs).toBeVisible();
    await tabs.getByRole("tab", { name: "预览" }).click();
    await expect(page.getByText("报告预览")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "报告正文" })).toBeHidden();
    await tabs.getByRole("tab", { name: "编辑" }).click();
    await expect(page.getByRole("textbox", { name: "报告正文" })).toBeVisible();
  }
});

test("来源不完整的成果不能进入报告", async ({ page }) => {
  const artifactId = "00000000-0000-0000-0000-000000000399";
  await page.route("**/api/v1/collections?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/documents?*", (route) => route.fulfill({ json: [] }));
  await page.route(`**/api/v1/projects/${projectId}/review`, (route) => route.fulfill({ json: {
    project_id: projectId, project_name: "真实研究", counts: { documents: 1, datasets: 1, successful_runs: 1, failed_runs: 0, artifacts: 1, saved_artifacts: 1, verified_claims: 0, flagged_claims: 0 }, risks: [], next_actions: [],
  } }));
  await page.route(`**/api/v1/projects/${projectId}/artifacts?*`, (route) => route.fulfill({ json: {
    items: [{ id: artifactId, run_id: "r1", kind: "number", title: "待核对指标", value: { value: 0.42 }, content_hash: null, saved_at: "2026-07-16T10:00:00Z", created_at: "2026-07-16T09:00:00Z", source_complete: false, run_status: "success" }],
    total_count: 1, saved_count: 1, candidate_count: 0,
  } }));

  await page.goto("/results");
  await expect(page.getByText("来源完整 0/1")).toBeVisible();
  await expect(page.getByText("待检查来源")).toBeVisible();
  await expect(page.getByText("先检查并补全来源，再写入报告。")).toBeVisible();
  const writingLink = page.getByRole("link", { name: "加入报告" });
  await expect(writingLink).toHaveAttribute("aria-disabled", "true");
  await expect(writingLink).not.toHaveAttribute("href");
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

test("Agent 时间线说明本轮依据及使用原因但不暴露隐藏推理", async ({ page }) => {
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
  await expect(page.getByText("1 份数据 · 1 条有效记忆 · 动态分析")).toBeVisible();
  await page.getByText("本轮依据已核对").click();
  await expect(page.getByText("检索项目记忆")).toBeVisible();
  await expect(page.getByText("只召回与当前问题相关且仍有效的项目记忆。")).toBeVisible();
  await expect(page.getByText("未套用固定模板，由 Agent 根据真实字段动态规划。")).toBeVisible();
  await expect(page.getByText("优先报告效应量")).toBeVisible();
  await expect(page.getByText("动态分析，不限制为固定模板")).toBeVisible();
  await expect(page.getByText("隐藏推理")).toHaveCount(0);
  await page.getByRole("button", { name: "继续追问" }).click();
  await expect(page.getByPlaceholder("直接提出问题，Agent 会自行选择需要的文件和工具…")).toBeFocused();
});
