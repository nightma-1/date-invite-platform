/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * ВРЕМЕННЫЙ служебный эндпоинт: сам песочница не имеет доступа к api.telegram.org
 * напрямую (egress через прокси блокирует его), а сервер Vercel — имеет.
 * Вызывается один раз вручную (с секретом), чтобы поставить webhook новому
 * боту, затем удаляется из кода.
 */

export default async function handler(req, res) {
  const secret = req.query.secret;
  if (!secret || secret !== process.env.TEMP_SETUP_SECRET) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
    return;
  }

  const webhookUrl = `${process.env.PUBLIC_APP_URL || 'https://senti.uz'}/api/telegram/webhook`;

  const [setResult, meResult, infoResult] = await Promise.all([
    fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`).then((r) => r.json()),
    fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json()),
    fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then((r) => r.json()),
  ]);

  res.status(200).json({ setResult, meResult, infoResult });
}
