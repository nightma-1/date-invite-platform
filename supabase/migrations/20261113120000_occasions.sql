-- Поводы (день рождения, «Ты меня простишь?», 8 марта, годовщина,
-- «Горжусь тобой», Новый год). Пока видны только владельцу в конструкторе
-- /builder/occasion. Настройки повода (имена, тексты, подарок) лежат в одном
-- jsonb на приглашении: экраны получателя рисует public/occasion.html.
alter table public.invitations drop constraint if exists invitations_kind_check;
alter table public.invitations
  add constraint invitations_kind_check check (kind = any (array['invite'::text, 'museum'::text, 'occasion'::text]));
alter table public.invitations add column if not exists occasion jsonb;
comment on column public.invitations.occasion is
  'Настройки повода для kind = occasion: {scn, to, toF, from, fromF, reason, peace[], tone, wish, gift, age, since}';
