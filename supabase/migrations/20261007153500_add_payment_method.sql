-- © 2026 Senti.
--
-- Добавляем второй способ оплаты Click — "оплата картой" (click-pay-by-card)
-- рядом с уже работающим "оплата через CLICK" (click-button). На стороне
-- Click это по-прежнему один и тот же провайдер/транзакция (api/click/webhook.js
-- не меняется), но колонка нужна, чтобы различать, с какой кнопки пришёл
-- платёж — это прямая рекомендация Click из их чек-листа интеграции:
-- логировать запросы/ответы, чтобы быстрее искать проблемы конкретного метода.
alter table payments
  add column method text not null default 'invoice'
    check (method in ('invoice', 'card'));

comment on column payments.method is
  'Какая кнопка оплаты была нажата: invoice — "Оплата через CLICK" (click-button), card — "Оплата картой" (click-pay-by-card). Обе ведут в один и тот же Prepare/Complete вебхук.';
