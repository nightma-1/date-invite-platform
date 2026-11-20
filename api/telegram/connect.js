/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

// Возвращает ссылку-deep-link на бота (t.me/<bot>?start=<подписанный код>) для
// авторизованного пользователя. Токен бота и username на фронтенд не попадают.
// Раньше эндпоинт принимал голый ?uid= без авторизации — это позволяло
// привязать чужой аккаунт к своему Telegram.

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createLinkCode } from '../_lib/telegramLink.js';
import { rateLimit, clientIp } from '../_lib/rateLimit.js';

let cachedUsername = null;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  if (!rateLimit(`tg-connect:${clientIp(req)}`, { max: 20, windowMs: 60_000 })) {
    return res.status(429).json({ error: 'too many requests' });
  }

  // Вход внутри Mini App (отдельный эндпоинт не заводим: на Vercel Hobby
  // предел 12 функций, и он уже выбран).
  if (req.body?.action === 'miniapp_login') return miniAppLogin(req, res);

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!accessToken) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'telegram bot is not configured' });
  }

  try {
    if (!cachedUsername) {
      const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await r.json();
      cachedUsername = data?.result?.username || null;
    }
    if (!cachedUsername) {
      return res.status(500).json({ error: 'could not resolve bot username' });
    }
    const code = createLinkCode(userData.user.id);
    return res.status(200).json({ url: `https://t.me/${cachedUsername}?start=${code}` });
  } catch (e) {
    return res.status(500).json({ error: 'telegram lookup failed' });
  }
}

// ── Вход внутри Telegram Mini App ─────────────────────────────────────────
// У окна Mini App своё хранилище: вход из Chrome туда не переносится, и
// человек, который уже пользуется ботом, видел форму входа заново.
// Telegram передаёт в окно initData, подписанные токеном бота
// (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
// Проверяем подпись, ищем аккаунт, привязанный к этому Telegram через бота
// (profiles.telegram_chat_id — в личном чате он равен id пользователя), и
// отдаём одноразовый token_hash; браузер меняет его на сессию через verifyOtp.
// Никаких писем: generateLink ничего не отправляет.

const INIT_DATA_MAX_AGE_S = 24 * 60 * 60;

function verifyInitData(initData, botToken) {
  if (typeof initData !== 'string' || initData.length > 4096) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  params.delete('hash');
  const checkString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(checkString).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(hash, 'hex'))) return null;
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE_S) return null;
  try {
    const user = JSON.parse(params.get('user') || 'null');
    return Number.isSafeInteger(user?.id) && user.id > 0 ? user : null;
  } catch {
    return null;
  }
}

async function miniAppLogin(req, res) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return res.status(500).json({ error: 'telegram bot is not configured' });

  const tgUser = verifyInitData(req.body?.initData, botToken);
  if (!tgUser) return res.status(401).json({ error: 'bad initData' });

  const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: profiles, error } = await admin
    .from('profiles').select('id').eq('telegram_chat_id', tgUser.id).limit(5);
  if (error) {
    console.error('miniapp_login: profiles lookup failed', error.message);
    return res.status(500).json({ error: 'lookup failed' });
  }

  // К одному Telegram бывает привязано несколько аккаунтов (тестовые) —
  // берём тот, в который входили последним. Нужен email: magic link без
  // него не выпустить; аккаунты «только Telegram» входят кнопкой, как раньше.
  let best = null;
  for (const p of profiles || []) {
    const { data } = await admin.auth.admin.getUserById(p.id);
    const u = data?.user;
    if (!u?.email || u.banned_until) continue;
    if (!best || String(u.last_sign_in_at || '') > String(best.last_sign_in_at || '')) best = u;
  }
  if (!best) return res.status(404).json({ error: 'not linked' });

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink', email: best.email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error('miniapp_login: generateLink failed', linkError?.message);
    return res.status(500).json({ error: 'login failed' });
  }
  return res.status(200).json({ token_hash: tokenHash });
}
