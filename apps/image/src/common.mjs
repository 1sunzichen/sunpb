export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const ensure = (condition, status, message) => { if (!condition) throw new HttpError(status, message); };
export const now = () => Math.floor(Date.now() / 1000);
export const id = () => crypto.randomUUID().replaceAll('-', '');
export const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
export async function readLimited(response, maxBytes) {
  ensure(Number(response.headers.get('content-length') || 0) <= maxBytes, 413, '文件或请求过大');
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, '文件或请求过大'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
export async function readJson(request, limit = 16384) {
  try { return JSON.parse(new TextDecoder().decode(await readLimited(request, limit))); }
  catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(400, '请求格式不正确'); }
}
export async function sha256(value) { return Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))).toString('hex'); }
export function validateRequestId(value) { ensure(typeof value === 'string' && /^[a-zA-Z0-9_-]{16,64}$/.test(value), 400, '请刷新页面后重试'); return value; }
export function price(env) { const p = Number(env.PRICE_CENTS || 100); ensure(Number.isSafeInteger(p) && p > 0 && p <= 100000, 503, '价格配置暂不可用'); return p; }
