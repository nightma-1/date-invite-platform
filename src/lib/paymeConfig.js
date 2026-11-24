/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Кнопка «Payme» на сайте. Включается переменной VITE_PAYME_ENABLED=true в
 * Vercel (нужен новый деплой): пока касса Payme не открыта, клиенты кнопку
 * не видят. Сервер без PAYME_MERCHANT_ID/PAYME_KEY всё равно ответит 503.
 */
export const PAYME_ENABLED = import.meta.env.VITE_PAYME_ENABLED === 'true';
