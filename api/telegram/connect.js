/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

// Редиректит пользователя на deep-link бота (t.me/<bot>?start=<user_id>),
// сам узнавая username бота через Telegram getMe — так фронтенд никогда
// не должен знать токен бота или его username напрямую.

let cachedUsername = null;

export default async function handler(req, res) {
  const uid = req.query.uid;
  if (!uid || typeof uid !== 'string') {
    res.status(400).send('missing uid');
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    res.status(500).send('telegram bot is not configured');
    return;
  }

  try {
    if (!cachedUsername) {
      const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await r.json();
      cachedUsername = data?.result?.username || null;
    }
    if (!cachedUsername) {
      res.status(500).send('could not resolve bot username');
      return;
    }
    res.writeHead(302, { Location: `https://t.me/${cachedUsername}?start=${encodeURIComponent(uid)}` });
    res.end();
  } catch (e) {
    res.status(500).send('telegram lookup failed');
  }
}
