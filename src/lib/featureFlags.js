/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Флаги незаконченных функций. Смысл в том, чтобы код жил в main и не
 * расходился с остальным проектом, но при этом ничего не показывал людям,
 * пока мы сами не скажем.
 *
 * Как включить galaxy-letter:
 *   - на весь стенд: переменная окружения VITE_GALAXY_LETTER=1
 *   - разово, чтобы посмотреть на живом приглашении: ?galaxy=1 в адресе
 *
 * Второй способ нужен, чтобы проверять фичу на настоящем приглашении, не
 * открывая её всем сразу.
 */

function envOn(name) {
  try {
    const v = import.meta.env?.[name];
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

function queryOn(name) {
  try {
    if (typeof window === 'undefined') return false;
    const v = new URLSearchParams(window.location.search).get(name);
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

/** Космическое письмо: конверт → письмо → галактика → портрет из слов. */
export function galaxyLetterEnabled() {
  return envOn('VITE_GALAXY_LETTER') || queryOn('galaxy');
}
