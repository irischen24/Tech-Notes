-- ════════════════════════════════════════════════════════════════════
-- Iris Notes — Phase 2 初始 Schema
-- 內容：資料表、約束、索引、updated_at trigger、角色函式、RLS、Storage bucket 與 policy
--
-- 安全原則：
--   1. 每張表都啟用 RLS，沒有 policy 的操作一律拒絕。
--   2. 寫入一律需 public.is_admin()；角色來源只有 profiles.role，且一般使用者無法修改此欄位。
--   3. 訪客（anon）只能讀取已發布筆記與其分類結構。
--   4. 本檔不含任何帳號、密碼或金鑰。管理員以 supabase/scripts/promote-admin.sql 手動指定。
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pg_trgm with schema extensions;

-- ─── 共用：updated_at trigger ─────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─── profiles ────────────────────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null,
  role        text not null default 'visitor',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_username_unique unique (username),
  constraint profiles_username_format check (username ~ '^[a-z0-9_][a-z0-9_.-]{1,31}$'),
  constraint profiles_role_check check (role in ('admin', 'visitor'))
);
comment on column public.profiles.role is '只能由資料庫擁有者（SQL Editor / migration）修改，authenticated 角色無此欄位的 UPDATE 權限';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 角色判斷：SECURITY DEFINER 以避開 profiles 自身 RLS 的遞迴；固定 search_path 防止劫持
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- 新使用者自動建立 profile，角色一律 visitor
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_name text;
begin
  base_name := lower(regexp_replace(split_part(coalesce(new.email, 'user'), '@', 1), '[^a-z0-9_.-]', '', 'gi'));
  if base_name = '' or base_name !~ '^[a-z0-9_]' then
    base_name := 'user';
  end if;
  insert into public.profiles (id, username, role)
  values (new.id, left(base_name, 20) || '_' || substr(replace(new.id::text, '-', ''), 1, 8), 'visitor');
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── categories（自我參照樹狀結構） ───────────────────────────────────
create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid references public.categories (id) on delete restrict,
  name         text not null,
  slug         text not null,
  description  text,
  icon         text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint categories_name_length check (char_length(name) between 1 and 80),
  constraint categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  constraint categories_not_self_parent check (parent_id is null or parent_id <> id),
  constraint categories_parent_slug_unique unique nulls not distinct (parent_id, slug)
);
create index categories_parent_sort_idx on public.categories (parent_id, sort_order);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- 防止父子循環（A→B→A）
create or replace function public.prevent_category_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is null then
    return new;
  end if;
  if exists (
    with recursive ancestors as (
      select c.id, c.parent_id, 1 as depth from public.categories c where c.id = new.parent_id
      union all
      select c.id, c.parent_id, a.depth + 1
      from public.categories c join ancestors a on c.id = a.parent_id
      where a.depth < 64
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception '分類不可設定為自己的子孫分類（循環參照）' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger categories_prevent_cycle
  before insert or update of parent_id on public.categories
  for each row execute function public.prevent_category_cycle();

-- ─── chapters ────────────────────────────────────────────────────────
create table public.chapters (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.categories (id) on delete restrict,
  title        text not null,
  slug         text not null,
  description  text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint chapters_title_length check (char_length(title) between 1 and 120),
  constraint chapters_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  constraint chapters_category_slug_unique unique (category_id, slug)
);
create index chapters_category_sort_idx on public.chapters (category_id, sort_order);

create trigger chapters_set_updated_at
  before update on public.chapters
  for each row execute function public.set_updated_at();

-- ─── notes ───────────────────────────────────────────────────────────
create table public.notes (
  id                   uuid primary key default gen_random_uuid(),
  chapter_id           uuid not null references public.chapters (id) on delete restrict,
  title                text not null,
  slug                 text not null,
  summary              text,
  content_md           text not null default '',
  source_type          text not null default 'manual',
  hackmd_note_id       text,
  hackmd_content_hash  text,
  hackmd_synced_at     timestamptz,
  status               text not null default 'draft',
  cover_image          text,
  sort_order           integer not null default 0,
  published_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint notes_title_length check (char_length(title) between 1 and 200),
  constraint notes_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  constraint notes_slug_unique unique (slug),
  constraint notes_summary_length check (summary is null or char_length(summary) <= 500),
  constraint notes_content_size check (octet_length(content_md) <= 1048576),
  constraint notes_source_type_check check (source_type in ('manual', 'hackmd')),
  constraint notes_hackmd_consistency check (
    (source_type = 'hackmd' and hackmd_note_id is not null) or (source_type = 'manual' and hackmd_note_id is null)
  ),
  constraint notes_hackmd_note_id_unique unique (hackmd_note_id),
  constraint notes_status_check check (status in ('draft', 'published', 'archived')),
  constraint notes_published_at_required check (status <> 'published' or published_at is not null)
);
create index notes_chapter_sort_idx on public.notes (chapter_id, sort_order, created_at);
create index notes_published_idx on public.notes (published_at desc) where status = 'published';
create index notes_title_trgm_idx on public.notes using gin (title extensions.gin_trgm_ops);
create index notes_content_trgm_idx on public.notes using gin (content_md extensions.gin_trgm_ops);

-- 發布時自動補 published_at；首次發布時間在重新發布時保留
create or replace function public.notes_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger notes_before_write
  before insert or update on public.notes
  for each row execute function public.notes_before_write();

-- ─── tags / note_tags ────────────────────────────────────────────────
create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null,
  created_at  timestamptz not null default now(),
  constraint tags_name_length check (char_length(name) between 1 and 40),
  constraint tags_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  constraint tags_name_unique unique (name),
  constraint tags_slug_unique unique (slug)
);

create table public.note_tags (
  note_id  uuid not null references public.notes (id) on delete cascade,
  tag_id   uuid not null references public.tags (id) on delete cascade,
  primary key (note_id, tag_id)
);
-- PK 已涵蓋 note_id 開頭的查詢；反向查詢（某標籤下的筆記）需另建索引
create index note_tags_tag_idx on public.note_tags (tag_id);

-- ─── note_assets ─────────────────────────────────────────────────────
create table public.note_assets (
  id            uuid primary key default gen_random_uuid(),
  note_id       uuid references public.notes (id) on delete set null,
  bucket        text not null,
  storage_path  text not null,
  mime_type     text not null,
  size_bytes    bigint not null,
  uploaded_by   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint note_assets_bucket_check check (bucket in ('note-images', 'note-drafts')),
  constraint note_assets_mime_check check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif')),
  constraint note_assets_size_check check (size_bytes > 0 and size_bytes <= 10485760),
  constraint note_assets_path_format check (storage_path !~ '(^/|\.\.)'),
  constraint note_assets_bucket_path_unique unique (bucket, storage_path)
);
create index note_assets_note_idx on public.note_assets (note_id);
create index note_assets_uploaded_by_idx on public.note_assets (uploaded_by);
create index note_assets_created_idx on public.note_assets (created_at desc);

-- ─── hackmd_sync_logs ────────────────────────────────────────────────
create table public.hackmd_sync_logs (
  id              uuid primary key default gen_random_uuid(),
  hackmd_note_id  text not null,
  note_id         uuid references public.notes (id) on delete set null,
  status          text not null,
  http_status     integer,
  error_code      text,
  error_message   text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  constraint hackmd_sync_logs_status_check check (status in ('success', 'conflict', 'failed', 'skipped')),
  constraint hackmd_sync_logs_http_status_check check (http_status is null or http_status between 100 and 599),
  constraint hackmd_sync_logs_error_length check (error_message is null or char_length(error_message) <= 2000),
  constraint hackmd_sync_logs_time_order check (finished_at is null or finished_at >= started_at)
);
create index hackmd_sync_logs_hackmd_note_idx on public.hackmd_sync_logs (hackmd_note_id, started_at desc);
create index hackmd_sync_logs_note_idx on public.hackmd_sync_logs (note_id);
create index hackmd_sync_logs_started_idx on public.hackmd_sync_logs (started_at desc);

-- ─── audit_logs（只新增、不可修改或刪除） ─────────────────────────────
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.profiles (id) on delete set null,
  action       text not null,
  entity_type  text not null,
  entity_id    text,
  result       text not null,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  constraint audit_logs_action_format check (action ~ '^[a-z_]+(\.[a-z_]+)*$' and char_length(action) <= 64),
  constraint audit_logs_entity_type_length check (char_length(entity_type) between 1 and 64),
  constraint audit_logs_result_check check (result in ('success', 'failure')),
  constraint audit_logs_metadata_object check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 16384)
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

