-- ════════════════════════════════════════════════════════════════════
-- Phase 5：HackMD 匯入
--   admin_import_hackmd_note()：在單一交易內建立「草稿」筆記與標籤。
--   已匯入過的 hackmd_note_id 不會重複建立（回傳既有筆記，skipped = true）；
--   notes_hackmd_note_id_unique 約束是並行匯入時的最終防線。
--   同步更新只改單一列，由應用程式以 updated_at 條件更新，不需另外的函式。
--   本 migration 不新增資料表；hackmd_sync_logs 已於 0001 建立（含 FK、RLS、索引）。
-- ════════════════════════════════════════════════════════════════════

create or replace function public.admin_import_hackmd_note(
  p_hackmd_note_id text,
  p_chapter_id uuid,
  p_title text,
  p_slug text,
  p_content_md text,
  p_content_hash text,
  p_tags jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.notes%rowtype;
  v_note public.notes%rowtype;
  v_tag jsonb;
  v_tag_name text;
  v_tag_slug text;
  v_tag_id uuid;
  v_tag_ids uuid[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'admin required' using errcode = '42501';
  end if;
  if p_hackmd_note_id is null or p_hackmd_note_id !~ '^[A-Za-z0-9_-]{4,64}$' then
    raise exception 'INVALID_HACKMD_NOTE_ID' using errcode = '22023';
  end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_CONTENT_HASH' using errcode = '22023';
  end if;
  if p_tags is null or jsonb_typeof(p_tags) <> 'array' then
    p_tags := '[]'::jsonb;
  end if;
  if jsonb_array_length(p_tags) > 20 then
    raise exception 'TOO_MANY_TAGS' using errcode = '22023';
  end if;

  select * into v_existing from public.notes n where n.hackmd_note_id = p_hackmd_note_id;
  if found then
    return jsonb_build_object('id', v_existing.id, 'created', false, 'skipped', true, 'status', v_existing.status);
  end if;

  insert into public.notes (chapter_id, title, slug, content_md, status, source_type, hackmd_note_id, hackmd_content_hash, hackmd_synced_at)
  values (p_chapter_id, p_title, p_slug, coalesce(p_content_md, ''), 'draft', 'hackmd', p_hackmd_note_id, p_content_hash, now())
  returning * into v_note;

  for v_tag in select * from jsonb_array_elements(p_tags) loop
    v_tag_name := btrim(v_tag ->> 'name');
    v_tag_slug := btrim(v_tag ->> 'slug');
    continue when v_tag_name is null or v_tag_name = '' or v_tag_slug is null or v_tag_slug = '';
    select t.id into v_tag_id from public.tags t
     where t.slug = v_tag_slug or lower(t.name) = lower(v_tag_name)
     order by (t.slug = v_tag_slug) desc limit 1;
    if v_tag_id is null then
      insert into public.tags (name, slug) values (v_tag_name, v_tag_slug) returning id into v_tag_id;
    end if;
    if not (v_tag_id = any (v_tag_ids)) then
      v_tag_ids := v_tag_ids || v_tag_id;
    end if;
    v_tag_id := null;
  end loop;

  insert into public.note_tags (note_id, tag_id)
  select v_note.id, t from unnest(v_tag_ids) as t
  on conflict do nothing;

  return jsonb_build_object('id', v_note.id, 'created', true, 'skipped', false, 'status', v_note.status);
end;
$$;

revoke all on function public.admin_import_hackmd_note(text, uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.admin_import_hackmd_note(text, uuid, text, text, text, text, jsonb) to authenticated;

-- 同步中心「已匯入筆記」列表使用
create index if not exists notes_hackmd_source_idx on public.notes (updated_at desc) where source_type = 'hackmd';
