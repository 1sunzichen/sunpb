import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createCipheriv, generateKeyPairSync } from 'node:crypto';
import { id, now, sha256 } from '../src/common.mjs';
import { signRSA } from '../src/payments.mjs';

export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5mQAAAAASUVORK5CYII=', 'base64');
export function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../migrations/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL('../migrations/'+name, import.meta.url), 'utf8'));
  const db = { sqlite, prepare(sql) {
    let args = []; const statement = {
      bind(...values) { args = values; return statement; },
      async first() { return sqlite.prepare(sql).get(...args) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() { const result = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(result.changes) } }; }
    }; return statement;
  }, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results = []; for (const s of statements) results.push(await s.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } }; return db;
}
export function imageStore() {
  const objects = new Map();
  return { objects,
    async put(key, data, options = {}) { objects.set(key, { bytes: new Uint8Array(data), ...options }); },
    async get(key) { const obj = objects.get(key); return obj ? { arrayBuffer: async () => obj.bytes.buffer, body: obj.bytes, httpMetadata: obj.httpMetadata } : null; },
    async delete(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key); }
  };
}
export function env() { return { DB: database(), IMAGES: imageStore(), IMAGE_JOBS: { messages: [], async send(body) { this.messages.push(body); } }, SALES_ENABLED: '0', PRICE_CENTS: '100', ASSETS: { fetch: async () => new Response('test') } }; }
export async function user(environment, username = 'testuser') {
  const userId = id(); const token = id() + id();
  await environment.DB.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)').bind(userId, username, 'test-only', now()).run();
  await environment.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await sha256(token), userId, now() + 3600).run();
  return { id: userId, cookie: `__Host-sunpb_image=${token}` };
}
export async function order(environment, owner, { amount = 100, credits = 1, provider = 'wechat', paid = false } = {}) {
  const orderId = id();
  await environment.DB.prepare('INSERT INTO orders(id,user_id,request_id,provider,amount_cents,credits,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind(orderId, owner.id, id(), provider, amount, credits, now(), now() + 900).run();
  if (paid) await environment.DB.prepare("UPDATE orders SET status='paid',paid_at=?,transaction_id=? WHERE id=?").bind(now(), id(), orderId).run();
  return orderId;
}
export const request = (path, { method = 'GET', cookie, body, origin = 'https://images.example', headers = {} } = {}) => new Request(`https://images.example${path}`, { method, headers: { ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}), ...(!(body instanceof FormData) && body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body == null ? undefined : body instanceof FormData || typeof body === 'string' ? body : JSON.stringify(body) });
export function keys() {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  return { ...pair, env: { WECHAT_APP_ID: 'wx-test', WECHAT_MCH_ID: 'merchant-test', WECHAT_CERT_SERIAL: 'test-serial', WECHAT_PRIVATE_KEY: pair.privateKey, WECHAT_API_V3_KEY: '0123456789abcdef0123456789abcdef', WECHAT_PUBLIC_KEY_ID: 'PUB_KEY_ID_TEST', WECHAT_PUBLIC_KEY: pair.publicKey, ALIPAY_APP_ID: 'app-test', ALIPAY_SELLER_ID: 'seller-test', ALIPAY_PRIVATE_KEY: pair.privateKey, ALIPAY_PUBLIC_KEY: pair.publicKey } };
}
export function signedWechat(raw, key, timestamp = String(now())) {
  const nonce = id(); return { 'wechatpay-timestamp': timestamp, 'wechatpay-nonce': nonce, 'wechatpay-serial': 'PUB_KEY_ID_TEST', 'wechatpay-signature': signRSA(`${timestamp}\n${nonce}\n${raw}\n`, key) };
}
export function notification(transaction, environment, key) {
  const nonce = '123456789012', associated = 'transaction'; const cipher = createCipheriv('aes-256-gcm', Buffer.from(environment.WECHAT_API_V3_KEY), Buffer.from(nonce)); cipher.setAAD(Buffer.from(associated));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(transaction)), cipher.final(), cipher.getAuthTag()]).toString('base64');
  const body = JSON.stringify({ event_type: 'TRANSACTION.SUCCESS', resource: { algorithm: 'AEAD_AES_256_GCM', nonce, associated_data: associated, ciphertext } });
  return { body, headers: signedWechat(body, key) };
}
export function form(prompt = '请把两张图片自然融合在一起', requestId = id()) { const data = new FormData(); data.set('requestId', requestId); data.set('prompt', prompt); data.set('size', '1024*1024'); data.append('images', new Blob([PNG], { type: 'image/png' }), 'test.png'); return data; }
