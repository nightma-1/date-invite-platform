-- © 2026 Senti. Все права защищены.
--
-- «Наш музей»: 3D-галерея с фото как отдельный вид подарка.
-- Живёт на той же основе, что и приглашение (invitations + payments + Click),
-- поэтому вебхук оплаты менять не нужно. Обычные приглашения работают как раньше.
--
--   * invitations.kind — 'invite' или 'museum', после создания не меняется.
--   * payments.term_days / purpose — срок, за который заплатили. Сервер пишет его
--     сам, поэтому автор не может оплатить месяц, а получить год.
--   * museum_content — напрямую видит только автор. Получатель читает через
--     get_museum(slug): без этого фото всех пар можно было бы выгрузить одним
--     запросом с публичным ключом.

alter table invitations
  add column if not exists kind text not null default 'invite'
  check (kind in ('invite', 'museum'));

alter table payments
  add column if not exists term_days integer check (term_days is null or term_days in (30, 180, 365)),
  add column if not exists purpose text not null default 'publish' check (purpose in ('publish', 'extend'));

create table if not exists museum_content (
  invitation_id uuid primary key references invitations(id) on delete cascade,
  author_name text not null default '' check (char_length(author_name) <= 40),
  dedication text not null default '' check (char_length(dedication) <= 600),
  signature text not null default '' check (char_length(signature) <= 80),
  photos jsonb not null default '[]'::jsonb
    check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 45),
  video_url text,
  term_days integer not null default 30 check (term_days in (30, 180, 365)),
  purged_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table museum_content enable row level security;

create policy "owner select museum_content" on museum_content for select
  using (exists (select 1 from invitations i where i.id = invitation_id and (select auth.uid()) = i.user_id));
create policy "owner insert museum_content" on museum_content for insert
  with check (exists (select 1 from invitations i where i.id = invitation_id and (select auth.uid()) = i.user_id and i.kind = 'museum'));
create policy "owner update museum_content" on museum_content for update
  using (exists (select 1 from invitations i where i.id = invitation_id and (select auth.uid()) = i.user_id));
create policy "owner delete museum_content" on museum_content for delete
  using (exists (select 1 from invitations i where i.id = invitation_id and (select auth.uid()) = i.user_id));

drop trigger if exists trg_museum_content_edit_window on museum_content;
create trigger trg_museum_content_edit_window
  before insert or update on museum_content
  for each row execute function guard_invitation_children_writes();

-- Чтение для получателя: только по точному slug и только пока ссылка жива.
create or replace function get_museum(p_slug text)
returns jsonb as $$
  select jsonb_build_object(
    'slug', i.slug,
    'recipient_name', i.recipient_name,
    'author_name', c.author_name,
    'dedication', c.dedication,
    'signature', c.signature,
    'photos', c.photos,
    'video_url', c.video_url
  )
  from invitations i
  join museum_content c on c.invitation_id = i.id
  where i.slug = p_slug
    and i.kind = 'museum'
    and i.status = 'published'
    and (i.expires_at is null or i.expires_at > now());
$$ language sql stable security definer set search_path = public;

revoke execute on function get_museum(text) from public;
grant execute on function get_museum(text) to anon, authenticated;

-- Сроки. Ветка для обычных приглашений не изменилась: 3 дня на правку, 7 на ссылку.
-- Музей живёт столько, сколько оплачено, и править его можно весь срок.
create or replace function public.set_publication_deadlines()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_days integer;
begin
  if new.kind = 'museum' then
    if new.status = 'published' and old.status = 'draft' then
      select p.term_days into v_days
        from payments p
       where p.invitation_id = new.id and p.status = 'paid' and p.purpose = 'publish'
       order by p.created_at desc
       limit 1;
      new.published_at = coalesce(new.published_at, now());
      new.expires_at = new.published_at + make_interval(days => coalesce(v_days, 30));
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

-- Продление: срок прибавляется к оставшемуся, как только платёж стал оплаченным.
create or replace function public.museum_apply_extension()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update invitations
     set expires_at = greatest(expires_at, now()) + make_interval(days => coalesce(new.term_days, 30)),
         edit_until = greatest(expires_at, now()) + make_interval(days => coalesce(new.term_days, 30)),
         expiry_reminded_at = null,
         status = 'published'
   where id = new.invitation_id and kind = 'museum' and status in ('published', 'expired');
  return new;
end;
$function$;

revoke execute on function public.museum_apply_extension() from public, anon, authenticated;

drop trigger if exists trg_payments_museum_extension on payments;
create trigger trg_payments_museum_extension
  after update of status on payments
  for each row
  when (new.status = 'paid' and old.status is distinct from 'paid' and new.purpose = 'extend')
  execute function museum_apply_extension();

-- Тот же страж записи, что и на проде, плюс одна проверка: нельзя оплатить
-- дешёвое приглашение и потом превратить его в музей.
create or replace function public.guard_invitation_writes()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role text := coalesce((select auth.role()), '');
begin
  if v_role not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'draft';
    return new;
  end if;

  if new.user_id is distinct from old.user_id or new.slug is distinct from old.slug then
    raise exception 'user_id and slug are immutable' using errcode = '42501';
  end if;

  if new.kind is distinct from old.kind then
    raise exception 'kind is immutable' using errcode = '42501';
  end if;

  if (old.status in ('expired', 'archived')
      or (old.status = 'published' and old.edit_until is not null and old.edit_until <= now()))
     and (
       new.recipient_name   is distinct from old.recipient_name
       or new.recipient_gender is distinct from old.recipient_gender
       or new.mood          is distinct from old.mood
       or new.template_id   is distinct from old.template_id
       or new.template_key  is distinct from old.template_key
       or new.card_shape    is distinct from old.card_shape
       or new.opening_mechanic is distinct from old.opening_mechanic
       or new.pin_code      is distinct from old.pin_code
     )
  then
    raise exception 'edit_window_closed' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if not (old.status = 'draft' and new.status = 'published') then
      raise exception 'status change % -> % is not allowed', old.status, new.status
        using errcode = '42501';
    end if;

    if coalesce((select value from app_secrets where key = 'free_publish'), 'off') <> 'on'
       and not exists (
         select 1 from payments p where p.invitation_id = old.id and p.status = 'paid'
       )
    then
      raise exception 'payment required to publish' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

revoke execute on function public.guard_invitation_writes() from public, anon, authenticated;

-- Отдельное хранилище: видео до 60 секунд не влезает в лимит invitation-media.
-- Политики чтения нет намеренно: файл открывается по случайной ссылке,
-- а список файлов получить нельзя.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('museum-media', 'museum-media', true, 52428800,
        array['image/jpeg', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do nothing;

create policy "museum upload own media" on storage.objects for insert to authenticated
  with check (bucket_id = 'museum-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "museum read own media" on storage.objects for select to authenticated
  using (bucket_id = 'museum-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "museum delete own media" on storage.objects for delete to authenticated
  using (bucket_id = 'museum-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- На invitations права выданы по столбцам. kind разрешён только при создании:
-- после этого его не меняет никто, кроме сервера.
grant insert (kind) on invitations to authenticated;

revoke all on museum_content from anon;
revoke truncate, trigger, references on museum_content from authenticated;
