/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { randomInt } from 'crypto';
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

  // Покупка подарочного кода «купи другу» — без приглашения (см. миграцию gift_codes)
  if (req.body?.purpose === 'gift') {
    return createGiftPayment(res, userId, req.body?.method === PAYMENT_METHOD.CARD ? PAYMENT_METHOD.CARD : PAYMENT_METHOD.INVOICE);
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

  // Промокод: скидку считает только сервер. Один и тот же код человек может
  // использовать один раз; общий лимит и срок — в promo_codes.
  let promo = null;
  const promoInput = typeof req.body?.promoCode === 'string'
    ? req.body.promoCode.trim().toUpperCase().slice(0, 24) : '';

  // Подарочный код: одно бесплатное приглашение (не музей), ровно один раз
  if (promoInput.startsWith('GIFT-') && !isExtension) {
    if (invitation.kind === 'museum') return res.status(400).json({ error: 'подарочный код не для музея', promoInvalid: true });
    return redeemGift(res, admin, { code: promoInput, userId, invitationId, method });
  }

  if (promoInput && !isExtension) {
    const { data: pc } = await admin
      .from('promo_codes')
      .select('code, discount_percent, max_uses, expires_at, is_active, partner_id')
      .eq('code', promoInput)
      .maybeSingle();
    let valid = Boolean(pc?.is_active) && (!pc.expires_at || new Date(pc.expires_at) > new Date());
    if (valid && pc.max_uses) {
      const { count } = await admin.from('payments').select('id', { count: 'exact', head: true })
        .eq('promo_code', pc.code).eq('status', 'paid');
      valid = (count ?? 0) < pc.max_uses;
    }
    if (valid) {
      const { count } = await admin.from('payments').select('id', { count: 'exact', head: true })
        .eq('promo_code', pc.code).eq('status', 'paid').eq('user_id', userId);
      valid = (count ?? 0) === 0;
    }
    if (!valid) return res.status(400).json({ error: 'промокод недействителен', promoInvalid: true });
    promo = pc;
    amount = Math.round((amount * (100 - pc.discount_percent)) / 100 / 100) * 100;
    if (amount > 0 && amount < 1000) amount = 1000; // меньше Click не примет
  }

  // Промокод на 100%: публикуем сразу, без Click, но с записью в payments
  // (сумма 0) — чтобы было видно, сколько раз код использован.
  if (promo && amount === 0) {
    const { error: freeError } = await admin.from('payments').insert({
      user_id: userId, invitation_id: invitationId, amount: 0, status: 'paid', method,
      provider: 'promo', promo_code: promo.code, partner_id: promo.partner_id || null,
      term_days: termDays, features, purpose: 'publish',
    });
    if (freeError) {
      console.error('click/create: promo payment insert failed', freeError);
      return res.status(500).json({ error: 'не удалось применить промокод' });
    }
    const { data: published, error: publishError } = await admin
      .from('invitations').update({ status: 'published' }).eq('id', invitationId).select('slug').single();
    if (publishError) {
      console.error('click/create: promo publish failed', publishError);
      return res.status(500).json({ error: 'не удалось опубликовать' });
    }
    return res.status(200).json({ published: true, free: true, promo: promo.code, slug: published.slug });
  }

  if (!isClickConfigured()) {
    return res.status(503).json({ error: 'оплата временно недоступна' });
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
      promo_code: promo?.code || null,
      ...(promo?.partner_id ? { partner_id: promo.partner_id } : {}),
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


// ── Подарочные коды ────────────────────────────────────────────────────

const GIFT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без 0/O и 1/I

function newGiftCode() {
  return `GIFT-${Array.from({ length: 6 }, () => GIFT_ALPHABET[randomInt(GIFT_ALPHABET.length)]).join('')}`;
}

async function createGiftPayment(res, userId, method) {
  if (!isClickConfigured()) {
    return res.status(503).json({ error: 'оплата временно недоступна' });
  }
  const admin = getAdmin();

  // Защита от спама: не больше 5 неоплаченных подарков за час
  const since = new Date(Date.now() - PENDING_WINDOW_MS).toISOString();
  const { count } = await admin.from('gift_codes').select('id', { count: 'exact', head: true })
    .eq('buyer_id', userId).eq('status', 'pending').gte('created_at', since);
  if ((count ?? 0) >= MAX_PENDING_PER_INVITATION) {
    return res.status(429).json({ error: 'слишком много неоплаченных попыток, попробуйте позже' });
  }

  let gift = null;
  for (let i = 0; i < 3 && !gift; i += 1) {
    const { data, error } = await admin.from('gift_codes')
      .insert({ code: newGiftCode(), buyer_id: userId, amount: INVITATION_PRICE })
      .select('id, code').single();
    if (!error) gift = data;
    else if (error.code !== '23505') {
      console.error('click/create: gift insert failed', error);
      return res.status(500).json({ error: 'не удалось создать подарок' });
    }
  }
  if (!gift) return res.status(500).json({ error: 'не удалось создать подарок' });

  const { data: payment, error: paymentError } = await admin.from('payments').insert({
    user_id: userId, gift_id: gift.id, amount: INVITATION_PRICE, status: 'pending', method, purpose: 'gift',
  }).select().single();
  if (paymentError) {
    console.error('click/create: gift payment insert failed', paymentError);
    return res.status(500).json({ error: 'не удалось создать платёж' });
  }

  // В Click уходит id подарка — он вернётся в merchant_trans_id
  const { paymentUrl } = await clickProvider.createPayment({
    invitationId: gift.id,
    amount: INVITATION_PRICE,
    returnUrl: `${process.env.PUBLIC_APP_URL || 'https://senti.uz'}/gift/${gift.id}`,
    method,
  });
  return res.status(200).json({ paymentUrl, paymentId: payment.id, giftId: gift.id });
}

async function redeemGift(res, admin, { code, userId, invitationId, method }) {
  // Забираем код атомарно: два одновременных запроса не смогут погасить его дважды
  const { data: claimed, error: claimError } = await admin.from('gift_codes')
    .update({ status: 'redeemed', redeemed_by: userId, redeemed_invitation_id: invitationId, redeemed_at: new Date().toISOString() })
    .eq('code', code).eq('status', 'active')
    .select('id, code').maybeSingle();
  if (claimError) {
    console.error('click/create: gift claim failed', claimError);
    return res.status(500).json({ error: 'не удалось применить подарок' });
  }
  if (!claimed) return res.status(400).json({ error: 'подарочный код недействителен', promoInvalid: true });

  const release = () => admin.from('gift_codes')
    .update({ status: 'active', redeemed_by: null, redeemed_invitation_id: null, redeemed_at: null })
    .eq('id', claimed.id);

  const { error: payError } = await admin.from('payments').insert({
    user_id: userId, invitation_id: invitationId, amount: 0, status: 'paid', method,
    provider: 'promo', promo_code: claimed.code, gift_id: claimed.id, purpose: 'publish',
  });
  if (payError) {
    console.error('click/create: gift redeem payment failed', payError);
    await release();
    return res.status(500).json({ error: 'не удалось применить подарок' });
  }
  const { data: published, error: publishError } = await admin
    .from('invitations').update({ status: 'published' }).eq('id', invitationId).select('slug').single();
  if (publishError) {
    console.error('click/create: gift publish failed', publishError);
    return res.status(500).json({ error: 'не удалось опубликовать' });
  }
  return res.status(200).json({ published: true, free: true, promo: claimed.code, gift: true, slug: published.slug });
}
