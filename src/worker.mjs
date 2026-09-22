import { createApi } from './api.mjs';
import { D1Store } from './d1-store.mjs';
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith('/api/')) {
      if (!env.DB) return Response.json({ error: '学习服务尚未配置，请联系站点维护者。' }, { status: 503 });
      return createApi(new D1Store(env.DB))(request);
    }
    return env.ASSETS.fetch(request);
  }
};
