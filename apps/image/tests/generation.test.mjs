import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
import { failJob } from '../src/generation.mjs';
import { id, now } from '../src/common.mjs';
import { env, form, order, PNG, request, user } from './helpers.mjs';

test('upload → reserve one credit → queued model run → private result download', async t => {
  const e = { ...env(), DASHSCOPE_API_KEY: 'test-key' }, owner = await user(e); await order(e, owner, { paid: true });
  const requestId = id();
  const response = await worker.fetch(request('/api/jobs', { method: 'POST', cookie: owner.cookie, body: form(undefined, requestId) }), e); assert.equal(response.status, 201);
  const { job } = await response.json(); assert.equal(job.status, 'queued');
  assert.equal((await e.DB.prepare('SELECT credits FROM users WHERE id=?').bind(owner.id).first()).credits, 0);
  const duplicate = await worker.fetch(request('/api/jobs', { method: 'POST', cookie: owner.cookie, body: form(undefined, requestId) }), e); assert.equal(duplicate.status, 200); assert.equal((await duplicate.json()).job.id, job.id);
  const oldFetch = globalThis.fetch; t.after(() => { globalThis.fetch = oldFetch; }); let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    if (new URL(url).pathname.includes('generation')) {
      const payload = JSON.parse(options.body); assert.equal(payload.input.messages[0].content.length, 2); assert.match(payload.input.messages[0].content[0].image, /^data:image\/png;base64,/); assert.equal(payload.parameters.n, 1);
      return Response.json({ request_id: 'provider-test', output: { choices: [{ message: { content: [{ image: 'https://result.oss-cn-hangzhou.aliyuncs.com/test.png' }] } }] } });
    }
    assert.equal(options.redirect, 'manual');
    return new Response(PNG, { headers: { 'content-type': 'image/png' } });
  };
  const message = { body: e.IMAGE_JOBS.messages[0], ack() {}, retry() { assert.fail('should not retry'); } };
  await worker.queue({ messages: [message, message] }, e); assert.equal(calls, 2);
  const detail = await (await worker.fetch(request(`/api/jobs/${job.id}`, { cookie: owner.cookie }), e)).json(); assert.equal(detail.job.status, 'succeeded');
  const image = await worker.fetch(request(detail.job.imageUrl + '?download=1', { cookie: owner.cookie }), e); assert.equal(image.status, 200); assert.match(image.headers.get('content-disposition'), /attachment/); assert.deepEqual(Buffer.from(await image.arrayBuffer()), PNG);
  const stranger = await user(e, 'stranger'); assert.equal((await worker.fetch(request(detail.job.imageUrl, { cookie: stranger.cookie }), e)).status, 404);
  assert.equal((await worker.fetch(request(detail.job.imageUrl), e)).status, 401);
});
test('model failure returns reserved credit once even on repeated failures and queue deliveries', async t => {
  const e = { ...env(), DASHSCOPE_API_KEY: 'test-key' }, owner = await user(e); await order(e, owner, { paid: true });
  const response = await worker.fetch(request('/api/jobs', { method: 'POST', cookie: owner.cookie, body: form() }), e); const { job } = await response.json();
  const oldFetch = globalThis.fetch; t.after(() => { globalThis.fetch = oldFetch; }); globalThis.fetch = async () => Response.json({ code: 'ServiceUnavailable' }, { status: 503 });
  await worker.queue({ messages: [{ body: { jobId: job.id }, ack() {}, retry() { assert.fail(); } }] }, e);
  await Promise.all([failJob(e.DB, job.id, 'another failure'), failJob(e.DB, job.id, 'another failure')]);
  assert.equal((await e.DB.prepare('SELECT credits FROM users WHERE id=?').bind(owner.id).first()).credits, 1);
  assert.equal((await e.DB.prepare("SELECT COUNT(*) AS n FROM credit_ledger WHERE reason='return'").first()).n, 1);
});
test('two simultaneous jobs cannot overspend a single credit', async () => {
  const e = { ...env(), DASHSCOPE_API_KEY: 'test-key' }, owner = await user(e); await order(e, owner, { paid: true });
  const responses = await Promise.all([1,2].map(() => worker.fetch(request('/api/jobs', { method: 'POST', cookie: owner.cookie, body: form() }), e)));
  assert.equal(responses.filter(r => r.status === 201).length, 1);
  assert.equal(responses.filter(r => [402,409].includes(r.status)).length, 1);
  assert.equal((await e.DB.prepare('SELECT credits FROM users WHERE id=?').bind(owner.id).first()).credits, 0);
  assert.equal((await e.DB.prepare('SELECT COUNT(*) AS n FROM jobs').first()).n, 1);
  assert.equal(e.IMAGES.objects.size, 1);
});
test('invalid input and missing model config never charge a credit', async () => {
  const e = env(), owner = await user(e); await order(e, owner, { paid: true });
  assert.equal((await worker.fetch(request('/api/jobs', { method: 'POST', cookie: owner.cookie, body: form() }), e)).status, 503);
  e.DASHSCOPE_API_KEY = 'test-key'; const bad = form(); bad.delete('images'); bad.append('images', new Blob(['<svg onload="evil()"></svg>'], { type: 'image/png' }), 'fake.png');
  assert.equal((await worker.fetch(request('/api/jobs', { method: 'POST', cookie: owner.cookie, body: bad }), e)).status, 400);
  assert.equal((await e.DB.prepare('SELECT credits FROM users WHERE id=?').bind(owner.id).first()).credits, 1);
});
test('enqueue failure refunds and a later stray queue delivery cannot run that job', async t => {
  const e = { ...env(), DASHSCOPE_API_KEY: 'test-key' }, owner = await user(e); await order(e, owner, { paid: true });
  e.IMAGE_JOBS.send = async () => { throw new Error('network'); };
  const response = await worker.fetch(request('/api/jobs', { method: 'POST', cookie: owner.cookie, body: form() }), e); const { job } = await response.json(); assert.equal(job.status, 'failed');
  const oldFetch = globalThis.fetch; t.after(() => { globalThis.fetch = oldFetch; }); globalThis.fetch = async () => { assert.fail('should not call upstream'); };
  await worker.queue({ messages: [{ body: { jobId: job.id }, ack() {}, retry() {} }] }, e);
  assert.equal((await e.DB.prepare('SELECT credits FROM users WHERE id=?').bind(owner.id).first()).credits, 1);
});
test('stale running task is recovered with exactly one returned credit', async () => {
  const e = { ...env(), DASHSCOPE_API_KEY: 'test-key' }, owner = await user(e); await order(e, owner, { paid: true });
  const response = await worker.fetch(request('/api/jobs', { method: 'POST', cookie: owner.cookie, body: form() }), e); const { job } = await response.json();
  await e.DB.prepare("UPDATE jobs SET status='running',started_at=? WHERE id=?").bind(now() - 700, job.id).run();
  await worker.scheduled({}, e); await worker.scheduled({}, e);
  assert.equal((await e.DB.prepare('SELECT credits FROM users WHERE id=?').bind(owner.id).first()).credits, 1);
  assert.equal((await e.DB.prepare('SELECT status FROM jobs WHERE id=?').bind(job.id).first()).status, 'failed');
});
test('untrusted model result URLs are rejected before downloading', async t => {
  const e = { ...env(), DASHSCOPE_API_KEY: 'test-key' }, owner = await user(e); await order(e, owner, { paid: true });
  const { job } = await (await worker.fetch(request('/api/jobs', { method: 'POST', cookie: owner.cookie, body: form() }), e)).json();
  const oldFetch = globalThis.fetch; t.after(() => { globalThis.fetch = oldFetch; }); let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ output: { choices: [{ message: { content: [{ image: 'http://127.0.0.1/internal' }] } }] } }); };
  await worker.queue({ messages: [{ body: { jobId: job.id }, ack() {}, retry() {} }] }, e); assert.equal(calls, 1);
  assert.equal((await e.DB.prepare('SELECT credits FROM users WHERE id=?').bind(owner.id).first()).credits, 1);
});
test('image download refuses redirects and returns the reserved credit', async t => {
  const e = { ...env(), DASHSCOPE_API_KEY: 'test-key' }, owner = await user(e); await order(e, owner, { paid: true });
  const { job } = await (await worker.fetch(request('/api/jobs', { method: 'POST', cookie: owner.cookie, body: form() }), e)).json();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    if (calls === 1) return Response.json({ output: { choices: [{ message: { content: [{ image: 'https://result.oss-cn-hangzhou.aliyuncs.com/test.png' }] } }] } });
    assert.equal(options.redirect, 'manual');
    return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/internal' } });
  });
  await worker.queue({ messages: [{ body: { jobId: job.id }, ack() {}, retry() {} }] }, e);
  assert.equal(calls, 2);
  assert.equal((await e.DB.prepare('SELECT status FROM jobs WHERE id=?').bind(job.id).first()).status, 'failed');
  assert.equal((await e.DB.prepare('SELECT credits FROM users WHERE id=?').bind(owner.id).first()).credits, 1);
});
