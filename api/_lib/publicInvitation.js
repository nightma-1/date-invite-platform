/**
 * © 2026 Senti. Все права защищены.
 *
 * Чтение опубликованного приглашения для превью ссылок — с anon-ключом,
 * ровно с теми же правами, что у получателя в браузере. Service-role здесь
 * не нужен и не используется: превью видит не больше, чем видит любой,
 * у кого есть ссылка.
 */

export const SLUG_RE = /^[a-z0-9]{4,16}$/;

export async function fetchPublicInvitation(slug) {
  if (!SLUG_RE.test(slug || '')) return null;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const query = new URLSearchParams({
    select: 'recipient_name,recipient_gender,template_key,expires_at,updated_at',
    slug: `eq.${slug}`,
    status: 'eq.published',
    limit: '1',
  });
  try {
    const res = await fetch(`${url}/rest/v1/invitations?${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const [row] = await res.json();
    if (!row) return null;
    if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
    return row;
  } catch {
    return null;
  }
}
