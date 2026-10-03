/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

// Возвращает ссылку-deep-link на бота (t.me/<bot>?start=<подписанный код>) для
// авторизованного пользователя. Токен бота и username на фронтенд не попадают.
// Раньше эндпоинт принимал голый ?uid= без авторизации — это позволяло
// привязать чужой аккаунт к своему Telegram.

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
