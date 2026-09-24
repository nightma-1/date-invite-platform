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
 */

let pendingFile = null;

export function setPendingMedia(file) {
  pendingFile = file;
}

export function getPendingMedia() {
  return pendingFile;
}

export function clearPendingMedia() {
  pendingFile = null;
}
