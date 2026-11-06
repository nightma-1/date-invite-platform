-- © 2026 Senti. Все права защищены.
--
-- Получателю персонаж предлагается по полу, который указал автор. Выбор остаётся
-- за человеком: по одной ссылке в музей заходят и автор, и гости.
-- Полный текст функции get_museum — как в museum_v3, плюс поле recipient_gender.

create or replace function get_museum(p_slug text)
returns jsonb as $$
  select case
    when c.opens_at is not null and c.opens_at > now() then
      jsonb_build_object('locked', true, 'opens_at', c.opens_at, 'recipient_name', i.recipient_name, 'lang', c.lang)
    else jsonb_build_object(
      'slug', i.slug,
      'recipient_name', i.recipient_name,
      'recipient_gender', i.recipient_gender,
      'author_name', c.author_name,
      'dedication', c.dedication,
      'signature', c.signature,
      'photos', c.photos,
      'video_url', c.video_url,
      'theme', c.theme,
      'voice_url', c.voice_url,
      'song_url', c.song_url,
      'ambient', c.ambient,
      'finale_question', c.finale_question,
      'lang', c.lang,
      'hearts', coalesce((select jsonb_object_agg(h.photo_index::text, h.hearts) from museum_hearts h where h.invitation_id = i.id), '{}'::jsonb),
      'guestbook', coalesce((
        select jsonb_agg(jsonb_build_object('author', g.author, 'message', g.message) order by g.created_at desc)
        from (select * from museum_guestbook x where x.invitation_id = i.id order by x.created_at desc limit 50) g
      ), '[]'::jsonb),
      'guest_photos', coalesce((
        select jsonb_agg(jsonb_build_object('url', p.url, 'author', p.author, 'w', p.w, 'h', p.h) order by p.created_at)
        from museum_guest_photos p where p.invitation_id = i.id and not p.hidden
      ), '[]'::jsonb)
    )
  end
  from invitations i
  join museum_content c on c.invitation_id = i.id
  where i.slug = p_slug
    and i.kind = 'museum'
    and i.status = 'published'
    and (i.expires_at is null or i.expires_at > now());
$$ language sql stable security definer set search_path = public;
revoke execute on function get_museum(text) from public;
grant execute on function get_museum(text) to anon, authenticated;

