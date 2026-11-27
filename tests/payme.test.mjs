// Сценарии песочницы Payme на фейковой базе (без Supabase).
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.PAYME_KEY = 'secret-key';
process.env.PAYME_MERCHANT_ID = 'm123';
process.env.SUPABASE_URL = 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'x';

const { processPaymeRpc } = await import('../api/_lib/paymeWebhook.js');
const { paymeProvider, buildReceiptDetail } = await import('../src/lib/paymeProvider.js');

const AUTH = `Basic ${Buffer.from('Paycom:secret-key').toString('base64')}`;
const ORDER = '11111111-2222-3333-4444-555555555555';

function fakeRepo(rows) {
  const db = new Map(rows.map((r) => [r.id, { ...r }]));
  const log = { published: [], gifts: [] };
  return {
    log, db,
    getPayment: async (id) => db.get(id) || null,
    getByPaymeId: async (pid) => (typeof pid !== 'string' ? null : [...db.values()].find((r) => r.payme_transaction_id === pid) || null),
    updatePayment: async (id, patch) => { const r = { ...db.get(id), ...patch }; db.set(id, r); return r; },
    listByPaymeTime: async (from, to) => [...db.values()].filter((r) => r.payme_transaction_id && r.payme_create_time >= from && r.payme_create_time <= to),
    activateGift: async (g) => log.gifts.push(g),
    revokeGift: async (g) => log.gifts.push('revoked:' + g),
    archiveInvitation: async (i) => log.published.push('archived:' + i),
    publishInvitation: async (i) => log.published.push(i),
  };
}
const order = (extra = {}) => ({ id: ORDER, amount: 19000, status: 'pending', method: 'payme', purpose: 'publish', invitation_id: 'inv-1', ...extra });
const call = (repo, method, params, now = 1_000_000, authorization = AUTH) =>
  processPaymeRpc({ jsonrpc: '2.0', id: 7, method, params }, { authorization, repo, now });
const acc = { order_id: ORDER };

test('неверная авторизация → -32504', async () => {
  const r = await call(fakeRepo([order()]), 'CheckPerformTransaction', { amount: 1900000, account: acc }, 1, 'Basic xxx');
  assert.equal(r.error.code, -32504);
});

test('CheckPerform: ок, неверная сумма, нет заказа', async () => {
  const repo = fakeRepo([order()]);
  assert.deepEqual((await call(repo, 'CheckPerformTransaction', { amount: 1900000, account: acc })).result, { allow: true });
  assert.equal((await call(repo, 'CheckPerformTransaction', { amount: 100, account: acc })).error.code, -31001);
  const nf = await call(repo, 'CheckPerformTransaction', { amount: 1900000, account: { order_id: '99999999-2222-3333-4444-555555555555' } });
  assert.ok(nf.error.code <= -31050 && nf.error.code >= -31099);
});

test('полный цикл: Create → повторный Create → Perform → повторный Perform → возврат (-2)', async () => {
  const repo = fakeRepo([order()]);
  const c1 = await call(repo, 'CreateTransaction', { id: 'pay1', time: 999_000, amount: 1900000, account: acc }, 1_000_000);
  assert.equal(c1.result.state, 1);
  assert.equal(c1.result.transaction, ORDER);
  const c2 = await call(repo, 'CreateTransaction', { id: 'pay1', time: 999_000, amount: 1900000, account: acc }, 1_000_500);
  assert.equal(c2.result.create_time, 1_000_000);
  const other = await call(repo, 'CreateTransaction', { id: 'pay2', time: 999_000, amount: 1900000, account: acc }, 1_000_600);
  assert.ok(other.error.code <= -31050);
  const busy = await call(repo, 'CheckPerformTransaction', { amount: 1900000, account: acc });
  assert.ok(busy.error.code <= -31050);

  const p1 = await call(repo, 'PerformTransaction', { id: 'pay1' }, 1_002_000);
  assert.equal(p1.result.state, 2);
  assert.deepEqual(repo.log.published, ['inv-1']);
  assert.equal(repo.db.get(ORDER).status, 'paid');
  const p2 = await call(repo, 'PerformTransaction', { id: 'pay1' }, 1_003_000);
  assert.equal(p2.result.perform_time, 1_002_000);
  assert.deepEqual(repo.log.published, ['inv-1']); // не публикуем дважды

  const st = await call(repo, 'GetStatement', { from: 0, to: 2_000_000 });
  assert.equal(st.result.transactions.length, 1);
  assert.equal(st.result.transactions[0].amount, 1900000);
  assert.equal(st.result.transactions[0].account.order_id, ORDER);

  const cancel = await call(repo, 'CancelTransaction', { id: 'pay1', reason: 5 }, 1_004_000);
  assert.equal(cancel.result.state, -2);
  assert.equal(cancel.result.cancel_time, 1_004_000);
  assert.equal(repo.db.get(ORDER).status, 'refunded');
  assert.deepEqual(repo.log.published, ['inv-1', 'archived:inv-1']);
  const again = await call(repo, 'CancelTransaction', { id: 'pay1', reason: 5 }, 1_005_000);
  assert.equal(again.result.cancel_time, 1_004_000);
  const ct = await call(repo, 'CheckTransaction', { id: 'pay1' });
  assert.equal(ct.result.state, -2);
  assert.equal(ct.result.reason, 5);
  assert.equal((await call(repo, 'PerformTransaction', { id: 'pay1' })).error.code, -31008);

});

