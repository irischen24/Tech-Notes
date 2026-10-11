-- ⚠ 測試用範例資料，只用於本機整合測試（PostgREST + Next.js），不可匯入正式 Supabase。
insert into public.chapters (id, category_id, title, slug, sort_order)
select 'c0000000-0000-0000-0000-000000000001', id, 'JOIN 與資料表關聯', 'joins', 10 from public.categories where slug = 'sql';

insert into public.tags (id, name, slug) values
  ('d0000000-0000-0000-0000-000000000001', 'SQL', 'sql'),
  ('d0000000-0000-0000-0000-000000000002', 'JOIN', 'join');

insert into public.notes (id, chapter_id, title, slug, summary, content_md, status, sort_order) values
('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'INNER JOIN', 'inner-join', '只保留兩表都有對應的資料列。',
$md$## 1. 語法名稱

INNER JOIN

## 2. 一句話定義

只回傳兩張表**都有**對應的資料。

### 基本語法

```sql
SELECT o.id, c.name
FROM orders AS o
INNER JOIN customers AS c ON c.id = o.customer_id;
```

| 參數 | 說明 |
| --- | --- |
| `ON` | 連接條件 |

## 2. 一句話定義

重複標題測試。

<script>window.__xss = 1</script>
<img src=x onerror="window.__xss=2">

[危險連結](javascript:alert(1))
[外部連結](https://www.postgresql.org/docs/)
![data 圖](data:image/png;base64,AAAA)
![http 圖](http://example.com/a.png)

- [x] 已完成
- [ ] 未完成
$md$, 'published', 10),
('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'LEFT JOIN', 'left-join', '保留左表所有資料列。',
$md$## 定義

LEFT JOIN 保留左表。

```python
print("hello")
```
$md$, 'published', 20),
('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'FULL JOIN 草稿', 'full-join', '尚未發布', '機密草稿內容', 'draft', 30);

insert into public.note_tags values
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002');
