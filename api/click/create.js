/**
 * © 2026 Date Invite Platform. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { createClient } from '@supabase/supabase-js';
import { clickProvider } from '../../src/lib/clickProvider.js';

const INVITATION_PRICE = 19000; // сум, см. ТЗ раздел 3

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.replace('Bearer ', '');

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'не авторизован' });
  }

  const { invitationId } = req.body;
  if (!invitationId) {
    return res.status(400).json({ error: 'invitationId обязателен' });
  }

  // RLS сам не даст создать платёж по чужому приглашению — но проверяем явно для понятной ошибки
  const { data: invitation, error: invitationError } = await supabase
    .from('invitations')
    .select('id, status, user_id')
    .eq('id', invitationId)
    .single();

  if (invitationError || !invitation) {
    return res.status(404).json({ error: 'приглашение не найдено' });
  }
  if (invitation.status === 'published') {
    return res.status(409).json({ error: 'приглашение уже опубликовано' });
  }

  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .insert({
      user_id: userData.user.id,
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