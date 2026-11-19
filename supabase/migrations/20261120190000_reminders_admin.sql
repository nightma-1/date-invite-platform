-- Админка «Напоминания»: журнал каждого отправленного напоминания о
-- неоплаченном черновике, очередь (кто получит / почему нет), вкл/выкл
-- и тестовая отправка себе. Копия каждого напоминания уходит админам в
-- Telegram (api/telegram/notify.js).

create table if not exists public.draft_reminders (
  id bigint generated always as identity primary key,
  invitation_id uuid references public.invitations(id) on delete set null,
  user_id uuid,
  recipient_name text,
  lang text,
  sent_at timestamptz not null default now(),
  delivered boolean,
  error text
);
alter table public.draft_reminders enable row level security;
-- Политик нет: читают только admin_* функции ниже и service role.
create index if not exists draft_reminders_sent_at_idx on public.draft_reminders (sent_at desc);

insert into public.app_secrets(key, value) values ('draft_reminders', 'on')
on conflict (key) do nothing;

create or replace function public.send_draft_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
  r record;
  v_log bigint;
  n integer := 0;
begin
  if coalesce((select value from app_secrets where key = 'draft_reminders'), 'on') <> 'on' then
    return 0;
  end if;
  select value into v_url from app_secrets where key = 'notify_url';
  select value into v_secret from app_secrets where key = 'notify_secret';
  if v_url is null or v_secret is null then
    return 0;
  end if;

  for r in
    select distinct on (i.user_id) i.id, i.user_id, i.recipient_name,
      (select s.configuration_json->>'lang' from invitation_steps s
        where s.invitation_id = i.id and s.step_type = 'question' limit 1) as lang
    from invitations i
    join profiles p on p.id = i.user_id
    where i.status = 'draft'
      and coalesce(i.kind, 'invite') = 'invite'
      and i.reminder_sent_at is null
      and i.created_at < now() - interval '3 hours'
      and i.created_at > now() - interval '3 days'
      and p.telegram_chat_id is not null
      and not coalesce(p.is_admin, false)
      and not exists (
        select 1 from invitations j
        where j.user_id = i.user_id and j.status <> 'draft'
          and j.created_at > i.created_at - interval '1 hour'
      )
      and not exists (
        select 1 from invitations j
        where j.user_id = i.user_id and j.reminder_sent_at > now() - interval '7 days'
      )
    order by i.user_id, i.created_at desc
  loop
    update invitations set reminder_sent_at = now()
    where user_id = r.user_id and status = 'draft' and reminder_sent_at is null;

    insert into draft_reminders (invitation_id, user_id, recipient_name, lang)
    values (r.id, r.user_id, r.recipient_name, coalesce(r.lang, 'ru'))
    returning id into v_log;

    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
      body := jsonb_build_object('event', 'draft_reminder', 'invitation_id', r.id, 'extra', jsonb_build_object('reminder_id', v_log))
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.send_draft_reminders() from public, anon, authenticated;

-- История отправок + что стало с черновиком после напоминания
create or replace function public.admin_draft_reminders()
returns table (
  id bigint, sent_at timestamptz, delivered boolean, error text, lang text,
  invitation_id uuid, recipient_name text, slug text, invitation_status text,
  owner text, paid_at timestamptz, paid_amount integer
)
language sql stable security definer set search_path = public
as $$
  select r.id, r.sent_at, r.delivered, r.error, r.lang,
    r.invitation_id, r.recipient_name, i.slug, coalesce(i.status, 'deleted'),
    coalesce(u.email::text, u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', left(r.user_id::text, 8)),
    pay.created_at, pay.amount
  from draft_reminders r
  left join invitations i on i.id = r.invitation_id
  left join auth.users u on u.id = r.user_id
  left join lateral (
    select p.created_at, p.amount from payments p
    where p.user_id = r.user_id and p.status = 'paid' and p.created_at >= r.sent_at
    order by p.created_at limit 1
  ) pay on true
  where exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin)
  order by r.sent_at desc
  limit 1000;
$$;
revoke all on function public.admin_draft_reminders() from public, anon;
grant execute on function public.admin_draft_reminders() to authenticated;

-- Все неоплаченные черновики и что с ними будет
create or replace function public.admin_reminder_queue()
returns table (
  invitation_id uuid, created_at timestamptz, recipient_name text, owner text,
  has_bot boolean, reminder_sent_at timestamptz, state text, due_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select i.id, i.created_at, i.recipient_name,
    coalesce(u.email::text, u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', left(i.user_id::text, 8)),
    p.telegram_chat_id is not null, i.reminder_sent_at,
    case
      when i.reminder_sent_at is not null then 'sent'
      when exists (select 1 from invitations j where j.user_id = i.user_id and j.status <> 'draft'
                   and j.created_at > i.created_at - interval '1 hour') then 'paid_other'
      when p.telegram_chat_id is null then 'no_bot'
      when i.created_at <= now() - interval '3 days' then 'too_old'
      when exists (select 1 from invitations j where j.user_id = i.user_id
                   and j.reminder_sent_at > now() - interval '7 days') then 'weekly_limit'
      when i.created_at > now() - interval '3 hours' then 'waiting'
      else 'next_run'
    end,
    case when i.created_at > now() - interval '3 hours' then i.created_at + interval '3 hours' end
  from invitations i
  join profiles p on p.id = i.user_id
  left join auth.users u on u.id = i.user_id
  where i.status = 'draft' and coalesce(i.kind, 'invite') = 'invite'
    and not coalesce(p.is_admin, false)
    and exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin)
  order by i.created_at desc
  limit 500;
$$;
revoke all on function public.admin_reminder_queue() from public, anon;
grant execute on function public.admin_reminder_queue() to authenticated;

create or replace function public.admin_reminder_settings()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select case when exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin)
    then jsonb_build_object(
      'enabled', coalesce((select value from app_secrets where key = 'draft_reminders'), 'on') = 'on',
      'admin_has_bot', (select telegram_chat_id is not null from profiles where id = auth.uid())
    ) end;
$$;
revoke all on function public.admin_reminder_settings() from public, anon;
grant execute on function public.admin_reminder_settings() to authenticated;

create or replace function public.admin_set_draft_reminders(p_enabled boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into app_secrets(key, value) values ('draft_reminders', case when p_enabled then 'on' else 'off' end)
  on conflict (key) do update set value = excluded.value;
end;
$$;
revoke all on function public.admin_set_draft_reminders(boolean) from public, anon;
grant execute on function public.admin_set_draft_reminders(boolean) to authenticated;

-- Прислать себе в Telegram ровно то сообщение, которое получают люди
create or replace function public.admin_test_draft_reminder(p_lang text default 'ru')
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from profiles me where me.id = auth.uid() and me.is_admin) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select value into v_url from app_secrets where key = 'notify_url';
  select value into v_secret from app_secrets where key = 'notify_secret';
  if v_url is null or v_secret is null then
    raise exception 'notify not configured';
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body := jsonb_build_object('event', 'draft_reminder_test',
      'extra', jsonb_build_object('user_id', auth.uid(), 'lang', coalesce(p_lang, 'ru')))
  );
end;
$$;
revoke all on function public.admin_test_draft_reminder(text) from public, anon;
grant execute on function public.admin_test_draft_reminder(text) to authenticated;
