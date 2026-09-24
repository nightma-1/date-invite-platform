-- © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).

-- Как у onlyteplo: конструктор спрашивает "кого приглашаешь?" на входе.
-- Пока используется только как метаданные автора (для статистики и
-- будущего подбора формулировок), на экраны получателя не влияет.
alter table invitations
  add column recipient_gender text check (recipient_gender in ('male', 'female'));
