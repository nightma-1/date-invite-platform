-- Категории гифок как данные, а не захардкоженный список: админ заводит,
-- переименовывает и удаляет их сам, подписи хранятся сразу на трёх языках.
create table if not exists gif_categories (
  slug text primary key,
  label_ru text not null,
  label_en text not null,
  label_uz text not null,
  position int not null default 100,
  created_at timestamptz not null default now()
);

alter table gif_categories enable row level security;

-- Читают все (список нужен конструктору даже гостю), пишет только админ.
create policy "public read gif categories"
  on gif_categories for select using (true);

create policy "admin insert gif categories"
  on gif_categories for insert to authenticated
  with check (exists (select 1 from profiles p where p.id = (select auth.uid()) and p.is_admin));

create policy "admin update gif categories"
  on gif_categories for update to authenticated
  using (exists (select 1 from profiles p where p.id = (select auth.uid()) and p.is_admin));

create policy "admin delete gif categories"
  on gif_categories for delete to authenticated
  using (exists (select 1 from profiles p where p.id = (select auth.uid()) and p.is_admin));

-- Переносим шесть базовых категорий с их нынешними подписями из i18n.
insert into gif_categories (slug, label_ru, label_en, label_uz, position) values
  ('romantic', '❤️ Романтика', '❤️ Romantic', '❤️ Romantik', 10),
  ('flirty',   '😏 Флирт',     '😏 Flirty',   '😏 Flirt',    20),
  ('funny',    '😂 Смешные',   '😂 Funny',    '😂 Kulgili',  30),
  ('cute',     '🥹 Милые',     '🥹 Cute',     '🥹 Shirin',   40),
  ('bold',     '🔥 Яркие',     '🔥 Bold',     '🔥 Yorqin',   50),
  ('custom',   '✨ Другое',    '✨ Other',    '✨ Boshqa',   60)
on conflict (slug) do nothing;

-- И всё, что уже успели завести вручную прямо в media_library.
insert into gif_categories (slug, label_ru, label_en, label_uz, position)
select distinct m.category, m.category, m.category, m.category, 100
from media_library m
where m.category is not null
  and m.category <> ''
  and not exists (select 1 from gif_categories c where c.slug = m.category)
on conflict (slug) do nothing;
