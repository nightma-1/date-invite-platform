/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Перенос гостевого аккаунта на настоящий.
 *
 * Человек купил приглашение как гость (anonymous sign-in, см.
 * src/lib/guestAccount.js), потом вошёл через Telegram или по почте. Клиент
 * присылает два токена: настоящей сессии (в заголовке) и гостевой (в теле).
 * Оба проверяем через Supabase Auth: владение гостем доказывает только его
 * собственный токен, поэтому чужие приглашения так не забрать.
 *
 * Пишем сервисным ключом: триггер guard_invitation_writes запрещает менять
 * user_id обычным пользователям, и это правильно — смена владельца
 * допустима только здесь, после проверки обоих токенов.
 */

import { createClient } from '@supabase/supabase-js';
import { rateLimit, clientIp } from '../_lib/rateLimit.js';

let adminClient = null;
function getAdmin() {
  if (!adminClient) {
    adminClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return adminClient;
}

async function userFromToken(token) {
  if (!token || typeof token !== 'string' || token.length > 4096) return null;
  const { data, error } = await getAdmin().auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// Таблицы, где строка принадлежит пользователю через user_id.
const OWNED_TABLES = ['invitations', 'payments', 'support_tickets', 'support_threads', 'analytics_events'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }
  if (!rateLimit(`account-claim:${clientIp(req)}`, { max: 10, windowMs: 60_000 })) {
    return res.status(429).json({ error: 'слишком много запросов' });
  }

  const authHeader = req.headers.authorization || '';
  const realToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const realUser = await userFromToken(realToken);
  if (!realUser) return res.status(401).json({ error: 'не авторизован' });
  if (realUser.is_anonymous) return res.status(400).json({ error: 'нужен настоящий аккаунт' });

  const guestUser = await userFromToken(req.body?.guestToken);
  if (!guestUser) return res.status(410).json({ error: 'гостевая сессия истекла' });
  if (!guestUser.is_anonymous) return res.status(400).json({ error: 'это не гостевой аккаунт' });
  if (guestUser.id === realUser.id) return res.status(200).json({ ok: true, invitations: 0 });

  const admin = getAdmin();
  const moved = {};

  try {
    // Профиль: переносим только то, чего у настоящего аккаунта ещё нет —
    // подключённого бота уведомлений и реферальную метку блогера.
    const { data: profiles, error: profilesError } = await admin
      .from('profiles')
      .select('id, telegram_chat_id, telegram_username, referred_by, referred_at')
      .in('id', [guestUser.id, realUser.id]);
    if (profilesError) throw profilesError;
    const guestProfile = profiles.find((p) => p.id === guestUser.id);
    const realProfile = profiles.find((p) => p.id === realUser.id);

    if (guestProfile && realProfile) {
      const patch = {};
      if (!realProfile.telegram_chat_id && guestProfile.telegram_chat_id) {
        patch.telegram_chat_id = guestProfile.telegram_chat_id;
        patch.telegram_username = guestProfile.telegram_username;
      }
      if (!realProfile.referred_by && guestProfile.referred_by) {
        patch.referred_by = guestProfile.referred_by;
        patch.referred_at = guestProfile.referred_at;
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await admin.from('profiles').update(patch).eq('id', realUser.id);
        if (error) throw error;
      }
    }

    for (const table of OWNED_TABLES) {
      const { data, error } = await admin
        .from(table)
        .update({ user_id: realUser.id })
        .eq('user_id', guestUser.id)
        .select('user_id');
      if (error) throw error;
      moved[table] = data?.length || 0;
    }
  } catch (err) {
    console.error('guest claim failed', { guest: guestUser.id, real: realUser.id, err: err?.message });
    return res.status(500).json({ error: 'не удалось перенести приглашения' });
  }

  // Пустой гостевой аккаунт больше не нужен. Профиль удалится каскадом.
  // Не получилось — не страшно: в нём уже ничего нет.
  try {
    await admin.auth.admin.deleteUser(guestUser.id);
  } catch { /* оставляем пустого гостя */ }

  return res.status(200).json({ ok: true, invitations: moved.invitations || 0, payments: moved.payments || 0 });
}
