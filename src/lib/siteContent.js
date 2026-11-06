/**
 * © 2026 Senti. Все права защищены.
 *
 * Тексты сайта, которые владелец правит из админки (таблица site_content,
 * миграция site_content). Сейчас это образец приглашения на главной.
 *
 * Как и с гифками демо: последнюю версию держим в localStorage, чтобы
 * главная сразу показывала правильный текст, а не дефолт с подменой.
 */

import { supabase } from './supabaseClient.js';

export const LANDING_DEMO_KEY = 'landing_demo';
const CACHE_PREFIX = 'senti_site_content_v1:';

/** Поля образца, которые можно менять. Пустое значение = текст по умолчанию. */
export const LANDING_DEMO_FIELDS = [
  { id: 'recipientName', label: 'Имя получателя', i18n: 'landing.previewRecipient', max: 40 },
  { id: 'question', label: 'Вопрос', i18n: 'landing.previewQuestion', max: 200, multiline: true },
  { id: 'yesText', label: 'Кнопка «Да»', i18n: 'questionScreen.yesDefault', max: 40 },
  { id: 'reactionTitle', label: 'Реакция — заголовок', i18n: 'landing.demo.reactionTitle', max: 80 },
  { id: 'reactionText', label: 'Реакция — текст', i18n: 'landing.demo.reactionText', max: 240, multiline: true },
  { id: 'dateTitle', label: 'Дата — заголовок', i18n: 'landing.demo.dateTitle', max: 80 },
  { id: 'placeTitle', label: 'Куда пойти — заголовок', i18n: 'landing.demo.placeTitle', max: 60 },
  { id: 'placeOptions', label: 'Куда пойти — варианты', i18n: 'landing.demo.placeOptions', options: true },
  { id: 'foodTitle', label: 'Что поесть — заголовок', i18n: 'landing.demo.foodTitle', max: 60 },
  { id: 'foodOptions', label: 'Что поесть — варианты', i18n: 'landing.demo.foodOptions', options: true },
  { id: 'finalTitle', label: 'Финал — заголовок', i18n: 'landing.demo.finalTitle', max: 80 },
  { id: 'finalDescription', label: 'Финал — текст', i18n: 'landing.demo.finalDescription', max: 240, multiline: true },
];

export function getCachedSiteContent(key) {
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function cacheSiteContent(key, value) {
  try {
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value || {}));
  } catch { /* приватный режим — без кэша */ }
}

export async function loadSiteContent(key) {
  const { data, error } = await supabase
    .from('site_content')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw error;
  const value = data?.value || {};
  cacheSiteContent(key, value);
  return value;
}

export async function saveSiteContent(key, value) {
  const { error } = await supabase
    .from('site_content')
    .upsert({ key, value }, { onConflict: 'key' });
  if (error) throw error;
  cacheSiteContent(key, value);
}

/** «☕ Кафе» → { id, icon: '☕', label: 'Кафе' }. Без значка — ✨. */
export function parseOptionLines(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((line, i) => {
      const m = line.match(/^(\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*)\s*(.*)$/u);
      const icon = m ? m[1] : '✨';
      const label = (m ? m[2] : line).trim().slice(0, 40) || line.slice(0, 40);
      return { id: `opt_${i + 1}`, icon, label };
    });
}

export function optionsToLines(options) {
  if (!Array.isArray(options)) return '';
  return options.map((o) => `${o.icon || ''} ${o.label || ''}`.trim()).join('\n');
}
