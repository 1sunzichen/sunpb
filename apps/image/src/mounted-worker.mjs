import worker from './worker.mjs';

// This Worker owns only /ai. The study Worker and its database remain separate.
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url), base = env.APP_BASE_PATH || '/ai';
    if (url.pathname === base) return Response.redirect(url.origin + base + '/', 308);
    if (!url.pathname.startsWith(base + '/')) return new Response('Not found', { status: 404 });
    url.pathname = url.pathname.slice(base.length);
    if (url.pathname === '/') url.pathname = '/index.html';
    if (url.pathname === '/payment-test' || url.pathname === '/payment-test/') url.pathname = '/payment-test.html';
    const response = await worker.fetch(new Request(url, request), env, ctx);
    if (!response.headers.get('content-type')?.includes('application/json')) return response;
    const value = await response.json();
    const mount = item => {
      if (Array.isArray(item)) return item.map(mount);
      if (!item || typeof item !== 'object') return item;
      return Object.fromEntries(Object.entries(item).map(([key, val]) => [key,
        ['qrUrl', 'checkoutUrl', 'imageUrl'].includes(key) && typeof val === 'string' && val.startsWith('/api/') ? base + val : mount(val)]));
    };
    const headers = new Headers(response.headers); headers.delete('content-length');
    return new Response(JSON.stringify(mount(value)), { status: response.status, headers });
  },
  queue: worker.queue,
  scheduled: worker.scheduled
};
