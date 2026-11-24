-- © 2026 Senti.
--
-- Payme (Merchant API) как второй провайдер рядом с Click.
-- Один заказ = одна строка payments: её id уходит в Payme как account.order_id,
-- а данные транзакции Payme хранятся в той же строке.

alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('invoice', 'card', 'payme'));

alter table public.payments
  add column if not exists payme_transaction_id text,
  add column if not exists payme_time bigint,          -- время создания у Payme (params.time), мс
  add column if not exists payme_create_time bigint,   -- когда мы создали транзакцию, мс
  add column if not exists payme_perform_time bigint,
  add column if not exists payme_cancel_time bigint,
  add column if not exists payme_state smallint,       -- 1 создана, 2 проведена, -1/-2 отменена
  add column if not exists payme_reason smallint;

create unique index if not exists payments_payme_transaction_id_key
  on public.payments (payme_transaction_id) where payme_transaction_id is not null;
create index if not exists payments_payme_create_time_idx
  on public.payments (payme_create_time) where payme_transaction_id is not null;

comment on column public.payments.method is
  'Кнопка оплаты: invoice — «через CLICK», card — «картой» (Click), payme — Payme (checkout.paycom.uz).';
