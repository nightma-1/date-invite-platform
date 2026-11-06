-- © 2026 Senti. Все права защищены.
--
-- «Наш музей», третья часть: честные уведомления, напоминания о сроке,
-- защита от накрутки, фото от гостей, статистика для админки.

alter table museum_content
  add column if not exists lang text not null default 'ru' check (lang in ('ru', 'uz', 'en')),
  add column if not exists notified_at timestamptz,
  add column if not exists early_notified_at timestamptz;

create table if not exists museum_guest_photos (
  id bigint generated always as identity primary key,
  invitation_id uuid not null references invitations(id) on delete cascade,
  url text not null,
  author text not null check (char_length(author) between 1 and 24),
  w integer not null check (w > 0),
  h integer not null check (h > 0),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists museum_guest_photos_invitation on museum_guest_photos (invitation_id);

create table if not exists museum_rate (
  invitation_id uuid not null references invitations(id) on delete cascade,
  action text not null,
  window_start timestamptz not null default date_trunc('hour', now()),
  hits integer not null default 0,
  primary key (invitation_id, action)
);

alter table museum_guest_photos enable row level security;
alter table museum_rate enable row level security;
revoke all on museum_guest_photos, museum_rate from anon, authenticated;
grant select on museum_guest_photos to authenticated;
grant update (hidden) on museum_guest_photos to authenticated;

create policy "owner read guest photos" on museum_guest_photos for select to authenticated
  using (exists (select 1 from invitations i where i.id = invitation_id and (select auth.uid()) = i.user_id));
create policy "owner hide guest photos" on museum_guest_photos for update to authenticated
  using (exists (select 1 from invitations i where i.id = invitation_id and (select auth.uid()) = i.user_id));

-- Лимит на музей в час: ссылкой может поделиться кто угодно
create or replace function museum_rate_ok(p_id uuid, p_action text, p_limit integer)
returns boolean as $$
declare
  v_hits integer;
begin
  insert into museum_rate (invitation_id, action, window_start, hits)
  values (p_id, p_action, date_trunc('hour', now()), 1)
  on conflict (invitation_id, action) do update
    set hits = case when museum_rate.window_start = date_trunc('hour', now()) then museum_rate.hits + 1 else 1 end,
        window_start = date_trunc('hour', now())
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$ language plpgsql security definer set search_path = public;
revoke execute on function museum_rate_ok(uuid, text, integer) from public, anon, authenticated;

create or replace function museum_heart(p_slug text, p_photo integer)
returns integer as $$
declare
  v_id uuid := museum_open_id(p_slug);
  v_hearts integer;
begin
  if v_id is null or p_photo is null or p_photo < 0
     or p_photo >= (select jsonb_array_length(photos) from museum_content where invitation_id = v_id)
     or not museum_rate_ok(v_id, 'heart', 200) then
    return null;
  end if;
  insert into museum_hearts (invitation_id, photo_index, hearts) values (v_id, p_photo, 1)
  on conflict (invitation_id, photo_index)
    do update set hearts = least(museum_hearts.hearts + 1, 9999)
  returning hearts into v_hearts;
  return v_hearts;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function museum_sign(p_slug text, p_author text, p_message text)
returns boolean as $$
declare
  v_id uuid := museum_open_id(p_slug);
  v_author text := left(btrim(coalesce(p_author, '')), 24);
  v_message text := left(btrim(coalesce(p_message, '')), 300);
begin
  if v_id is null or v_author = '' or v_message = ''
     or (select count(*) from museum_guestbook where invitation_id = v_id) >= 200
     or not museum_rate_ok(v_id, 'sign', 15) then
    return false;
  end if;
  insert into museum_guestbook (invitation_id, author, message) values (v_id, v_author, v_message);
  perform notify_telegram(v_id, 'guestbook', jsonb_build_object('author', v_author, 'message', v_message));
  return true;
end;
$$ language plpgsql security definer set search_path = public;

-- Вход в музей. Автор получает сообщение сразу, а дальше не чаще раза в 30 минут:
-- вчетвером гости иначе засыпали бы его уведомлениями.
create or replace function museum_mark_entered(p_slug text)
returns void as $$
declare
  v_id uuid := museum_open_id(p_slug);
  v_views integer;
  v_notified timestamptz;
begin
  if v_id is null then return; end if;
  update invitations
     set first_viewed_at = coalesce(first_viewed_at, now()),
         last_viewed_at = now(),
         view_count = case when last_viewed_at is null or now() - last_viewed_at > interval '60 seconds'
                           then view_count + 1 else view_count end
   where id = v_id
   returning view_count into v_views;
  select notified_at into v_notified from museum_content where invitation_id = v_id;
  if v_notified is null or v_notified < now() - interval '30 minutes' then
    update museum_content set notified_at = now() where invitation_id = v_id;
    perform notify_telegram(v_id, 'viewed', jsonb_build_object('view_count', greatest(v_views, 1)));
  end if;
end;
$$ language plpgsql security definer set search_path = public;
revoke execute on function museum_mark_entered(text) from public;
grant execute on function museum_mark_entered(text) to anon, authenticated;

create or replace function museum_mark_early(p_slug text)
returns void as $$
declare
  v_id uuid;
  v_opens timestamptz;
  v_early timestamptz;
begin
  select i.id, c.opens_at, c.early_notified_at into v_id, v_opens, v_early
    from invitations i join museum_content c on c.invitation_id = i.id
   where i.slug = p_slug and i.kind = 'museum' and i.status = 'published' and c.opens_at > now();
  if v_id is null or (v_early is not null and v_early > now() - interval '6 hours') then return; end if;
  update museum_content set early_notified_at = now() where invitation_id = v_id;
  perform notify_telegram(v_id, 'early', jsonb_build_object('opens_at', v_opens));
end;
$$ language plpgsql security definer set search_path = public;
revoke execute on function museum_mark_early(text) from public;
grant execute on function museum_mark_early(text) to anon, authenticated;

-- Закрытая ссылка не видна получателю как строка таблицы, поэтому статус отдаём отдельно.
create or replace function museum_status(p_slug text)
returns text as $$
  select case when i.status = 'expired' or i.expires_at < now() then 'expired' end
    from invitations i where i.slug = p_slug and i.kind = 'museum';
$$ language sql stable security definer set search_path = public;
revoke execute on function museum_status(text) from public;
grant execute on function museum_status(text) to anon, authenticated;

create or replace function trg_notify_invitation_viewed()
returns trigger as $$
begin
  if new.kind = 'museum' then
    return new; -- музей сообщает о входе сам, см. museum_mark_entered
  end if;
  if new.view_count is distinct from old.view_count and new.view_count > 0 then
    perform notify_telegram(new.id, 'viewed', jsonb_build_object('view_count', new.view_count));
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;
revoke execute on function trg_notify_invitation_viewed() from public, anon, authenticated;

-- Приглашения: как раньше. Музей: за неделю и ещё раз за сутки, даже если ответ уже есть.
create or replace function public.send_expiry_reminders()
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  r record;
begin
  for r in
    select i.id, i.expires_at
      from invitations i
     where i.status = 'published'
       and i.expires_at > now()
       and (
         (i.kind = 'invite'
          and i.expiry_reminded_at is null
          and i.expires_at <= now() + interval '24 hours'
          and not exists (select 1 from responses x where x.invitation_id = i.id))
         or
         (i.kind = 'museum' and (
           (i.expiry_reminded_at is null and i.expires_at <= now() + interval '7 days')
           or (i.expires_at <= now() + interval '24 hours' and i.expiry_reminded_at < now() - interval '2 days')
         ))
       )
  loop
    perform notify_telegram(r.id, 'expiring', jsonb_build_object('expires_at', r.expires_at));
    update invitations set expiry_reminded_at = now() where id = r.id;
  end loop;
end;
$function$;

create or replace function museum_guest_slot(p_slug text)
returns uuid as $$
declare
  v_id uuid := museum_open_id(p_slug);
begin
  if v_id is null
     or (select count(*) from museum_guest_photos where invitation_id = v_id and not hidden) >= 6
     or not museum_rate_ok(v_id, 'guest_photo', 6) then
    return null;
  end if;
  return v_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function museum_add_guest_photo(p_id uuid, p_url text, p_author text, p_w integer, p_h integer)
returns void as $$
begin
  insert into museum_guest_photos (invitation_id, url, author, w, h) values (p_id, p_url, p_author, p_w, p_h);
  perform notify_telegram(p_id, 'guest_photo', jsonb_build_object('author', p_author));
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function museum_guest_slot(text) from public, anon, authenticated;
revoke execute on function museum_add_guest_photo(uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function museum_guest_slot(text) to service_role;
grant execute on function museum_add_guest_photo(uuid, text, text, integer, integer) to service_role;

drop function if exists get_museum(text);
create function get_museum(p_slug text)
returns jsonb as $$
  select case
    when c.opens_at is not null and c.opens_at > now() then
      jsonb_build_object('locked', true, 'opens_at', c.opens_at, 'recipient_name', i.recipient_name, 'lang', c.lang)
    else jsonb_build_object(
      'slug', i.slug,
      'recipient_name', i.recipient_name,
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

create or replace function admin_museum_stats(p_days integer default 30)
returns jsonb as $$
declare
  v_from timestamptz := now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 365));
begin
  if not exists (select 1 from profiles where id = (select auth.uid()) and is_admin) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'events', coalesce((
      select jsonb_object_agg(event, visitors) from (
        select event, count(distinct visitor_id) as visitors
          from analytics_events
         where occurred_at >= v_from and event like 'museum\_%'
         group by event
      ) e
    ), '{}'::jsonb),
    'paid', (select count(*) from payments p join invitations i on i.id = p.invitation_id
              where i.kind = 'museum' and p.status = 'paid' and p.purpose = 'publish' and p.created_at >= v_from),
    'extended', (select count(*) from payments p join invitations i on i.id = p.invitation_id
              where i.kind = 'museum' and p.status = 'paid' and p.purpose = 'extend' and p.created_at >= v_from),
    'revenue', (select coalesce(sum(p.amount), 0) from payments p join invitations i on i.id = p.invitation_id
              where i.kind = 'museum' and p.status = 'paid' and p.created_at >= v_from)
  );
end;
$$ language plpgsql stable security definer set search_path = public;
revoke execute on function admin_museum_stats(integer) from public, anon;
grant execute on function admin_museum_stats(integer) to authenticated;
