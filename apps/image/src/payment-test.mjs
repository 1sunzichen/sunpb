import { timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { ensure, id, json, now, sha256 } from './common.mjs';
import { rateLimit } from './auth.mjs';
import { createPayment, paymentReady, queryPayment } from './payments.mjs';

export async function settleTestPayment(db, transaction, source) {
  ensure(transaction.paid && transaction.provider === 'wechat' && typeof transaction.transactionId === 'string' && transaction.transactionId.length > 0 && transaction.transactionId.length <= 128, 400, '支付尚未成功');
  const order = await db.prepare('SELECT * FROM payment_test_orders WHERE id=?').bind(transaction.orderId).first();
  ensure(order && transaction.amountCents === 1 && order.amount_cents === transaction.amountCents, 400, '测试订单或金额不匹配');
  ensure(!order.transaction_id || order.transaction_id === transaction.transactionId, 409, '交易编号冲突');
  const column = source === 'callback' ? 'callback_at' : 'query_at';
  await db.prepare(`UPDATE payment_test_orders SET status='paid',transaction_id=?,paid_at=COALESCE(paid_at,?),${column}=COALESCE(${column},?) WHERE id=? AND (transaction_id IS NULL OR transaction_id=?)`).bind(transaction.transactionId, now(), now(), order.id, transaction.transactionId).run();
  const saved = await db.prepare('SELECT transaction_id FROM payment_test_orders WHERE id=?').bind(order.id).first();
  ensure(saved.transaction_id === transaction.transactionId, 409, '交易编号冲突');
}

export async function paymentTest(request, env) {
  ensure(env.PAYMENT_TEST_ENABLED === '1', 410, '支付联调已结束，测试入口已关闭');
  ensure(typeof env.PAYMENT_TEST_TOKEN === 'string' && env.PAYMENT_TEST_TOKEN.length >= 32, 404, '测试入口未启用');
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  const suppliedBytes = Buffer.from(supplied), expectedBytes = Buffer.from(env.PAYMENT_TEST_TOKEN);
  ensure(suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes), 401, '请使用专属测试链接打开');
  ensure(paymentReady(env, 'wechat'), 503, '微信支付配置尚未完成');
  const path = new URL(request.url).pathname, runHash = await sha256(env.PAYMENT_TEST_TOKEN);
  let order = await env.DB.prepare('SELECT * FROM payment_test_orders WHERE run_hash=?').bind(runHash).first();
  if (path.endsWith('/order') && request.method === 'POST') {
    await rateLimit(env.DB, `payment-test-create:${runHash}`, 5, 600);
    if (!order) {
      await env.DB.prepare('INSERT INTO payment_test_orders(id,run_hash,created_at,expires_at) VALUES(?,?,?,?) ON CONFLICT(run_hash) DO NOTHING').bind('TEST' + id().slice(4), runHash, now(), now() + 1800).run();
      order = await env.DB.prepare('SELECT * FROM payment_test_orders WHERE run_hash=?').bind(runHash).first();
    }
    if (!order.code_url && order.status === 'pending') {
      ensure(order.expires_at > now(), 410, '测试订单已过期，请联系维护者重新准备测试');
      const code = await createPayment({ ...order, description: 'SUNPB 微信支付联调测试（非合成次数）' }, env);
      await env.DB.prepare('UPDATE payment_test_orders SET code_url=? WHERE id=?').bind(code, order.id).run();
      order.code_url = code;
    }
  } else if (path.endsWith('/refresh') && request.method === 'POST') {
    ensure(order, 404, '请先创建测试订单');
    await rateLimit(env.DB, `payment-test-query:${runHash}`, 6, 60);
    const result = await queryPayment(order, env);
    if (result.paid) await settleTestPayment(env.DB, result, 'query');
    order = await env.DB.prepare('SELECT * FROM payment_test_orders WHERE run_hash=?').bind(runHash).first();
  } else if (path.endsWith('/qr') && request.method === 'GET') {
    ensure(order?.status === 'pending' && order.code_url && order.expires_at > now(), 410, '付款码已失效');
    return new Response(await QRCode.toString(order.code_url, { type: 'svg', width: 300, margin: 2 }), { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' } });
  } else ensure(path.endsWith('/status') && request.method === 'GET', 404, '接口不存在');
  return json({ order: order ? { id: order.id, amountCents: order.amount_cents, status: order.status, expiresAt: order.expires_at,
    expired: order.expires_at <= now(), callbackReceived: !!order.callback_at, queryVerified: !!order.query_at, hasQr: !!order.code_url } : null });
}
