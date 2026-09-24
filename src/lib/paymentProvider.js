/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

/**
 * PaymentProvider — универсальный контракт платёжного слоя.
 *
 * Любая реализация (Click сейчас, Payme в будущем) обязана предоставлять
 * оба метода ниже с этой же сигнатурой. Ничего в коде продукта не должно
 * напрямую знать про конкретного провайдера, кроме файла api/click/*.
 */

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
};

/**
 * @typedef {Object} CreatePaymentParams
 * @property {string} invitationId
 * @property {number} amount     — в тийинах/сумах, как принято у провайдера
 * @property {string} returnUrl  — куда вернуть пользователя после оплаты
 *
 * @typedef {Object} CreatePaymentResult
 * @property {string} paymentUrl — редирект пользователя сюда для оплаты
 *
 * @typedef {Object} WebhookResult
 * @property {string} transactionId
 * @property {string} invitationId
 * @property {'paid'|'failed'} status
 * @property {Object} responseBody — что нужно вернуть провайдеру как HTTP-ответ
 */

/**
 * @typedef {Object} PaymentProvider
 * @property {(params: CreatePaymentParams) => Promise<CreatePaymentResult>} createPayment
 * @property {(rawBody: any, headers: Record<string, string>) => WebhookResult} parseWebhook
 */