-- ════════════════════════════════════════════════════════════════════
-- 權限（Supabase 預設會把 public 表的全部權限給 anon / authenticated，這裡收斂）
-- ════════════════════════════════════════════════════════════════════
revoke all on all tables in schema public from anon, authenticated;

grant select on public.categories, public.chapters, public.notes, public.tags, public.note_tags to anon, authenticated;
grant insert, update, delete on public.categories, public.chapters, public.notes, public.tags, public.note_tags to authenticated;
grant select, insert, update, delete on public.note_assets to authenticated;
grant select, insert on public.hackmd_sync_logs, public.audit_logs to authenticated;

-- profiles：只允許更新 username；role 欄位沒有 UPDATE 權限
grant select on public.profiles to authenticated;
grant update (username) on public.profiles to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════════════════════════════
alter table public.profiles          enable row level security;
alter table public.categories        enable row level security;
alter table public.chapters          enable row level security;
alter table public.notes             enable row level security;
alter table public.tags              enable row level security;
alter table public.note_tags         enable row level security;
alter table public.note_assets       enable row level security;
alter table public.hackmd_sync_logs  enable row level security;
alter table public.audit_logs        enable row level security;

-- profiles
create policy "profiles: 讀取自己或 admin 讀全部" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy "profiles: 只能更新自己的 username" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- categories / chapters / tags：結構公開可讀，admin 可寫
create policy "categories: 公開讀取" on public.categories for select to anon, authenticated using (true);
create policy "categories: admin 新增" on public.categories for insert to authenticated with check ((select public.is_admin()));
create policy "categories: admin 修改" on public.categories for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "categories: admin 刪除" on public.categories for delete to authenticated using ((select public.is_admin()));

