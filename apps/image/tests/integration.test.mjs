import test from 'node:test';
import assert from 'node:assert/strict';
import mounted from '../src/mounted-worker.mjs';
import { env, keys, request, signedWechat, notification, user } from './helpers.mjs';
import { sha256 } from '../src/common.mjs';
const pair = keys(), token = 'a'.repeat(64);
function setup() { return { ...env(), ...pair.env, APP_ORIGIN: 'https://images.example', APP_BASE_PATH: '/ai', PAYMENT_TEST_TOKEN: token }; }
const headers = { authorization: `Bearer ${token}` };

test('mounted application owns only /ai and keeps normal sales closed', async () => {
  const e = setup();
  assert.equal((await mounted.fetch(request('/api/health'), e)).status, 404);
  assert.equal((await mounted.fetch(request('/ai'), e)).headers.get('location'), 'https://images.example/ai/');
  const result = await (await mounted.fetch(request('/ai/api/bootstrap'), e)).json();
  assert.equal(result.generationReady, false); assert.equal(result.salesEnabled, false);
  const owner = await user(e);
  assert.equal((await mounted.fetch(request('/ai/api/orders', { method: 'POST', cookie: owner.cookie, body: {quantity:1,provider:'wechat',requestId:'a'.repeat(32)} }), e)).status,503);
});

test('test order is secret protected, origin checked, fixed at one cent and idempotent', async t => {
  const e = setup(); let calls = 0;
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    calls++; const body = JSON.parse(options.body);
    assert.equal(body.amount.total, 1); assert.match(body.description, /联调测试/);
    assert.equal(body.notify_url, 'https://images.example/ai/api/payments/wechat/notify');
    const raw = JSON.stringify({code_url:'weixin://wxpay/test'}); return new Response(raw, {headers:signedWechat(raw,pair.privateKey)});
  };
  assert.equal((await mounted.fetch(request('/ai/api/payment-test/order',{method:'POST'}),e)).status,401);
  assert.equal((await mounted.fetch(request('/ai/api/payment-test/order',{method:'POST',headers,origin:'https://evil.example'}),e)).status,403);
  const create = () => mounted.fetch(request('/ai/api/payment-test/order',{method:'POST',headers,body:{amountCents:1000,paid:true}}),e);
  const first = await (await create()).json(); const second = await (await create()).json();
  assert.equal(first.order.id,second.order.id);assert.equal(first.order.amountCents,1);assert.equal(calls,1);
  assert.equal((await e.DB.prepare('SELECT COUNT(*) AS n FROM orders').first()).n,0);
  assert.equal((await e.DB.prepare('SELECT COUNT(*) AS n FROM credit_ledger').first()).n,0);
  assert.equal((await mounted.fetch(request('/ai/api/payment-test/qr',{headers}),e)).status,200);
});

test('verified test callback is idempotent and separate from account credits; forged values fail', async () => {
  const e = setup(); const orderId = 'TEST'+'b'.repeat(28);
  await e.DB.prepare('INSERT INTO payment_test_orders(id,run_hash,created_at,expires_at) VALUES(?,?,1,2)').bind(orderId,await sha256(token)).run();
  const data = {appid:e.WECHAT_APP_ID,mchid:e.WECHAT_MCH_ID,out_trade_no:orderId,transaction_id:'wx-real-test',trade_state:'SUCCESS',trade_type:'NATIVE',amount:{total:1,currency:'CNY'}};
  const send = data => mounted.fetch(request('/ai/api/payments/wechat/notify',{method:'POST',origin:null,...notification(data,e,pair.privateKey)}),e);
  assert.equal((await send({...data,amount:{total:2,currency:'CNY'}})).status,400);
  assert.equal((await send({...data,mchid:'wrong'})).status,400);
  const forged=notification(data,e,pair.privateKey);forged.headers['wechatpay-signature']='forged';
  assert.equal((await mounted.fetch(request('/ai/api/payments/wechat/notify',{method:'POST',origin:null,...forged}),e)).status,400);
  for(const response of await Promise.all(Array.from({length:5},()=>send(data)))) assert.equal(response.status,204);
  const result = await (await mounted.fetch(request('/ai/api/payment-test/status',{headers}),e)).json();
  assert.equal(result.order.status,'paid');assert.equal(result.order.callbackReceived,true);assert.equal(result.order.queryVerified,false);
  assert.equal((await e.DB.prepare('SELECT COUNT(*) AS n FROM credit_ledger').first()).n,0);
});

test('query confirmation cannot pretend a public callback arrived', async t => {
  const e = setup(), orderId='TEST'+'c'.repeat(28);
  await e.DB.prepare('INSERT INTO payment_test_orders(id,run_hash,created_at,expires_at) VALUES(?,?,1,2)').bind(orderId,await sha256(token)).run();
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async()=>{const raw=JSON.stringify({appid:e.WECHAT_APP_ID,mchid:e.WECHAT_MCH_ID,out_trade_no:orderId,transaction_id:'wx-query',trade_state:'SUCCESS',trade_type:'NATIVE',amount:{total:1,currency:'CNY'}});return new Response(raw,{headers:signedWechat(raw,pair.privateKey)});};
  const result=await(await mounted.fetch(request('/ai/api/payment-test/refresh',{method:'POST',headers}),e)).json();
  assert.equal(result.order.status,'paid');assert.equal(result.order.queryVerified,true);assert.equal(result.order.callbackReceived,false);
});
