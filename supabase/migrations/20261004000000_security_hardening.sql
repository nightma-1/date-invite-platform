-- © 2026 Senti. Все права защищены.
--
-- Security hardening (аудит от 2026-10-04).
--
-- 1. profiles: политика "user updates own profile" разрешала менять ЛЮБУЮ колонку
--    своей строки, в том числе is_admin → любой пользователь мог сделать себя
--    админом (и получить запись в media_library и gif-library). Теперь клиенту
--    разрешено менять только telegram_username.
-- 2. invitations: владелец мог напрямую (через REST API) выставить
--    status = 'published' / произвольные expires_at, минуя оплату. Теперь:
--      * писать можно только перечисленные колонки;
--      * вставка всегда создаёт черновик;
--      * переход draft → published разрешён либо при флаге free_publish = 'on'
--        (режим бесплатного запуска, пока не подключён Click), либо при
--        наличии оплаченного платежа.
-- 3. Лишние права ролей anon/authenticated (TRUNCATE, TRIGGER, REFERENCES,
--    запись для anon, запись в payments) отозваны — RLS остаётся второй линией.
-- 4. Триггерные SECURITY DEFINER функции больше не вызываются через /rest/v1/rpc.
-- 5. Уведомление «открыл приглашение» не чаще раза в минуту на приглашение
--    (иначе любой, знающий slug, мог спамить автору в Telegram).
--
-- КАК ВКЛЮЧИТЬ ОПЛАТУ, когда подключён Click:
--   update app_secrets set value = 'off' where key = 'free_publish';

-- ---------------------------------------------------------------- profiles
revoke update on profiles from anon, authenticated;
grant update (telegram_username) on profiles to authenticated;
revoke insert, delete on profiles from authenticated;

-- ------------------------------------------------------------- invitations
revoke insert, update on invitations from anon, authenticated;

grant insert (
  user_id, slug, mood, recipient_name, recipient_gender,
  template_id, template_key, card_shape, opening_mechanic, pin_code, status
) on invitations to authenticated;

grant update (
  mood, recipient_name, recipient_gender,
  template_id, template_key, card_shape, opening_mechanic, pin_code, status
) on invitations to authenticated;

insert into app_secrets (key, value) values ('free_publish', 'on')
on conflict (key) do nothing;

create or replace function guard_invitation_writes()
returns trigger as $$
declare
  v_role text := coalesce((select auth.role()), '');
begin
  -- service_role (webhook оплаты), cron и SQL-редактор не ограничиваем.
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
$$ language plpgsql security definer set search_path = public;

revoke execute on function guard_invitation_writes() from public, anon, authenticated;

-- Имя начинается с "a_", чтобы сработать раньше trg_invitations_publish.
drop trigger if exists trg_invitations_a_guard on invitations;
create trigger trg_invitations_a_guard
  before insert or update on invitations
  for each row execute function guard_invitation_writes();

-- ---------------------------------------------------- прочие лишние права
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

revoke all on app_secrets from anon, authenticated;

-- Анонимный получатель только читает опубликованное и пишет ответ.
revoke insert, update, delete on
  profiles, templates, media_library, invitation_content, invitation_steps,
  choice_blocks, choice_options, payments
from anon;
revoke delete on invitations, responses from anon;

-- Платежи создаются и меняются только сервером (service_role обходит RLS).
revoke insert, update, delete on payments from authenticated;

-- --------------------------------------------- SECURITY DEFINER триггеры
revoke execute on function trg_notify_invitation_viewed() from public, anon, authenticated;
revoke execute on function trg_notify_response_created() from public, anon, authenticated;

create or replace function trg_notify_invitation_viewed()
returns trigger as $$
begin
  if new.last_viewed_at is distinct from old.last_viewed_at
     and (old.last_viewed_at is null
          or new.last_viewed_at - old.last_viewed_at > interval '60 seconds')
  then
    perform notify_telegram(new.id, 'viewed');
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;

revoke execute on function trg_notify_invitation_viewed() from public, anon, authenticated;
