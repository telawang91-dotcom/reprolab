import { expect, test } from "@playwright/test";

test("旧演示入口进入正式产品指南并完整说明核心技术", async ({ page }) => {
  await page.goto("/demo");

  await expect(page).toHaveURL(/\/guide$/);
  await expect(page.getByRole("heading", { name: /不只是回答问题/ })).toBeVisible();
  await expect(page.getByText("复杂检索 · RAG")).toBeVisible();
  await expect(page.getByRole("heading", { name: /证据筛选流水线/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "规划、执行、自检，形成分析闭环。" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /越用越懂你的研究/ })).toBeVisible();
  await expect(page.getByText("code_hash = sha256(code + lang + input_hash + env_hash)")).toBeVisible();
});

test("指南在窄屏仍提供清晰的真实功能入口", async ({ page }) => {
  await page.goto("/guide");

  await expect(page.getByRole("link", { name: "开始一个研究项目" })).toHaveAttribute("href", "/knowledge");
  await expect(page.getByRole("link", { name: "进入研究 Agent" })).toHaveAttribute("href", "/analysis");
  await expect(page.getByRole("link", { name: /长期记忆.*打开功能/ })).toHaveAttribute("href", "/memory");
  await expect(page.getByRole("link", { name: "进入写作面板" })).toHaveAttribute("href", "/results?tab=writing");
  await expect(page.getByText("最后是否保存和发布始终由你决定。", { exact: false })).toBeVisible();
});
