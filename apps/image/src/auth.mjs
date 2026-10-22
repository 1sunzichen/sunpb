import { timingSafeEqual } from 'node:crypto';
import { ensure, id, now, sha256 } from './common.mjs';
const ITERATIONS = 100000;
export async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
  return `pbkdf2:${Buffer.from(salt).toString('hex')}:${Buffer.from(bits).toString('hex')}`;
}
export async function checkPassword(password, stored) {
  const salt = stored?.split(':')[1] || '00000000000000000000000000000000';
  const candidate = await hashPassword(password, Buffer.from(salt, 'hex'));
  return !!stored && stored.length === candidate.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(stored));
}
export async function rateLimit(db, key, limit, seconds) {
  const t = now(); const windowKey = `${key}:${Math.floor(t / seconds)}`;
  const row = await db.prepare('INSERT INTO rate_limits(key,hits,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').bind(windowKey, t + seconds).first();
  ensure(row.hits <= limit, 429, '操作太频繁，请稍后再试');
}
const cookieName = request => new URL(request.url).protocol === 'https:' ? '__Host-sunpb_image' : 'sunpb_image';
export function cookie(request, token, expires = 2592000) {
  return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${expires}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}
export function sessionToken(request) {
  return (request.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(cookieName(request) + '='))?.split('=')[1] || '';
}
export async function getUser(request, db, required = true) {
  const token = sessionToken(request);
  const user = /^[a-f0-9]{64}$/.test(token) ? await db.prepare('SELECT users.id,username,credits FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?').bind(await sha256(token), now()).first() : null;
  if (required) ensure(user, 401, '请先登录');
  return user;
}
export async function authenticate(request, db, body, register) {
  const username = String(body.username || '').trim().toLowerCase();
  const password = body.password;
  ensure(/^[a-z0-9_]{3,24}$/.test(username), 400, '账号需为 3–24 位字母、数字或下划线');
  ensure(typeof password === 'string' && password.length >= 10 && password.length <= 128, 400, '密码需为 10–128 位');
  await rateLimit(db, `auth-ip:${await sha256(request.headers.get('cf-connecting-ip') || 'local')}`, 15, 600);
  await rateLimit(db, `auth-user:${username}`, 10, 600);
  let user = await db.prepare('SELECT * FROM users WHERE username=?').bind(username).first();
  if (register) {
    ensure(!user, 409, '账号已存在，请直接登录');
    const userId = id(); const hash = await hashPassword(password);
    try { await db.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)').bind(userId, username, hash, now()).run(); }
    catch (e) { if (String(e).includes('UNIQUE')) throw Object.assign(new Error('账号已存在，请直接登录'), { status: 409 }); throw e; }
    user = { id: userId, username, credits: 0 };
  } else ensure(await checkPassword(password, user?.password_hash), 401, '账号或密码不正确');
  const token = id() + id();
  const oldToken = sessionToken(request);
  if (oldToken) await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(oldToken)).run();
  await db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(await sha256(token), user.id, now() + 2592000).run();
  return { user: { id: user.id, username: user.username, credits: user.credits }, cookie: cookie(request, token) };
}
