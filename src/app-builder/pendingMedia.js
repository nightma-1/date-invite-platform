/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Файл нельзя положить в localStorage (не сериализуется), а загрузить в Storage
 * до входа тоже нельзя — RLS требует user_id в пути. Поэтому сам File живёт
 * в памяти модуля до момента публикации, а в состоянии билдера лежит только
 * blob:-URL для превью.
 *
 * Следствие, о котором нужно знать: при перезагрузке страницы выбранный файл
 * теряется (черновик текста сохраняется, картинка — нет). Это осознанный
 * компромисс ради того, чтобы не заливать в Storage файлы черновиков,
 * которые никогда не оплатят.
 *
 * Ключ ('question' | 'reaction' | 'date' | 'final' | 'galaxy'): раньше был один общий
 * слот на весь конструктор, и загрузка своей картинки для экрана "Ого, ты
 * сказал да?" тихо затирала (или терялась под) картинку экрана вопроса —
 * теперь у каждого шага свой слот.
 */

// 'galaxy' — фото для портрета-из-слов в космическом письме: отдельный слот,
// иначе оно затирало бы картинку финального экрана.
const STEP_KEYS = ['question', 'reaction', 'date', 'final', 'galaxy'];
const pending = { question: null, reaction: null, date: null, final: null, galaxy: null };

export function setPendingMedia(key, file) {
  pending[key] = file;
}

export function getPendingMedia(key) {
  return pending[key];
}

export function clearPendingMedia(key) {
  if (key) {
    pending[key] = null;
  } else {
    for (const k of STEP_KEYS) pending[k] = null;
  }
}
