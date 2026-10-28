-- © 2026 Senti. Все права защищены.
--
-- Тексты сайта, которые владелец правит сам из админки (/xujayin), без
-- выкатки кода. Первый ключ — 'landing_demo': образец приглашения на
-- главной (имя, вопрос, тексты экранов, варианты мест и еды) по языкам:
--   { "ru": { "recipientName": "...", ... }, "uz": { ... }, "en": { ... } }
-- Пустое поле = текст по умолчанию из переводов сайта.
--
-- Читать может кто угодно (это публичный текст главной), менять — только
-- админ (profiles.is_admin).

create table if not exists site_content (
  key        text primary key check (key ~ '^[a-z][a-z0-9_]{2,39}$'),
  value      jsonb not null default '{}'::jsonb
             check (jsonb_typeof(value) = 'object' and pg_column_size(value) < 20000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table site_content enable row level security;

revoke all on site_content from anon, authenticated;
grant select on site_content to anon, authenticated;
grant insert, update on site_content to authenticated;

drop policy if exists "site content is public" on site_content;
create policy "site content is public" on site_content
  for select to anon, authenticated using (true);

drop policy if exists "admins insert site content" on site_content;
create policy "admins insert site content" on site_content
  for insert to authenticated
  with check (exists (select 1 from profiles p where p.id = (select auth.uid()) and p.is_admin));

drop policy if exists "admins update site content" on site_content;
create policy "admins update site content" on site_content
  for update to authenticated
  using (exists (select 1 from profiles p where p.id = (select auth.uid()) and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = (select auth.uid()) and p.is_admin));

create or replace function trg_site_content_stamp()
returns trigger as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists trg_site_content_stamp on site_content;
create trigger trg_site_content_stamp
  before insert or update on site_content
  for each row execute function trg_site_content_stamp();
