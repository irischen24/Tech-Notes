# 公開頁面整合測試（本機，無需 Supabase 帳號）

以本機 PostgreSQL + PostgREST 模擬 Supabase REST API，讓 Next.js 讀取真實查詢結果。
Auth 與 Storage 不在模擬範圍內（登入流程請用真實 Supabase 測試）。

1. 建立資料庫：依序套用 `supabase/tests/local-supabase-stub.sql`、`supabase/migrations/*.sql`、`supabase/seed.sql`、`supabase/tests/fixtures/sample-notes.sql`。
2. 建立 PostgREST 登入角色：
   `create role authenticator login password '<本機密碼>' noinherit; grant anon, authenticated to authenticator;`
3. 下載 PostgREST（GitHub Releases），設定 `db-anon-role = "anon"`、`jwt-secret = "<至少 32 字元的本機測試字串>"`、`server-port = 3300`。
4. `node tests/integration/fake-supabase-gateway.mjs`（在 54321 埠把 `/rest/v1/*` 轉給 PostgREST）。
5. 以同一個 jwt-secret 簽一個 `{"role":"anon"}` 的 HS256 JWT 當作 anon key。
6. `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<JWT> npm run build && npm start`

預期：草稿 `FULL JOIN 草稿` 不出現在任何公開頁面與搜尋結果；`INNER JOIN` 筆記中的 `<script>`、`onerror`、`javascript:`、`data:` 與 `http:` 圖片都不會輸出。

所有密碼與 secret 只用於本機，不可 commit 真實值。