test('отмена до проведения, затем Perform нельзя', async () => {
  const repo = fakeRepo([order()]);
  await call(repo, 'CreateTransaction', { id: 'pay1', time: 999_000, amount: 1900000, account: acc });
  const c = await call(repo, 'CancelTransaction', { id: 'pay1', reason: 3 }, 1_100_000);
  assert.equal(c.result.state, -1);
  assert.equal(repo.db.get(ORDER).status, 'failed');
  const again = await call(repo, 'CancelTransaction', { id: 'pay1', reason: 3 }, 1_200_000);
  assert.equal(again.result.cancel_time, 1_100_000);
  assert.equal((await call(repo, 'PerformTransaction', { id: 'pay1' })).error.code, -31008);
  assert.equal((await call(repo, 'CheckTransaction', { id: 'pay1' })).result.reason, 3);
});

test('таймаут 12 часов → отмена с reason 4', async () => {
  const repo = fakeRepo([order()]);
  await call(repo, 'CreateTransaction', { id: 'pay1', time: 999_000, amount: 1900000, account: acc }, 1_000_000);
  const late = 1_000_000 + 12 * 3600_000 + 1;
  assert.equal((await call(repo, 'PerformTransaction', { id: 'pay1' }, late)).error.code, -31008);
  const ct = await call(repo, 'CheckTransaction', { id: 'pay1' });
  assert.equal(ct.result.state, -1);
  assert.equal(ct.result.reason, 4);
});

test('подарок: Perform активирует код, а не публикует', async () => {
  const repo = fakeRepo([order({ purpose: 'gift', invitation_id: null, gift_id: 'g1' })]);
  await call(repo, 'CreateTransaction', { id: 'pay1', time: 999_000, amount: 1900000, account: acc });
  await call(repo, 'PerformTransaction', { id: 'pay1' });
  assert.deepEqual(repo.log.gifts, ['g1']);
  assert.deepEqual(repo.log.published, []);
});

test('строку Click Payme не оплачивает; неизвестный метод → -32601', async () => {
  const repo = fakeRepo([order({ method: 'invoice' })]);
  assert.ok((await call(repo, 'CheckPerformTransaction', { amount: 1900000, account: acc })).error.code <= -31050);
  assert.equal((await call(repo, 'Foo', {})).error.code, -32601);
  assert.equal((await call(repo, 'CheckTransaction', { id: 'nope' })).error.code, -31003);
});

test('ссылка checkout и фискальный чек', async () => {
  const { paymentUrl } = await paymeProvider.createPayment({ orderId: ORDER, amount: 19000, returnUrl: 'https://senti.uz/payment/x', lang: 'uz' });
  const decoded = Buffer.from(paymentUrl.split('/').pop(), 'base64').toString();
  assert.ok(paymentUrl.startsWith('https://checkout.paycom.uz/'));
  assert.equal(decoded, `m=m123;ac.order_id=${ORDER};a=1900000;c=https://senti.uz/payment/x;l=uz`);
  assert.equal(buildReceiptDetail(order()), undefined);
  process.env.PAYME_IKPU = '10305001001000000';
  process.env.PAYME_PACKAGE_CODE = '1500';
  const d = buildReceiptDetail(order());
  assert.equal(d.items[0].price, 1900000);
  assert.equal(d.items[0].code, '10305001001000000');
  assert.equal(d.items[0].vat_percent, 0);
});
