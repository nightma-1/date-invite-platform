-- Раньше уведомление "открыл приглашение" уходило только один раз (при
-- первом first_viewed_at null -> not null). Хотим слать его при КАЖДОМ
-- открытии — добавляем last_viewed_at, который обновляется на каждый вызов
-- mark_invitation_viewed, и переключаем триггер на него.

alter table invitations add column if not exists last_viewed_at timestamptz;

create or replace function mark_invitation_viewed(p_slug text)
returns void as $$
begin
  update invitations
  set first_viewed_at = coalesce(first_viewed_at, now()),
      last_viewed_at = now()
  where slug = p_slug and status = 'published';
end;
$$ language plpgsql security definer set search_path = public;

create or replace function trg_notify_invitation_viewed()
returns trigger as $$
begin
  if new.last_viewed_at is distinct from old.last_viewed_at then
    perform notify_telegram(new.id, 'viewed');
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions;
