-- ════════════════════════════════════════════════════════════════════
-- Phase 3：公開閱讀與搜尋
--   1. 分類 slug 改為全域唯一，讓 /categories/[slug] 可以唯一定位（保留原本的 (parent_id, slug) 約束，seed 的 ON CONFLICT 仍可使用）
--   2. search_published_notes()：安全的全文模糊搜尋（取代在前端拼接 PostgREST or() 字串）
--   本 migration 不新增資料表。
-- ════════════════════════════════════════════════════════════════════

alter table public.categories
  add constraint categories_slug_unique unique (slug);

-- 搜尋：只回傳已發布筆記。
-- SECURITY INVOKER（預設）→ 以呼叫者身分執行，RLS 照常生效；即使被 admin 呼叫，也額外限制 status = 'published'。
-- 使用者輸入只作為參數，並跳脫 LIKE 萬用字元，不會被當成 SQL 或 PostgREST 語法。
create or replace function public.search_published_notes(search_query text, max_results integer default 30)
returns table (
  id uuid,
  title text,
  summary text,
  published_at timestamptz,
  chapter_title text,
  category_name text,
  category_slug text,
  match_in text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  q text := btrim(coalesce(search_query, ''));
  pattern text;
  lim integer := least(greatest(coalesce(max_results, 30), 1), 50);
begin
  if char_length(q) < 1 or char_length(q) > 100 then
    return;
  end if;
  pattern := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
  select
    n.id,
    n.title,
    n.summary,
    n.published_at,
    ch.title as chapter_title,
    c.name  as category_name,
    c.slug  as category_slug,
    case
      when n.title ilike pattern then 'title'
      when exists (
        select 1 from public.note_tags nt join public.tags t on t.id = nt.tag_id
        where nt.note_id = n.id and t.name ilike pattern
      ) then 'tag'
      when coalesce(n.summary, '') ilike pattern then 'summary'
      else 'content'
    end as match_in
  from public.notes n
  join public.chapters ch on ch.id = n.chapter_id
  join public.categories c on c.id = ch.category_id
  where n.status = 'published'
    and (
      n.title ilike pattern
      or coalesce(n.summary, '') ilike pattern
      or n.content_md ilike pattern
      or exists (
        select 1 from public.note_tags nt join public.tags t on t.id = nt.tag_id
        where nt.note_id = n.id and t.name ilike pattern
      )
    )
  order by
    (n.title ilike pattern) desc,
    n.published_at desc nulls last
  limit lim;
end;
$$;

revoke all on function public.search_published_notes(text, integer) from public;
grant execute on function public.search_published_notes(text, integer) to anon, authenticated;
