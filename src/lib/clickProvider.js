/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
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

/** Click полностью настроен только если заданы все три переменные. */
export function isClickConfigured() {
  return Boolean(SERVICE_ID && MERCHANT_ID && SECRET_KEY);
}

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

/**
 * Проверяет sign_string входящего запроса. Работает и для Prepare, и для Complete.
 *
 * Закрыто по умолчанию: если секрет не задан, подпись считалась бы от строки
 * "undefined" и любой мог бы её подделать, поэтому без настроенного Click
 * проверка всегда проваливается. Также проверяем service_id и сравниваем
 * подписи за постоянное время.
 */
export function verifySign(body) {
  if (!isClickConfigured() || !body || typeof body.sign_string !== 'string') return false;
  if (String(body.service_id) !== String(SERVICE_ID)) return false;

  const action = Number(body.action);
  if (action !== CLICK_ACTION.PREPARE && action !== CLICK_ACTION.COMPLETE) return false;

  const expected = action === CLICK_ACTION.PREPARE ? buildPrepareSign(body) : buildCompleteSign(body);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(body.sign_string.toLowerCase(), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function buildPrepareResponse({ click_trans_id, merchant_trans_id, merchant_prepare_id, error, error_note }) {
  return { click_trans_id, merchant_trans_id, merchant_prepare_id, error, error_note };
}

export function buildCompleteResponse({ click_trans_id, merchant_trans_id, merchant_confirm_id, error, error_note }) {
  return { click_trans_id, merchant_trans_id, merchant_confirm_id, error, error_note };
}

export const PAYMENT_METHOD = { INVOICE: 'invoice', CARD: 'card' };

/**
 * У Click две отдельные страницы в документации — click-button ("оплата
 * через CLICK", есть оплата и без регистрации на той же странице) и
 * click-pay-by-card ("оплата с любой карты" — номер + срок, без аккаунта
 * Click вообще). У обеих совпадает весь набор обязательных параметров
 * (service_id/merchant_id/amount/transaction_param), и у click-pay-by-card
 * по документации на дату написания нет отдельного публичного URL — Click
 * либо выдаёт готовый <script> в личном кабинете мерчанта, либо это та же
 * страница my.click.uz/services/pay, просто с другим входом в интерфейс.
 *
 * Пока нет подтверждённого отдельного виджета, обе кнопки ведут на один и
 * тот же checkout — это рабочее решение (Click сам предлагает выбор способа
 * оплаты на этой странице), но ПЕРЕД продакшеном сверь с личным кабинетом:
 * если там есть отдельный JS-виджет (createPaymentRequest()) для
 * click-pay-by-card, замени ветку CARD на него — тогда карта будет
 * вводиться во встроенном окне, не уходя с сайта.
 */
export const clickProvider = {
  async createPayment({ invitationId, amount, returnUrl, method = PAYMENT_METHOD.INVOICE }) {
    if (!isClickConfigured()) throw new Error('Click is not configured');
    const params = new URLSearchParams({
      service_id: SERVICE_ID,
      merchant_id: MERCHANT_ID,
      amount: String(amount),
      transaction_param: invitationId, // приходит обратно как merchant_trans_id
      return_url: returnUrl,
    });
    // TODO(click-pay-by-card): если Click выдал отдельный виджет в кабинете
    // мерчанта — подставить его здесь вместо редиректа на ту же страницу.
    return { paymentUrl: `https://my.click.uz/services/pay?${params.toString()}`, method };
  },
};