-- © 2026 Senti. Все права защищены.
--
-- Напоминание автору в @sentiuz_bot за сутки до того, как ссылка перестанет
-- открываться (срок — 7 дней с публикации), если ответа ещё нет.
-- Раз в час планировщик ищет такие приглашения и шлёт событие 'expiring'
-- через тот же notify_telegram(). expiry_reminded_at — чтобы напомнить
-- ровно один раз.
--
-- Порядок выкатки: сначала сайт (api/telegram/notify.js должен знать
-- событие 'expiring'), потом эта миграция.

alter table invitations add column if not exists expiry_reminded_at timestamptz;

create or replace function send_expiry_reminders()
returns void as $$
declare
  r record;
begin
  for r in
    select i.id, i.expires_at
      from invitations i
     where i.status = 'published'
       and i.expiry_reminded_at is null
       and i.expires_at > now()
       and i.expires_at <= now() + interval '24 hours'
       and not exists (select 1 from responses x where x.invitation_id = i.id)
  loop
    perform notify_telegram(r.id, 'expiring', jsonb_build_object('expires_at', r.expires_at));
    update invitations set expiry_reminded_at = now() where id = r.id;
  end loop;
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke execute on function send_expiry_reminders() from public, anon, authenticated;

select cron.unschedule('expiry-reminders-hourly')
 where exists (select 1 from cron.job where jobname = 'expiry-reminders-hourly');
select cron.schedule('expiry-reminders-hourly', '15 * * * *',
  $$select public.send_expiry_reminders()$$);
