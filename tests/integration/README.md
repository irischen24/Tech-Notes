# 公開頁面整合測試（本機，無需 Supabase 帳號）

以本機 PostgreSQL + PostgREST 模擬 Supabase REST API，讓 Next.js 讀取真實查詢結果。
閘道另外模擬 `/auth/v1/user`（以 HS256 驗證 JWT），因此可以用自行簽發的 session cookie 測試後台頁面與 Server Actions。
真正的登入（密碼驗證）與 Storage 不在模擬範圍內，請用真實 Supabase 測試。

1. 建立資料庫：依序套用 `supabase/tests/local-supabase-stub.sql`、`supabase/migrations/*.sql`、`supabase/seed.sql`、`supabase/tests/fixtures/sample-notes.sql`。
2. 建立 PostgREST 登入角色：
   `create role authenticator login password '<本機密碼>' noinherit; grant anon, authenticated to authenticator;`
3. 下載 PostgREST（GitHub Releases），設定 `db-anon-role = "anon"`、`jwt-secret = "<至少 32 字元的本機測試字串>"`、`server-port = 3300`。
4. `LOCAL_JWT_SECRET=<同 jwt-secret> node tests/integration/fake-supabase-gateway.mjs`（在 54321 埠把 `/rest/v1/*` 轉給 PostgREST）。
5. 以同一個 jwt-secret 簽一個 `{"role":"anon"}` 的 HS256 JWT 當作 anon key。
6. `NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=<JWT> npm run build && npm start`

預期：草稿 `FULL JOIN 草稿` 不出現在任何公開頁面與搜尋結果；`INNER JOIN` 筆記中的 `<script>`、`onerror`、`javascript:`、`data:` 與 `http:` 圖片都不會輸出。

所有密碼與 secret 只用於本機，不可 commit 真實值。

## 後台（Phase 4）

1. 在 `auth.users` 插入測試使用者，並將其 `profiles.role` 設為 `admin`。
2. 以同一個 secret 簽 `{"sub":"<user id>","role":"authenticated","aud":"authenticated","exp":...}`，
   組成 session JSON 後以 `sb-localhost-auth-token=base64-<base64url(JSON)>` 作為 cookie。
3. 以 cookie 請求 `/admin/*` 頁面；Server Action 可用 `Next-Action: <id>` 標頭 POST（id 見 `.next/server/server-reference-manifest.json`），並帶 `Origin` 標頭。

## HackMD（Phase 5）

`tests/integration/mock-hackmd-server.mjs` 模擬 HackMD API v1（`/me`、`/notes`、`/notes/:id`，含速率限制標頭與 401 / 404 / 429）。

```bash
MOCK_HACKMD_TOKEN=<本機測試字串> node tests/integration/mock-hackmd-server.mjs   # 4010 埠
HACKMD_API_TOKEN=<同上> HACKMD_API_BASE_URL=http://localhost:4010/v1 npm start
# 模擬在 HackMD 編輯：
curl -X POST localhost:4010/__set/JoinNote01 -d '{"content":"# 新內容"}'
```

## Storage（Phase 6）

`tests/integration/fake-storage-server.mjs` 模擬 Supabase Storage 本專案用到的端點（簽名上傳、info、簽名 / 公開下載含 Range、刪除）。
檔案存在記憶體，metadata 寫入 PostgreSQL `storage.objects`；權限以使用者 JWT 身分 + `storage.objects` RLS 判斷。

```bash
npm i --no-save pg
LOCAL_JWT_SECRET=<同上> PGURL=postgres://<本機超級使用者>@localhost:5432/<資料庫> node tests/integration/fake-storage-server.mjs   # 預設 54322 埠
```

閘道 `fake-supabase-gateway.mjs` 會把 `/storage/v1/*` 轉到此伺服器。
