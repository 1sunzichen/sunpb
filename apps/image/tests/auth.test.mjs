import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
import { env, request } from './helpers.mjs';

test('register, login and logout preserve account while revoking sessions', async () => {
  const e = env(), body = { username: 'my_account', password: 'a-strong-password-123' };
  const registered = await worker.fetch(request('/api/auth/register', { method: 'POST', body }), e); assert.equal(registered.status, 200);
  const cookie = registered.headers.get('set-cookie').split(';')[0]; assert.match(registered.headers.get('set-cookie'), /HttpOnly/); assert.match(registered.headers.get('set-cookie'), /Secure/);
  const first = await (await worker.fetch(request('/api/bootstrap', { cookie }), e)).json(); assert.equal(first.user.username, body.username);
  const wrong = await worker.fetch(request('/api/auth/login', { method: 'POST', body: { ...body, password: 'incorrect-password' } }), e); assert.equal(wrong.status, 401);
  const loggedIn = await worker.fetch(request('/api/auth/login', { method: 'POST', cookie, body }), e); assert.equal(loggedIn.status, 200); const newCookie = loggedIn.headers.get('set-cookie').split(';')[0];
  assert.equal((await (await worker.fetch(request('/api/bootstrap', { cookie }), e)).json()).user, null);
  assert.equal((await worker.fetch(request('/api/auth/logout', { method: 'POST', cookie: newCookie, body: {} }), e)).status, 200);
  assert.equal((await (await worker.fetch(request('/api/bootstrap', { cookie: newCookie }), e)).json()).user, null);
  const stored = await e.DB.prepare('SELECT * FROM users').first(); assert.equal(stored.id, first.user.id); assert.notEqual(stored.password_hash, body.password); assert.match(stored.password_hash, /^pbkdf2:/);
});
test('cross-site requests and client-injected identity are rejected', async () => {
  const e = env(); const body = { username: 'attacker', password: 'a-strong-password-123', credits: 10000 };
  assert.equal((await worker.fetch(request('/api/auth/register', { method: 'POST', body, origin: 'https://evil.example' }), e)).status, 403);
  const registered = await worker.fetch(request('/api/auth/register', { method: 'POST', body }), e); assert.equal((await registered.json()).user.credits, 0);
  assert.equal((await worker.fetch(request('/api/jobs', { headers: { 'x-user-id': 'attacker' } }), e)).status, 401);
});
test('repeated login failures are throttled', async () => {
  const e = env(); let response;
  for (let i = 0; i < 11; i++) response = await worker.fetch(request('/api/auth/login', { method: 'POST', body: { username: 'unknown', password: 'a-strong-password' } }), e);
  assert.equal(response.status, 429);
});
test('no configured API or merchant is represented as ready', async () => {
  const result = await (await worker.fetch(request('/api/bootstrap'), env())).json();
  assert.equal(result.generationReady, false); assert.equal(result.salesEnabled, false); assert.deepEqual(result.methods, []);
});
