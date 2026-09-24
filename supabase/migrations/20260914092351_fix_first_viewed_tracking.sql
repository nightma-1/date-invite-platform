-- © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).

alter table invitations add column first_viewed_at timestamptz;
alter table responses drop column first_viewed_at;

-- Публичная, но узкая точка входа: помечает просмотр только для опубликованного
-- приглашения и только один раз. Умышленно доступна anon/authenticated через RPC —
-- в отличие от handle_new_user, здесь это не баг, а единственный способ дать
-- получателю без аккаунта записать факт открытия ссылки.
create or replace function mark_invitation_viewed(p_slug text)
returns void as $$
begin
  update invitations
  set first_viewed_at = now()
  where slug = p_slug and status = 'published' and first_viewed_at is null;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function mark_invitation_viewed(text) to anon, authenticated;
