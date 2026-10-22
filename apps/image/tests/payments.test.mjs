import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
import { alipayCanonical, cents, rawAlipayResponse, settlePayment, signRSA, verifyRSA } from '../src/payments.mjs';
import { env, keys, notification, order, request, signedWechat, user } from './helpers.mjs';
import { id, now } from '../src/common.mjs';
const keyset = keys();

test('signed WeChat notification credits once under duplicate and concurrent delivery', async () => {
  const e = { ...env(), ...keyset.env }; const owner = await user(e); const orderId = await order(e, owner, { credits: 10, amount: 1000 });
  const n = notification({ appid: e.WECHAT_APP_ID, mchid: e.WECHAT_MCH_ID, out_trade_no: orderId, transaction_id: 'wx-transaction', trade_state: 'SUCCESS', trade_type: 'NATIVE', amount: { total: 1000, currency: 'CNY' } }, e, keyset.privateKey);
  for (const response of await Promise.all(Array.from({ length: 8 }, () => worker.fetch(request('/api/payments/wechat/notify', { method: 'POST', ...n, origin: null }), e)))) assert.equal(response.status, 204);
  assert.equal((await e.DB.prepare('SELECT credits FROM users WHERE id=?').bind(owner.id).first()).credits, 10);
  assert.equal((await e.DB.prepare('SELECT COUNT(*) AS n FROM credit_ledger').first()).n, 1);
});
test('WeChat callback rejects forged signature, stale signature, wrong merchant, amount and key ID without credit', async () => {
  const e = { ...env(), ...keyset.env }; const owner = await user(e); const orderId = await order(e, owner);
  const original = { appid: e.WECHAT_APP_ID, mchid: e.WECHAT_MCH_ID, out_trade_no: orderId, transaction_id: id(), trade_state: 'SUCCESS', trade_type: 'NATIVE', amount: { total: 100, currency: 'CNY' } };
  const forged = notification(original, e, keyset.privateKey); forged.headers['wechatpay-signature'] = 'forged';
  const stale = notification(original, e, keyset.privateKey); stale.headers = signedWechat(stale.body, keyset.privateKey, String(now() - 1000));
  const serial = notification(original, e, keyset.privateKey); serial.headers['wechatpay-serial'] = 'UNTRUSTED';
  const cases = [forged, stale, serial, notification({ ...original, mchid: 'someone-else' }, e, keyset.privateKey), notification({ ...original, amount: { total: 1, currency: 'CNY' } }, e, keyset.privateKey)];
  for (const n of cases) assert.equal((await worker.fetch(request('/api/payments/wechat/notify', { method: 'POST', ...n, origin: null }), e)).status, 400);
  assert.equal((await e.DB.prepare('SELECT credits FROM users WHERE id=?').bind(owner.id).first()).credits, 0);
});
test('signed Alipay callback verifies app/seller/amount and returns literal success idempotently', async () => {
  const e = { ...env(), ...keyset.env }; const owner = await user(e); const orderId = await order(e, owner, { provider: 'alipay' });
  const params = { sign_type: 'RSA2', app_id: e.ALIPAY_APP_ID, seller_id: e.ALIPAY_SELLER_ID, out_trade_no: orderId, trade_no: 'ali-transaction', trade_status: 'TRADE_SUCCESS', total_amount: '1.00', subject: '合成 & 测试 + 编码' };
  params.sign = signRSA(alipayCanonical(params, true), keyset.privateKey);
  const body = new URLSearchParams(params).toString();
  for (let n = 0; n < 2; n++) {
    const response = await worker.fetch(request('/api/payments/alipay/notify', { method: 'POST', origin: null, body }), e); assert.equal(response.status, 200); assert.equal(await response.text(), 'success');
  }
  assert.equal((await e.DB.prepare('SELECT credits FROM users WHERE id=?').bind(owner.id).first()).credits, 1);
  const bad = { ...params, seller_id: 'wrong-seller' }; bad.sign = signRSA(alipayCanonical(bad, true), keyset.privateKey);
  assert.equal((await worker.fetch(request('/api/payments/alipay/notify', { method: 'POST', origin: null, body: new URLSearchParams(bad).toString() }), e)).status, 400);
  assert.equal((await worker.fetch(request('/api/payments/alipay/notify', { method: 'POST', origin: null, body: body + '&total_amount=100' }), e)).status, 400);
});
test('one transaction cannot credit a different second order', async () => {
  const e = env(), owner = await user(e), a = await order(e, owner), b = await order(e, owner);
  await settlePayment(e.DB, { provider: 'wechat', orderId: a, transactionId: 'unique', amountCents: 100, paid: true });
  await assert.rejects(settlePayment(e.DB, { provider: 'wechat', orderId: b, transactionId: 'unique', amountCents: 100, paid: true }));
  assert.equal((await e.DB.prepare('SELECT credits FROM users WHERE id=?').bind(owner.id).first()).credits, 1);
});
test('late verified payment for an expired QR still credits its existing order', async () => {
  const e = env(), owner = await user(e), orderId = await order(e, owner);
  await e.DB.prepare('UPDATE orders SET expires_at=? WHERE id=?').bind(now() - 500, orderId).run();
  await settlePayment(e.DB, { provider: 'wechat', orderId, transactionId: 'late', amountCents: 100, paid: true });
  assert.equal((await e.DB.prepare('SELECT credits FROM users WHERE id=?').bind(owner.id).first()).credits, 1);
});
test('order creation uses server price, preserves request id, verifies response and never trusts client paid flag', async t => {
  const e = { ...env(), ...keyset.env, APP_ORIGIN: 'https://images.example', DASHSCOPE_API_KEY: 'test-key', SALES_ENABLED: '1' }; const owner = await user(e); const requestId = id(); let calls = 0;
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (url, options) => { calls++; assert.equal(new URL(url).hostname, 'api.mch.weixin.qq.com'); assert.equal(options.headers['Wechatpay-Serial'], e.WECHAT_PUBLIC_KEY_ID); const data = JSON.parse(options.body); assert.equal(data.amount.total, 1000); const raw = JSON.stringify({ code_url: 'weixin://wxpay/test' }); return new Response(raw, { headers: signedWechat(raw, keyset.privateKey) }); };
  const body = { provider: 'wechat', quantity: 10, requestId, amountCents: 1, paid: true };
  const first = await worker.fetch(request('/api/orders', { method: 'POST', cookie: owner.cookie, body }), e); assert.equal(first.status, 201); const result = await first.json();
  const second = await worker.fetch(request('/api/orders', { method: 'POST', cookie: owner.cookie, body }), e); assert.equal(second.status, 200); assert.equal((await second.json()).order.id, result.order.id);
  assert.equal(calls, 1); assert.equal(result.order.amountCents, 1000); assert.equal(result.order.status, 'pending');
  assert.equal((await e.DB.prepare('SELECT credits FROM users WHERE id=?').bind(owner.id).first()).credits, 0);
  const qr = await worker.fetch(request(`/api/orders/${result.order.id}/qr`, { cookie: owner.cookie }), e); assert.equal(qr.status, 200); assert.match(await qr.text(), /<svg/);
  const stranger = await user(e, 'stranger'); assert.equal((await worker.fetch(request(`/api/orders/${result.order.id}`, { cookie: stranger.cookie }), e)).status, 404);
});
test('unconfigured sales reject checkout without creating an order', async () => {
  const e = env(), owner = await user(e);
  const result = await worker.fetch(request('/api/orders', { method: 'POST', cookie: owner.cookie, body: { quantity: 1, provider: 'wechat', requestId: id() } }), e);
  assert.equal(result.status, 503); assert.equal((await e.DB.prepare('SELECT COUNT(*) AS n FROM orders').first()).n, 0);
});
test('Alipay website checkout signs the server price, restricts access and never credits on navigation', async () => {
  const e = { ...env(), ...keyset.env, APP_ORIGIN: 'https://images.example', DASHSCOPE_API_KEY: 'test-key', SALES_ENABLED: '1' };
  const owner = await user(e), body = { provider: 'alipay', quantity: 10, requestId: id(), amountCents: 1, paid: true };
  const result = await worker.fetch(request('/api/orders', { method: 'POST', cookie: owner.cookie, body }), e);
  assert.equal(result.status, 201);
  const { order: created } = await result.json();
  assert.equal(created.qrUrl, null); assert.equal(created.amountCents, 1000);
  const checkout = await worker.fetch(request(created.checkoutUrl, { cookie: owner.cookie }), e);
  assert.equal(checkout.status, 302);
  const url = new URL(checkout.headers.get('location')), params = Object.fromEntries(url.searchParams);
  assert.equal(url.origin, 'https://openapi.alipay.com'); assert.equal(params.method, 'alipay.trade.page.pay');
  assert.equal(params.notify_url, 'https://images.example/api/payments/alipay/notify');
  assert(verifyRSA(alipayCanonical(params), params.sign, e.ALIPAY_PUBLIC_KEY));
  const business = JSON.parse(params.biz_content);
  assert.equal(business.total_amount, '10.00'); assert.equal(business.out_trade_no, created.id);
  assert.equal(business.product_code, 'FAST_INSTANT_TRADE_PAY'); assert.equal(business.seller_id, e.ALIPAY_SELLER_ID);
  assert.equal((await e.DB.prepare('SELECT credits FROM users WHERE id=?').bind(owner.id).first()).credits, 0);
  const repeated = await worker.fetch(request('/api/orders', { method: 'POST', cookie: owner.cookie, body }), e);
  assert.equal((await repeated.json()).order.id, created.id);
  const stranger = await user(e, 'stranger');
  assert.equal((await worker.fetch(request(created.checkoutUrl, { cookie: stranger.cookie }), e)).status, 404);
  assert.equal((await worker.fetch(request(`/api/orders/${created.id}/qr`, { cookie: owner.cookie }), e)).status, 404);
  await e.DB.prepare('UPDATE orders SET expires_at=? WHERE id=?').bind(now() - 1, created.id).run();
  assert.equal((await worker.fetch(request(created.checkoutUrl, { cookie: owner.cookie }), e)).status, 410);
});
test('money parsing is exact and raw signed response preserves escape sequences', () => {
  assert.equal(cents('12.30'), 1230); assert.throws(() => cents('1e3')); assert.throws(() => cents('1.001')); assert.throws(() => cents('-1'));
  const value = '{ "code": "10000", "nested": {"text":"brace } and \\""} }'; const raw = `{"alipay_trade_query_response":${value},"sign":"abc"}`;
  assert.equal(rawAlipayResponse(raw, 'alipay_trade_query_response'), value);
});
