#!/usr/bin/env bash
# 在本機 PostgreSQL（15 以上）建立暫時資料庫，套用 stub → migrations → seed → RLS 測試。
# 用法：bash supabase/tests/run-local.sh   （需能以 psql 連線，可用 PGUSER/PGHOST 等環境變數設定）
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="iris_rls_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/local-supabase-stub.sql
for f in supabase/migrations/*.sql; do
  echo "→ migration: $f"
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"
done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/seed.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/seed.sql   # 驗證 seed 可重複執行
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/rls.test.sql 2>&1 | sed "s/^psql:[^ ]* NOTICE:  //"
