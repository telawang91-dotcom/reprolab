import { expect, test } from "@playwright/test";

const readyRuntime = {
  state: "ready",
  summary: "数据库、模型和 Docker 沙箱均可用。",
  components: [
    { key: "database", title: "PostgreSQL", state: "ready", message: "数据库可用。", action: null },
    { key: "model", title: "模型服务", state: "ready", message: "模型已配置。", action: null },
    { key: "sandbox", title: "Docker 沙箱", state: "ready", message: "沙箱可用。", action: null },
  ],
};

test("演示入口创建隔离项目并进入可分析研究文件夹", async ({ page }) => {
  const project = {
    id: "00000000-0000-0000-0000-000000000101",
    name: "ReproLab 演示",
    description: "隔离演示",
    archived_at: null,
    created_at: "2026-07-30T00:00:00Z",
  };
  let prepared = false;
  await page.route("**/api/v1/settings/runtime", (route) => route.fulfill({ json: readyRuntime }));
  await page.route("**/api/v1/projects?*", (route) => route.fulfill({ json: prepared ? [project] : [] }));
  await page.route("**/api/v1/projects/demo", (route) => {
    prepared = true;
    return route.fulfill({ json: project });
  });
  await page.route("**/api/v1/collections?*", (route) => route.fulfill({ json: [{
    id: "00000000-0000-0000-0000-000000000102",
    project_id: project.id,
    name: "企鹅形态差异研究",
    description: "隔离演示文件夹",
    document_count: 2,
    created_at: "2026-07-30T00:00:00Z",
  }] }));
  await page.route("**/api/v1/documents?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/conversations?*", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/v1/skills?*", (route) => route.fulfill({ json: [] }));

  await page.goto("/demo");

  await expect(page.getByRole("heading", { name: "用真实数据跑通一条可信研究链。" })).toBeVisible();
  await expect(page.getByText("运行环境检查完成")).toBeVisible();
  await page.getByRole("button", { name: /使用示例数据体验/ }).click();
  await expect(page).toHaveURL(/\/analysis$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("reprolab-active-project"))).toBe(project.id);
  await expect.poll(() => page.evaluate((id) => localStorage.getItem(`reprolab.activeCollection.${id}`), project.id))
    .toBe("00000000-0000-0000-0000-000000000102");
});

test("指南完整说明核心技术", async ({ page }) => {
  await page.goto("/guide");

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
