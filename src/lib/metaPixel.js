/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Meta Pixel для рекламы в Facebook/Instagram.
 *
 * Правила:
 *   - пока META_PIXEL_ID пустой, модуль ничего не делает и ничего не грузит;
 *   - страницы приглашений (/i/:slug) не трекаем никогда: получатель ничего
 *     не покупает и на чужой счётчик не соглашался;
 *   - админку и локальную разработку тоже не считаем;
 *   - почту, имена и тексты приглашений в Meta не передаём;
 *   - пиксель никогда не ломает страницу и не держит пользователя.
 */

// ID пикселя не секрет: он всё равно виден в коде любой страницы.
export const META_PIXEL_ID = '1853938249149554';

const INVITATION_PRICE_UZS = 19000;
const IGNORED_PATH_PREFIXES = ['/i/', '/xujayin'];
const PURCHASE_KEY_PREFIX = 'senti_pixel_purchase_';

let initialized = false;

function isAllowed(path) {
  try {
    if (!META_PIXEL_ID) return false;
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return false;
    const p = path || window.location.pathname;
    return !IGNORED_PATH_PREFIXES.some((prefix) => p.startsWith(prefix));
  } catch {
    return false;
  }
}

/** Стандартный загрузчик Meta. Запускается только на разрешённых страницах. */
function init() {
  if (initialized) return;
  initialized = true;
  /* eslint-disable */
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,'script','https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
  window.fbq('init', META_PIXEL_ID);
}

function send(event, params, options) {
  try {
    if (!isAllowed()) return;
    init();
    window.fbq('track', event, params, options);
  } catch { /* пиксель не должен мешать сайту */ }
}

export function pixelPageView(path) {
  try {
    if (!isAllowed(path)) return;
    init();
    window.fbq('track', 'PageView');
  } catch { /* см. выше */ }
}

export function pixelInitiateCheckout() {
  send('InitiateCheckout', { value: INVITATION_PRICE_UZS, currency: 'UZS' });
}

/**
 * Покупка. Страницу оплаты можно открыть повторно, поэтому в этом браузере
 * считаем каждое приглашение один раз, а eventID защищает от дублей на стороне Meta.
 */
export function pixelPurchase(invitationId) {
  try {
    if (!isAllowed()) return;
    const key = `${PURCHASE_KEY_PREFIX}${invitationId}`;
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, '1');
  } catch { /* без localStorage дубли отсечёт eventID */ }
  send('Purchase', { value: INVITATION_PRICE_UZS, currency: 'UZS' }, { eventID: `purchase_${invitationId}` });
}
