/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { createClient } from '@supabase/supabase-js';
import paymeHandler from '../_lib/paymeWebhook.js';
import { verifySign, buildPrepareResponse, buildCompleteResponse, CLICK_ACTION, CLICK_ERROR } from '../../src/lib/clickProvider.js';

// Service-role клиент — только на сервере. Создаём лениво, чтобы падать с
// понятной ошибкой, а не с «supabaseUrl is required» при загрузке модуля.
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
  // /api/payme переписан сюда (vercel.json) — лимит 12 функций на Vercel Hobby
  if (req.query?.provider === 'payme') return paymeHandler(req, res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'bad request' });
  }
  const action = Number(body.action);
  const isPrepare = action === CLICK_ACTION.PREPARE;

  if (!verifySign(body)) {
    const bad = { click_trans_id: body.click_trans_id, merchant_trans_id: body.merchant_trans_id, error: CLICK_ERROR.SIGN_CHECK_FAILED, error_note: 'Неверная подпись' };
    return res.status(200).json(isPrepare ? buildPrepareResponse({ ...bad, merchant_prepare_id: null }) : buildCompleteResponse({ ...bad, merchant_confirm_id: null }));
  }

  return isPrepare ? handlePrepare(body, res) : handleComplete(body, res);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handlePrepare(body, res) {
  const invitationId = body.merchant_trans_id;
  // Идёт в фильтр .or() — пропускаем только uuid
  if (!UUID_RE.test(String(invitationId || ''))) {
    return res.status(200).json(buildPrepareResponse({
      click_trans_id: body.click_trans_id, merchant_trans_id: invitationId, merchant_prepare_id: null,
      error: CLICK_ERROR.TRANSACTION_NOT_FOUND, error_note: 'Платёж не найден',
    }));
  }

  // merchant_trans_id — id приглашения или id подарочного кода (purpose = 'gift')
  const { data: payment, error: findError } = await getAdmin()
    .from('payments')
    .select('*')
    .or(`invitation_id.eq.${invitationId},gift_id.eq.${invitationId}`)
    .neq('method', 'payme') // строки Payme Click не трогает
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
  await getAdmin().from('payments').update({ transaction_id: String(body.click_trans_id) }).eq('id', payment.id);

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
  if (!UUID_RE.test(String(invitationId || ''))) {
    return res.status(200).json(buildCompleteResponse({
      click_trans_id: body.click_trans_id, merchant_trans_id: invitationId, merchant_confirm_id: null,
      error: CLICK_ERROR.TRANSACTION_NOT_FOUND, error_note: 'Платёж не найден',
    }));
  }

  const { data: payment, error: findError } = await getAdmin()
    .from('payments')
    .select('*')
    .or(`invitation_id.eq.${invitationId},gift_id.eq.${invitationId}`)
    .neq('method', 'payme') // строки Payme Click не трогает
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

  // Сумму сверяем и на Complete, а не только на Prepare: иначе можно
  // «подтвердить» платёж с другой суммой в уже подписанном запросе.
  if (Number(body.error) >= 0 && Number(body.amount) !== payment.amount) {
    return res.status(200).json(
      buildCompleteResponse({
        click_trans_id: body.click_trans_id,
        merchant_trans_id: invitationId,
        merchant_confirm_id: payment.click_prepare_id,
        error: CLICK_ERROR.INVALID_AMOUNT,
        error_note: 'Сумма не совпадает',
      })
    );
  }

  // Click сообщает об отмене/ошибке платежа на своей стороне
  if (Number(body.error) < 0) {
    await getAdmin().from('payments').update({ status: 'failed' }).eq('id', payment.id);
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

  await getAdmin()
    .from('payments')
    .update({ status: 'paid', transaction_id: String(body.click_trans_id) })
    .eq('id', payment.id);

  // Подарок: оплачен — код становится активным, публиковать нечего
  if (payment.purpose === 'gift') {
    const { error: giftError } = await getAdmin().from('gift_codes')
      .update({ status: 'active', paid_at: new Date().toISOString() })
      .eq('id', payment.gift_id).eq('status', 'pending');
    if (giftError) console.error('click/webhook: failed to activate gift', giftError);
    return res.status(200).json(buildCompleteResponse({
      click_trans_id: body.click_trans_id,
      merchant_trans_id: invitationId,
      merchant_confirm_id: payment.click_prepare_id,
      error: giftError ? CLICK_ERROR.INTERNAL_ERROR : CLICK_ERROR.SUCCESS,
      error_note: giftError ? 'Оплата принята, но код не активирован — нужен ручной разбор' : 'Success',
    }));
  }

  // Триггер set_publication_deadlines сам посчитает edit_until/expires_at
  const { error: publishError } = await getAdmin()
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