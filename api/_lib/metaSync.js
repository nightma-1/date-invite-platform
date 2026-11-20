/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Расходы на рекламу из Meta Marketing API (бесплатно, токен с правом
 * ads_read). Раз в день (pg_cron → request_meta_sync → notify.js) и по
 * кнопке в админке забираем траты по кампаниям за последние N дней и
 * перезаписываем их в ad_spend (строки с note «meta:…»; внесённые руками
 * не трогаем). campaign = id кампании — он же utm_campaign в ссылках
 * рекламы ({{campaign.id}}), поэтому аналитика сама сопоставит расход
 * с посетителями и оплатами.
 *
 * Валюта: если рекламный кабинет не в сумах, переводим по курсу ЦБ Узбекистана
 * (cbu.uz, бесплатно, без ключа) на день траты; если ЦБ недоступен — по
 * META_FALLBACK_RATE из настроек Vercel.
 *
 * Нужно в Vercel: META_ACCESS_TOKEN, META_AD_ACCOUNT_ID (цифры, можно с act_).
 */

const GRAPH = 'https://graph.facebook.com/v21.0';
const TZ_MS = 5 * 3600 * 1000;

function tashkentYmd(offsetDays = 0) {
  return new Date(Date.now() + TZ_MS + offsetDays * 86400000).toISOString().slice(0, 10);
}

async function graph(path, params) {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  url.searchParams.set('access_token', process.env.META_ACCESS_TOKEN);
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) throw new Error(body.error?.message || `Meta API ${res.status}`);
  return body;
}

const rateCache = new Map();
async function cbuRate(currency, ymd) {
  const key = `${currency}:${ymd}`;
  if (rateCache.has(key)) return rateCache.get(key);
  let rate = null;
  try {
    const res = await fetch(`https://cbu.uz/ru/arkhiv-kursov-valyut/json/${currency}/${ymd}/`);
    const list = await res.json();
    rate = Number(String(list?.[0]?.Rate || '').replace(',', '.')) || null;
  } catch { /* ниже — запасной курс */ }
  if (!rate) rate = Number(process.env.META_FALLBACK_RATE) || null;
  if (!rate) throw new Error(`Нет курса ${currency} (cbu.uz недоступен, META_FALLBACK_RATE не задан)`);
  rateCache.set(key, rate);
  return rate;
}

export function metaConfigured() {
  return Boolean(process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID);
}

export async function syncMetaSpend(supabaseAdmin, days = 7) {
  const log = (row) => supabaseAdmin.from('meta_sync_log').insert(row);
  if (!metaConfigured()) {
    await log({ ok: false, error: 'В Vercel не заданы META_ACCESS_TOKEN и META_AD_ACCOUNT_ID' });
    return { ok: false, reason: 'not configured' };
  }
  const account = `act_${String(process.env.META_AD_ACCOUNT_ID).replace(/^act_/, '')}`;
  try {
    const info = await graph(account, { fields: 'currency,name' });
    const currency = info.currency || 'USD';
    const since = tashkentYmd(-(Math.max(1, Math.min(days, 90)) - 1));
    const until = tashkentYmd(0);

    const rows = [];
    let page = await graph(`${account}/insights`, {
      level: 'campaign',
      fields: 'campaign_id,campaign_name,spend',
      time_increment: '1',
      time_range: { since, until },
      limit: '500',
    });
    for (;;) {
      for (const r of page.data || []) {
        const spend = Number(r.spend || 0);
        if (!spend) continue;
        const rate = currency === 'UZS' ? 1 : await cbuRate(currency, r.date_start);
        rows.push({
          day: r.date_start,
          channel: 'meta',
          campaign: r.campaign_id,
          content: null,
          amount: Math.round(spend * rate),
          note: `meta:${String(r.campaign_name || '').slice(0, 150)}`,
        });
      }
      if (!page.paging?.next) break;
      const next = await fetch(page.paging.next);
      page = await next.json();
      if (page.error) throw new Error(page.error.message);
    }

    // Перезаписываем только автоматические строки за этот период
    const { error: delError } = await supabaseAdmin.from('ad_spend')
      .delete().like('note', 'meta:%').gte('day', since).lte('day', until);
    if (delError) throw new Error(delError.message);
    if (rows.length) {
      const { error: insError } = await supabaseAdmin.from('ad_spend').insert(rows);
      if (insError) throw new Error(insError.message);
    }
    const total = rows.reduce((s, r) => s + r.amount, 0);
    await log({ ok: true, rows: rows.length, spend_total: total, currency, rate: currency === 'UZS' ? 1 : (rateCache.get(`${currency}:${until}`) || null) });
    return { ok: true, rows: rows.length, total, currency };
  } catch (err) {
    const message = String(err?.message || err).replace(/access_token=[^&\s]+/g, 'access_token=***').slice(0, 300);
    await log({ ok: false, error: message });
    return { ok: false, error: message };
  }
}
