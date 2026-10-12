-- ⚠ 只供本機 PostgreSQL 測試 migration 與 RLS 使用，絕不可在 Supabase 執行。
-- 模擬 Supabase 預設提供的 roles、auth schema、storage schema 與預設權限。
-- roles 屬於整個 cluster，重複執行時略過
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema extensions;
create schema auth;
create schema storage;
grant usage on schema public, auth, storage, extensions to anon, authenticated;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz default now()
);

-- 與 Supabase 相同：同時支援舊版 request.jwt.claim.sub 與 PostgREST 新版 request.jwt.claims
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated;

-- Supabase 預設：public schema 新表自動授權給 anon / authenticated
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