create policy "chapters: 公開讀取" on public.chapters for select to anon, authenticated using (true);
create policy "chapters: admin 新增" on public.chapters for insert to authenticated with check ((select public.is_admin()));
create policy "chapters: admin 修改" on public.chapters for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "chapters: admin 刪除" on public.chapters for delete to authenticated using ((select public.is_admin()));

create policy "tags: 公開讀取" on public.tags for select to anon, authenticated using (true);
create policy "tags: admin 新增" on public.tags for insert to authenticated with check ((select public.is_admin()));
create policy "tags: admin 修改" on public.tags for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "tags: admin 刪除" on public.tags for delete to authenticated using ((select public.is_admin()));

-- notes：訪客只看已發布；admin 看全部
create policy "notes: 已發布公開，admin 可讀全部" on public.notes
  for select to anon, authenticated
  using (status = 'published' or (select public.is_admin()));
create policy "notes: admin 新增" on public.notes for insert to authenticated with check ((select public.is_admin()));
create policy "notes: admin 修改" on public.notes for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "notes: admin 刪除" on public.notes for delete to authenticated using ((select public.is_admin()));

-- note_tags：跟隨筆記可見性
create policy "note_tags: 隨筆記可見性" on public.note_tags
  for select to anon, authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.notes n where n.id = note_id and n.status = 'published')
  );
create policy "note_tags: admin 新增" on public.note_tags for insert to authenticated with check ((select public.is_admin()));
create policy "note_tags: admin 刪除" on public.note_tags for delete to authenticated using ((select public.is_admin()));

-- note_assets：僅 admin（公開圖片透過 Storage public URL 讀取，不經此表）
create policy "note_assets: admin 全權" on public.note_assets
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and uploaded_by = (select auth.uid()));

-- 日誌：admin 可讀、可新增；沒有 update / delete policy = 不可竄改
create policy "hackmd_sync_logs: admin 讀取" on public.hackmd_sync_logs for select to authenticated using ((select public.is_admin()));
create policy "hackmd_sync_logs: admin 新增" on public.hackmd_sync_logs for insert to authenticated with check ((select public.is_admin()));

create policy "audit_logs: admin 讀取" on public.audit_logs for select to authenticated using ((select public.is_admin()));
create policy "audit_logs: admin 新增（actor 必須是自己）" on public.audit_logs
  for insert to authenticated
  with check ((select public.is_admin()) and actor_id = (select auth.uid()));

-- ════════════════════════════════════════════════════════════════════
-- Storage
--   note-images：public bucket，只放「已發布或確定可公開」的圖片（知道網址即可讀取）
--   note-drafts：private bucket，草稿附件，只有 admin 可讀寫（之後以 signed URL 預覽）
-- ════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('note-images', 'note-images', true,  10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']),
  ('note-drafts', 'note-drafts', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- public bucket 的檔案透過 public URL 讀取，不需要 SELECT policy；
-- 這裡的 SELECT 只開給 admin，避免訪客透過 API 列舉所有檔案。
create policy "storage: admin 讀取 Iris 圖片" on storage.objects
  for select to authenticated
  using (bucket_id in ('note-images', 'note-drafts') and (select public.is_admin()));
create policy "storage: admin 上傳 Iris 圖片" on storage.objects
  for insert to authenticated
  with check (bucket_id in ('note-images', 'note-drafts') and (select public.is_admin()));
create policy "storage: admin 更新 Iris 圖片" on storage.objects
  for update to authenticated
  using (bucket_id in ('note-images', 'note-drafts') and (select public.is_admin()))
  with check (bucket_id in ('note-images', 'note-drafts') and (select public.is_admin()));
create policy "storage: admin 刪除 Iris 圖片" on storage.objects
  for delete to authenticated
  using (bucket_id in ('note-images', 'note-drafts') and (select public.is_admin()));
