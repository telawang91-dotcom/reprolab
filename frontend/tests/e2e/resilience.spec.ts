import { expect, test } from "@playwright/test";

test("设置读取失败后停止加载并提供独立重试入口", async ({ page }) => {
  let modelRequests = 0;
  let runtimeRequests = 0;
  await page.route("**/api/v1/settings/model", async (route) => {
    modelRequests += 1;
    await route.abort("connectionrefused");
  });
  await page.route("**/api/v1/settings/runtime", async (route) => {
    runtimeRequests += 1;
    await route.abort("connectionrefused");
  });

  await page.goto("/settings");

  await expect(page.getByRole("heading", { name: "模型设置暂不可用" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "运行状态暂不可用" })).toBeVisible();
  await expect(page.getByText("读取模型设置…")).toHaveCount(0);
  await expect(page.getByText("正在检查…")).toHaveCount(0);

  await page.getByRole("button", { name: "重新读取模型设置" }).click();
  await page.getByRole("button", { name: "重新检查运行状态" }).click();
  await expect.poll(() => modelRequests).toBeGreaterThan(1);
  await expect.poll(() => runtimeRequests).toBeGreaterThan(1);
});

test("未知地址显示正式恢复页面而不是项目空态", async ({ page }) => {
  await page.route("**/api/v1/**", (route) => route.abort("connectionrefused"));
  await page.goto("/this-page-does-not-exist");

  await expect(page.getByRole("heading", { name: "这里没有可继续的研究任务" })).toBeVisible();
  await expect(page.getByRole("link", { name: "返回工作台" })).toBeVisible();
  await expect(page.getByRole("link", { name: "查看研究项目" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "从你的真实项目开始" })).toHaveCount(0);
});
