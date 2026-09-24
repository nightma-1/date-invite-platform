-- © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).

-- Как у onlyteplo: "Получите ответ в Telegram — когда человек выберет ответ,
-- вы сразу получите уведомление в нашем тг-боте". Раньше бот только линковал
-- telegram_chat_id через /start, но никогда сам не писал автору — эта миграция
-- добавляет исходящие уведомления через pg_net на новый эндпоинт
-- /api/telegram/notify (см. api/telegram/notify.js).

create extension if not exists pg_net with schema extensions;

-- Секреты (URL эндпоинта, общий секрет для заголовка) храним в таблице с RLS
-- без политик: невидима через PostgREST, но читается внутри SECURITY DEFINER.
create table app_secrets (
  key text primary key,
  value text not null
);
alter table app_secrets enable row level security;

create or replace function notify_telegram(p_invitation_id uuid, p_event text, p_extra jsonb default '{}'::jsonb)
returns void as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from app_secrets where key = 'notify_url';
  select value into v_secret from app_secrets where key = 'notify_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body := jsonb_build_object('invitation_id', p_invitation_id, 'event', p_event, 'extra', p_extra)
  );
exception when others then
  raise warning 'notify_telegram failed: %', sqlerrm;
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke execute on function notify_telegram(uuid, text, jsonb) from public, anon, authenticated;

create or replace function trg_notify_invitation_viewed()
returns trigger as $$
begin
  if new.first_viewed_at is not null and old.first_viewed_at is null then
    perform notify_telegram(new.id, 'viewed');
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;

create trigger trg_invitation_viewed_notify
  after update on invitations
  for each row execute function trg_notify_invitation_viewed();

create or replace function trg_notify_response_created()
returns trigger as $$
begin
  perform notify_telegram(new.invitation_id, 'answered', jsonb_build_object(
    'answered_yes', new.answered_yes,
    'selected_date', new.selected_date,
    'selected_time', new.selected_time
  ));
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;

create trigger trg_response_created_notify
  after insert on responses
  for each row execute function trg_notify_response_created();
