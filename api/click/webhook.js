/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { createClient } from '@supabase/supabase-js';
import { verifySign, buildPrepareResponse, buildCompleteResponse, CLICK_ACTION, CLICK_ERROR } from '../../src/lib/clickProvider.js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const body = req.body;
  const action = Number(body.action);
  const isPrepare = action === CLICK_ACTION.PREPARE;

  if (!verifySign(body)) {
    const bad = { click_trans_id: body.click_trans_id, merchant_trans_id: body.merchant_trans_id, error: CLICK_ERROR.SIGN_CHECK_FAILED, error_note: 'Неверная подпись' };
    return res.status(200).json(isPrepare ? buildPrepareResponse({ ...bad, merchant_prepare_id: null }) : buildCompleteResponse({ ...bad, merchant_confirm_id: null }));
  }

  return isPrepare ? handlePrepare(body, res) : handleComplete(body, res);
}

async function handlePrepare(body, res) {
  const invitationId = body.merchant_trans_id;

  const { data: payment, error: findError } = await supabaseAdmin
    .from('payments')
    .select('*')
    .eq('invitation_id', invitationId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError || !payment) {
    return res.status(200).json(
      buildPrepareResponse({
        click_trans_id: body.click_trans_id,
        merchant_trans_id: invitationId,
        merchant_prepare_id: null,
        error: CLICK_ERROR.TRANSACTION_NOT_FOUND,
        error_note: 'Платёж не найден',
      })
    );
  }

  if (Number(body.amount) !== payment.amount) {
    return res.status(200).json(
      buildPrepareResponse({
        click_trans_id: body.click_trans_id,
        merchant_trans_id: invitationId,
        merchant_prepare_id: null,
        error: CLICK_ERROR.INVALID_AMOUNT,
        error_note: 'Сумма не совпадает',
      })
    );
  }

  // click_prepare_id уже назначен базой при создании строки (bigserial) — просто фиксируем click_trans_id
  await supabaseAdmin.from('payments').update({ transaction_id: String(body.click_trans_id) }).eq('id', payment.id);

  return res.status(200).json(
    buildPrepareResponse({
      click_trans_id: body.click_trans_id,
      merchant_trans_id: invitationId,
      merchant_prepare_id: payment.click_prepare_id,
      error: CLICK_ERROR.SUCCESS,
      error_note: 'Success',
    })
  );
}

async function handleComplete(body, res) {
  const invitationId = body.merchant_trans_id;
  const preparedId = body.merchant_prepare_id;

  const { data: payment, error: findError } = await supabaseAdmin
    .from('payments')
    .select('*')
    .eq('invitation_id', invitationId)
    .eq('click_prepare_id', preparedId)
    .maybeSingle();

  if (findError || !payment) {
    return res.status(200).json(
      buildCompleteResponse({
        click_trans_id: body.click_trans_id,
        merchant_trans_id: invitationId,
        merchant_confirm_id: null,
        error: CLICK_ERROR.TRANSACTION_NOT_FOUND,
        error_note: 'Платёж не найден (Prepare не выполнялся?)',
      })
    );
  }

  if (payment.status === 'paid') {
    return res.status(200).json(
      buildCompleteResponse({
        click_trans_id: body.click_trans_id,
        merchant_trans_id: invitationId,
        merchant_confirm_id: payment.click_prepare_id,
        error: CLICK_ERROR.ALREADY_PAID,
        error_note: 'Уже оплачено',
      })
    );
  }

  // Click сообщает об отмене/ошибке платежа на своей стороне
  if (Number(body.error) < 0) {
    await supabaseAdmin.from('payments').update({ status: 'failed' }).eq('id', payment.id);
    return res.status(200).json(
      buildCompleteResponse({
        click_trans_id: body.click_trans_id,
        merchant_trans_id: invitationId,
        merchant_confirm_id: payment.click_prepare_id,
        error: CLICK_ERROR.SUCCESS, // подтверждаем, что приняли уведомление об отмене
        error_note: 'Отмена зафиксирована',
      })
    );
  }

  await supabaseAdmin
    .from('payments')
    .update({ status: 'paid', transaction_id: String(body.click_trans_id) })
    .eq('id', payment.id);

  // Триггер set_publication_deadlines сам посчитает edit_until/expires_at
  const { error: publishError } = await supabaseAdmin
    .from('invitations')
    .update({ status: 'published' })
    .eq('id', invitationId);

  if (publishError) {
    console.error('click/webhook: failed to publish invitation after payment', publishError);
    return res.status(200).json(
      buildCompleteResponse({
        click_trans_id: body.click_trans_id,
        merchant_trans_id: invitationId,
        merchant_confirm_id: payment.click_prepare_id,
        error: CLICK_ERROR.INTERNAL_ERROR,
        error_note: 'Оплата принята, но публикация не удалась — нужен ручной разбор',
      })
    );
  }

  return res.status(200).json(
    buildCompleteResponse({
      click_trans_id: body.click_trans_id,
      merchant_trans_id: invitationId,
      merchant_confirm_id: payment.click_prepare_id,
      error: CLICK_ERROR.SUCCESS,
      error_note: 'Success',
    })
  );
}