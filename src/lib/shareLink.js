/**
 * © 2026 Senti. Все права защищены.
 *
 * Ссылка на приглашение для отправки получателю.
 *
 * Telegram (и другие мессенджеры) запоминают превью ссылки навсегда при
 * первом показе и больше к сайту не ходят. Если автор сначала скинул
 * ссылку себе проверить, а потом поправил имя, в чате так и оставалось
 * старое «Имя, это тебе».
 *
 * Поэтому в ссылку добавляем короткую метку ?v=, посчитанную из того, что
 * видно на превью: имени и шаблона. Поменял имя — получил новую ссылку,
 * мессенджер заново загрузит превью. Не менял — ссылка та же. Сам сайт
 * метку игнорирует, приглашение открывается по slug, старые ссылки без
 * метки тоже работают.
 *
 * Такая же функция есть на сервере — api/_lib/ogCards.js (previewVersion).
 * Менять их только вместе.
 */

export function normalizeName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim();
}

export function previewVersion(name, templateKey) {
  const input = `${normalizeName(name)}|${templateKey || ''}`;
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash * 33) ^ input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36).slice(0, 5);
}

export function inviteShareUrl(slug, name, templateKey) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://senti.uz';
  return `${origin}/i/${slug}?v=${previewVersion(name, templateKey)}`;
}

// Слова-заглушки, которые люди оставляют в поле имени, не заметив.
const PLACEHOLDER_NAMES = new Set(['имя', 'тебя', 'ism', 'name', 'имя получателя']);

export function isPlaceholderName(name) {
  return PLACEHOLDER_NAMES.has(normalizeName(name).toLowerCase());
}
