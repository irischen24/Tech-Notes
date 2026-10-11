-- 初始分類（規格第五節）。可重複執行：已存在的 slug 會略過。
-- 在 Supabase SQL Editor 以專案擁有者身分執行（會繞過 RLS）。
with roots(name, slug, icon, sort_order) as (
  values
    ('Database', 'database', 'database', 10),
    ('Linux', 'linux', 'terminal', 20),
    ('Programming', 'programming', 'code', 30),
    ('Artificial Intelligence', 'artificial-intelligence', 'brain', 40),
    ('Cybersecurity', 'cybersecurity', 'shield', 50)
)
insert into public.categories (name, slug, icon, sort_order)
select name, slug, icon, sort_order from roots
on conflict (parent_id, slug) do nothing;

with children(parent_slug, name, slug, sort_order) as (
  values
    ('database', 'MariaDB', 'mariadb', 10),
    ('database', 'PostgreSQL', 'postgresql', 20),
    ('database', 'SQL', 'sql', 30),
    ('database', '資料表關聯', 'table-relations', 40),
    ('linux', '基礎指令', 'basic-commands', 10),
    ('linux', 'Apache2', 'apache2', 20),
    ('linux', '使用者與權限', 'users-and-permissions', 30),
    ('linux', 'Linux 網站部署', 'web-deployment', 40),
    ('programming', 'Python', 'python', 10),
    ('programming', 'PHP', 'php', 20),
    ('programming', 'JavaScript', 'javascript', 30),
    ('programming', 'Godot', 'godot', 40),
    ('artificial-intelligence', 'AI Agent', 'ai-agent', 10),
    ('artificial-intelligence', 'RAG', 'rag', 20),
    ('artificial-intelligence', 'Prompt Engineering', 'prompt-engineering', 30),
    ('cybersecurity', 'NIST CSF', 'nist-csf', 10),
    ('cybersecurity', 'NIST SP 800-30', 'nist-sp-800-30', 20),
    ('cybersecurity', 'ISO 27001', 'iso-27001', 30),
    ('cybersecurity', 'FAIR', 'fair', 40),
    ('cybersecurity', 'CIS Controls', 'cis-controls', 50)
)
insert into public.categories (parent_id, name, slug, sort_order)
select p.id, c.name, c.slug, c.sort_order
from children c
join public.categories p on p.slug = c.parent_slug and p.parent_id is null
on conflict (parent_id, slug) do nothing;
