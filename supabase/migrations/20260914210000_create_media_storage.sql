-- © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invitation-media', 'invitation-media', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "public read invitation media"
  on storage.objects for select using (bucket_id = 'invitation-media');

create policy "authenticated upload own media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'invitation-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "owner delete own media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'invitation-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
