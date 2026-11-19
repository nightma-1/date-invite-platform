-- Напоминание о неоплаченном приглашении в Telegram (@sentiuz_bot).
-- Раз в час (9:17–22:17 по Ташкенту) ищем черновики старше 3 часов и
-- моложе 3 дней у авторов с привязанным ботом и шлём одно напоминание
-- (api/telegram/notify.js, event 'draft_reminder'). Не чаще раза в неделю
-- на человека, и не тем, кто уже оплатил более новое приглашение.

alter table public.invitations add column if not exists reminder_sent_at timestamptz;

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
  n integer := 0;
begin
  select value into v_url from app_secrets where key = 'notify_url';
  select value into v_secret from app_secrets where key = 'notify_secret';
  if v_url is null or v_secret is null then
    return 0;
  end if;

  for r in
    select distinct on (i.user_id) i.id, i.user_id
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

    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
      body := jsonb_build_object('event', 'draft_reminder', 'invitation_id', r.id)
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.send_draft_reminders() from public, anon, authenticated;

select cron.schedule('draft-reminders', '17 4-17 * * *', 'select public.send_draft_reminders()');
