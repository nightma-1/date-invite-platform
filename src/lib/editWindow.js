/**
 * © 2026 Senti. Все права защищены.
 *
 * Правило сроков: опубликованное приглашение можно править 3 дня
 * (invitations.edit_until), а ссылка работает 7 дней (expires_at).
 * Оба срока считает база при публикации — триггер set_publication_deadlines.
 * База сама запрещает правку после edit_until (миграция edit_window_lock),
 * здесь — только чтобы не показывать кнопку, которая всё равно не сработает.
 * Черновик (ещё не оплачен) можно править всегда.
 */
export function isEditLocked(inv, now = Date.now()) {
  if (!inv) return false;
  if (inv.status === 'expired' || inv.status === 'archived') return true;
  if (inv.status !== 'published' || !inv.edit_until) return false;
  return new Date(inv.edit_until).getTime() <= now;
}
