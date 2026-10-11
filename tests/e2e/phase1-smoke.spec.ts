import { expect, test } from "@playwright/test";

test("首頁可載入且為繁體中文", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant-TW");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("主題切換會改變 data-theme 並保存", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: /目前主題/ });
  await toggle.click(); // system → light
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await toggle.click(); // light → dark
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("頁面沒有水平溢出", async ({ page }) => {
  await page.goto("/design-system");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("未登入存取 /admin 會導向 /login", async ({ page }) => {
  const response = await page.goto("/admin");
  expect(page.url()).toContain("/login?next=%2Fadmin");
  // /login 於 Phase 2 才建立，此時預期為 404
  expect(response?.status()).toBe(404);
});

test("健康檢查端點不洩漏金鑰", async ({ request }) => {
  const res = await request.get("/api/health");
  const body = await res.text();
  expect(body).not.toMatch(/eyJ|sb_publishable_|sb_secret_/);
  expect(JSON.parse(body)).toHaveProperty("app", "ok");
});
