/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import crypto from 'crypto';

/**
 * Payme Business (Merchant API) — второй платёжный провайдер рядом с Click.
 *
 * Поток (как и у Click — оплата на странице провайдера, мы только отвечаем):
 *  1. createPayment() строит ссылку checkout.paycom.uz (строка payments уже
 *     создана со статусом pending; её id уходит в Payme как account.order_id).
 *  2. Payme шлёт JSON-RPC на /api/payme: CheckPerformTransaction →
 *     CreateTransaction → PerformTransaction (+ CancelTransaction,
 *     CheckTransaction, GetStatement). Логика с БД — api/_lib/paymeWebhook.js.
 *
 * Суммы: в нашей БД (payments.amount) — сумы, у Payme — тийины (× 100).
 *
 * Переменные окружения (Vercel → Settings → Environment Variables):
 *   PAYME_MERCHANT_ID   — ID кассы (Payme Business → касса → «Разработчикам»)
 *   PAYME_KEY           — боевой ключ кассы (или тестовый, пока PAYME_TEST=true)
 *   PAYME_TEST          — 'true' → ссылка ведёт в песочницу test.paycom.uz
 *   PAYME_ACCOUNT_FIELD — имя поля в настройках кассы, по умолчанию order_id
 *   PAYME_IKPU          — код ИКПУ (МХИК) услуги для фискального чека, tasnif.soliq.uz
 *   PAYME_PACKAGE_CODE  — код упаковки (единицы) для этого ИКПУ
 *   PAYME_VAT_PERCENT   — НДС в чеке, по умолчанию 0 (ИП на налоге с оборота)
 *
 * Сверить перед запуском с документацией в кабинете Payme Business
 * (developer.help.paycom.uz) — это место, где ошибка стоит реальных денег.
 */

const env = () => ({
  merchantId: process.env.PAYME_MERCHANT_ID,
  key: process.env.PAYME_KEY,
  test: process.env.PAYME_TEST === 'true',
  accountField: process.env.PAYME_ACCOUNT_FIELD || 'order_id',
  ikpu: process.env.PAYME_IKPU,
  packageCode: process.env.PAYME_PACKAGE_CODE,
  vatPercent: Number(process.env.PAYME_VAT_PERCENT || 0),
});

export function isPaymeConfigured() {
  const { merchantId, key } = env();
  return Boolean(merchantId && key);
}

export function paymeAccountField() {
  return env().accountField;
}

/** Состояния транзакции Payme. */
export const PAYME_STATE = {
  CREATED: 1,
  PERFORMED: 2,
  CANCELLED: -1, // отменена до проведения
  CANCELLED_AFTER_PERFORM: -2,
};

/** Транзакция, не проведённая за 12 часов, отменяется (reason 4). */
export const PAYME_TIMEOUT_MS = 12 * 60 * 60 * 1000;
export const PAYME_REASON_TIMEOUT = 4;

const msg = (ru, uz, en) => ({ ru, uz, en });

export const PAYME_ERROR = {
  INVALID_AMOUNT: { code: -31001, message: msg('Неверная сумма', "Noto'g'ri summa", 'Invalid amount') },
  TRANSACTION_NOT_FOUND: { code: -31003, message: msg('Транзакция не найдена', 'Tranzaksiya topilmadi', 'Transaction not found') },
  CANT_CANCEL: { code: -31007, message: msg('Услуга уже оказана, отмена невозможна', "Xizmat ko'rsatilgan, bekor qilib bo'lmaydi", 'Service already delivered') },
  CANT_PERFORM: { code: -31008, message: msg('Операцию выполнить нельзя', "Amalni bajarib bo'lmaydi", 'Unable to perform operation') },
  ORDER_NOT_FOUND: { code: -31050, message: msg('Заказ не найден', 'Buyurtma topilmadi', 'Order not found') },
  ORDER_BUSY: { code: -31051, message: msg('Заказ уже оплачивается', "Buyurtma to'lanmoqda", 'Order is being paid') },
  ORDER_NOT_PAYABLE: { code: -31052, message: msg('Заказ нельзя оплатить', "Buyurtmani to'lab bo'lmaydi", 'Order cannot be paid') },
  INSUFFICIENT_PRIVILEGE: { code: -32504, message: msg('Недостаточно привилегий', 'Ruxsat yetarli emas', 'Insufficient privilege') },
  PARSE_ERROR: { code: -32700, message: msg('Ошибка разбора JSON', 'JSON xatosi', 'Parse error') },
  INVALID_REQUEST: { code: -32600, message: msg('Неверный запрос', "Noto'g'ri so'rov", 'Invalid request') },
  METHOD_NOT_FOUND: { code: -32601, message: msg('Метод не найден', 'Metod topilmadi', 'Method not found') },
  SYSTEM_ERROR: { code: -32400, message: msg('Системная ошибка', 'Tizim xatosi', 'System error') },
};

/**
 * Проверка заголовка Authorization: Basic base64("Paycom:<KEY>").
 * Закрыто по умолчанию: без ключа в окружении не пропускаем никого.
 * Сравнение за постоянное время.
 */
export function verifyPaymeAuth(authorizationHeader) {
  const { key } = env();
  if (!key || typeof authorizationHeader !== 'string') return false;
  const match = authorizationHeader.match(/^Basic\s+(.+)$/i);
  if (!match) return false;
  let decoded;
  try {
    decoded = Buffer.from(match[1].trim(), 'base64').toString('utf8');
  } catch {
    return false;
  }
  const expected = Buffer.from(`Paycom:${key}`, 'utf8');
  const got = Buffer.from(decoded, 'utf8');
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}

/** Сумы → тийины. */
export const toTiyin = (sum) => Math.round(Number(sum) * 100);

/**
 * Фискальные данные для чека (поле detail в CheckPerformTransaction).
 * Без ИКПУ/кода упаковки чек не собрать — тогда detail не отдаём, а Payme
 * напомнит о фискализации в кабинете.
 */
export function buildReceiptDetail(payment) {
  const { ikpu, packageCode, vatPercent } = env();
  if (!ikpu || !packageCode) return undefined;
  const title = payment.purpose === 'gift'
    ? 'Senti: подарочный код на приглашение'
    : payment.purpose === 'extend'
      ? 'Senti: продление ссылки'
      : 'Senti: электронное приглашение';
  return {
    receipt_type: 0,
    items: [{
      title,
      price: toTiyin(payment.amount),
      count: 1,
      code: ikpu,
      package_code: packageCode,
      vat_percent: vatPercent,
    }],
  };
}

export const paymeProvider = {
  /**
   * @param {{ orderId: string, amount: number, returnUrl: string, lang?: string }} p
   *   orderId — payments.id; amount — в сумах.
   */
  async createPayment({ orderId, amount, returnUrl, lang = 'ru' }) {
    const { merchantId, test, accountField } = env();
    if (!isPaymeConfigured()) throw new Error('Payme is not configured');
    // Формат GET-инициализации: base64 от строки "m=...;ac.order_id=...;a=...;c=...;l=..."
    const params = [
      `m=${merchantId}`,
      `ac.${accountField}=${orderId}`,
      `a=${toTiyin(amount)}`,
      `c=${returnUrl}`,
      `l=${['ru', 'uz', 'en'].includes(lang) ? lang : 'ru'}`,
    ].join(';');
    const host = test ? 'https://test.paycom.uz' : 'https://checkout.paycom.uz';
    return { paymentUrl: `${host}/${Buffer.from(params, 'utf8').toString('base64')}` };
  },
};
