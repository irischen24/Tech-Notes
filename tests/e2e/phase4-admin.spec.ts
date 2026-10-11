import { expect, test } from "@playwright/test";

/**
 * 後台主要流程。需要真實 Supabase 與管理員帳號（以環境變數提供，不寫入 Repository）：
 *   E2E_ADMIN_EMAIL、E2E_ADMIN_PASSWORD
 * 會建立以 e2e- 開頭的分類 / 章節 / 筆記，並在最後刪除。
 */
const EMAIL = process.env.E2E_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test.describe("後台管理流程", () => {
  test.skip(!EMAIL || !PASSWORD, "未設定 E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD");
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now().toString(36);
  const categorySlug = `e2e-cat-${stamp}`;
  const chapterSlug = `e2e-ch-${stamp}`;
  const noteTitle = `E2E 筆記 ${stamp}`;

  test.beforeEach(async ({ page }) => {
    await page.goto("/login?next=/admin");
    await page.getByLabel("Email").fill(EMAIL ?? "");
    await page.getByLabel("密碼").fill(PASSWORD ?? "");
    await page.getByRole("button", { name: "登入" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("建立分類與章節", async ({ page }) => {
    await page.goto("/admin/categories");
    await page.getByRole("button", { name: "新增分類" }).first().click();
    await page.getByLabel("名稱").fill(`E2E ${stamp}`);
    await page.getByLabel("網址代稱").fill(categorySlug);
    await page.getByRole("dialog").getByRole("button", { name: "新增分類" }).click();
    await expect(page.getByText("已新增分類")).toBeVisible();

    await page.goto("/admin/chapters");
    await page.getByRole("button", { name: "新增章節" }).first().click();
    await page.getByLabel("所屬分類").selectOption({ label: `E2E ${stamp}` });
    await page.getByLabel("章節名稱").fill(`E2E 章節 ${stamp}`);
    await page.getByLabel("網址代稱").fill(chapterSlug);
    await page.getByRole("dialog").getByRole("button", { name: "新增章節" }).click();
    await expect(page.getByText("已新增章節")).toBeVisible();
  });

  test("新增並發布筆記，公開頁立即可見；取消發布後消失", async ({ page }) => {
    await page.goto("/admin/notes/new");
    await page.getByLabel("標題").fill(noteTitle);
    await page.getByLabel("網址代稱").fill(`e2e-note-${stamp}`);
    await page.getByLabel("章節").selectOption({ label: `E2E ${stamp}／E2E 章節 ${stamp}` });
    await page.getByLabel("標籤").fill("E2E, 測試");
    await page.getByRole("button", { name: "儲存並發布" }).click();
    await expect(page).toHaveURL(/\/admin\/notes\/.+\/edit\?created=1/);
    const noteId = page.url().split("/admin/notes/")[1].split("/")[0];

    await page.goto(`/notes/${noteId}`);
    await expect(page.getByRole("heading", { level: 1, name: noteTitle })).toBeVisible();

    await page.goto("/admin/notes");
    const row = page.getByRole("listitem").filter({ hasText: noteTitle });
    await row.getByRole("button", { name: "取消發布" }).click();
    await expect(page.getByText("已改回草稿")).toBeVisible();
    await page.goto(`/notes/${noteId}`);
    await expect(page.getByText("找不到這個頁面")).toBeVisible();

    // 清理
    await page.goto("/admin/notes");
    await page.getByRole("listitem").filter({ hasText: noteTitle }).getByRole("button", { name: "刪除" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "永久刪除" }).click();
    await expect(page.getByText("已刪除筆記")).toBeVisible();
  });

  test("清理章節與分類", async ({ page }) => {
    await page.goto("/admin/chapters");
    await page.getByRole("listitem").filter({ hasText: `E2E 章節 ${stamp}` }).getByRole("button", { name: "刪除" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "刪除" }).click();
    await expect(page.getByText("已刪除章節")).toBeVisible();

    await page.goto("/admin/categories");
    await page.getByRole("listitem").filter({ hasText: categorySlug }).getByRole("button", { name: "刪除" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "刪除" }).click();
    await expect(page.getByText("已刪除分類")).toBeVisible();
  });
});
