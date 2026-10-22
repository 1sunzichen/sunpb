import { ensure, HttpError, now, readLimited } from './common.mjs';
export const SIZES = ['1024*1024', '1280*720', '720*1280'];
export const imageReady = env => !!(env.DASHSCOPE_API_KEY && env.IMAGES && env.IMAGE_JOBS);
export function imageType(bytes) {
  if (bytes[0] === 0x89 && Buffer.from(bytes.subarray(1, 8)).equals(Buffer.from([80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (Buffer.from(bytes.subarray(0, 4)).toString() === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString() === 'WEBP') return 'image/webp';
  throw new HttpError(400, '请上传有效的 JPG、PNG 或 WebP 图片');
}
export async function failJob(db, jobId, message) {
  await db.prepare("UPDATE jobs SET status='failed',error=?,finished_at=? WHERE id=? AND status IN ('queued','running')").bind(message, now(), jobId).run();
}
export async function runJob(jobId, env) {
  const job = await env.DB.prepare("UPDATE jobs SET status='running',started_at=? WHERE id=? AND status='queued' RETURNING *").bind(now(), jobId).first();
  if (!job) return;
  try {
    ensure(imageReady(env), 503, '图片服务暂不可用');
    const content = [];
    for (const key of JSON.parse(job.input_keys)) {
      const object = await env.IMAGES.get(key);
      ensure(object, 500, '原图读取失败，请重新上传');
      const bytes = new Uint8Array(await object.arrayBuffer());
      content.push({ image: `data:${imageType(bytes)};base64,${Buffer.from(bytes).toString('base64')}` });
    }
    content.push({ text: job.prompt });
    const origin = new URL(env.IMAGE_API_ORIGIN || 'https://dashscope.aliyuncs.com');
    ensure(origin.protocol === 'https:' && /(^|\.)aliyuncs\.com$/.test(origin.hostname), 503, '图片服务地址配置不正确');
    const response = await fetch(new URL('/api/v1/services/aigc/multimodal-generation/generation', origin), {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${env.DASHSCOPE_API_KEY}` },
      body: JSON.stringify({ model: env.IMAGE_MODEL || 'qwen-image-2.0', input: { messages: [{ role: 'user', content }] }, parameters: { n: 1, size: job.size, prompt_extend: true, watermark: true } }),
      signal: AbortSignal.timeout(240000)
    });
    const data = JSON.parse(new TextDecoder().decode(await readLimited(response, 262144)));
    if (!response.ok) {
      const rejected = /DataInspection|Content|Safety/i.test(data.code || '');
      throw new HttpError(502, rejected ? '图片或描述未通过模型检查，请调整后重试' : '图片服务暂时未能完成合成，请稍后重试');
    }
    const imageUrl = data.output?.choices?.[0]?.message?.content?.find(v => v.image)?.image;
    ensure(imageUrl, 502, '模型未返回图片，请调整描述后重试');
    const resultUrl = new URL(imageUrl);
    ensure(resultUrl.protocol === 'https:' && /(^|\.)aliyuncs\.com$/.test(resultUrl.hostname) && !resultUrl.username && !resultUrl.password, 502, '图片返回地址不正确');
    const download = await fetch(resultUrl, { redirect: 'manual', signal: AbortSignal.timeout(45000) });
    ensure(download.ok, 502, '合成图片下载失败，请稍后重试');
    const bytes = await readLimited(download, 20 * 1024 * 1024); const type = imageType(bytes);
    const key = `${job.user_id}/${job.id}/result`;
    await env.IMAGES.put(key, bytes, { httpMetadata: { contentType: type } });
    const result = await env.DB.prepare("UPDATE jobs SET status='succeeded',result_key=?,provider_request_id=?,finished_at=? WHERE id=? AND status='running'").bind(key, String(data.request_id || '').slice(0, 128), now(), job.id).run();
    if (!result.meta.changes) await env.IMAGES.delete(key);
  } catch (e) {
    console.error(JSON.stringify({ event: 'generation_failed', jobId, kind: e.name }));
    await failJob(env.DB, job.id, e instanceof HttpError ? e.message : '合成中断，次数已返还，请重新尝试');
  }
}
export function publicJob(job) {
  return { id: job.id, prompt: job.prompt, size: job.size, status: job.status, error: job.error, createdAt: job.created_at, inputCount: JSON.parse(job.input_keys).length,
    imageUrl: job.status === 'succeeded' && job.result_key ? `/api/jobs/${job.id}/image` : null };
}
