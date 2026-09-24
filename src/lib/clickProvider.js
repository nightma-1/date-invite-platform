/**
 * © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import crypto from 'crypto';

/**
 * Реализация платёжного слоя для Click (Узбекистан).
 *
 * Структура полей и формулы подписи подтверждены по кэшированным фрагментам
 * официальной документации (docs.click.uz/en/click-api-request) и независимым
 * open-source интеграциям (php-click-payment, click/module), которые на неё
 * ссылаются. Тем не менее перед продакшеном свериться с актуальной версией
 * документации в личном кабинете мерчанта Click — это единственное место
 * в проекте, где ошибка стоит реальных денег.
 *
 * Поток:
 *  1. createPayment() — строит ссылку на оплату, платёж уже создан в БД со статусом pending
 *  2. Click шлёт Prepare (action=0) — подтверждаем, что заказ существует и сумма верна,
 *     возвращаем merchant_prepare_id (наш внутренний числовой ID, payments.click_prepare_id)
 *  3. Click шлёт Complete (action=1) — списание прошло, подтверждаем и публикуем приглашение
 *
 * Эта часть модуля не обращается к БД — только считает подписи и формирует ответы.
 * БД-логика (поиск/обновление payments и invitations) — в api/click/webhook.js.
 */

const SERVICE_ID = process.env.CLICK_SERVICE_ID;
const MERCHANT_ID = process.env.CLICK_MERCHANT_ID;
const SECRET_KEY = process.env.CLICK_SECRET_KEY;

export const CLICK_ACTION = { PREPARE: 0, COMPLETE: 1 };

export const CLICK_ERROR = {
  SUCCESS: 0,
  SIGN_CHECK_FAILED: -1,
  INVALID_AMOUNT: -2,
  ACTION_NOT_FOUND: -3,
  ALREADY_PAID: -4,
  USER_NOT_FOUND: -5,
  TRANSACTION_NOT_FOUND: -6,
  INTERNAL_ERROR: -9,
};

function md5(input) {
  return crypto.createHash('md5').update(input).digest('hex');
}

function buildPrepareSign({ click_trans_id, service_id, merchant_trans_id, amount, action, sign_time }) {
  return md5(`${click_trans_id}${service_id}${SECRET_KEY}${merchant_trans_id}${amount}${action}${sign_time}`);
}

function buildCompleteSign({
  click_trans_id,
  service_id,
  merchant_trans_id,
  merchant_prepare_id,
  amount,
  action,
  sign_time,
}) {
  return md5(
    `${click_trans_id}${service_id}${SECRET_KEY}${merchant_trans_id}${merchant_prepare_id}${amount}${action}${sign_time}`
  );
}

/** Проверяет sign_string входящего запроса. Работает и для Prepare, и для Complete. */
export function verifySign(body) {
  const expected =
    Number(body.action) === CLICK_ACTION.PREPARE ? buildPrepareSign(body) : buildCompleteSign(body);
  return expected === body.sign_string;
}

export function buildPrepareResponse({ click_trans_id, merchant_trans_id, merchant_prepare_id, error, error_note }) {
  return { click_trans_id, merchant_trans_id, merchant_prepare_id, error, error_note };
}

export function buildCompleteResponse({ click_trans_id, merchant_trans_id, merchant_confirm_id, error, error_note }) {
  return { click_trans_id, merchant_trans_id, merchant_confirm_id, error, error_note };
}

export const clickProvider = {
  async createPayment({ invitationId, amount, returnUrl }) {
    const params = new URLSearchParams({
      service_id: SERVICE_ID,
      merchant_id: MERCHANT_ID,
      amount: String(amount),
      transaction_param: invitationId, // приходит обратно как merchant_trans_id
      return_url: returnUrl,
    });
    return { paymentUrl: `https://my.click.uz/services/pay?${params.toString()}` };
  },
};