-- RLS / 約束整合測試：在已套用 stub + migration + seed 的本機 PostgreSQL 執行。
-- 任一斷言失敗會 raise exception 並中止（psql -v ON_ERROR_STOP=1）。
\set ON_ERROR_STOP 1
set client_min_messages = notice;
\o /dev/null

create or replace function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    raise notice 'PASS（預期被拒）: % → %', label, sqlerrm;
    return;
  end;
  raise exception 'FAIL: 應被拒絕但成功了: %', label;
end $$;

create or replace function pg_temp.expect_eq(actual bigint, expected bigint, label text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL: % 預期 % 實際 %', label, expected, actual;
  end if;
  raise notice 'PASS: % = %', label, actual;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- ── 準備：以擁有者身分建立使用者與資料 ──
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'visitor@example.test');
select pg_temp.expect_eq((select count(*) from public.profiles where role = 'visitor'), 2, 'trigger 自動建立 visitor profile');
update public.profiles set role = 'admin', username = 'iris' where id = '00000000-0000-0000-0000-00000000000a';

insert into public.chapters (id, category_id, title, slug)
select '10000000-0000-0000-0000-000000000001', id, 'JOIN 語法', 'join' from public.categories where slug = 'sql';
insert into public.notes (id, chapter_id, title, slug, status) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '已發布', 'published-note', 'published'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '草稿', 'draft-note', 'draft');
insert into public.tags (id, name, slug) values ('30000000-0000-0000-0000-000000000001', 'SQL', 'sql');
insert into public.note_tags values
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001');

select pg_temp.expect_eq((select count(*) from public.notes where slug='published-note' and published_at is not null), 1, '發布時自動補 published_at');
select pg_temp.expect_eq((select count(*) from public.categories), 25, 'seed 分類數量');

-- ── 約束 ──
select pg_temp.expect_fail($$insert into public.notes (chapter_id,title,slug,source_type) values ('10000000-0000-0000-0000-000000000001','x','x-hackmd','hackmd')$$, 'hackmd 來源必須有 hackmd_note_id');
insert into public.notes (chapter_id,title,slug,source_type,hackmd_note_id) values ('10000000-0000-0000-0000-000000000001','h1','h-one','hackmd','HM123');
select pg_temp.expect_fail($$insert into public.notes (chapter_id,title,slug,source_type,hackmd_note_id) values ('10000000-0000-0000-0000-000000000001','h2','h-two','hackmd','HM123')$$, '同一 hackmd_note_id 不可重複匯入');
select pg_temp.expect_fail($$insert into public.notes (chapter_id,title,slug,status) values ('10000000-0000-0000-0000-000000000001','bad','bad','deleted')$$, 'status CHECK');
select pg_temp.expect_fail($$insert into public.notes (chapter_id,title,slug) values ('10000000-0000-0000-0000-000000000001','bad','Bad Slug!')$$, 'slug 格式');
select pg_temp.expect_fail($$delete from public.chapters where id = '10000000-0000-0000-0000-000000000001'$$, '有筆記的章節不可刪除');
select pg_temp.expect_fail($$delete from public.categories where slug = 'sql'$$, '有章節的分類不可刪除');
select pg_temp.expect_fail($$delete from public.categories where slug = 'database'$$, '有子分類的分類不可刪除');
select pg_temp.expect_fail($$update public.categories set parent_id = (select id from public.categories where slug='sql') where slug = 'database'$$, '分類不可形成循環');
select pg_temp.expect_fail($$insert into public.categories (name, slug) values ('重複','database')$$, '同層 slug 不可重複（含根層 NULL parent）');
select pg_temp.expect_fail($$insert into public.note_assets (bucket,storage_path,mime_type,size_bytes) values ('note-images','../etc/passwd','image/png',10)$$, 'storage_path 不可含 ..');
select pg_temp.expect_fail($$insert into public.note_assets (bucket,storage_path,mime_type,size_bytes) values ('note-images','a.svg','image/svg+xml',10)$$, 'MIME 白名單（拒絕 SVG）');

