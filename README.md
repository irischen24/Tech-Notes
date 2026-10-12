# Iris Notes（iris-tech-notes）

個人技術筆記與知識管理系統。Next.js 16（App Router、Cache Components）+ Supabase + Vercel。

架構、安全分析、ERD 與各階段驗收標準：[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## 目前進度

| Phase | 狀態 |
|---|---|
| 1. Next.js / Tailwind / Supabase 連線 / Design System | ✅ 完成 |
| 2. Schema、RLS、Storage policy、管理員登入 | ✅ 完成（需依下方「Supabase 初始設定」套用到專案） |
| 3. 公開網站、Markdown Renderer、搜尋 | ✅ 完成（需套用 migration 0002） |
| 4. 後台 Dashboard、分類 / 章節管理、筆記編輯與發布 | ✅ 完成（需套用 migration 0003） |
| 5. HackMD 匯入與同步 | ✅ 完成（需套用 migration 0004 並設定 HACKMD_API_TOKEN） |
| 6–7 | 未開始 |

後台：`/admin`、`/admin/notes`（含新增 / 編輯）、`/admin/categories`、`/admin/chapters`、`/admin/hackmd`、`/admin/logs`、`/admin/settings`。

> **Phase 5 升級**：在 SQL Editor 執行 `supabase/migrations/20261011000004_hackmd_import.sql`；在 Vercel 新增 Server-only 環境變數 `HACKMD_API_TOKEN` 後 Redeploy。

> **Phase 4 升級**：在 SQL Editor 執行 `supabase/migrations/20261011000003_admin_note_editing.sql`（筆記儲存函式，含標籤同步與樂觀鎖）。

公開頁面：`/`、`/categories`、`/categories/[slug]`、`/notes/[id]`、`/tags/[slug]`、`/search?q=`、`/login`、`/admin`（需管理員）、`/design-system`、`/api/health`、`/auth/confirm`。

> **Phase 3 升級**：在 SQL Editor 執行 `supabase/migrations/20261011000002_public_reading_and_search.sql`（新增分類 slug 全域唯一與搜尋函式）。若既有資料中不同父分類下有相同 slug，執行會失敗，請先改名。

## Supabase 初始設定（Phase 2，只需做一次）

以下步驟都在 Supabase Dashboard 操作，無法由程式自動完成。

1. **套用 Schema**：SQL Editor → New query → 依檔名順序貼上 `supabase/migrations/` 內每個檔案 → Run。
   （若使用 Supabase CLI：`npx supabase link --project-ref hfozxjsriughgduwfbgn && npx supabase db push`）
2. **初始分類**：SQL Editor 執行 `supabase/seed.sql`（可重複執行）。
3. **關閉公開註冊**：Authentication → Sign In / Providers → 關閉「Allow new users to sign up」。
4. **密碼政策**：Authentication → Policies（或 Providers → Email）將最短密碼長度設為 12 以上。
5. **建立管理員帳號**：Authentication → Users → Add user → Create new user，輸入 Email 與高強度密碼，勾選 Auto Confirm User。
   規格中的開發密碼 `1234` 不符合 Supabase 最短長度，也不應用於任何環境。
6. **指定為管理員**：開啟 `supabase/scripts/promote-admin.sql`，**只在 SQL Editor 中**把 `ADMIN_EMAIL_HERE` 換成該 Email 後執行。完成後顯示名稱為 `iris`。不要把真實 Email commit 回 Repository。
7. **Auth URL**：依下方「Supabase Auth URL 設定」設定 Site URL 與 Redirect URLs。
8. **Email 範本**（需要重設密碼時）：Authentication → Email Templates → Reset Password 的連結改為
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/admin`
9. **產生正式型別**：`npx supabase gen types typescript --project-id hfozxjsriughgduwfbgn --schema public > types/database.ts`，與目前手寫版比對後 commit。
10. **驗證**：開啟 `/admin` → 導向登入 → 登入後應看到「資料庫連線與管理權限正常」與 25 個分類。

### 公開頁面整合測試

見 `tests/integration/README.md`（本機 PostgreSQL + PostgREST 模擬 Supabase REST）。

### 資料庫測試（本機 PostgreSQL 15+）

```bash
npm run test:db    # 建立暫時資料庫 → stub → migration → seed（執行兩次）→ 82 項 RLS / 約束 / 搜尋 / 筆記儲存 / HackMD 匯入斷言
```

`supabase/tests/local-supabase-stub.sql` 只模擬 Supabase 的 roles、`auth.uid()` 與 storage 表，**不可在 Supabase 執行**。
GitHub Actions（`.github/workflows/ci.yml`）每次 push 都會跑 lint、typecheck、單元測試、build 與資料庫測試。

## 本機開發

需求：Node.js 22 以上。

```bash
npm install
cp .env.local.example .env.local   # 填入 Supabase anon / publishable key
npm run dev                         # http://localhost:3000
```

## 驗證指令

```bash
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
npm run test        # Vitest 單元測試
npm run build       # Production build
npm run verify      # 以上四項依序執行

# E2E（第一次需下載瀏覽器）
npx playwright install chromium
npm run build && npm run test:e2e
# 管理員登入流程需要帳號，以環境變數提供（不要寫進任何檔案）：
E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npm run test:e2e
```

## 環境變數

| 變數 | 範圍 | 說明 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 公開 | Supabase 專案網址 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` 或 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 公開 | 二擇一，同時設定時 publishable 優先 |
| `HACKMD_API_TOKEN` | **Server-only** | HackMD 匯入與同步，禁止加 `NEXT_PUBLIC_` |
| `HACKMD_API_BASE_URL` | Server-only，選填 | 預設 `https://api.hackmd.io/v1`；僅 HackMD EE 或本機模擬測試需要 |

啟動時會驗證格式；若誤把 `service_role` 或 `sb_secret_` 金鑰放進 `NEXT_PUBLIC_` 變數會直接拒絕。
本專案預設不使用 service_role key。

## GitHub

```bash
git init
git add .
git status                 # 確認沒有 .env.local
git commit -m "feat: phase 1 - next.js, tailwind, supabase clients, md3 design system"
git branch -M main
git remote add origin https://github.com/<你的帳號>/iris-tech-notes.git
git push -u origin main
```

建立 Repository：GitHub → New repository → 名稱 `iris-tech-notes` → Private（建議）→ 不要勾選自動產生 README / .gitignore（避免與本機衝突）。

分支策略：`main` 對應 Production；每個 Phase 開 `feat/phase-N-xxx` 分支，PR 會自動產生 Vercel Preview，驗收後合併。
Commit 採 Conventional Commits（`feat:`、`fix:`、`chore:`、`test:`、`docs:`）。

## Vercel 部署

1. 登入 Vercel（使用 GitHub 帳號）。
2. Add New → Project → Import `iris-tech-notes`。
3. Framework Preset：Next.js（自動偵測）。
4. Root Directory：`./`。
5. Build Command / Output：保持預設。Settings → General → Node.js Version：22.x。
6. Environment Variables：加入上表變數。Supabase 兩個公開變數勾選 Production、Preview、Development；`HACKMD_API_TOKEN` 至 Phase 5 再加入。
7. Deploy，於 Build Logs 確認出現 `✓ Compiled successfully` 與路由表。
8. 開啟 `https://<網址>/design-system`，應顯示「已連線到 Supabase」；`/api/health` 應回傳 `{"app":"ok","supabase":"ok"}`。
9. Settings → Domains 設定正式網址（如需自訂網域）。
10. 推送一個小變更到 `main`，確認自動觸發部署。

## Supabase Auth URL 設定（Phase 2 登入前完成）

Supabase Dashboard → Authentication → URL Configuration：

- Site URL：`https://<正式網址>`
- Redirect URLs：
  - `http://localhost:3000/**`
  - `https://<正式網址>/**`
  - `https://iris-tech-notes-*-<vercel-team-slug>.vercel.app/**`（Preview）

Authentication → Providers → Email：建議關閉公開註冊（Allow new users to sign up），管理員帳號由 Dashboard 手動建立，密碼長度設定 12 以上。

## 常見問題

- **`/design-system` 顯示「環境變數尚未設定完成」**：`.env.local` 未建立，或 Vercel 未設定變數後重新部署（NEXT_PUBLIC_ 變數在 build 時內嵌，修改後必須 Redeploy）。
- **顯示「金鑰被拒絕」**：key 不屬於此 Supabase 專案，或複製時少了字元。
- **顯示「無法連線到 Supabase」**：專案可能被暫停（免費方案閒置），到 Dashboard 恢復。
- **Build 出現 `cookies()` 需在 Suspense 內的錯誤**：Cache Components 規則，讀取 Session 的元件要包在 `<Suspense>` 內。

## HackMD 匯入與同步（Phase 5）

- 額度：HackMD 免費方案每月 2000 次、每 5 分鐘 100 次 API 呼叫。本系統**不會**在頁面載入時自動呼叫 HackMD：
  測試連線、載入列表各 1 次；每匯入 1 篇或檢查同步 1 篇各 1 次；不自動重試。
- 匯入後一律是**草稿**；同一篇 HackMD 筆記（`hackmd_note_id`）只會匯入一次。
- 內容轉換：移除 YAML front matter、開頭的 H1（本站另外顯示標題）、`[TOC]` 與 `###### tags:` 行。HackMD 專屬語法（`:::info`、`{%youtube%}` 等）會以一般文字顯示。
- 同步只比對**內容**（SHA-256），本地修改的標題、摘要、標籤、狀態不會被 HackMD 覆蓋。
- 單向同步：HackMD → Supabase。只有 HackMD 更新、本地未修改時才自動更新；雙方都修改時顯示差異，由管理員選擇「保留本地」或「用 HackMD 覆蓋」。
