/**
 * © 2026 Senti. Все права защищены.
 *
 * Публичные данные поддержки. Здесь нарочно НЕ переменная окружения:
 * .env у проекта только для секретов (ни одна переменная не должна начинаться
 * с VITE_, иначе попадёт в браузер), а username бота — вещь публичная и
 * меняется примерно никогда.
 *
 * ⚠️ ПОМЕНЯТЬ НА РЕАЛЬНЫЙ USERNAME бота поддержки после его создания в
 * @BotFather. Это единственное место, где он задаётся.
 */
export const SUPPORT_BOT_USERNAME = 'senti_support_bot';

export const SUPPORT_BOT_URL = `https://t.me/${SUPPORT_BOT_USERNAME}`;

/**
 * Ссылка на бота с кодом обращения: по /start t<номер> бот привязывает
 * Telegram автора к карточке обращения в рабочей группе, и ответ команды
 * прилетает человеку в личку.
 */
export function supportTicketUrl(ticketNo) {
  return `${SUPPORT_BOT_URL}?start=t${ticketNo}`;
}
