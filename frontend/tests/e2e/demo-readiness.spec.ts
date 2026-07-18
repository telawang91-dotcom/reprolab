import { expect, test } from "@playwright/test";

const runtime = {
  state: "ready",
  summary: "数据库、模型与科研执行环境均已就绪。",
  components: [
    { key: "database", title: "数据库", state: "ready", message: "PostgreSQL 可用", action: null },
    { key: "model", title: "模型", state: "ready", message: "模型密钥已配置", action: null },
    { key: "sandbox", title: "沙箱", state: "ready", message: "Docker 镜像可用", action: null },
  ],
};

const quality = {
  project_id: "00000000-0000-0000-0000-000000000101",
  generated_at: "2026-07-14T00:00:00Z",
  ready_for_demo: false,
  metrics: [
    { key: "datasets", title: "可分析数据集", value: 1, total: null, ratio: null, state: "ready", evidence: "项目内真实 Dataset 数量" },
    { key: "searchable_documents", title: "可检索证据文档", value: 1, total: 1, ratio: 1, state: "ready", evidence: "至少含一个文本切块的项目文档" },
    { key: "run_success", title: "分析运行成功率", value: 0, total: 0, ratio: null, state: "block", evidence: "项目内成功/全部运行" },
    { key: "provenance", title: "完整血缘覆盖率", value: 0, total: 0, ratio: null, state: "block", evidence: "完整 Artifact" },
    { key: "verification", title: "可信结论通过率", value: 0, total: 0, ratio: null, state: "warn", evidence: "verified Claim / 全部 Claim" },
  ],
  blockers: ["还没有成功的动态分析运行。", "还没有可展示的分析产物。", "还没有通过三查的可信结论。"],
  next_actions: ["进入分析页选择数据并运行一个未预设问题。"],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/settings/runtime", (route) => route.fulfill({ json: runtime }));
  await page.route("**/api/v1/projects/demo", (route) => route.fulfill({ json: {
    id: quality.project_id,
    name: "ReproLab Demo",
    description: "明确隔离的演示项目",
    archived_at: null,
    created_at: "2026-07-14T00:00:00Z",
  } }));
  await page.route("**/api/v1/projects/*/quality-report", (route) => route.fulfill({ json: quality }));
});

test("真实运行状态和项目质量指标形成可操作演示主线", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByText("真实运行环境")).toBeVisible();
  await expect(page.getByText("数据库、模型与科研执行环境均已就绪。")).toBeVisible();
  await page.getByRole("button", { name: "准备并检查演示项目" }).first().click();
  await expect(page.getByRole("region", { name: "演示就绪检查" })).toBeVisible();
  await expect(page.getByText("以下数字直接读取项目账本，不是静态演示文案。")).toBeVisible();
  await expect(page.getByRole("link", { name: /2\. 动态分析/ })).toHaveAttribute("href", "/analysis");
  await expect(page.getByText("3 项待完成")).toBeVisible();
});

test("窄屏仍可切换能力证据并进入主流程", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: /04 · 漂移归因/ }).click();
  await expect(page.getByRole("heading", { name: "改了数据，不只告诉你结果变了，还定位为什么变" })).toBeVisible();
  await expect(page.getByRole("link", { name: "检查溯源与漂移" })).toHaveAttribute("href", "/results?tab=lineage");
  await expect(page.getByRole("button", { name: "准备并检查演示项目" }).first()).toBeVisible();
});
