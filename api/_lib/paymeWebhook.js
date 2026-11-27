/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { createClient } from '@supabase/supabase-js';
import {
  verifyPaymeAuth, paymeAccountField, buildReceiptDetail, toTiyin,
  PAYME_ERROR, PAYME_STATE, PAYME_TIMEOUT_MS, PAYME_REASON_TIMEOUT,
} from '../../src/lib/paymeProvider.js';

/**
 * Обработчик Payme Merchant API (JSON-RPC 2.0) на /api/payme.
 *
 * Отдельной функции в api/ нет намеренно: на тарифе Vercel Hobby лимит —
 * 12 serverless-функций, и он уже выбран. vercel.json переписывает
 * /api/payme → /api/click/webhook?provider=payme, а тот передаёт запрос сюда.
 *
 * Один заказ = одна строка payments (её id — account.order_id). Поля Payme
 * хранятся в той же строке (payme_* колонки, см. миграцию payme).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class RpcError extends Error {
  constructor(err, data) {
    super(err.message.en);
    this.rpc = { code: err.code, message: err.message, ...(data ? { data } : {}) };
  }
}

// ── Доступ к данным (вынесен, чтобы логику можно было тестировать без БД) ──

let adminClient = null;
function getAdmin() {
  if (!adminClient) {
    adminClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return adminClient;
}

export function supabaseRepo(admin = getAdmin()) {
  const one = async (q) => {
    const { data, error } = await q;
    if (error) throw error;
    return data;
  };
  return {
    getPayment: (id) => one(admin.from('payments').select('*').eq('id', id).maybeSingle()),
    getByPaymeId: (paymeId) => (typeof paymeId !== 'string' ? null : one(admin.from('payments').select('*').eq('payme_transaction_id', paymeId).maybeSingle())),
    updatePayment: (id, patch) => one(admin.from('payments').update(patch).eq('id', id).select().single()),
    listByPaymeTime: (from, to) => one(admin.from('payments').select('*')
      .gte('payme_create_time', from).lte('payme_create_time', to)
      .not('payme_transaction_id', 'is', null).order('payme_create_time', { ascending: true })),
    activateGift: async (giftId) => {
      const { error } = await admin.from('gift_codes')
        .update({ status: 'active', paid_at: new Date().toISOString() })
        .eq('id', giftId).eq('status', 'pending');
      if (error) throw error;
    },
    // Возврат после проведения (Payme CancelTransaction на state 2) —
    // как ручной возврат в админке (admin_refund_payment с unpublish)
    revokeGift: async (giftId) => {
      const { error } = await admin.from('gift_codes')
        .update({ status: 'pending', paid_at: null })
        .eq('id', giftId).eq('status', 'active');
      if (error) throw error;
    },
    archiveInvitation: async (invitationId) => {
      const { error } = await admin.from('invitations').update({ status: 'archived' })
        .eq('id', invitationId).in('status', ['published', 'expired']);
      if (error) throw error;
    },
    publishInvitation: async (invitationId) => {
      // Триггеры сами посчитают edit_until/expires_at и продление музея
      const { error } = await admin.from('invitations').update({ status: 'published' }).eq('id', invitationId);
      if (error) throw error;
    },
  };
}

// ── Методы ──────────────────────────────────────────────────────────────

function orderIdFrom(params) {
  const id = params?.account?.[paymeAccountField()];
  return typeof id === 'string' && UUID_RE.test(id) ? id : null;
}

/** Общая проверка заказа для CheckPerformTransaction и CreateTransaction. */
async function loadPayableOrder(repo, params) {
  const orderId = orderIdFrom(params);
  if (!orderId) throw new RpcError(PAYME_ERROR.ORDER_NOT_FOUND, paymeAccountField());
  const payment = await repo.getPayment(orderId);
  if (!payment || payment.method !== 'payme') throw new RpcError(PAYME_ERROR.ORDER_NOT_FOUND, paymeAccountField());
  if (toTiyin(payment.amount) !== Number(params.amount)) throw new RpcError(PAYME_ERROR.INVALID_AMOUNT);
  if (payment.status !== 'pending') throw new RpcError(PAYME_ERROR.ORDER_NOT_PAYABLE, paymeAccountField());
  return payment;
}

