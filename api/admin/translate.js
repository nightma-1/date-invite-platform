/**
 * © 2026 Senti. Все права защищены.
 *
 * Автоперевод текстов образца на главной (админка → «Образец на главной»).
 * Принимает русские поля, возвращает узбекский и английский варианты.
 * Ничего не сохраняет: перевод подставляется в форму, админ проверяет
 * и сам жмёт «Сохранить».
 *
 * Только для админа (profiles.is_admin). Перевод — Claude API, ключ в
 * переменной окружения ANTHROPIC_API_KEY на Vercel; модель можно сменить
 * через ANTHROPIC_MODEL.
 */

import { createClient } from '@supabase/supabase-js';
import { rateLimit, clientIp } from '../_lib/rateLimit.js';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
const TEXT_FIELDS = [
  'recipientName', 'question', 'yesText', 'reactionTitle', 'reactionText',
  'dateTitle', 'placeTitle', 'foodTitle', 'finalTitle', 'finalDescription',
];
const OPTION_FIELDS = ['placeOptions', 'foodOptions'];

const SYSTEM_PROMPT = `You translate short UI texts for Senti, a playful website where someone invites a person on a date with a cute interactive invitation (with a runaway "No" button).

Translate from Russian into:
- "uz": Uzbek, LATIN script, informal "sen" form, warm and natural as young people in Tashkent would write in a message.
- "en": English, casual and warm.

Rules:
- Keep the tone, humour and flirtiness. Do not make it formal. Do not add new meaning.
- Keep every emoji exactly where it makes sense.
- "recipientName" is a person's first name: transliterate it to Latin script, do not translate it.
- Option lists: translate each label, keep the same order and count.
- Keep the same JSON keys. Omit nothing that was given.

Answer with ONLY a JSON object: {"uz": {...}, "en": {...}} with the same keys as the input. No comments, no markdown.`;

function clean(s, max) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

async function isAdmin(accessToken) {
  const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: userData, error } = await anon.auth.getUser(accessToken);
  if (error || !userData?.user) return false;
  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data } = await admin.from('profiles').select('is_admin').eq('id', userData.user.id).maybeSingle();
  return Boolean(data?.is_admin);
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no json in answer');
  return JSON.parse(text.slice(start, end + 1));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!rateLimit(`translate:${clientIp(req)}`, { max: 10, windowMs: 60_000 })) {
    return res.status(429).json({ error: 'Слишком часто. Подожди минуту.' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token || !(await isAdmin(token))) return res.status(401).json({ error: 'unauthorized' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Перевод не настроен: на Vercel нет ANTHROPIC_API_KEY.' });
  }

  // Берём только известные поля и обрезаем длину — во внешний сервис уходит
  // ровно то, что видно в форме, и не больше.
  const src = req.body?.fields || {};
  const input = {};
  for (const k of TEXT_FIELDS) {
    const v = clean(src[k], 240);
    if (v) input[k] = v;
  }
  for (const k of OPTION_FIELDS) {
    if (Array.isArray(src[k]) && src[k].length) {
      input[k] = src[k].slice(0, 8).map((o) => clean(o, 40)).filter(Boolean);
    }
  }
  if (Object.keys(input).length === 0) {
    return res.status(400).json({ error: 'Нечего переводить: русские поля пустые.' });
  }

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(input) }],
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('admin/translate: anthropic error', r.status, data?.error?.message);
      return res.status(502).json({ error: `Переводчик ответил ошибкой: ${data?.error?.message || r.status}` });
    }
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const parsed = extractJson(text);

    const result = {};
    for (const lang of ['uz', 'en']) {
      const out = {};
      const got = parsed?.[lang] || {};
      for (const k of TEXT_FIELDS) if (input[k] && typeof got[k] === 'string') out[k] = clean(got[k], 240);
      for (const k of OPTION_FIELDS) {
        if (input[k] && Array.isArray(got[k])) out[k] = got[k].slice(0, input[k].length).map((o) => clean(o, 40));
      }
      result[lang] = out;
    }
    return res.status(200).json(result);
  } catch (e) {
    console.error('admin/translate failed', e);
    return res.status(502).json({ error: 'Не получилось перевести. Попробуй ещё раз.' });
  }
}
