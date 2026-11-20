-- © 2026 Senti. Все права защищены.
--
-- Колонки ответов (20261121130000, 20261121140000) добавили, но не выдали
-- на них право INSERT: у invitations права выданы поколоночно (см.
-- security_hardening), поэтому вставка открытки падала с
-- «permission denied for table invitations». Бесплатную публикацию
-- ответа всё равно решает сервер (api/click/create.js).
grant insert (sender_name, reply_to, reply_kind, reply_card) on public.invitations to authenticated;
