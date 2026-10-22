-- © 2026 Senti. Все права защищены.
--
-- Уведомления автору в @sentiuz_bot стали точнее:
--
-- 1. Счётчик открытий. Раньше каждое открытие присылало одно и то же
--    «открыл(а) твоё приглашение». Теперь бот различает первое открытие
--    и повторные («открыла уже 3-й раз») — для автора это и есть самое
--    волнительное: она возвращается к ссылке.
--
-- 2. Защита от повторов в 60 секунд. Она уже стояла в рабочей базе, но
--    не была записана в миграциях — закрепляем, чтобы не потерять при
--    следующем пересоздании функции.
--
-- 3. Сколько раз получатель пытался нажать «Нет» (responses.no_attempts).
--    Пишет фронт вместе с ответом; бот показывает это автору, а в сумме
--    это первая настоящая цифра о продукте для соцсетей.

alter table invitations add column if not exists view_count integer not null default 0;

alter table responses add column if not exists no_attempts smallint
  check (no_attempts is null or (no_attempts >= 0 and no_attempts <= 999));

create or replace function mark_invitation_viewed(p_slug text)
returns void as $$
begin
  update invitations
  set first_viewed_at = coalesce(first_viewed_at, now()),
      last_viewed_at = now(),
      -- Обновление страницы в течение минуты — это то же самое открытие
      view_count = case
        when last_viewed_at is null or now() - last_viewed_at > interval '60 seconds'
          then view_count + 1
        else view_count
      end
  where slug = p_slug and status = 'published';
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function mark_invitation_viewed(text) to anon, authenticated;

create or replace function trg_notify_invitation_viewed()
returns trigger as $$
begin
  if new.view_count is distinct from old.view_count and new.view_count > 0 then
    perform notify_telegram(new.id, 'viewed', jsonb_build_object('view_count', new.view_count));
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;

create or replace function trg_notify_response_created()
returns trigger as $$
begin
  perform notify_telegram(new.invitation_id, 'answered', jsonb_build_object(
    'answered_yes', new.answered_yes,
    'selected_date', new.selected_date,
    'selected_time', new.selected_time,
    'selections', new.selections,
    'no_attempts', new.no_attempts
  ));
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke execute on function trg_notify_invitation_viewed() from public, anon, authenticated;
revoke execute on function trg_notify_response_created() from public, anon, authenticated;
