-- © 2026 Senti. Все права защищены.
--
-- «Наш музей», вторая часть: тарифы, темы залов, звук, подписи к фото,
-- финальный вопрос, открытие в выбранный момент, сердечки и книга отзывов.
--
-- Главное правило: платные возможности определяет снимок в payments.features.
-- Его пишет сервер в момент создания платежа, поэтому всё, что автор дописал
-- после этого, при публикации приводится к оплаченному.

alter table museum_content
  add column if not exists tier text not null default 'full' check (tier in ('lite', 'full')),
  add column if not exists theme text not null default 'classic'
    check (theme in ('classic', 'night', 'garden', 'samarkand', 'valentine')),
  add column if not exists voice_url text,
  add column if not exists song_url text,
  add column if not exists ambient text not null default 'warm' check (ambient in ('off', 'warm', 'dream')),
  add column if not exists finale_question text not null default '' check (char_length(finale_question) <= 120),
  add column if not exists opens_at timestamptz;

alter table museum_content drop constraint if exists museum_photos_size;
alter table museum_content add constraint museum_photos_size check (pg_column_size(photos) < 64000);

alter table payments add column if not exists features jsonb;

create table if not exists museum_hearts (
  invitation_id uuid not null references invitations(id) on delete cascade,
  photo_index smallint not null check (photo_index between 0 and 44),
  hearts integer not null default 0 check (hearts between 0 and 9999),
  primary key (invitation_id, photo_index)
);

