/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Свой счётчик посещаемости. Пишет события в Supabase (RPC track_event),
 * читает их только админка (/xujayin → раздел «Аналитика»).
 *
 * Что собираем и чего НЕ собираем:
 *   visitor_id  — случайный uuid в localStorage. Это «один браузер», а не
 *                 человек: почистил хранилище — стал новым посетителем.
 *   session_id  — случайный uuid в sessionStorage, живёт до закрытия вкладки.
 *   НЕ собираем IP, почту, имена, содержимое приглашений. Поэтому и
 *   cookie-баннер не нужен: это обезличенная статистика по своему сайту.
 *
 * Правила работы:
 *   - никогда не ломаем страницу: все вызовы в try/catch, ошибки молчат;
 *   - ничего не ждём — трекинг не должен задерживать ни один клик;
 *   - админку и локальную разработку не считаем, иначе своя же возня
 *     перебьёт реальную статистику.
 */

import { supabase } from './supabaseClient.js';

const VISITOR_KEY = 'senti_visitor_id';
const SESSION_KEY = 'senti_session_id';
const ATTRIBUTION_KEY = 'senti_attribution';

// Путь админки трекать нельзя: владелец сам ходит туда десятки раз в день.
const IGNORED_PATH_PREFIXES = ['/xujayin'];

function uuid() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* старый браузер — падаем в ручную генерацию ниже */ }
  // Ручной v4 на случай, если crypto.randomUUID недоступен (старый Safari).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** localStorage бывает недоступен (режим инкогнито, запрет хранилища) — не падаем. */
function readStore(store, key) {
  try {
    return window[store].getItem(key);
  } catch {
    return null;
  }
}

function writeStore(store, key, value) {
  try {
    window[store].setItem(key, value);
  } catch { /* не сохранилось — просто будем считать визит новым */ }
}

function getVisitorId() {
  let id = readStore('localStorage', VISITOR_KEY);
  if (!id) {
    id = uuid();
    writeStore('localStorage', VISITOR_KEY, id);
  }
  return id;
}

function getSessionId() {
  let id = readStore('sessionStorage', SESSION_KEY);
  if (!id) {
    id = uuid();
    writeStore('sessionStorage', SESSION_KEY, id);
  }
  return id;
}

function detectDevice() {
  try {
    const ua = navigator.userAgent || '';
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'tablet';
    if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua)) return 'mobile';
    return 'desktop';
  } catch {
    return null;
  }
}

/**
 * Источник перехода запоминаем ОДИН РАЗ за сессию (first-touch): человек
 * пришёл с инстаграма, потом походил по сайту — все его события должны
 * остаться за инстаграмом, а не за «прямым заходом».
 */
function getAttribution() {
  const cached = readStore('sessionStorage', ATTRIBUTION_KEY);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch { /* битый json — пересоберём ниже */ }
  }

  const attribution = {
    utm_source: null, utm_medium: null, utm_campaign: null,
    ref_code: null, referrer_host: null,
  };

  try {
    const params = new URLSearchParams(window.location.search);
    attribution.utm_source = params.get('utm_source');
    attribution.utm_medium = params.get('utm_medium');
    attribution.utm_campaign = params.get('utm_campaign');
    // ?ref=blogger — реферальные ссылки инфлюенсеров
    attribution.ref_code = params.get('ref');

    const ref = document.referrer;
    if (ref) {
      const host = new URL(ref).hostname.replace(/^www\./, '');
      // Переходы внутри своего же сайта источником не считаются
      if (host && host !== window.location.hostname.replace(/^www\./, '')) {
        attribution.referrer_host = host;
      }
    }
  } catch { /* кривой URL или реферер — остаёмся с пустыми полями */ }

  writeStore('sessionStorage', ATTRIBUTION_KEY, JSON.stringify(attribution));
  return attribution;
}

function isTrackable(path) {
  try {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return false;
    if (navigator.webdriver) return false;
    const p = path || window.location.pathname;
    return !IGNORED_PATH_PREFIXES.some((prefix) => p.startsWith(prefix));
  } catch {
    return false;
  }
}

// Защита от дублей: React StrictMode в деве вызывает эффекты дважды, да и
// повторный рендер роутера может прислать тот же page_view подряд.
const recent = new Map();
function isDuplicate(key, windowMs = 1200) {
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < windowMs) return true;
  recent.set(key, now);
  // Чистим, чтобы Map не рос на длинных сессиях
  if (recent.size > 50) {
    for (const [k, time] of recent) if (now - time > 60_000) recent.delete(k);
  }
  return false;
}

/**
 * Отправить событие. Ничего не возвращает и никогда не бросает исключений —
 * вызывать можно прямо в обработчике клика, не дожидаясь результата.
 *
 * @param {string} event   имя события в snake_case (page_view, builder_start, …)
 * @param {object} [props] произвольные детали (маленький объект, до ~2 КБ)
 * @param {object} [opts]  { path, slug } — переопределить путь или указать
 *                         slug приглашения для событий на стороне получателя
 */
export function track(event, props = {}, opts = {}) {
  try {
    const path = opts.path || window.location.pathname;
    if (!isTrackable(path)) return Promise.resolve(false);
    // В ключ дубля входят и props: builder_step с разными шагами — это
    // разные события, даже если они пришли одно за другим.
    let propsKey = '';
    try { propsKey = JSON.stringify(props || {}); } catch { propsKey = ''; }
    if (isDuplicate(`${event}|${path}|${opts.slug || ''}|${propsKey}`)) return Promise.resolve(false);

    const attribution = getAttribution();

    return supabase.rpc('track_event', {
      p_event: event,
      p_visitor_id: getVisitorId(),
      p_session_id: getSessionId(),
      p_path: path,
      p_props: props || {},
      p_invitation_slug: opts.slug || null,
      p_utm_source: attribution.utm_source,
      p_utm_medium: attribution.utm_medium,
      p_utm_campaign: attribution.utm_campaign,
      p_ref_code: attribution.ref_code,
      p_referrer_host: attribution.referrer_host,
      p_device: detectDevice(),
      p_lang: (navigator.language || '').slice(0, 12) || null,
    }).then(() => true, () => false); // статистика не должна шуметь в консоли
  } catch {
    return Promise.resolve(false); // аналитика никогда не ломает страницу
  }
}

/**
 * То же самое, но перед уходом со страницы (редирект на оплату): даём запросу
 * шанс долететь, но держим пользователя не дольше 700 мс — если сеть тупит,
 * лучше потерять событие, чем задержать оплату.
 */
export function trackBeforeLeaving(event, props = {}, opts = {}) {
  return Promise.race([
    track(event, props, opts),
    new Promise((resolve) => setTimeout(() => resolve(false), 700)),
  ]);
}

/** Просмотр страницы. Вызывается автоматически на каждую смену роута. */
export function trackPageView(path) {
  track('page_view', {}, { path });
}
