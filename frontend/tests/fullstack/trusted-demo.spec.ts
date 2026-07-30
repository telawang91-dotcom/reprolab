import { expect, test } from "@playwright/test";

const enabled = process.env.RUN_FULLSTACK_E2E === "1";
const apiBase = process.env.FULLSTACK_API_BASE ?? "http://127.0.0.1:8000/api/v1";
const demoProjectId = "00000000-0000-0000-0000-000000000101";

test("隔离演示从真实浏览器贯通数据库、Docker 运行、成果与血缘", async ({ page }) => {
  test.skip(!enabled, "set RUN_FULLSTACK_E2E=1 after starting the complete stack");

  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "用真实数据跑通一条可信研究链。" })).toBeVisible();
  await expect(page.getByText("运行环境检查完成")).toBeVisible();
  await page.getByRole("button", { name: /使用示例数据体验/ }).click();
  await expect(page).toHaveURL(/\/analysis$/, { timeout: 300_000 });
  await expect(page.getByRole("heading", { name: "企鹅形态差异研究" })).toBeVisible();
  await expect(page.getByText(/企鹅形态差异研究 · 2 个文件/)).toBeVisible();

  const datasetsResponse = await page.request.get(
    `${apiBase}/datasets?project_id=${demoProjectId}`,
  );
  expect(datasetsResponse.ok()).toBeTruthy();
  const datasets = await datasetsResponse.json();
  expect(datasets).toHaveLength(1);

  const title = `全栈验收平均体重-${Date.now()}`;
  const runResponse = await page.request.post(`${apiBase}/runs`, {
    data: {
      project_id: demoProjectId,
      dataset_ids: [datasets[0].id],
      seed: 42,
      code: [
        "df = load_dataset(0)",
        `emit_artifact('number', float(df['body_mass_g'].mean()), title=${JSON.stringify(title)}, tol=1e-9)`,
      ].join("\n"),
    },
  });
  expect(runResponse.ok()).toBeTruthy();
  const run = await runResponse.json();
  expect(run.status).toBe("success");
  expect(run.artifacts).toHaveLength(1);
  const artifactId = run.artifacts[0].artifact_id;

  const saveResponse = await page.request.put(`${apiBase}/artifacts/${artifactId}/library`, {
    data: { project_id: demoProjectId, saved: true },
  });
  expect(saveResponse.ok()).toBeTruthy();

  await page.goto("/results?tab=artifacts");
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("link", { name: "来源" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/lineage/${artifactId}$`));
  await expect(page.getByRole("heading", { name: "这项结果从哪里来" })).toBeVisible();
  await expect(page.getByText("代码与运行").first()).toBeVisible();

  await page.goto("/review");
  await expect(page).toHaveURL(/\/results\?tab=records$/);
  await expect(page.getByRole("heading", { name: /可信研究闭环/ })).toBeVisible();
  await expect(page.getByText("语义索引覆盖率")).toBeVisible();
  await expect(page.getByRole("heading", { name: "研究时间线" })).toBeVisible();

  const archiveResponse = await page.request.post(
    `${apiBase}/projects/${demoProjectId}/archive`,
  );
  expect(archiveResponse.ok()).toBeTruthy();
});