create table if not exists museum_guestbook (
  id bigint generated always as identity primary key,
  invitation_id uuid not null references invitations(id) on delete cascade,
  author text not null check (char_length(author) between 1 and 24),
  message text not null check (char_length(message) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists museum_guestbook_invitation on museum_guestbook (invitation_id, created_at desc);

alter table museum_hearts enable row level security;
alter table museum_guestbook enable row level security;

revoke all on museum_hearts, museum_guestbook from anon, authenticated;
grant select, delete on museum_guestbook to authenticated;

create policy "owner read guestbook" on museum_guestbook for select to authenticated
  using (exists (select 1 from invitations i where i.id = invitation_id and (select auth.uid()) = i.user_id));
create policy "owner delete guestbook" on museum_guestbook for delete to authenticated
  using (exists (select 1 from invitations i where i.id = invitation_id and (select auth.uid()) = i.user_id));

-- До открытия отдаём только имя и время: содержимое сервер не показывает вовсе,
-- поэтому сюрприз нельзя подсмотреть через консоль браузера.
drop function if exists get_museum(text);
create function get_museum(p_slug text)
returns jsonb as $$
  select case
    when c.opens_at is not null and c.opens_at > now() then
      jsonb_build_object('locked', true, 'opens_at', c.opens_at, 'recipient_name', i.recipient_name)
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
      'hearts', coalesce((select jsonb_object_agg(h.photo_index::text, h.hearts) from museum_hearts h where h.invitation_id = i.id), '{}'::jsonb),
      'guestbook', coalesce((
        select jsonb_agg(jsonb_build_object('author', g.author, 'message', g.message) order by g.created_at desc)
        from (select * from museum_guestbook x where x.invitation_id = i.id order by x.created_at desc limit 50) g
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

create or replace function museum_open_id(p_slug text)
returns uuid as $$
  select i.id
    from invitations i
    join museum_content c on c.invitation_id = i.id
   where i.slug = p_slug and i.kind = 'museum' and i.status = 'published'
     and (i.expires_at is null or i.expires_at > now())
     and (c.opens_at is null or c.opens_at <= now());
$$ language sql stable security definer set search_path = public;

revoke execute on function museum_open_id(text) from public, anon, authenticated;

create or replace function museum_heart(p_slug text, p_photo integer)
returns integer as $$
declare
  v_id uuid := museum_open_id(p_slug);
  v_hearts integer;
begin
  if v_id is null or p_photo is null or p_photo < 0
     or p_photo >= (select jsonb_array_length(photos) from museum_content where invitation_id = v_id) then
    return null;
  end if;
  insert into museum_hearts (invitation_id, photo_index, hearts) values (v_id, p_photo, 1)
  on conflict (invitation_id, photo_index)
    do update set hearts = least(museum_hearts.hearts + 1, 9999)
  returning hearts into v_hearts;
  return v_hearts;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function museum_heart(text, integer) from public;
grant execute on function museum_heart(text, integer) to anon, authenticated;

create or replace function museum_sign(p_slug text, p_author text, p_message text)
returns boolean as $$
declare
  v_id uuid := museum_open_id(p_slug);
  v_author text := left(btrim(coalesce(p_author, '')), 24);
  v_message text := left(btrim(coalesce(p_message, '')), 300);
begin
  if v_id is null or v_author = '' or v_message = ''
     or (select count(*) from museum_guestbook where invitation_id = v_id) >= 200 then
    return false;
  end if;
  insert into museum_guestbook (invitation_id, author, message) values (v_id, v_author, v_message);
  perform notify_telegram(v_id, 'guestbook', jsonb_build_object('author', v_author, 'message', v_message));
  return true;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function museum_sign(text, text, text) from public;
grant execute on function museum_sign(text, text, text) to anon, authenticated;

-- Приводит музей к тому, за что заплатили.
create or replace function museum_apply_paid_features(p_id uuid, p_features jsonb)
returns void as $$
declare
  v_tier text := coalesce(p_features->>'tier', 'lite');
begin
  update museum_content c
     set tier = v_tier,
         theme = coalesce(p_features->>'theme', 'classic'),
         voice_url = case when (p_features->>'voice')::boolean then c.voice_url end,
         song_url = case when (p_features->>'song')::boolean then c.song_url end,
         video_url = case when v_tier = 'full' then c.video_url end,
         photos = case when v_tier = 'full' then c.photos else jsonb_path_query_array(c.photos, '$[0 to 14]') end
   where c.invitation_id = p_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function museum_apply_paid_features(uuid, jsonb) from public, anon, authenticated;

-- Срок музея считается с момента открытия: иначе отложенный подарок
-- терял бы оплаченное время, ещё не открывшись.
create or replace function public.set_publication_deadlines()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_days integer;
  v_features jsonb;
  v_opens timestamptz;
begin
  if new.kind = 'museum' then
    if new.status = 'published' and old.status = 'draft' then
      select p.term_days, p.features into v_days, v_features
        from payments p
       where p.invitation_id = new.id and p.status = 'paid' and p.purpose = 'publish'
       order by p.created_at desc
       limit 1;
      if v_features is not null then
        perform museum_apply_paid_features(new.id, v_features);
      end if;
      select c.opens_at into v_opens from museum_content c where c.invitation_id = new.id;
      new.published_at = coalesce(new.published_at, now());
      new.expires_at = greatest(new.published_at, coalesce(v_opens, new.published_at)) + make_interval(days => coalesce(v_days, 30));
      new.edit_until = new.expires_at;
    end if;
    return new;
  end if;

  if new.status = 'published' and (old.status is distinct from 'published') then
    new.published_at = coalesce(new.published_at, now());
    new.edit_until = new.published_at + interval '3 days';
    new.expires_at = new.published_at + interval '7 days';
  end if;
  return new;
end;
$function$;

-- После оплаты правка не должна открывать то, что не оплачено.
create or replace function public.guard_museum_paid_features()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := coalesce((select auth.role()), '');
  v_status text;
begin
  if v_role not in ('anon', 'authenticated') then
    return new;
  end if;
  select status into v_status from invitations where id = new.invitation_id;
  if v_status = 'draft' then
    return new;
  end if;

  new.tier := old.tier;
  new.term_days := old.term_days;
  new.purged_at := old.purged_at;
  if old.theme = 'classic' then new.theme := 'classic'; end if;
  if old.voice_url is null then new.voice_url := null; end if;
  if old.song_url is null then new.song_url := null; end if;
  if old.tier = 'lite' then
    new.video_url := null;
    new.photos := jsonb_path_query_array(new.photos, '$[0 to 14]');
  end if;
  return new;
end;
$function$;

revoke execute on function public.guard_museum_paid_features() from public, anon, authenticated;

drop trigger if exists trg_museum_paid_features on museum_content;
create trigger trg_museum_paid_features
  before update on museum_content
  for each row execute function guard_museum_paid_features();

update storage.buckets
   set allowed_mime_types = array[
     'image/jpeg', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime',
     'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav'
   ]
 where id = 'museum-media';
