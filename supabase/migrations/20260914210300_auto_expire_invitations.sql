-- © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).
create extension if not exists pg_cron with schema extensions;

create or replace function expire_old_invitations()
returns void as $$
begin
  update invitations set status = 'expired'
  where status = 'published' and expires_at is not null and expires_at < now();
end;
$$ language plpgsql security definer set search_path = public;

-- Служебная функция: вызывает только планировщик. revoke from public недостаточно —
-- роли anon/authenticated нужно отзывать явно.
revoke execute on function expire_old_invitations() from public;
revoke execute on function expire_old_invitations() from anon, authenticated;

select cron.schedule('expire-invitations-hourly', '0 * * * *',
  $$select public.expire_old_invitations()$$);
