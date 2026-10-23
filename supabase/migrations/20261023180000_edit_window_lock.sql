-- © 2026 Senti. Все права защищены.
--
-- Правило: опубликованное приглашение можно править 3 дня (edit_until),
-- ссылка работает 7 дней (expires_at). edit_until проставлялся с самого
-- начала, но нигде не проверялся — править можно было все 7 дней.
--
-- Теперь база сама запрещает автору менять приглашение после edit_until:
--   * invitations — только «авторские» поля (имя, шаблон, форма карточки
--     и т.п.). Служебные поля (просмотры, напоминания) пишут функции
--     mark_invitation_viewed / send_expiry_reminders — их не трогаем.
--   * invitation_content и invitation_steps — вставка и изменение.
--     Удаление не ограничиваем: иначе каскад не дал бы удалить само
--     приглашение из кабинета после срока правки.
-- service_role (вебхуки) и планировщик не ограничиваются.
--
-- Ошибка — 'edit_window_closed'; сайт показывает по ней понятный текст
-- (src/app-builder/updateInvitation.js).

create or replace function invitation_edit_locked(p_invitation_id uuid)
returns boolean as $$
  select exists (
    select 1 from invitations
     where id = p_invitation_id
       and (
         status in ('expired', 'archived')
         or (status = 'published' and edit_until is not null and edit_until <= now())
       )
  );
$$ language sql stable security definer set search_path = public;

revoke execute on function invitation_edit_locked(uuid) from public, anon, authenticated;

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

  -- Срок правки вышел: авторские поля менять нельзя
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
$$ language plpgsql security definer set search_path = public;

revoke execute on function guard_invitation_writes() from public, anon, authenticated;

create or replace function guard_invitation_children_writes()
returns trigger as $$
declare
  v_role text := coalesce((select auth.role()), '');
begin
  if v_role not in ('anon', 'authenticated') then
    return new;
  end if;

  if invitation_edit_locked(new.invitation_id) then
    raise exception 'edit_window_closed' using errcode = '42501';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function guard_invitation_children_writes() from public, anon, authenticated;

drop trigger if exists trg_invitation_content_edit_window on invitation_content;
create trigger trg_invitation_content_edit_window
  before insert or update on invitation_content
  for each row execute function guard_invitation_children_writes();

drop trigger if exists trg_invitation_steps_edit_window on invitation_steps;
create trigger trg_invitation_steps_edit_window
  before insert or update on invitation_steps
  for each row execute function guard_invitation_children_writes();
