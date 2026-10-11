# Iris Notes（iris-tech-notes）

個人技術筆記與知識管理系統。Next.js 16（App Router、Cache Components）+ Supabase + Vercel。

架構、安全分析、ERD 與各階段驗收標準：[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## 目前進度

| Phase | 狀態 |
|---|---|
| 1. Next.js / Tailwind / Supabase 連線 / Design System | ✅ 完成 |
| 2. Schema、RLS、管理員登入 | 未開始 |
| 3–7 | 未開始 |

Phase 1 可用頁面：`/`（首頁）、`/design-system`（元件與 Supabase 連線檢查）、`/api/health`。

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
```

## 環境變數

| 變數 | 範圍 | 說明 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 公開 | Supabase 專案網址 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` 或 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 公開 | 二擇一，同時設定時 publishable 優先 |
| `HACKMD_API_TOKEN` | **Server-only** | Phase 5 使用，禁止加 `NEXT_PUBLIC_` |

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
