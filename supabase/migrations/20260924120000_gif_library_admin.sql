-- © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).

-- ============================================================
-- Библиотека гифок: администратор может пополнять её из
-- админ-панели (не только через Supabase Dashboard вручную).
-- Публичное чтение активных записей уже есть (harden_security).
-- ============================================================

create policy "admin insert media_library"
  on media_library for insert to authenticated
  with check (exists (
    select 1 from profiles p where p.id = (select auth.uid()) and p.is_admin
  ));

create policy "admin update media_library"
  on media_library for update to authenticated
  using (exists (
    select 1 from profiles p where p.id = (select auth.uid()) and p.is_admin
  ))
  with check (exists (
    select 1 from profiles p where p.id = (select auth.uid()) and p.is_admin
  ));

create policy "admin delete media_library"
  on media_library for delete to authenticated
  using (exists (
    select 1 from profiles p where p.id = (select auth.uid()) and p.is_admin
  ));

-- Отдельный публичный бакет под библиотеку гифок — отделён от
-- invitation-media (там путь = user_id, тут файлы общие для всех).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gif-library', 'gif-library', true, 8388608,
        array['image/gif', 'image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "public read gif library"
  on storage.objects for select using (bucket_id = 'gif-library');

create policy "admin write gif library"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'gif-library'
    and exists (select 1 from profiles p where p.id = (select auth.uid()) and p.is_admin)
  );

create policy "admin delete gif library"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'gif-library'
    and exists (select 1 from profiles p where p.id = (select auth.uid()) and p.is_admin)
  );
