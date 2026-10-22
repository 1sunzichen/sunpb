import QRCode from 'qrcode';
import { HttpError, ensure, id, json, now, price, readJson, readLimited, sha256, validateRequestId } from './common.mjs';
import { authenticate, cookie, getUser, rateLimit, sessionToken } from './auth.mjs';
import { alipayNotification, createPayment, decryptWechatNotification, paymentReady, queryPayment, refreshWechatCertificates, settlePayment } from './payments.mjs';
import { failJob, imageReady, imageType, publicJob, runJob, SIZES } from './generation.mjs';
import { paymentTest, settleTestPayment } from './payment-test.mjs';

function secure(response) {
  const out = new Response(response.body, response);
  out.headers.set('x-content-type-options', 'nosniff');
  out.headers.set('referrer-policy', 'same-origin');
  out.headers.set('x-frame-options', 'DENY');
  out.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  out.headers.set('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  return out;
}
function orderView(order) {
  return { id: order.id, provider: order.provider, credits: order.credits, amountCents: order.amount_cents, status: order.status, expiresAt: order.expires_at,
    expired: order.expires_at < now(),
    qrUrl: order.code_url && order.status === 'pending' && order.provider === 'wechat' ? `/api/orders/${order.id}/qr` : null,
    checkoutUrl: order.code_url && order.status === 'pending' && order.provider === 'alipay' ? `/api/orders/${order.id}/checkout` : null };
}
async function notification(request, env, provider) {
  ensure(paymentReady(env, provider), 503, '收款通道未配置');
  const raw = new TextDecoder().decode(await readLimited(request, 65536));
  const transaction = provider === 'wechat' ? await decryptWechatNotification(raw, request.headers, env) : alipayNotification(raw, env);
  if (transaction.paid) {
    if (provider === 'wechat' && transaction.orderId?.startsWith('TEST')) await settleTestPayment(env.DB, transaction, 'callback');
    else await settlePayment(env.DB, transaction);
  }
  return provider === 'wechat' ? new Response(null, { status: 204 }) : new Response('success', { headers: { 'content-type': 'text/plain' } });
}
async function submitJob(request, env, user) {
  ensure(imageReady(env), 503, '图片合成暂未开放，请稍后再来');
  const bytes = await readLimited(request, 16 * 1024 * 1024);
  let form;
  try { form = await new Response(bytes, { headers: { 'content-type': request.headers.get('content-type') || '' } }).formData(); }
  catch { throw new HttpError(400, '请重新选择图片后提交'); }
  const requestId = validateRequestId(form.get('requestId'));
  const prompt = String(form.get('prompt') || '').trim(); const size = form.get('size');
  ensure(prompt.length >= 4 && prompt.length <= 1500, 400, '请填写 4–1500 字的合成要求');
  ensure(SIZES.includes(size), 400, '不支持该图片比例');
  const oldJob = await env.DB.prepare('SELECT * FROM jobs WHERE user_id=? AND request_id=?').bind(user.id, requestId).first();
  if (oldJob) { ensure(oldJob.prompt === prompt && oldJob.size === size, 409, '本次请求已存在，请刷新后重新提交'); return json({ job: publicJob(oldJob) }); }
  ensure(user.credits >= 1, 402, '合成次数不足，请先购买次数');
  await rateLimit(env.DB, `job:${user.id}`, 10, 600);
  const files = form.getAll('images');
  ensure(files.length >= 1 && files.length <= 3 && files.every(f => typeof f !== 'string'), 400, '请上传 1–3 张图片');
  const images = [];
  for (const file of files) {
    ensure(file.size > 0 && file.size <= 5 * 1024 * 1024, 400, '每张图片不能超过 5 MB');
    const content = new Uint8Array(await file.arrayBuffer());
    images.push({ content, type: imageType(content) });
  }
  const jobId = id(); const keys = images.map((_, index) => `${user.id}/${jobId}/input-${index}`);
  try {
    for (let i = 0; i < images.length; i++) await env.IMAGES.put(keys[i], images[i].content, { httpMetadata: { contentType: images[i].type } });
    const inserted = await env.DB.prepare("INSERT INTO jobs(id,user_id,request_id,prompt,size,input_keys,created_at) SELECT ?,?,?,?,?,?,? FROM users WHERE id=? AND credits>=1 AND (SELECT COUNT(*) FROM jobs WHERE user_id=? AND status IN ('queued','running'))<2 RETURNING *").bind(jobId, user.id, requestId, prompt, size, JSON.stringify(keys), now(), user.id, user.id).first();
    ensure(inserted, 409, '次数不足或已有两个任务进行中，请稍后重试');
  } catch (e) {
    await Promise.allSettled(keys.map(key => env.IMAGES.delete(key)));
    const duplicate = await env.DB.prepare('SELECT * FROM jobs WHERE user_id=? AND request_id=?').bind(user.id, requestId).first();
    if (duplicate) return json({ job: publicJob(duplicate) });
    throw e;
  }
  try { await env.IMAGE_JOBS.send({ jobId }); }
  catch { await failJob(env.DB, jobId, '任务提交失败，次数已返还，请重新尝试'); }
  const job = await env.DB.prepare('SELECT * FROM jobs WHERE id=?').bind(jobId).first();
  return json({ job: publicJob(job) }, 201);
}
async function handle(request, env) {
  const url = new URL(request.url); const path = url.pathname;
  if (path === '/api/health') return json({ ok: true, service: 'sunpb-image' });
  const callback = /^\/api\/payments\/(wechat|alipay)\/notify$/.exec(path);
  if (callback && request.method === 'POST') return notification(request, env, callback[1]);
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (!['GET', 'HEAD'].includes(request.method)) {
    ensure(request.headers.get('origin') === url.origin, 403, '请求来源不正确，请从本站操作');
    ensure(!request.headers.get('sec-fetch-site') || ['same-origin', 'none'].includes(request.headers.get('sec-fetch-site')), 403, '请求来源不正确');
  }
  ensure(env.DB, 503, '系统正在准备，请稍后再来');
  if (path.startsWith('/api/payment-test/')) return paymentTest(request, env);
  if (path === '/api/bootstrap' && request.method === 'GET') {
    const generationReady = imageReady(env);
    const salesReady = env.SALES_ENABLED === '1' && !!env.APP_ORIGIN && generationReady;
    return json({ user: await getUser(request, env.DB, false), generationReady,
      salesEnabled: salesReady, priceCents: price(env), methods: ['wechat', 'alipay'].filter(p => salesReady && paymentReady(env, p)),
      storageDays: 30, maxImages: 3 });
  }
  if (['/api/auth/register', '/api/auth/login'].includes(path) && request.method === 'POST') {
    const result = await authenticate(request, env.DB, await readJson(request), path.endsWith('/register'));
    return json({ user: result.user }, 200, { 'set-cookie': result.cookie });
  }
  if (path === '/api/auth/logout' && request.method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(sessionToken(request))).run();
    return json({ ok: true }, 200, { 'set-cookie': cookie(request, '', 0) });
  }
  const user = await getUser(request, env.DB);
  if (path === '/api/jobs') {
    if (request.method === 'POST') return submitJob(request, env, user);
    if (request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM jobs WHERE user_id=? ORDER BY created_at DESC LIMIT 30').bind(user.id).all();
      return json({ jobs: rows.results.map(publicJob), credits: user.credits });
    }
  }
  const jobMatch = /^\/api\/jobs\/([a-f0-9]{32})(\/image)?$/.exec(path);
  if (jobMatch && request.method === 'GET') {
    const job = await env.DB.prepare('SELECT * FROM jobs WHERE id=? AND user_id=?').bind(jobMatch[1], user.id).first();
    ensure(job, 404, '未找到该作品');
    if (!jobMatch[2]) return json({ job: publicJob(job), credits: user.credits });
    ensure(job.status === 'succeeded' && job.result_key, 404, '图片尚未生成或已到期');
    const object = await env.IMAGES.get(job.result_key); ensure(object, 404, '图片已到期');
    const type = object.httpMetadata?.contentType || 'image/png';
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[type] || 'png';
    return new Response(object.body, { headers: { 'content-type': type, 'cache-control': 'private, no-store', 'content-disposition': `${url.searchParams.has('download') ? 'attachment' : 'inline'}; filename="sunpb-${job.id}.${extension}"` } });
  }
  if (path === '/api/orders' && request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 20').bind(user.id).all();
    return json({ orders: rows.results.map(orderView), credits: user.credits });
  }
  if (path === '/api/orders' && request.method === 'POST') {
    ensure(env.SALES_ENABLED === '1' && env.APP_ORIGIN && imageReady(env), 503, '购买次数暂未开放');
    const body = await readJson(request); const requestId = validateRequestId(body.requestId);
    ensure(['wechat','alipay'].includes(body.provider) && paymentReady(env, body.provider), 503, '该支付方式暂未开放');
    ensure([1, 10, 30].includes(body.quantity), 400, '请选择有效次数');
    await rateLimit(env.DB, `order:${user.id}`, 15, 600);
    let order = await env.DB.prepare('SELECT * FROM orders WHERE user_id=? AND request_id=?').bind(user.id, requestId).first();
    if (!order) {
      const orderId = id();
      await env.DB.prepare('INSERT INTO orders(id,user_id,request_id,provider,amount_cents,credits,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,request_id) DO NOTHING').bind(orderId, user.id, requestId, body.provider, price(env) * body.quantity, body.quantity, now(), now() + 900).run();
      order = await env.DB.prepare('SELECT * FROM orders WHERE user_id=? AND request_id=?').bind(user.id, requestId).first();
    }
    ensure(order.provider === body.provider && order.credits === body.quantity, 409, '订单内容已变化，请重新下单');
    if (order.status !== 'pending' || order.code_url) return json({ order: orderView(order) });
    ensure(order.expires_at > now(), 409, '订单已过期，请重新下单');
    const codeUrl = await createPayment(order, env);
    await env.DB.prepare("UPDATE orders SET code_url=? WHERE id=? AND status='pending'").bind(codeUrl, order.id).run();
    order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(order.id).first();
    return json({ order: orderView(order) }, 201);
  }
  const orderMatch = /^\/api\/orders\/([a-f0-9]{32})(\/(qr|refresh|checkout))?$/.exec(path);
  if (orderMatch && ['GET','POST'].includes(request.method)) {
    let order = await env.DB.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').bind(orderMatch[1], user.id).first();
    ensure(order, 404, '订单不存在');
    if (orderMatch[3] === 'refresh') {
      ensure(request.method === 'POST', 405, '请使用 POST 请求');
      if (order.status === 'pending' && paymentReady(env, order.provider)) {
        await rateLimit(env.DB, `query:${order.id}`, 10, 60);
        const transaction = await queryPayment(order, env);
        if (transaction.paid) await settlePayment(env.DB, transaction);
        order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(order.id).first();
      }
    } else ensure(request.method === 'GET', 405, '请使用 GET 请求');
    if (orderMatch[3] === 'qr') {
      ensure(order.provider === 'wechat', 404, '该订单请前往支付宝收银台付款');
      ensure(order.status === 'pending' && order.code_url && order.expires_at > now(), 410, '付款码已失效');
      return new Response(await QRCode.toString(order.code_url, { type: 'svg', margin: 2, width: 280 }), { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'no-store' } });
    }
    if (orderMatch[3] === 'checkout') {
      ensure(order.provider === 'alipay', 404, '该订单请使用微信扫码付款');
      ensure(order.status === 'pending' && order.code_url && order.expires_at > now(), 410, '付款链接已失效');
      const destination = new URL(order.code_url);
      ensure(destination.origin === 'https://openapi.alipay.com' && destination.pathname === '/gateway.do', 500, '收银台地址不正确');
      return new Response(null, { status: 302, headers: { location: destination.href, 'cache-control': 'no-store' } });
    }
    const updatedUser = await getUser(request, env.DB);
    return json({ order: orderView(order), credits: updatedUser.credits });
  }
  throw new HttpError(404, '未找到该接口');
}
export default {
  async fetch(request, env) {
    try { return secure(await handle(request, env)); }
    catch (error) {
      const status = error.status || 500;
      if (status === 500 || error.upstreamStatus) console.error(JSON.stringify({ event: 'request_failed', path: new URL(request.url).pathname, kind: error.name, upstreamStatus: error.upstreamStatus, upstreamCode: error.upstreamCode }));
      return secure(json({ error: status === 500 ? '服务暂时不可用，请稍后重试' : error.message }, status));
    }
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      if (!/^[a-f0-9]{32}$/.test(message.body?.jobId || '')) { message.ack(); continue; }
      try { await runJob(message.body.jobId, env); message.ack(); }
      catch { message.retry({ delaySeconds: 60 }); }
    }
  },
  async scheduled(controller, env) {
    try { await refreshWechatCertificates(env); }
    catch (error) { console.error(JSON.stringify({ event: 'wechat_certificate_refresh_failed', kind: error.name, upstreamStatus: error.upstreamStatus, upstreamCode: error.upstreamCode })); }
    const time = now();
    // An interrupted execution is refunded rather than blindly re-submitted to
    // a paid model provider. This also recovers a lost queue acknowledgement.
    await env.DB.prepare("UPDATE jobs SET status='failed',error='任务超时，次数已返还，请重新尝试',finished_at=? WHERE (status='running' AND started_at<?) OR (status='queued' AND created_at<?)").bind(time, time - 600, time - 900).run();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(time),
      env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(time)
    ]);
    const old = await env.DB.prepare("SELECT id,input_keys,result_key FROM jobs WHERE created_at<? AND status IN ('succeeded','failed') AND (input_keys<>'[]' OR result_key IS NOT NULL) LIMIT 20").bind(time - 30 * 86400).all();
    for (const job of old.results) {
      const keys = [...JSON.parse(job.input_keys), job.result_key].filter(Boolean);
      if (keys.length) await env.IMAGES.delete(keys);
      await env.DB.prepare("UPDATE jobs SET input_keys='[]',result_key=NULL WHERE id=?").bind(job.id).run();
    }
  }
};
