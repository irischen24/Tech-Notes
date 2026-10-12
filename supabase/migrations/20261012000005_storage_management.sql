-- ════════════════════════════════════════════════════════════════════
-- Phase 6：圖片管理與容量警告
--   1. note_assets.original_name：保留原始檔名（只用於顯示，實際路徑由伺服器產生）
--   2. storage_settings（新資料表，單列）：管理員自訂容量額度與警告門檻
--      額度預設為 NULL（尚未設定），不寫死任何 Supabase 方案數字
--   3. admin_storage_overview() / admin_list_storage_objects()：以 storage.objects 為準統計與列出圖片
--      兩者皆 SECURITY INVOKER：admin 依既有 storage.objects RLS 可讀取兩個 bucket，其他角色看不到任何資料
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. note_assets.original_name ───────────────────────────────────
alter table public.note_assets
  add column original_name text,
  add constraint note_assets_original_name_length check (original_name is null or char_length(original_name) between 1 and 255);

-- ─── 2. storage_settings ────────────────────────────────────────────
create table public.storage_settings (
  id                smallint primary key default 1,
  quota_bytes       bigint,
  notice_percent    smallint not null default 70,
  warning_percent   smallint not null default 85,
  critical_percent  smallint not null default 95,
  updated_by        uuid references public.profiles (id) on delete set null,
  updated_at        timestamptz not null default now(),
  constraint storage_settings_singleton check (id = 1),
  constraint storage_settings_quota_range check (quota_bytes is null or quota_bytes between 1048576 and 1099511627776),
  constraint storage_settings_threshold_order check (
    notice_percent > 0 and notice_percent < warning_percent and warning_percent < critical_percent and critical_percent <= 100
  )
);
comment on table public.storage_settings is '單列設定：圖片容量額度（管理員自行輸入，非 Supabase 即時計費資料）與警告門檻';

-- FK 欄位索引（刪除 profile 時 ON DELETE SET NULL 需要）
create index storage_settings_updated_by_idx on public.storage_settings (updated_by);

create trigger storage_settings_set_updated_at
  before update on public.storage_settings
  for each row execute function public.set_updated_at();

insert into public.storage_settings (id) values (1) on conflict (id) do nothing;

revoke all on public.storage_settings from anon, authenticated;
grant select on public.storage_settings to authenticated;
grant update (quota_bytes, notice_percent, warning_percent, critical_percent, updated_by) on public.storage_settings to authenticated;

alter table public.storage_settings enable row level security;
create policy "storage_settings: admin 讀取" on public.storage_settings
  for select to authenticated using ((select public.is_admin()));
create policy "storage_settings: admin 修改（記錄修改者）" on public.storage_settings
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()) and updated_by = (select auth.uid()));
-- 沒有 insert / delete policy：單列由 migration 建立，不可新增或刪除

-- ─── 3. 統計與列表函式 ─────────────────────────────────────────────
create or replace function public.admin_storage_overview()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_buckets jsonb;
  v_untracked bigint;
begin
  if not public.is_admin() then
    raise exception 'admin required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(b order by b ->> 'bucket'), '[]'::jsonb) into v_buckets
  from (
    select jsonb_build_object(
      'bucket', o.bucket_id,
      'count', count(*),
      'bytes', coalesce(sum((o.metadata ->> 'size')::bigint), 0),
      'largest', coalesce(max((o.metadata ->> 'size')::bigint), 0)
    ) as b
    from storage.objects o
    where o.bucket_id in ('note-images', 'note-drafts')
    group by o.bucket_id
  ) s;

  select count(*) into v_untracked
  from storage.objects o
  where o.bucket_id in ('note-images', 'note-drafts')
    and not exists (select 1 from public.note_assets a where a.bucket = o.bucket_id and a.storage_path = o.name);

  return jsonb_build_object(
    'buckets', v_buckets,
    'untracked_count', v_untracked,
    'database_bytes', pg_database_size(current_database())
  );
end;
$$;

create or replace function public.admin_list_storage_objects(
  p_bucket text,
  p_limit integer default 48,
  p_offset integer default 0,
  p_untracked_only boolean default false
)
returns table (
  bucket text,
  name text,
  size_bytes bigint,
  mime_type text,
  created_at timestamptz,
  asset_id uuid,
  original_name text,
  note_id uuid,
  reference_count bigint,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin required' using errcode = '42501';
  end if;
  if p_bucket not in ('note-images', 'note-drafts') then
    raise exception 'INVALID_BUCKET' using errcode = '22023';
  end if;

  return query
  with objs as (
    select o.bucket_id, o.name, o.created_at,
           coalesce((o.metadata ->> 'size')::bigint, 0) as size_bytes,
           o.metadata ->> 'mimetype' as mime_type
    from storage.objects o
    where o.bucket_id = p_bucket
  ),
  joined as (
    select objs.*, a.id as asset_id, a.original_name, a.note_id
    from objs
    left join public.note_assets a on a.bucket = objs.bucket_id and a.storage_path = objs.name
    where not p_untracked_only or a.id is null
  )
  select j.bucket_id, j.name, j.size_bytes, j.mime_type, j.created_at, j.asset_id, j.original_name, j.note_id,
         (select count(*) from public.notes n
           where strpos(n.content_md, j.name) > 0 or strpos(coalesce(n.cover_image, ''), j.name) > 0) as reference_count,
         count(*) over () as total_count
  from joined j
  order by j.created_at desc
  limit least(greatest(coalesce(p_limit, 48), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_storage_overview() from public, anon;
revoke all on function public.admin_list_storage_objects(text, integer, integer, boolean) from public, anon;
grant execute on function public.admin_storage_overview() to authenticated;
grant execute on function public.admin_list_storage_objects(text, integer, integer, boolean) to authenticated;
