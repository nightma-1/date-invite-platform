-- © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).
alter table invitations add column template_key text not null default 'romantic';
