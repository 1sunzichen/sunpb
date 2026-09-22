import { lessons, publicCurriculum, summarize } from './curriculum.mjs';

const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (data, status = 200, extra = {}) => new Response(JSON.stringify(data), { status, headers: { ...headers, ...extra } });
const hash = async token => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(v => v.toString(16).padStart(2, '0')).join('');
const cookieValue = request => request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('study_session='))?.slice(14);
const safeUser = (user, progress) => ({ id: user.id, nickname: user.nickname, ...summarize(progress) });
async function readJson(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw Object.assign(new Error('请求格式需要为 JSON'), { status: 415 });
  const reader = request.body?.getReader();
  let bytes = 0, parts = [];
  if (reader) while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 4096) { await reader.cancel(); throw Object.assign(new Error('请求内容过长'), { status: 413 }); } parts.push(value); }
  const combined = new Uint8Array(bytes); let offset = 0; for (const part of parts) { combined.set(part, offset); offset += part.length; }
  try { const body = JSON.parse(new TextDecoder().decode(combined) || '{}'); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); return body; }
  catch { throw Object.assign(new Error('无法读取请求内容'), { status: 400 }); }
}
export function createApi(store) {
  return async request => {
    const url = new URL(request.url), route = url.pathname;
    try {
      if (request.method === 'GET' && route === '/api/curriculum') return json(publicCurriculum());
      if (request.method === 'GET' && route === '/api/health') return json({ ok: true });
      if (!['GET', 'POST'].includes(request.method)) return json({ error: '不支持该请求方式' }, 405);
      if (request.method === 'POST' && request.headers.get('origin') !== url.origin) return json({ error: '请从本站页面提交' }, 403);
      const token = cookieValue(request);
      let user = token && /^[a-f0-9]{64}$/.test(token) ? await store.getBySession(await hash(token)) : undefined;
      if (route === '/api/session' && request.method === 'POST') {
        await readJson(request);
        let extra = {};
        if (!user) {
          const session = [...crypto.getRandomValues(new Uint8Array(32))].map(v => v.toString(16).padStart(2, '0')).join('');
          user = { id: crypto.randomUUID(), session_hash: await hash(session), nickname: '追光同学' + Math.floor(Math.random() * 900 + 100), created_at: new Date().toISOString() };
          await store.createUser(user);
          extra['Set-Cookie'] = `study_session=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${url.protocol === 'https:' ? '; Secure' : ''}`;
        }
        return json(safeUser(user, await store.getProgress(user.id)), 200, extra);
      }
      if (!user) return json({ error: '学习身份已过期，请刷新页面重新进入。' }, 401);
      if (route === '/api/me' && request.method === 'GET') return json(safeUser(user, await store.getProgress(user.id)));
      if (route === '/api/leaderboard' && request.method === 'GET') {
        const rows = await store.leaderboard();
        return json({ entries: rows.slice(0, 50), total: rows.length, myRank: rows.find(r => r.id === user.id)?.rank || null });
      }
      if (route === '/api/profile' && request.method === 'POST') {
        const body = await readJson(request);
        if (typeof body.nickname !== 'string') return json({ error: '请输入昵称' }, 400);
        const nickname = body.nickname.trim();
        if (nickname.length < 2 || nickname.length > 16 || /[<>\u0000-\u001f\u007f]/u.test(nickname)) return json({ error: '昵称需为 2～16 个字符，不包含特殊控制字符。' }, 400);
        user = await store.renameUser(user.id, nickname);
        return json(safeUser(user, await store.getProgress(user.id)));
      }
      if (route === '/api/answer' && request.method === 'POST') {
        const body = await readJson(request);
        const lesson = lessons.find(l => l.id === body.lessonId);
        const q = lesson?.questions.find(q => q.id === body.questionId);
        if (!q || !Number.isInteger(body.choice) || body.choice < 0 || body.choice >= q.options.length) return json({ error: '题目或选项无效，请重新选择。' }, 400);
        const correct = body.choice === q.answer;
        const before = summarize(await store.getProgress(user.id));
        await store.recordAnswer(user.id, lesson, q, correct);
        const me = safeUser(user, await store.getProgress(user.id));
        return json({ correct, answer: q.answer, explanation: q.explanation, awarded: Math.max(0, me.score - before.score), me });
      }
      return json({ error: '接口不存在' }, 404);
    } catch (error) {
      if (!error.status) console.error('Study API error:', error.message);
      return json({ error: error.status ? error.message : '暂时无法保存，请稍后重试。' }, error.status || 503);
    }
  };
}
