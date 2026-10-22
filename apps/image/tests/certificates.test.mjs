import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { X509Certificate, createCipheriv } from 'node:crypto';
import { env, keys, notification, order, request, signedWechat, user } from './helpers.mjs';
import { paymentReady, refreshWechatCertificates, verifyWechat } from '../src/payments.mjs';
import { now } from '../src/common.mjs';
import worker from '../src/worker.mjs';

function certificate(t, serial) {
  const dir = mkdtempSync(join(tmpdir(), 'sunpb-cert-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-days','2','-set_serial',String(serial),'-subj','/CN=local-test-only','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem')], { stdio: 'ignore' });
  const pem = readFileSync(join(dir,'cert.pem'),'utf8'), parsed = new X509Certificate(pem);
  return { serial: parsed.serialNumber, pem, key: readFileSync(join(dir,'key.pem'),'utf8') };
}
function configured(cert) {
  return { ...env(), ...keys().env, WECHAT_PUBLIC_KEY_ID: '', WECHAT_PUBLIC_KEY: '', WECHAT_PLATFORM_CERTIFICATES: JSON.stringify([{ serial: cert.serial, pem: cert.pem }]) };
}
function headers(body, cert) { return { ...signedWechat(body, cert.key), 'wechatpay-serial': cert.serial }; }
function encrypted(pem, environment) {
  const nonce = '123456789012', associated = 'certificate';
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(environment.WECHAT_API_V3_KEY), Buffer.from(nonce));
  cipher.setAAD(Buffer.from(associated));
  return { algorithm: 'AEAD_AES_256_GCM', nonce, associated_data: associated, ciphertext: Buffer.concat([cipher.update(pem), cipher.final(), cipher.getAuthTag()]).toString('base64') };
}
test('platform-certificate mode accepts signed payment callbacks and refuses unknown certificate IDs', async t => {
  const cert = certificate(t, 1), e = configured(cert), owner = await user(e), orderId = await order(e, owner);
  assert.equal(paymentReady(e, 'wechat'), true);
  const n = notification({ appid: e.WECHAT_APP_ID, mchid: e.WECHAT_MCH_ID, out_trade_no: orderId, transaction_id: 'platform-paid', trade_state: 'SUCCESS', trade_type: 'NATIVE', amount: { total: 100, currency: 'CNY' } }, e, cert.key);
  n.headers['wechatpay-serial'] = cert.serial;
  assert.equal((await worker.fetch(request('/api/payments/wechat/notify', { method: 'POST', ...n, origin: null }), e)).status, 204);
  assert.equal((await e.DB.prepare('SELECT credits FROM users WHERE id=?').bind(owner.id).first()).credits, 1);
  n.headers['wechatpay-serial'] = 'UNTRUSTED';
  assert.equal((await worker.fetch(request('/api/payments/wechat/notify', { method: 'POST', ...n, origin: null }), e)).status, 400);
});
test('verified certificate refresh accepts rotation, caches per merchant and runs at most hourly', async t => {
  const old = certificate(t, 2), rotated = certificate(t, 3), e = configured(old);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++; assert.equal(url, 'https://api.mch.weixin.qq.com/v3/certificates');
    assert.equal(options.headers['Accept-Language'], 'zh-CN');
    assert.equal(options.headers['User-Agent'], 'SUNPB-Image/0.1.0');
    assert.equal(options.headers['Wechatpay-Serial'], undefined);
    const raw = JSON.stringify({ data: [{ serial_no: rotated.serial, encrypt_certificate: encrypted(rotated.pem, e) }] });
    return new Response(raw, { headers: headers(raw, old) });
  });
  await refreshWechatCertificates(e); await refreshWechatCertificates(e);
  assert.equal(calls, 1);
  await verifyWechat(new Headers(headers('rotated response', rotated)), 'rotated response', e);
  await assert.rejects(verifyWechat(new Headers(headers('rotated response', rotated)), 'rotated response', { ...e, WECHAT_MCH_ID: 'other-merchant' }));
});
test('forged certificate update cannot replace trusted certificates', async t => {
  const old = certificate(t, 4), attacker = certificate(t, 5), e = configured(old);
  t.mock.method(globalThis, 'fetch', async () => {
    const raw = JSON.stringify({ data: [{ serial_no: attacker.serial, encrypt_certificate: encrypted(attacker.pem, e) }] });
    return new Response(raw, { headers: { ...headers(raw, attacker), 'wechatpay-serial': old.serial } });
  });
  await assert.rejects(refreshWechatCertificates(e));
  assert.equal((await e.DB.prepare('SELECT COUNT(*) AS n FROM payment_certificates').first()).n, 0);
});
test('expired platform certificate is not accepted for a fresh signed response', async t => {
  const cert = certificate(t, 6), e = configured(cert), expiry = Date.parse(new X509Certificate(cert.pem).validTo);
  t.mock.method(Date, 'now', () => expiry + 1000);
  assert(now() > expiry / 1000);
  await assert.rejects(verifyWechat(new Headers(headers('fresh', cert)), 'fresh', e));
});
