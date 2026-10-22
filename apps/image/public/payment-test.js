const $ = id => document.getElementById(id);
const fragment = new URLSearchParams(location.hash.slice(1));
if (fragment.has('token')) { sessionStorage.setItem('sunpb-payment-test', fragment.get('token')); history.replaceState(null, '', location.pathname); }
const token = sessionStorage.getItem('sunpb-payment-test') || '';
let imageUrl, timer, currentOrder, busy = false;
async function call(action, method = 'GET', image = false) {
  const response = await fetch(`/ai/api/payment-test/${action}`, { method, headers: { authorization: `Bearer ${token}`, ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) }, ...(method === 'POST' ? { body: '{}' } : {}), signal: AbortSignal.timeout(25000) });
  if (image && response.ok) return response.blob();
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求未完成');
  return result;
}
async function show(order) {
  currentOrder = order; clearTimeout(timer);
  $('create').hidden = !!order && (order.hasQr || order.status === 'paid'); $('refresh').hidden = !order; $('checks').hidden = !order;
  if (!order) { $('status').textContent = '准备就绪，点击下方按钮开始。'; $('create').disabled = false; return; }
  $('order-id').textContent = `订单 ${order.id}`;
  $('paid').textContent = order.status === 'paid' ? '已确认支付 ¥0.01' : '待支付';
  $('callback').textContent = order.callbackReceived ? '已收到并验签通过 ✓' : '等待通知';
  $('query').textContent = order.queryVerified ? '已核对成功 ✓' : '尚未查询';
  $('status').textContent = order.status === 'paid' ? (order.callbackReceived ? '支付成功，公网回调已验证。' : '付款已确认，正在等待支付回调。') : order.expired ? '订单已过期，请联系维护者重新准备测试。' : '请使用手机微信扫一扫，支付 ¥0.01。';
  $('qr').hidden = order.status === 'paid' || order.expired || !order.hasQr;
  if (!$('qr').hidden && !imageUrl) { imageUrl = URL.createObjectURL(await call('qr', 'GET', true)); $('qr').src = imageUrl; }
  if (!order.callbackReceived && !order.expired && document.visibilityState === 'visible') timer = setTimeout(check, 10000);
}
function error(e) { $('error').textContent = ['AbortError','TimeoutError'].includes(e.name) ? '请求超时，结果可能已保存，请查询结果后再试。' : e.message; }
async function check() { if (busy) return; try { await show((await call('status')).order); } catch (e) { error(e); } }
async function act(action) { if (busy) return; busy = true; $('create').disabled = true; $('refresh').disabled = true; $('error').textContent = ''; try { await show((await call(action, 'POST')).order); } catch (e) { error(e); } finally { busy = false; $('create').disabled = false; $('refresh').disabled = false; } }
$('create').onclick = () => act('order'); $('refresh').onclick = () => act('refresh');
document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else if (token) check(); });
if (token) check(); else { $('status').textContent = '请使用维护者提供的专属测试链接打开。'; $('create').disabled = true; }
