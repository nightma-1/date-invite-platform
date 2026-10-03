/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { createClient } from '@supabase/supabase-js';
import { clickProvider, isClickConfigured } from '../../src/lib/clickProvider.js';
import { rateLimit, clientIp } from '../_lib/rateLimit.js';

const INVITATION_PRICE = 19000; // сум, см. ТЗ раздел 3 (цена задаётся только здесь, клиент её не передаёт)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PENDING_PER_INVITATION = 5; // защита от спама строк в payments

let adminClient = null;
function getAdmin() {
  if (!adminClient) {
    adminClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return adminClient;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  // Грубый лимит по IP до любых обращений к БД и Supabase Auth.
  if (!rateLimit(`click-create:${clientIp(req)}`, { max: 20, windowMs: 60_000 })) {
    return res.status(429).json({ error: 'слишком много запросов' });
  }

  if (!isClickConfigured()) {
    return res.status(503).json({ error: 'оплата временно недоступна' });
  }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!accessToken) {
    return res.status(401).json({ error: 'не авторизован' });
  }

  // Токен пользователя проверяем через Supabase Auth, а читаем данные уже
  // от его имени (RLS не даст увидеть чужое приглашение).
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'не авторизован' });
  }
  const userId = userData.user.id;

  if (!rateLimit(`click-create-user:${userId}`, { max: 10, windowMs: 60_000 })) {
    return res.status(429).json({ error: 'слишком много запросов' });
  }

  const invitationId = req.body?.invitationId;
  if (typeof invitationId !== 'string' || !UUID_RE.test(invitationId)) {
    return res.status(400).json({ error: 'invitationId обязателен' });
  }

  const { data: invitation, error: invitationError } = await supabase
    .from('invitations')
    .select('id, status, user_id')
    .eq('id', invitationId)
    .single();

  // Явная проверка владельца: опубликованные приглашения читаются всеми по RLS,
  // и без неё можно было бы создать платёж за чужое приглашение.
  if (invitationError || !invitation || invitation.user_id !== userId) {
    return res.status(404).json({ error: 'приглашение не найдено' });
  }
  if (invitation.status === 'published') {
    return res.status(409).json({ error: 'приглашение уже опубликовано' });
  }

  const admin = getAdmin();

  const { count: pendingCount } = await admin
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('invitation_id', invitationId)
    .eq('status', 'pending');
  if ((pendingCount ?? 0) >= MAX_PENDING_PER_INVITATION) {
    return res.status(429).json({ error: 'слишком много неоплаченных попыток, попробуйте позже' });
  }

  // Платежи создаёт только сервер: клиентам запись в payments закрыта.
  const { data: payment, error: paymentError } = await admin
    .from('payments')
    .insert({
      user_id: userId,
      invitation_id: invitationId,
      amount: INVITATION_PRICE,
      status: 'pending',
    })
    .select()
    .single();

  if (paymentError) {
    console.error('click/create: failed to create payment row', paymentError);
    return res.status(500).json({ error: 'не удалось создать платёж' });
  }

  const { paymentUrl } = await clickProvider.createPayment({
    invitationId,
    amount: INVITATION_PRICE,
    returnUrl: `${process.env.PUBLIC_APP_URL}/builder/${invitationId}?paid=pending`,
  });

  return res.status(200).json({ paymentUrl, paymentId: payment.id });
}
