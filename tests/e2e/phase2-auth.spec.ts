import { expect, test } from "@playwright/test";

/**
 * 需要真實 Supabase 專案與管理員帳號。以環境變數提供，不寫入 Repository：
 *   E2E_ADMIN_EMAIL、E2E_ADMIN_PASSWORD
 * 未設定時，需要帳號的測試會自動略過。
 */
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;

test("登入表單驗證錯誤會顯示在欄位下方", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page.getByText("請輸入 Email")).toBeVisible();
});

test("錯誤帳密顯示統一訊息", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.test");
  await page.getByLabel("密碼").fill("wrong-password-123");
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page.getByText(/Email 或密碼不正確|無法連線到驗證服務|次數過多/)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("login 的 next 參數不允許外部網址", async ({ page }) => {
  await page.goto("/login?next=https://evil.example.com");
  await expect(page.locator('input[name="next"]')).toHaveValue("/admin");
});

test.describe("管理員流程", () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "未設定 E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD");

  test("管理員可以登入、看到 Dashboard、登出", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
    await page.getByLabel("Email").fill(ADMIN_EMAIL ?? "");
    await page.getByLabel("密碼").fill(ADMIN_PASSWORD ?? "");
    await page.getByRole("button", { name: "登入" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: /歡迎回來/ })).toBeVisible();
    await expect(page.getByText("資料庫連線與管理權限正常")).toBeVisible();

    await page.getByRole("button", { name: "登出" }).click();
    await expect(page).toHaveURL(/\/login\?signed_out=1/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });
});
