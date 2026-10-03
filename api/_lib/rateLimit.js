/**
 * © 2026 Senti. Все права защищены.
 *
 * Простой лимитер в памяти инстанса: режет всплески с одного IP/пользователя.
 * В serverless у каждого инстанса свой счётчик, поэтому это только вторая
 * линия защиты. Основной лимит нужно включить в Vercel Firewall
 * (Rate Limiting) на /api/*.
 */

const buckets = new Map();

export function rateLimit(key, { max, windowMs }) {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    entry.count += 1;
    if (entry.count > max) return false;
  }

  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
    }
  }
  return true;
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  const first = typeof fwd === 'string' ? fwd.split(',')[0].trim() : '';
  return first || req.socket?.remoteAddress || 'unknown';
}
