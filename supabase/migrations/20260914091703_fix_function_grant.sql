-- © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).

-- anon/authenticated наследуют EXECUTE через псевдо-роль PUBLIC независимо
-- от точечного revoke выше — забираем право именно у PUBLIC.
revoke execute on function handle_new_user() from public;