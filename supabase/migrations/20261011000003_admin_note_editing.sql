-- ════════════════════════════════════════════════════════════════════
-- Phase 4：後台筆記編輯
--   admin_save_note()：在「單一交易」內新增 / 更新筆記並同步標籤，
--   並以 updated_at 做樂觀鎖，避免兩個分頁互相覆蓋。
--   本 migration 不新增資料表。
-- ════════════════════════════════════════════════════════════════════

create or replace function public.admin_save_note(
  p_id uuid,
  p_chapter_id uuid,
  p_title text,
  p_slug text,
  p_summary text,
  p_content_md text,
  p_status text,
  p_cover_image text,
  p_sort_order integer,
  p_tags jsonb,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security invoker            -- 以呼叫者身分執行：RLS 與欄位權限照常生效
set search_path = ''
as $$
declare
  v_note public.notes%rowtype;
  v_created boolean := false;
  v_tag jsonb;
  v_tag_name text;
  v_tag_slug text;
  v_tag_id uuid;
  v_tag_ids uuid[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'admin required' using errcode = '42501';
  end if;

  if p_tags is null or jsonb_typeof(p_tags) <> 'array' then
    p_tags := '[]'::jsonb;
  end if;
  if jsonb_array_length(p_tags) > 20 then
    raise exception 'TOO_MANY_TAGS' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.notes (chapter_id, title, slug, summary, content_md, status, cover_image, sort_order, source_type)
    values (p_chapter_id, p_title, p_slug, p_summary, coalesce(p_content_md, ''), p_status, p_cover_image, coalesce(p_sort_order, 0), 'manual')
    returning * into v_note;
    v_created := true;
  else
    update public.notes n
       set chapter_id = p_chapter_id,
           title = p_title,
           slug = p_slug,
           summary = p_summary,
           content_md = coalesce(p_content_md, ''),
           status = p_status,
           cover_image = p_cover_image,
           sort_order = coalesce(p_sort_order, 0)
     where n.id = p_id
       and (p_expected_updated_at is null or n.updated_at = p_expected_updated_at)
    returning * into v_note;

    if not found then
      if exists (select 1 from public.notes n where n.id = p_id) then
        raise exception 'NOTE_CONFLICT' using errcode = 'P0001', hint = '筆記已在其他地方被修改';
      end if;
      raise exception 'NOTE_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  -- 同步標籤（名稱或 slug 相同視為同一個標籤）
  for v_tag in select * from jsonb_array_elements(p_tags) loop
    v_tag_name := btrim(v_tag ->> 'name');
    v_tag_slug := btrim(v_tag ->> 'slug');
    continue when v_tag_name is null or v_tag_name = '' or v_tag_slug is null or v_tag_slug = '';

    select t.id into v_tag_id
      from public.tags t
     where t.slug = v_tag_slug or lower(t.name) = lower(v_tag_name)
     order by (t.slug = v_tag_slug) desc
     limit 1;

    if v_tag_id is null then
      insert into public.tags (name, slug) values (v_tag_name, v_tag_slug) returning id into v_tag_id;
    end if;

    if not (v_tag_id = any (v_tag_ids)) then
      v_tag_ids := v_tag_ids || v_tag_id;
    end if;
    v_tag_id := null;
  end loop;

  delete from public.note_tags nt where nt.note_id = v_note.id and not (nt.tag_id = any (v_tag_ids));
  insert into public.note_tags (note_id, tag_id)
  select v_note.id, t from unnest(v_tag_ids) as t
  on conflict do nothing;

  return jsonb_build_object(
    'id', v_note.id,
    'status', v_note.status,
    'updated_at', v_note.updated_at,
    'published_at', v_note.published_at,
    'created', v_created
  );
end;
$$;

revoke all on function public.admin_save_note(uuid, uuid, text, text, text, text, text, text, integer, jsonb, timestamptz) from public, anon;
grant execute on function public.admin_save_note(uuid, uuid, text, text, text, text, text, text, integer, jsonb, timestamptz) to authenticated;