const txView = (p) => ({
  create_time: Number(p.payme_create_time) || 0,
  perform_time: Number(p.payme_perform_time) || 0,
  cancel_time: Number(p.payme_cancel_time) || 0,
  transaction: p.id,
  state: p.payme_state,
  reason: p.payme_reason ?? null,
});

async function cancelByTimeout(repo, payment, now) {
  return repo.updatePayment(payment.id, {
    payme_state: PAYME_STATE.CANCELLED,
    payme_cancel_time: now,
    payme_reason: PAYME_REASON_TIMEOUT,
    status: 'failed',
  });
}

async function fulfill(repo, payment) {
  try {
    if (payment.purpose === 'gift') await repo.activateGift(payment.gift_id);
    else await repo.publishInvitation(payment.invitation_id);
  } catch (err) {
    // Деньги уже списаны и платёж помечен paid — Payme отвечаем успехом,
    // иначе он будет повторять Perform. Разбор — вручную по логам.
    console.error('payme: fulfil after payment failed, needs manual check', payment.id, err?.message || err);
  }
}

async function revoke(repo, payment) {
  try {
    if (payment.purpose === 'gift') await repo.revokeGift(payment.gift_id);
    else if (payment.purpose === 'publish') await repo.archiveInvitation(payment.invitation_id);
    // extend: продление не откатываем, платёж просто помечен refunded
  } catch (err) {
    console.error('payme: revoke after refund failed, needs manual check', payment.id, err?.message || err);
  }
}

const methods = {
  async CheckPerformTransaction(repo, params) {
    const payment = await loadPayableOrder(repo, params);
    if (payment.payme_transaction_id && payment.payme_state === PAYME_STATE.CREATED) {
      throw new RpcError(PAYME_ERROR.ORDER_BUSY, paymeAccountField());
    }
    const detail = buildReceiptDetail(payment);
    return { allow: true, ...(detail ? { detail } : {}) };
  },

  async CreateTransaction(repo, params, now) {
    if (typeof params?.id !== 'string') throw new RpcError(PAYME_ERROR.INVALID_REQUEST);
    const existing = await repo.getByPaymeId(params.id);
    if (existing) {
      if (existing.payme_state !== PAYME_STATE.CREATED) throw new RpcError(PAYME_ERROR.CANT_PERFORM);
      if (now - Number(existing.payme_create_time) > PAYME_TIMEOUT_MS) {
        await cancelByTimeout(repo, existing, now);
        throw new RpcError(PAYME_ERROR.CANT_PERFORM);
      }
      return { create_time: Number(existing.payme_create_time), transaction: existing.id, state: existing.payme_state };
    }

    const payment = await loadPayableOrder(repo, params);
    // На заказ уже есть другая транзакция Payme (живая или отменённая):
    // новую оплату человек начинает с сайта — там создаётся новый заказ.
    if (payment.payme_transaction_id) throw new RpcError(PAYME_ERROR.ORDER_BUSY, paymeAccountField());
    if (now - Number(params.time) > PAYME_TIMEOUT_MS) throw new RpcError(PAYME_ERROR.CANT_PERFORM);

    const created = await repo.updatePayment(payment.id, {
      payme_transaction_id: params.id,
      payme_time: Number(params.time),
      payme_create_time: now,
      payme_state: PAYME_STATE.CREATED,
      transaction_id: params.id,
    });
    return { create_time: Number(created.payme_create_time), transaction: created.id, state: created.payme_state };
  },

  async PerformTransaction(repo, params, now) {
    const payment = await repo.getByPaymeId(params?.id);
    if (!payment) throw new RpcError(PAYME_ERROR.TRANSACTION_NOT_FOUND);
    if (payment.payme_state === PAYME_STATE.PERFORMED) {
      return { transaction: payment.id, perform_time: Number(payment.payme_perform_time), state: payment.payme_state };
    }
    if (payment.payme_state !== PAYME_STATE.CREATED) throw new RpcError(PAYME_ERROR.CANT_PERFORM);
    if (now - Number(payment.payme_create_time) > PAYME_TIMEOUT_MS) {
      await cancelByTimeout(repo, payment, now);
      throw new RpcError(PAYME_ERROR.CANT_PERFORM);
    }
    const done = await repo.updatePayment(payment.id, {
      payme_state: PAYME_STATE.PERFORMED,
      payme_perform_time: now,
      status: 'paid',
    });
    await fulfill(repo, done);
    return { transaction: done.id, perform_time: Number(done.payme_perform_time), state: done.payme_state };
  },

  async CancelTransaction(repo, params, now) {
    const payment = await repo.getByPaymeId(params?.id);
    if (!payment) throw new RpcError(PAYME_ERROR.TRANSACTION_NOT_FOUND);
    if (payment.payme_state === PAYME_STATE.CREATED) {
      const cancelled = await repo.updatePayment(payment.id, {
        payme_state: PAYME_STATE.CANCELLED,
        payme_cancel_time: now,
        payme_reason: Number(params.reason) || null,
        status: 'failed',
      });
      return { transaction: cancelled.id, cancel_time: Number(cancelled.payme_cancel_time), state: cancelled.payme_state };
    }
    if (payment.payme_state === PAYME_STATE.PERFORMED) {
      // Возврат денег (по спецификации Payme отмена проведённой транзакции
      // обязательна): платёж → refunded, покупку откатываем.
      const refunded = await repo.updatePayment(payment.id, {
        payme_state: PAYME_STATE.CANCELLED_AFTER_PERFORM,
        payme_cancel_time: now,
        payme_reason: Number(params.reason) || null,
        status: 'refunded',
      });
      await revoke(repo, refunded);
      return { transaction: refunded.id, cancel_time: Number(refunded.payme_cancel_time), state: refunded.payme_state };
    }
    return { transaction: payment.id, cancel_time: Number(payment.payme_cancel_time), state: payment.payme_state };
  },

  async CheckTransaction(repo, params) {
    const payment = await repo.getByPaymeId(params?.id);
    if (!payment) throw new RpcError(PAYME_ERROR.TRANSACTION_NOT_FOUND);
    return txView(payment);
  },

  async GetStatement(repo, params) {
    const rows = await repo.listByPaymeTime(Number(params?.from) || 0, Number(params?.to) || 0);
    return {
      transactions: (rows || []).map((p) => ({
        id: p.payme_transaction_id,
        time: Number(p.payme_time) || 0,
        amount: toTiyin(p.amount),
        account: { [paymeAccountField()]: p.id },
        ...txView(p),
        receivers: null,
      })),
    };
  },

  // Payme присылает данные фискального чека после проведения — нам хранить нечего
  async SetFiscalData() {
    return { success: true };
  },
};