-- ── anon（訪客） ──
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_eq((select count(*) from public.notes), 1, 'anon 只看到已發布筆記');
select pg_temp.expect_eq((select count(*) from public.note_tags), 1, 'anon 只看到已發布筆記的標籤關聯');
select pg_temp.expect_eq((select count(*) from public.categories), 25, 'anon 可讀分類');
select pg_temp.expect_fail($$select count(*) from public.profiles$$, 'anon 不可讀 profiles');
select pg_temp.expect_fail($$select count(*) from public.audit_logs$$, 'anon 不可讀 audit_logs');
select pg_temp.expect_fail($$select count(*) from public.note_assets$$, 'anon 不可讀 note_assets');
select pg_temp.expect_fail($$insert into public.categories (name, slug) values ('x','anon-x')$$, 'anon 不可新增分類');
select pg_temp.expect_fail($$update public.notes set title='hacked'$$, 'anon 不可修改筆記');
select pg_temp.expect_fail($$insert into storage.objects (bucket_id, name) values ('note-images','anon.png')$$, 'anon 不可上傳圖片');
select pg_temp.expect_eq((select case when public.is_admin() then 1 else 0 end), 0, 'anon is_admin() = false');
reset role;

-- ── authenticated visitor ──
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect_eq((select count(*) from public.notes), 1, 'visitor 看不到草稿');
select pg_temp.expect_eq((select count(*) from public.profiles), 1, 'visitor 只看到自己的 profile');
select pg_temp.expect_fail($$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000b'$$, 'visitor 不可自行升級為 admin');
update public.profiles set username = 'visitor_ok' where id = '00000000-0000-0000-0000-00000000000b';
reset role;
select pg_temp.expect_eq((select count(*) from public.profiles where username='visitor_ok' and role='visitor'), 1, 'visitor 可改 username 但 role 不變');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
update public.profiles set username = 'pwn' where id = '00000000-0000-0000-0000-00000000000a';
reset role;
select pg_temp.expect_eq((select count(*) from public.profiles where username='iris'), 1, 'visitor 無法修改他人 profile');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect_fail($$insert into public.categories (name, slug) values ('x','visitor-x')$$, 'visitor 不可新增分類');
select pg_temp.expect_fail($$insert into public.audit_logs (actor_id, action, entity_type, result) values ('00000000-0000-0000-0000-00000000000b','auth.login','session','success')$$, 'visitor 不可寫 audit_logs');
select pg_temp.expect_fail($$insert into storage.objects (bucket_id, name) values ('note-images','v.png')$$, 'visitor 不可上傳圖片');
select pg_temp.expect_eq((select count(*) from storage.objects), 0, 'visitor 無法列舉 Storage');
reset role;

-- ── admin ──
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.expect_eq((select case when public.is_admin() then 1 else 0 end), 1, 'admin is_admin() = true');
select pg_temp.expect_eq((select count(*) from public.notes), 3, 'admin 看得到草稿');
select pg_temp.expect_eq((select count(*) from public.profiles), 2, 'admin 可讀全部 profiles');
insert into public.categories (name, slug) values ('Admin 建立', 'admin-created');
insert into public.chapters (category_id, title, slug) select id, '章節', 'chapter-a' from public.categories where slug='admin-created';
update public.notes set status = 'published' where slug = 'draft-note';
insert into public.audit_logs (actor_id, action, entity_type, result) values ('00000000-0000-0000-0000-00000000000a','auth.login','session','success');
select pg_temp.expect_fail($$insert into public.audit_logs (actor_id, action, entity_type, result) values ('00000000-0000-0000-0000-00000000000b','auth.login','session','success')$$, 'admin 不可冒用他人寫 audit_logs');
select pg_temp.expect_fail($$update public.profiles set role = 'visitor' where id = '00000000-0000-0000-0000-00000000000a'$$, '連 admin 也無法經 API 改 role');
insert into storage.objects (bucket_id, name, owner) values ('note-images','admin.png','00000000-0000-0000-0000-00000000000a');
insert into storage.objects (bucket_id, name, owner) values ('note-drafts','draft.png','00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_fail($$insert into storage.objects (bucket_id, name) values ('some-other-bucket','x.png')$$, 'admin 也只能寫入指定 bucket');
select pg_temp.expect_fail($$update public.audit_logs set result = 'failure'$$, 'admin 不可修改 audit_logs');
select pg_temp.expect_fail($$delete from public.audit_logs$$, 'admin 不可刪除 audit_logs');
reset role;
select pg_temp.expect_eq((select count(*) from public.audit_logs where result='success'), 1, 'audit_logs 無法被修改或刪除');
select pg_temp.expect_eq((select count(*) from storage.buckets where id='note-drafts' and public = false), 1, 'note-drafts 為 private bucket');


-- ── Phase 3：搜尋與分類 slug ──
select pg_temp.expect_fail($$insert into public.categories (parent_id, name, slug) select id, 'dup', 'sql' from public.categories where slug = 'linux'$$, '分類 slug 全域唯一');
update public.notes set content_md = '使用 LEFT JOIN 合併資料表，100% 的 a_b 範例' where slug = 'published-note';
insert into public.notes (chapter_id, title, slug, content_md, status) values ('10000000-0000-0000-0000-000000000001', '秘密草稿 JOIN', 'secret-draft', 'LEFT JOIN 草稿', 'draft');
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_eq((select count(*) from public.search_published_notes('LEFT JOIN')), 1, '搜尋不回傳草稿內容');
select pg_temp.expect_eq((select count(*) from public.search_published_notes('秘密')), 0, '草稿標題搜不到');
select pg_temp.expect_eq((select count(*) from public.search_published_notes('%')), 1, '% 視為一般字元');
select pg_temp.expect_eq((select count(*) from public.search_published_notes('_')), 1, '_ 視為一般字元');
select pg_temp.expect_eq((select count(*) from public.search_published_notes('sql')), 2, '標籤名稱可搜尋（不分大小寫）');
select pg_temp.expect_eq((select count(*) from public.search_published_notes('   ')), 0, '空白查詢回傳 0');
select pg_temp.expect_eq((select count(*) from public.search_published_notes(repeat('a', 101))), 0, '超過 100 字回傳 0');
select pg_temp.expect_eq((select count(*) from public.search_published_notes('''; drop table public.notes; --')), 0, 'SQL injection 字串只是一般文字');
select pg_temp.expect_eq((select count(*) from public.notes), 2, 'notes 資料表仍存在（anon 可見 2 篇已發布）');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.expect_eq((select count(*) from public.search_published_notes('秘密')), 0, 'admin 呼叫搜尋也只回傳已發布');
reset role;

-- ── Phase 4：admin_save_note ──
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_fail($$select public.admin_save_note(null, '10000000-0000-0000-0000-000000000001', 'x', 'anon-note', null, '', 'draft', null, 0, '[]', null)$$, 'anon 不可呼叫 admin_save_note');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect_fail($$select public.admin_save_note(null, '10000000-0000-0000-0000-000000000001', 'x', 'visitor-note', null, '', 'draft', null, 0, '[]', null)$$, 'visitor 不可呼叫 admin_save_note');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
create temp table if not exists t_saved (r jsonb);
grant all on t_saved to authenticated;
insert into t_saved select public.admin_save_note(null, '10000000-0000-0000-0000-000000000001', '新筆記', 'phase4-note', '摘要', '## 內容', 'draft', null, 5,
  '[{"name":"SQL","slug":"sql"},{"name":"資料表關聯","slug":"t-relations"},{"name":"sql","slug":"sql"}]'::jsonb, null);
select pg_temp.expect_eq((select count(*) from t_saved where (r->>'created')::boolean), 1, 'admin_save_note 新增筆記');
select pg_temp.expect_eq((select count(*) from public.note_tags where note_id = (select (r->>'id')::uuid from t_saved)), 2, '標籤去重（SQL 與 sql 視為同一個）並新增新標籤');
select pg_temp.expect_eq((select count(*) from public.tags where slug = 't-relations'), 1, '新標籤已建立');

-- 更新：帶正確 updated_at 成功、移除一個標籤、發布
insert into t_saved select public.admin_save_note((select (r->>'id')::uuid from t_saved limit 1), '10000000-0000-0000-0000-000000000001', '新筆記 v2', 'phase4-note', null, '## v2', 'published', null, 5,
  '[{"name":"SQL","slug":"sql"}]'::jsonb, (select (r->>'updated_at')::timestamptz from t_saved limit 1));
select pg_temp.expect_eq((select count(*) from public.notes where slug='phase4-note' and title='新筆記 v2' and status='published' and published_at is not null), 1, '更新並發布');
select pg_temp.expect_eq((select count(*) from public.note_tags where note_id = (select (r->>'id')::uuid from t_saved limit 1)), 1, '移除未勾選的標籤');

-- 樂觀鎖：使用舊的 updated_at 應失敗
select pg_temp.expect_fail(format($$select public.admin_save_note(%L, '10000000-0000-0000-0000-000000000001', 'stale', 'phase4-note', null, '', 'draft', null, 0, '[]', '2000-01-01T00:00:00Z')$$, (select (r->>'id') from t_saved limit 1)), '過期的 updated_at 觸發 NOTE_CONFLICT');
select pg_temp.expect_fail($$select public.admin_save_note('99999999-9999-9999-9999-999999999999', '10000000-0000-0000-0000-000000000001', 'x', 'nope', null, '', 'draft', null, 0, '[]', null)$$, '不存在的筆記回傳 NOTE_NOT_FOUND');
select pg_temp.expect_fail($$select public.admin_save_note(null, '10000000-0000-0000-0000-000000000001', 'dup', 'phase4-note', null, '', 'draft', null, 0, '[]', null)$$, 'slug 重複被拒');
select pg_temp.expect_fail($$select public.admin_save_note(null, '10000000-0000-0000-0000-000000000001', 'x', 'too-many', null, '', 'draft', null, 0, (select jsonb_agg(jsonb_build_object('name','t'||g,'slug','t'||g)) from generate_series(1,21) g), null)$$, '標籤超過 20 個被拒');
select pg_temp.expect_fail($$select public.admin_save_note(null, '10000000-0000-0000-0000-000000000001', 'x', 'bad-status', null, '', 'deleted', null, 0, '[]', null)$$, 'status CHECK 仍生效');
-- 交易原子性：標籤 slug 格式錯誤 → 整筆失敗，不留下半套筆記
select pg_temp.expect_fail($$select public.admin_save_note(null, '10000000-0000-0000-0000-000000000001', 'atomic', 'atomic-note', null, '', 'draft', null, 0, '[{"name":"x","slug":"Bad Slug"}]', null)$$, '標籤錯誤時整筆回滾');
reset role;
select pg_temp.expect_eq((select count(*) from public.notes where slug = 'atomic-note'), 0, '回滾後沒有殘留筆記');

-- ── Phase 5：HackMD 匯入 ──
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_fail($$select public.admin_import_hackmd_note('HmdNote01', '10000000-0000-0000-0000-000000000001', 't', 'hmd-anon', 'x', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '[]')$$, 'anon 不可匯入 HackMD');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect_fail($$select public.admin_import_hackmd_note('HmdNote01', '10000000-0000-0000-0000-000000000001', 't', 'hmd-visitor', 'x', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '[]')$$, 'visitor 不可匯入 HackMD');
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
create temp table if not exists t_import (r jsonb);
grant all on t_import to authenticated;
insert into t_import select public.admin_import_hackmd_note('HmdNote01', '10000000-0000-0000-0000-000000000001', 'HackMD 筆記', 'hmd-note-01', '## 內容', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '[{"name":"HackMD","slug":"hackmd"}]');
select pg_temp.expect_eq((select count(*) from public.notes where hackmd_note_id='HmdNote01' and source_type='hackmd' and status='draft' and hackmd_content_hash is not null and hackmd_synced_at is not null), 1, '匯入為草稿並記錄來源與雜湊');
select pg_temp.expect_eq((select count(*) from public.note_tags nt join public.notes n on n.id = nt.note_id where n.hackmd_note_id='HmdNote01'), 1, '匯入時建立標籤');
insert into t_import select public.admin_import_hackmd_note('HmdNote01', '10000000-0000-0000-0000-000000000001', '再次匯入', 'hmd-note-01-b', '## 新', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '[]');
select pg_temp.expect_eq((select count(*) from t_import where (r->>'skipped')::boolean), 1, '重複匯入回傳 skipped');
select pg_temp.expect_eq((select count(*) from public.notes where hackmd_note_id='HmdNote01'), 1, '同一 HackMD 筆記只存在一份');
select pg_temp.expect_eq((select count(*) from public.notes where hackmd_note_id='HmdNote01' and title='HackMD 筆記'), 1, '重複匯入不覆蓋既有內容');
select pg_temp.expect_fail($$select public.admin_import_hackmd_note('../../etc', '10000000-0000-0000-0000-000000000001', 't', 'hmd-bad', 'x', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '[]')$$, '拒絕不合法的 HackMD ID');
select pg_temp.expect_fail($$select public.admin_import_hackmd_note('HmdNote02', '10000000-0000-0000-0000-000000000001', 't', 'hmd-bad-hash', 'x', 'nothex', '[]')$$, '拒絕不合法的內容雜湊');
select pg_temp.expect_fail($$select public.admin_import_hackmd_note('HmdNote03', '10000000-0000-0000-0000-000000000001', 't', 'phase4-note', 'x', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '[]')$$, '匯入時 slug 重複被拒');
select pg_temp.expect_fail($$select public.admin_import_hackmd_note('HmdNote04', '10000000-0000-0000-0000-000000000001', 't', 'hmd-atomic', 'x', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '[{"name":"x","slug":"Bad Slug"}]')$$, '標籤錯誤時整筆回滾');
-- admin 寫入同步紀錄
insert into public.hackmd_sync_logs (hackmd_note_id, note_id, status, http_status, finished_at) select 'HmdNote01', id, 'success', 200, now() from public.notes where hackmd_note_id='HmdNote01';
select pg_temp.expect_fail($$update public.hackmd_sync_logs set status = 'failed'$$, 'hackmd_sync_logs 不可修改');
reset role;
select pg_temp.expect_eq((select count(*) from public.notes where slug = 'hmd-atomic'), 0, '回滾後沒有殘留筆記');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect_eq((select count(*) from public.hackmd_sync_logs), 0, 'visitor 看不到同步紀錄');
reset role;

-- ── Phase 6：圖片管理與容量設定 ──
-- 以擁有者身分補上 Storage metadata 與登記資料
update storage.objects set metadata = '{"size": 2048, "mimetype": "image/png"}' where name = 'admin.png';
update storage.objects set metadata = '{"size": 1024, "mimetype": "image/webp"}' where name = 'draft.png';
insert into storage.objects (bucket_id, name, owner, metadata) values ('note-images', '2026/10/orphan.jpg', '00000000-0000-0000-0000-00000000000a', '{"size": 4096, "mimetype": "image/jpeg"}');
insert into public.note_assets (bucket, storage_path, mime_type, size_bytes, uploaded_by, original_name)
values ('note-images', 'admin.png', 'image/png', 2048, '00000000-0000-0000-0000-00000000000a', '截圖.png');
update public.notes set content_md = content_md || E'\n![圖](https://x.supabase.co/storage/v1/object/public/note-images/admin.png)' where slug = 'published-note';
select pg_temp.expect_fail($$insert into public.note_assets (bucket, storage_path, mime_type, size_bytes, original_name) values ('note-images', 'long.png', 'image/png', 1, repeat('a', 256))$$, 'original_name 長度限制');
select pg_temp.expect_fail($$insert into public.storage_settings (id) values (2)$$, 'storage_settings 只能有一列');

set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_fail($$select * from public.storage_settings$$, 'anon 不可讀容量設定');
select pg_temp.expect_fail($$select public.admin_storage_overview()$$, 'anon 不可呼叫容量統計');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect_eq((select count(*) from public.storage_settings), 0, 'visitor 讀不到容量設定（RLS）');
update public.storage_settings set quota_bytes = 2097152, updated_by = '00000000-0000-0000-0000-00000000000b';
select pg_temp.expect_fail($$select public.admin_storage_overview()$$, 'visitor 不可呼叫容量統計');
select pg_temp.expect_fail($$select * from public.admin_list_storage_objects('note-images')$$, 'visitor 不可列出圖片');
reset role;
select pg_temp.expect_eq((select count(*) from public.storage_settings where quota_bytes is null), 1, 'visitor 的 update 沒有生效，額度預設為 NULL（未設定）');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
update public.storage_settings set quota_bytes = 1073741824, notice_percent = 60, updated_by = '00000000-0000-0000-0000-00000000000a';
select pg_temp.expect_eq((select count(*) from public.storage_settings where quota_bytes = 1073741824 and notice_percent = 60), 1, 'admin 可更新額度');
select pg_temp.expect_fail($$update public.storage_settings set quota_bytes = 10, updated_by = '00000000-0000-0000-0000-00000000000a'$$, '額度低於 1MB 被拒');
select pg_temp.expect_fail($$update public.storage_settings set notice_percent = 90, warning_percent = 85, updated_by = '00000000-0000-0000-0000-00000000000a'$$, '門檻順序錯誤被拒');
select pg_temp.expect_fail($$update public.storage_settings set quota_bytes = 2097152, updated_by = '00000000-0000-0000-0000-00000000000b'$$, 'admin 不可冒用他人為修改者');
select pg_temp.expect_fail($$update public.storage_settings set id = 2$$, '不可修改 id 欄位');
select pg_temp.expect_fail($$delete from public.storage_settings$$, '不可刪除容量設定');
select pg_temp.expect_eq((select ((public.admin_storage_overview() -> 'untracked_count')::bigint)), 2, '統計：未登記檔案 2 個（draft.png、orphan.jpg）');
select pg_temp.expect_eq((select (b ->> 'bytes')::bigint from jsonb_array_elements(public.admin_storage_overview() -> 'buckets') b where b ->> 'bucket' = 'note-images'), 6144, '統計：note-images 總大小');
select pg_temp.expect_eq((select (b ->> 'largest')::bigint from jsonb_array_elements(public.admin_storage_overview() -> 'buckets') b where b ->> 'bucket' = 'note-images'), 4096, '統計：最大單一圖片');
select pg_temp.expect_eq((select case when (public.admin_storage_overview() ->> 'database_bytes')::bigint > 0 then 1 else 0 end), 1, '統計：資料庫大小');
select pg_temp.expect_eq((select count(*) from public.admin_list_storage_objects('note-images')), 2, '列出 note-images 全部檔案');
select pg_temp.expect_eq((select count(*) from public.admin_list_storage_objects('note-images', 48, 0, true)), 1, '只列未登記檔案');
select pg_temp.expect_eq((select reference_count from public.admin_list_storage_objects('note-images') where name = 'admin.png'), 1, '計算引用此圖片的筆記數');
select pg_temp.expect_eq((select count(*) from public.admin_list_storage_objects('note-images') where name = 'admin.png' and original_name = '截圖.png'), 1, '帶出原始檔名');
select pg_temp.expect_fail($$select * from public.admin_list_storage_objects('other-bucket')$$, '只允許兩個圖片 bucket');
reset role;
\o
\echo '✅ 全部 RLS / 約束測試通過'
