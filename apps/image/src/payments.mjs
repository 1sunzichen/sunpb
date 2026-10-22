import { createSign, createVerify, createDecipheriv, X509Certificate } from 'node:crypto';
import { ensure, HttpError, now, readLimited } from './common.mjs';

const WECHAT_KEYS = ['WECHAT_APP_ID','WECHAT_MCH_ID','WECHAT_CERT_SERIAL','WECHAT_PRIVATE_KEY','WECHAT_API_V3_KEY'];
const ALIPAY_KEYS = ['ALIPAY_APP_ID','ALIPAY_SELLER_ID','ALIPAY_PRIVATE_KEY','ALIPAY_PUBLIC_KEY'];
export const paymentReady = (env, provider) => provider === 'wechat'
  ? WECHAT_KEYS.every(key => !!env[key]) && !!((env.WECHAT_PUBLIC_KEY_ID && env.WECHAT_PUBLIC_KEY) || env.WECHAT_PLATFORM_CERTIFICATES)
  : ALIPAY_KEYS.every(key => !!env[key]);
const pem = value => value.replaceAll('\\n', '\n');
export const signRSA = (message, key) => createSign('RSA-SHA256').update(message).end().sign(pem(key), 'base64');
export function verifyRSA(message, signature, key) {
  try { return createVerify('RSA-SHA256').update(message).end().verify(pem(key), signature, 'base64'); }
  catch { return false; }
}
function platformCertificate(item) {
  const cert = new X509Certificate(pem(item.pem));
  ensure(cert.serialNumber === item.serial && cert.publicKey.asymmetricKeyType === 'rsa', 503, '微信平台证书配置不正确');
  return { serial: cert.serialNumber, pem: cert.toString(), notBefore: Date.parse(cert.validFrom) / 1000, notAfter: Date.parse(cert.validTo) / 1000 };
}
async function wechatVerificationKey(serial, env) {
  if (env.WECHAT_PUBLIC_KEY_ID && serial === env.WECHAT_PUBLIC_KEY_ID) return env.WECHAT_PUBLIC_KEY;
  if (!env.WECHAT_PLATFORM_CERTIFICATES) return null;
  const seeds = JSON.parse(env.WECHAT_PLATFORM_CERTIFICATES);
  ensure(Array.isArray(seeds) && seeds.length <= 10, 503, '微信平台证书配置不正确');
  const cached = env.DB ? await env.DB.prepare('SELECT serial,pem FROM payment_certificates WHERE merchant_id=? AND serial=?').bind(env.WECHAT_MCH_ID, serial).first() : null;
  const item = cached || seeds.find(item => item.serial === serial);
  if (!item) return null;
  const cert = platformCertificate(item), time = now();
  return cert.notBefore <= time && cert.notAfter > time ? cert.pem : null;
}
export async function verifyWechat(headers, body, env) {
  const timestamp = headers.get('wechatpay-timestamp');
  const nonce = headers.get('wechatpay-nonce');
  const serial = headers.get('wechatpay-serial');
  const signature = headers.get('wechatpay-signature');
  ensure(/^\d{10,}$/.test(timestamp || '') && Math.abs(now() - Number(timestamp)) <= 300 && nonce && signature, 400, '支付通知已过期或不完整');
  ensure(typeof serial === 'string' && serial.length <= 128, 400, '支付签名公钥不匹配');
  const key = await wechatVerificationKey(serial, env);
  ensure(key, 400, '支付签名公钥不匹配或证书已到期');
  ensure(verifyRSA(`${timestamp}\n${nonce}\n${body}\n`, signature, key), 400, '支付签名校验失败');
}
async function wechatRequest(env, method, path, payload) {
  const body = payload ? JSON.stringify(payload) : '';
  const timestamp = String(now()); const nonce = crypto.randomUUID().replaceAll('-', '');
  const signature = signRSA(`${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`, env.WECHAT_PRIVATE_KEY);
  const response = await fetch(`https://api.mch.weixin.qq.com${path}`, {
    method, body: body || undefined, signal: AbortSignal.timeout(20000), redirect: 'manual',
    headers: { 'accept': 'application/json', 'content-type': 'application/json', 'Accept-Language': 'zh-CN', 'User-Agent': 'SUNPB-Image/0.1.0',
      ...(env.WECHAT_PUBLIC_KEY_ID ? { 'Wechatpay-Serial': env.WECHAT_PUBLIC_KEY_ID } : {}),
      'authorization': `WECHATPAY2-SHA256-RSA2048 mchid="${env.WECHAT_MCH_ID}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${env.WECHAT_CERT_SERIAL}",signature="${signature}"` }
  });
  const raw = new TextDecoder().decode(await readLimited(response, 200000));
  if (!response.ok) {
    const error = new HttpError(502, '微信支付暂时无法处理，请稍后重试');
    error.upstreamStatus = response.status;
    try { const code = JSON.parse(raw).code; if (typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code)) error.upstreamCode = code; } catch {}
    throw error;
  }
  return { response, raw };
}
async function wechatCall(env, method, path, payload) {
  const { response, raw } = await wechatRequest(env, method, path, payload);
  await verifyWechat(response.headers, raw, env);
  return JSON.parse(raw);
}
function decryptWechatResource(resource, env) {
  ensure(resource?.algorithm === 'AEAD_AES_256_GCM', 400, '支付解密算法不正确');
  const encrypted = Buffer.from(resource.ciphertext, 'base64');
  ensure(Buffer.byteLength(env.WECHAT_API_V3_KEY) === 32 && encrypted.length > 16, 400, '支付解密参数不正确');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(env.WECHAT_API_V3_KEY), Buffer.from(resource.nonce));
  decipher.setAuthTag(encrypted.subarray(-16));
  decipher.setAAD(Buffer.from(resource.associated_data || ''));
  return Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]).toString();
}
export async function refreshWechatCertificates(env) {
  if (!env.WECHAT_PLATFORM_CERTIFICATES || !env.DB || !paymentReady(env, 'wechat')) return;
  const last = await env.DB.prepare('SELECT MAX(fetched_at) AS refreshed FROM payment_certificates WHERE merchant_id=?').bind(env.WECHAT_MCH_ID).first();
  if (last?.refreshed > now() - 3600) return;
  // Refresh through an already trusted certificate/public key. Do not accept a
  // new certificate just because it appears in an unverified response body.
  const result = await wechatCall(env, 'GET', '/v3/certificates');
  ensure(Array.isArray(result.data) && result.data.length > 0 && result.data.length <= 10, 502, '微信平台证书响应不完整');
  const certs = result.data.map(item => platformCertificate({ serial: item.serial_no, pem: decryptWechatResource(item.encrypt_certificate, env) }));
  ensure(certs.some(cert => cert.notBefore <= now() && cert.notAfter > now()), 502, '未取得有效微信平台证书');
  await env.DB.batch(certs.map(cert => env.DB.prepare('INSERT INTO payment_certificates(merchant_id,serial,pem,not_before,not_after,fetched_at) VALUES(?,?,?,?,?,?) ON CONFLICT(merchant_id,serial) DO UPDATE SET pem=excluded.pem,not_before=excluded.not_before,not_after=excluded.not_after,fetched_at=excluded.fetched_at').bind(env.WECHAT_MCH_ID, cert.serial, cert.pem, cert.notBefore, cert.notAfter, now())));
}
export function wechatTransaction(data, env) {
  ensure(data.appid === env.WECHAT_APP_ID && data.mchid === env.WECHAT_MCH_ID, 400, '收款商户不匹配');
  ensure(data.amount?.currency === 'CNY' && Number.isSafeInteger(data.amount.total), 400, '支付币种或金额不正确');
  ensure(data.trade_type === 'NATIVE', 400, '支付类型不匹配');
  return { provider: 'wechat', orderId: data.out_trade_no, transactionId: data.transaction_id, amountCents: data.amount.total, paid: data.trade_state === 'SUCCESS' };
}
export async function decryptWechatNotification(raw, headers, env) {
  await verifyWechat(headers, raw, env);
  const event = JSON.parse(raw);
  ensure(event.event_type === 'TRANSACTION.SUCCESS' && event.resource?.algorithm === 'AEAD_AES_256_GCM', 400, '通知类型不匹配');
  try {
    const data = JSON.parse(decryptWechatResource(event.resource, env));
    return wechatTransaction(data, env);
  } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, '支付通知解密失败'); }
}
export function alipayCanonical(params, notification = false) {
  return Object.keys(params).filter(k => k !== 'sign' && (!notification || k !== 'sign_type') && params[k] !== '' && params[k] != null).sort().map(k => `${k}=${params[k]}`).join('&');
}
export function cents(amount) {
  ensure(typeof amount === 'string' && /^\d{1,9}(\.\d{1,2})?$/.test(amount), 400, '支付金额格式不正确');
  const [integer, fraction = ''] = amount.split('.');
  return Number(integer) * 100 + Number(fraction.padEnd(2, '0'));
}
// The Alipay signature covers the exact response value, including its original
// whitespace and escapes. Re-serializing parsed JSON is not safe for verification.
export function rawAlipayResponse(raw, name) {
  const match = new RegExp(`"${name}"\\s*:\\s*`).exec(raw);
  ensure(match, 502, '支付响应不完整');
  const start = match.index + match[0].length;
  ensure(raw[start] === '{', 502, '支付响应格式错误');
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < raw.length; i++) {
    const char = raw[i];
    if (inString) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') inString = false; }
    else if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) return raw.slice(start, i + 1);
  }
  throw new HttpError(502, '支付响应格式错误');
}
function alipayParams(env, method, business, extra = {}) {
  const timestamp = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
  const params = { app_id: env.ALIPAY_APP_ID, method, format: 'JSON', charset: 'utf-8', sign_type: 'RSA2', timestamp, version: '1.0', biz_content: JSON.stringify(business), ...extra };
  params.sign = signRSA(alipayCanonical(params), env.ALIPAY_PRIVATE_KEY);
  return params;
}
async function alipayCall(env, method, business) {
  const params = alipayParams(env, method, business);
  const response = await fetch('https://openapi.alipay.com/gateway.do', { method: 'POST', body: new URLSearchParams(params), signal: AbortSignal.timeout(20000) });
  const raw = new TextDecoder().decode(await readLimited(response, 65536));
  ensure(response.ok, 502, '支付宝暂时无法处理，请稍后重试');
  const result = JSON.parse(raw); const name = method.replaceAll('.', '_') + '_response';
  ensure(result[name]?.code === '10000', 502, '支付宝未完成请求，请检查商户产品开通状态后重试');
  ensure(result.sign && verifyRSA(rawAlipayResponse(raw, name), result.sign, env.ALIPAY_PUBLIC_KEY), 502, '支付宝响应签名校验失败');
  return result[name];
}
export function alipayNotification(raw, env) {
  const fields = new URLSearchParams(raw); const params = {};
  for (const [key, value] of fields) { ensure(!(key in params), 400, '支付通知包含重复字段'); params[key] = value; }
  ensure(params.sign_type === 'RSA2' && verifyRSA(alipayCanonical(params, true), params.sign, env.ALIPAY_PUBLIC_KEY), 400, '支付签名校验失败');
  ensure(params.app_id === env.ALIPAY_APP_ID && params.seller_id === env.ALIPAY_SELLER_ID, 400, '收款商户不匹配');
  return { provider: 'alipay', orderId: params.out_trade_no, transactionId: params.trade_no, amountCents: cents(params.total_amount), paid: ['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(params.trade_status) };
}
export async function createPayment(order, env) {
  ensure(env.APP_ORIGIN && new URL(env.APP_ORIGIN).protocol === 'https:', 503, '收款域名尚未配置');
  const notifyUrl = new URL(`${env.APP_BASE_PATH || ''}/api/payments/${order.provider}/notify`, env.APP_ORIGIN).href;
  if (order.provider === 'wechat') {
    const result = await wechatCall(env, 'POST', '/v3/pay/transactions/native', { appid: env.WECHAT_APP_ID, mchid: env.WECHAT_MCH_ID, description: order.description || `SUNPB 图片合成 ${order.credits} 次`, out_trade_no: order.id, notify_url: notifyUrl, time_expire: new Date(order.expires_at * 1000).toISOString(), amount: { total: order.amount_cents, currency: 'CNY' } });
    ensure(typeof result.code_url === 'string' && result.code_url.startsWith('weixin://'), 502, '未取得微信付款码');
    return result.code_url;
  }
  // PC website payments use page.pay, not the offline Face-to-Face precreate product.
  // The browser return is navigation only; credit is granted by verified notify/query.
  const params = alipayParams(env, 'alipay.trade.page.pay', {
    out_trade_no: order.id, total_amount: (order.amount_cents / 100).toFixed(2),
    subject: `SUNPB 图片合成 ${order.credits} 次`, seller_id: env.ALIPAY_SELLER_ID,
    product_code: 'FAST_INSTANT_TRADE_PAY',
    time_expire: new Date(order.expires_at * 1000 + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ')
  }, { notify_url: notifyUrl, return_url: new URL(`${env.APP_BASE_PATH || ''}/`, env.APP_ORIGIN).href });
  return `https://openapi.alipay.com/gateway.do?${new URLSearchParams(params)}`;
}
export async function queryPayment(order, env) {
  if (order.provider === 'wechat') return wechatTransaction(await wechatCall(env, 'GET', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(order.id)}?mchid=${encodeURIComponent(env.WECHAT_MCH_ID)}`), env);
  const result = await alipayCall(env, 'alipay.trade.query', { out_trade_no: order.id });
  return { provider: 'alipay', orderId: result.out_trade_no, transactionId: result.trade_no, amountCents: cents(result.total_amount), paid: ['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(result.trade_status) };
}
export async function settlePayment(db, transaction) {
  ensure(transaction.paid && typeof transaction.transactionId === 'string' && transaction.transactionId.length > 0 && transaction.transactionId.length <= 128, 400, '付款尚未成功');
  const order = await db.prepare('SELECT * FROM orders WHERE id=?').bind(transaction.orderId).first();
  ensure(order && order.provider === transaction.provider && order.amount_cents === transaction.amountCents, 400, '订单或支付金额不匹配');
  if (order.status === 'paid') { ensure(order.transaction_id === transaction.transactionId, 400, '交易编号不匹配'); return; }
  ensure(order.status === 'pending', 409, '订单状态不允许入账');
  // One atomic UPDATE + database trigger: even concurrent notifications can
  // issue exactly one ledger entry and one credit balance change.
  await db.prepare("UPDATE orders SET status='paid',transaction_id=?,paid_at=? WHERE id=? AND status='pending'").bind(transaction.transactionId, now(), order.id).run();
  const updated = await db.prepare('SELECT transaction_id FROM orders WHERE id=?').bind(order.id).first();
  ensure(updated.transaction_id === transaction.transactionId, 409, '订单交易冲突');
}
