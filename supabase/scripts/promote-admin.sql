-- ════════════════════════════════════════════════════════════════════
-- 指定管理員（只執行一次）
--
-- 步驟：
--   1. Supabase Dashboard → Authentication → Users → Add user → Create new user
--      輸入管理員 Email 與高強度密碼（12 碼以上），勾選 Auto Confirm User。
--   2. 把下方 'ADMIN_EMAIL_HERE' 換成該 Email（只在 SQL Editor 中修改，不要 commit 真實 Email）。
--   3. 在 SQL Editor 執行本檔。
--
-- 此檔刻意不含任何真實帳號或密碼。
-- ════════════════════════════════════════════════════════════════════
do $$
declare
  target_email constant text := 'ADMIN_EMAIL_HERE';
  target_id uuid;
begin
  if target_email = 'ADMIN_EMAIL_HERE' then
    raise exception '請先把 ADMIN_EMAIL_HERE 換成管理員的 Email';
  end if;

  select id into target_id from auth.users where lower(email) = lower(target_email);
  if target_id is null then
    raise exception '找不到此 Email 的使用者，請先在 Authentication → Users 建立帳號';
  end if;

  update public.profiles
     set role = 'admin', username = 'iris'
   where id = target_id;

  raise notice '已將 % 設為 admin，顯示名稱 iris', target_email;
end;
$$;
