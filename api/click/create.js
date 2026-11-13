/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { createClient } from '@supabase/supabase-js';
import { clickProvider, isClickConfigured, PAYMENT_METHOD } from '../../src/lib/clickProvider.js';
import { rateLimit, clientIp } from '../_lib/rateLimit.js';
import { MUSEUM_PUBLIC, museumPublishPrice, museumExtendPrice, museumTerm } from '../../src/lib/museumPlans.js';

const INVITATION_PRICE = 19000; // сум, см. ТЗ раздел 3 (цена задаётся только здесь, клиент её не передаёт)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PENDING_PER_INVITATION = 5; // защита от спама строк в payments
const PENDING_WINDOW_MS = 60 * 60_000; // за какой срок считаем незавершённые попытки

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

  // Какая из двух кнопок оплаты — "через CLICK" или "картой". Белый список,
  // а не что угодно от клиента: это пишется в payments.method (constraint
  // в БД всё равно отбракует мусор, но лучше 400, чем 500 от констрейнта).
  const method = req.body?.method === PAYMENT_METHOD.CARD ? PAYMENT_METHOD.CARD : PAYMENT_METHOD.INVOICE;

  const { data: invitation, error: invitationError } = await supabase
    .from('invitations')
    .select('id, status, user_id, kind')
    .eq('id', invitationId)
    .single();

  // Явная проверка владельца: опубликованные приглашения читаются всеми по RLS,
  // и без неё можно было бы создать платёж за чужое приглашение.
  if (invitationError || !invitation || invitation.user_id !== userId) {
    return res.status(404).json({ error: 'приглашение не найдено' });
  }

  // Музей: цена зависит от срока. Срок читаем из базы или проверяем по белому
  // списку, сумма считается только здесь. Продлить можно лишь живую ссылку.
  const isExtension = req.body?.purpose === 'extend';
  // Закончившийся музей тоже можно продлить, пока файлы не удалены (см. api/museum.js)
  if (isExtension && (invitation.kind !== 'museum' || !['published', 'expired'].includes(invitation.status))) {
    return res.status(409).json({ error: 'этот музей нельзя продлить' });
  }
  if (!isExtension && invitation.status === 'published') {
    return res.status(409).json({ error: 'приглашение уже опубликовано' });
  }

  const admin = getAdmin();

  // Владельцы сервиса (profiles.is_admin) публикуют без оплаты: тот же UPDATE,
  // что делает вебхук Click после списания, только без строки в payments,
  // чтобы бесплатные приглашения не попадали в выручку. Флаг читаем через
  // service role: клиент его подделать не может.
  const { data: profile } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();
  if (profile?.is_admin) {
    // Продление музея владельцем: сразу добавляем срок, без оплаты
    if (isExtension) {
      const days = museumTerm(req.body?.termDays)?.days;
      if (!days) return res.status(400).json({ error: 'неверный срок' });
      const { data: current } = await admin.from('invitations').select('expires_at').eq('id', invitationId).single();
      const from = Math.max(Date.now(), new Date(current?.expires_at || 0).getTime());
      const until = new Date(from + days * 86400000).toISOString();
      const { error: extendError } = await admin
        .from('invitations')
        .update({ expires_at: until, edit_until: until, expiry_reminded_at: null, status: 'published' })
        .eq('id', invitationId);
      if (extendError) {
        console.error('click/create: admin free extend failed', extendError);
        return res.status(500).json({ error: 'не удалось продлить' });
      }
      return res.status(200).json({ extended: true, free: true });
    }
    const { data: published, error: publishError } = await admin
      .from('invitations')
      .update({ status: 'published' })
      .eq('id', invitationId)
      .select('slug')
      .single();
    if (publishError) {
      console.error('click/create: admin free publish failed', publishError);
      return res.status(500).json({ error: 'не удалось опубликовать' });
    }
    return res.status(200).json({ published: true, free: true, slug: published.slug });
  }

  // Пока музей не запущен, оплатить его не может никто, кроме владельца
  if (invitation.kind === 'museum' && !MUSEUM_PUBLIC) {
    return res.status(403).json({ error: 'музей пока недоступен' });
  }

  if (!isClickConfigured()) {
    return res.status(503).json({ error: 'оплата временно недоступна' });
  }

  let amount = INVITATION_PRICE;
  let termDays = null;
  let features = null;
  if (invitation.kind === 'museum') {
    if (isExtension) {
      if (!museumTerm(req.body?.termDays)) {
        return res.status(400).json({ error: 'неверный срок' });
      }
      const { data: content } = await admin.from('museum_content').select('purged_at').eq('invitation_id', invitationId).maybeSingle();
      if (!content || content.purged_at) return res.status(409).json({ error: 'файлы этого музея уже удалены' });
      termDays = Number(req.body.termDays);
      amount = museumExtendPrice(termDays);
    } else {
      const { data: content } = await admin
        .from('museum_content')
        .select('term_days, tier, theme, voice_url, song_url')
        .eq('invitation_id', invitationId)
        .maybeSingle();
      if (!content) return res.status(404).json({ error: 'музей не найден' });
      termDays = content.term_days;
      // Снимок оплаченного: всё, что появится позже, при публикации будет снято
      features = { tier: content.tier, theme: content.theme, voice: Boolean(content.voice_url), song: Boolean(content.song_url) };
      amount = museumPublishPrice({ termDays, ...features });
    }
  }

  // Считаем только свежие попытки. Без окна брошенные оплаты (пользователь
  // ушёл на страницу Click и закрыл вкладку) копились бы вечно, и после пятой
  // приглашение становилось бы неоплачиваемым НАВСЕГДА — «попробуйте позже»
  // не помогало бы, спасала бы только ручная правка БД. Окно делает лимит тем,
  // чем он задумывался: защитой от спама, а не пожизненной блокировкой.
  //
  // Сами строки при этом не трогаем: pending-платёж остаётся pending, и если
  // Click всё-таки пришлёт по нему Prepare, тот его найдёт (handlePrepare
  // ищет по status='pending').
  const pendingSince = new Date(Date.now() - PENDING_WINDOW_MS).toISOString();
  const { count: pendingCount } = await admin
    .from('payments')
    .select('id', { count: 'exact', head: true })
    .eq('invitation_id', invitationId)
    .eq('status', 'pending')
    .gte('created_at', pendingSince);
  if ((pendingCount ?? 0) >= MAX_PENDING_PER_INVITATION) {
    return res.status(429).json({ error: 'слишком много неоплаченных попыток, попробуйте позже' });
  }

  // Платежи создаёт только сервер: клиентам запись в payments закрыта.
  const { data: payment, error: paymentError } = await admin
    .from('payments')
    .insert({
      user_id: userId,
      invitation_id: invitationId,
      amount,
      status: 'pending',
      method,
      term_days: termDays,
      features,
      purpose: isExtension ? 'extend' : 'publish',
    })
    .select()
    .single();

  if (paymentError) {
    console.error('click/create: failed to create payment row', paymentError);
    return res.status(500).json({ error: 'не удалось создать платёж' });
  }

  const { paymentUrl } = await clickProvider.createPayment({
    invitationId,
    amount,
    returnUrl: `${process.env.PUBLIC_APP_URL || 'https://senti.uz'}${isExtension ? '/dashboard' : `/payment/${invitationId}`}`,
    method,
  });

  return res.status(200).json({ paymentUrl, paymentId: payment.id });
}