/** Чистая логика: тело запроса → тело ответа. */
export async function processPaymeRpc(body, { authorization, repo, now = Date.now() }) {
  const id = body && typeof body === 'object' ? body.id ?? null : null;
  const fail = (err) => ({ jsonrpc: '2.0', id, error: err.rpc });

  if (!verifyPaymeAuth(authorization)) return fail(new RpcError(PAYME_ERROR.INSUFFICIENT_PRIVILEGE));
  if (!body || typeof body !== 'object') return fail(new RpcError(PAYME_ERROR.PARSE_ERROR));
  if (typeof body.method !== 'string' || !body.params || typeof body.params !== 'object') {
    return fail(new RpcError(PAYME_ERROR.INVALID_REQUEST));
  }
  const fn = Object.prototype.hasOwnProperty.call(methods, body.method) ? methods[body.method] : null;
  if (!fn) return fail(new RpcError(PAYME_ERROR.METHOD_NOT_FOUND, body.method));

  try {
    const result = await fn(repo, body.params, now);
    return { jsonrpc: '2.0', id, result };
  } catch (err) {
    if (err instanceof RpcError) return fail(err);
    console.error('payme: system error', body.method, err?.message || err);
    return fail(new RpcError(PAYME_ERROR.SYSTEM_ERROR));
  }
}

/** HTTP-обёртка. Payme ждёт HTTP 200 всегда, ошибка — в теле. */
export default async function paymeHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const response = await processPaymeRpc(body, {
    authorization: req.headers.authorization,
    repo: supabaseRepo(),
  });
  return res.status(200).json(response);
}
