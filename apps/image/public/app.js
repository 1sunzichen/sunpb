const basePath = '/ai';
const $ = selector => document.querySelector(selector);
const state = { files: [], size: '1024*1024', config: null, user: null, activeJob: null, jobs: [], quantity: 1, payment: 'wechat', order: null, authMode: 'login', creating: false, jobRequestId: null, orderRequestId: null, timer: null, checkoutTimer: null, authEpoch: 0 };
const templates = {
  product: '把图一的商品放入图二的场景中，保留商品的外观、颜色、文字和细节，调整光线、透视和阴影，使画面自然融合。',
  portrait: '将图一与图二中的人物自然地放在同一画面中，保持各自的面部特征与服装，统一光照和拍摄视角，构图像一张温暖自然的合照。',
  creative: '融合这些图片中的主体与环境，保留各自最有特点的视觉元素，创造一张构图完整、色调协调、有想象力的创意图片。'
};
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; }
let toastTimer;
function toast(text) { $('#toast').textContent = text; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500); }
async function api(path, options = {}) {
  const headers = options.body instanceof FormData ? {} : { 'content-type': 'application/json' };
  const response = await fetch(path.startsWith(basePath + '/') ? path : basePath + path, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(options.body instanceof FormData ? 60000 : 25000) });
  let body;
  try { body = await response.json(); } catch { throw new Error('服务响应异常，请稍后重试'); }
  if (!response.ok) throw Object.assign(new Error(body.error || '请求未完成，请重试'), { status: response.status });
  return body;
}
function errorText(error) { return ['TimeoutError', 'AbortError'].includes(error.name) ? '网络响应超时。请求可能已提交，请查询记录后重试。' : error.message || '网络连接失败，请稍后重试'; }
function updateAccount() {
  $('#balance-label').textContent = state.user ? `${state.user.credits} 次可用` : '购买次数';
  $('#account-button').textContent = state.user ? state.user.username : '登录 / 注册 ↗';
  $('#account-name').textContent = state.user?.username || '';
  $('#account-credits').textContent = `当前有 ${state.user?.credits || 0} 次合成机会`;
  $('#generate-button').disabled = state.creating || !state.config?.generationReady;
}
async function bootstrap() {
  try {
    state.config = await api('/api/bootstrap'); state.user = state.config.user; updateAccount();
    if (!state.config.generationReady) { $('#service-notice').textContent = '合成服务准备中 · 你可以先添加素材、编辑合成要求。开放后即可生成图片。'; $('#service-notice').hidden = false; }
    else { $('#service-notice').hidden = true; }
    if (state.user) await loadHistory(false);
  } catch (error) { $('#service-notice').textContent = `连接服务失败：${errorText(error)}`; $('#service-notice').hidden = false; updateAccount(); }
}
function setAuthMode(mode) {
  state.authMode = mode; $('#login-mode').classList.toggle('selected', mode === 'login'); $('#register-mode').classList.toggle('selected', mode === 'register');
  $('#auth-submit').textContent = mode === 'login' ? '登录' : '创建账号'; $('#password').autocomplete = mode === 'login' ? 'current-password' : 'new-password'; $('#auth-error').textContent = '';
}
function openAuth() { setAuthMode('login'); $('#auth-dialog').showModal(); }
$('#login-mode').onclick = () => setAuthMode('login'); $('#register-mode').onclick = () => setAuthMode('register');
$('#account-button').onclick = () => state.user ? $('#account-dialog').showModal() : openAuth();
$('#auth-form').onsubmit = async event => {
  event.preventDefault(); $('#auth-error').textContent = ''; $('#auth-submit').disabled = true;
  try {
    const result = await api(`/api/auth/${state.authMode}`, { method: 'POST', body: JSON.stringify({ username: $('#username').value, password: $('#password').value }) });
    state.authEpoch++; state.user = result.user; updateAccount(); $('#auth-dialog').close(); $('#password').value = ''; toast('已登录，继续你的创作'); await loadHistory(false);
  } catch (error) { $('#auth-error').textContent = errorText(error); }
  finally { $('#auth-submit').disabled = false; }
};
$('#logout-button').onclick = async () => {
  try {
    await api('/api/auth/logout', { method: 'POST', body: '{}' }); state.authEpoch++; state.user = null; state.jobs = []; state.activeJob = null; state.order = null;
    clearTimeout(state.timer); clearTimeout(state.checkoutTimer); $('#account-dialog').close(); resetCanvas(); updateAccount(); renderHistory(); toast('已退出登录');
  } catch (error) { toast(errorText(error)); }
};
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => document.getElementById(button.dataset.close).close());
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } }));
async function addFiles(files) {
  for (const file of files) {
    if (state.files.length >= 3) { toast('最多添加 3 张图片'); break; }
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) { toast('请上传 JPG、PNG 或 WebP 图片'); continue; }
    if (file.size > 5 * 1024 * 1024) { toast('单张图片不能超过 5 MB'); continue; }
    const url = URL.createObjectURL(file);
    try { const image = new Image(); image.src = url; await image.decode(); state.files.push({ file, url }); }
    catch { URL.revokeObjectURL(url); toast('无法读取这张图片，请更换文件'); }
  }
  state.jobRequestId = null; renderFiles();
}
function renderFiles() {
  $('#thumb-list').replaceChildren(); $('#file-count').textContent = `${state.files.length} / 3 张`;
  state.files.forEach((item, index) => {
    const wrapper = el('div', 'thumb'); const img = el('img'); img.src = item.url; img.alt = `图${index + 1}：${item.file.name}`;
    const remove = el('button', '', '×'); remove.setAttribute('aria-label', `移除图${index + 1}`);
    remove.onclick = () => { URL.revokeObjectURL(item.url); state.files.splice(index, 1); state.jobRequestId = null; renderFiles(); };
    wrapper.append(img, el('span', '', `图${['一','二','三'][index]}`), remove); $('#thumb-list').append(wrapper);
  });
  $('#upload-button').disabled = state.files.length >= 3;
}
$('#upload-button').onclick = () => $('#files').click();
$('#files').onchange = async event => { await addFiles([...event.target.files]); event.target.value = ''; };
['dragenter', 'dragover'].forEach(name => $('#drop-zone').addEventListener(name, event => { event.preventDefault(); $('#drop-zone').classList.add('dragging'); }));
['dragleave', 'drop'].forEach(name => $('#drop-zone').addEventListener(name, event => { event.preventDefault(); $('#drop-zone').classList.remove('dragging'); }));
$('#drop-zone').addEventListener('drop', event => addFiles([...event.dataTransfer.files]));
$('#prompt').oninput = () => { $('#prompt-count').textContent = `${$('#prompt').value.length} / 1500`; state.jobRequestId = null; };
document.querySelectorAll('[data-template]').forEach(button => button.onclick = () => { $('#prompt').value = templates[button.dataset.template]; $('#prompt').oninput(); $('#prompt').focus(); });
document.querySelectorAll('[data-size]').forEach(button => button.onclick = () => {
  state.size = button.dataset.size; state.jobRequestId = null;
  document.querySelectorAll('[data-size]').forEach(item => { item.classList.toggle('selected', item === button); item.setAttribute('aria-pressed', String(item === button)); });
});
function resetCanvas() { $('#canvas-empty').hidden = false; $('#result-image').hidden = true; $('#result-image').removeAttribute('src'); $('#job-state').hidden = true; $('#download-button').hidden = true; $('#canvas-code').hidden = false; $('#canvas-label').textContent = '等待你的灵感'; $('#result-description').textContent = '素材 + 想法 = 新的可能'; }
function renderJob(job) {
  state.activeJob = job; $('#canvas-empty').hidden = true; $('#job-state').hidden = true; $('#result-image').hidden = true; $('#download-button').hidden = true; $('#canvas-code').hidden = true;
  if (job.status === 'succeeded' && job.imageUrl) {
    const image = $('#result-image'); if (image.getAttribute('src') !== job.imageUrl) image.src = job.imageUrl; image.hidden = false;
    $('#canvas-label').textContent = '合成完成'; $('#result-description').textContent = '为你的灵感，保存这一刻。';
    $('#download-button').href = `${job.imageUrl}?download=1`; $('#download-button').hidden = false;
  } else {
    $('#job-state').hidden = false; $('#job-state').replaceChildren();
    const failed = job.status === 'failed' || job.status === 'succeeded';
    $('#job-state').append(el('span', failed ? 'failure-symbol' : 'spinner', failed ? '↻' : ''));
    $('#job-state').append(el('h3', '', failed ? job.status === 'succeeded' ? '作品已到保存期限' : '这次没能完成合成' : job.status === 'queued' ? '素材已就位，准备创作。' : '正在把你的想法变成画面。'));
    $('#job-state').append(el('p', '', failed ? job.error || '作品已超过 30 天保存期。你可以开始新的创作。' : 'AI 正在处理图片，通常需要一到几分钟。你可以稍后在「我的作品」中查看。'));
    if (!failed) $('#job-state').append(el('small', '', '无需重复提交，离开页面也会继续处理。'));
    $('#canvas-label').textContent = failed ? '未完成 / 已到期' : job.status === 'queued' ? '排队中' : '合成中';
    $('#result-description').textContent = failed ? job.status === 'failed' ? '本次合成次数已返还' : '请及时下载喜欢的作品' : '每个想法，都值得一点等待。';
  }
}
$('#generate-button').onclick = async () => {
  if (!state.user) return openAuth();
  if (!state.files.length) return toast('先添加至少一张图片');
  if ($('#prompt').value.trim().length < 4) { $('#prompt').focus(); return toast('描述一下你希望如何合成图片'); }
  if (state.user.credits < 1) return openPurchase();
  state.creating = true; updateAccount(); const epoch = state.authEpoch;
  const form = new FormData(); if (!state.jobRequestId) state.jobRequestId = crypto.randomUUID();
  form.set('requestId', state.jobRequestId); form.set('prompt', $('#prompt').value.trim()); form.set('size', state.size); state.files.forEach(item => form.append('images', item.file));
  try {
    const { job } = await api('/api/jobs', { method: 'POST', body: form }); if (epoch !== state.authEpoch) return;
    renderJob(job); await loadHistory(false); pollJobs();
    if (window.innerWidth < 780) $('#canvas').scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (['failed','succeeded'].includes(job.status)) state.jobRequestId = null;
  } catch (error) { toast(errorText(error)); if (error.status === 401) openAuth(); }
  finally { state.creating = false; updateAccount(); }
};
async function loadHistory(render = true) {
  if (!state.user) { if (render) renderHistory(); return; }
  const epoch = state.authEpoch; const result = await api('/api/jobs'); if (epoch !== state.authEpoch) return;
  state.jobs = result.jobs; state.user.credits = result.credits; updateAccount(); if (render) renderHistory();
  if (!state.activeJob) { const running = state.jobs.find(job => ['queued','running'].includes(job.status)); if (running) renderJob(running); }
  if (state.jobs.some(job => ['queued','running'].includes(job.status))) pollJobs();
}
function pollJobs() {
  clearTimeout(state.timer); if (!state.user || document.hidden) return;
  state.timer = setTimeout(async () => {
    try {
      await loadHistory(!$('#history-view').hidden);
      if (state.activeJob) { const latest = state.jobs.find(job => job.id === state.activeJob.id); if (latest) { renderJob(latest); if (['succeeded','failed'].includes(latest.status)) state.jobRequestId = null; } }
    } catch { if (state.user) pollJobs(); }
  }, 5000);
}
function setView(history) {
  $('#studio-view').hidden = history; $('#studio-intro').hidden = history; $('#below-workspace').hidden = history; $('#history-view').hidden = !history;
  $('#studio-tab').classList.toggle('active', !history); $('#history-tab').classList.toggle('active', history);
  if (history) loadHistory().catch(error => toast(errorText(error)));
}
$('#studio-tab').onclick = $('#back-studio').onclick = () => setView(false);
$('#history-tab').onclick = () => setView(true);
function renderHistory() {
  const list = $('#history-list'); list.replaceChildren();
  if (!state.user || !state.jobs.length) {
    const empty = el('div', 'empty-history', state.user ? '还没有作品。添加几张图片，开始第一次创作吧。' : '登录后，就能在这里找到你的作品。');
    if (!state.user) { const button = el('button', 'text-button', '登录 / 注册'); button.onclick = openAuth; empty.append(el('br'), button); }
    list.append(empty); return;
  }
  for (const job of state.jobs) {
    const card = el('article', 'history-card'), preview = el('div', 'history-preview');
    if (job.status === 'succeeded' && job.imageUrl) { const img = el('img'); img.src = job.imageUrl; img.alt = job.prompt; img.loading = 'lazy'; preview.append(img); }
    else { if (['queued','running'].includes(job.status)) preview.append(el('span', 'spinner')); preview.append(el('span', '', ({ queued: '排队中', running: '合成中', failed: '未完成 · 次数已返还', succeeded: '已超过保存期限' })[job.status])); }
    const body = el('div', 'history-card-body'); body.append(el('p', '', job.prompt), el('small', '', new Date(job.createdAt * 1000).toLocaleString('zh-CN')));
    const actions = el('div', 'history-card-actions'); const view = el('button', '', '查看作品 ↗'); view.onclick = () => { setView(false); renderJob(job); }; actions.append(view);
    if (job.imageUrl) { const download = el('a', '', '下载 ↓'); download.href = `${job.imageUrl}?download=1`; actions.append(download); }
    body.append(actions); card.append(preview, body); list.append(card);
  }
}
function renderPurchase() {
  $('#packages').replaceChildren();
  for (const count of [1, 10, 30]) {
    const button = el('button', `package${state.quantity === count ? ' selected' : ''}`);
    button.append(el('strong', '', `${count}`), el('small', '', '次合成'), el('span', '', `¥${((state.config?.priceCents || 100) * count / 100).toFixed(2)}`));
    button.setAttribute('aria-label', `购买 ${count} 次`); button.onclick = () => { state.quantity = count; state.orderRequestId = null; renderPurchase(); }; $('#packages').append(button);
  }
  const methods = state.config?.methods || [];
  document.querySelectorAll('input[name=payment]').forEach(input => {
    input.disabled = !methods.includes(input.value); $(`#${input.value}-status`).textContent = input.disabled ? '待开放' : '';
  });
  if (!methods.includes(state.payment)) state.payment = methods[0] || 'wechat';
  document.querySelectorAll('input[name=payment]').forEach(input => { input.checked = input.value === state.payment; });
  $('#checkout-button').disabled = !methods.length || !state.config?.salesEnabled;
  $('#checkout-button').textContent = '创建支付订单';
  $('#payment-notice').textContent = methods.length ? '到账后自动增加次数。合成失败会返还次数；购买记录可随时查询。' : '收款服务准备中，暂不接受付款。显示价格为待上线配置，正式购买时以订单金额为准。';
}
function openPurchase() {
  if (!state.user) return openAuth();
  $('#account-dialog').close(); $('#pay-error').textContent = ''; $('#purchase-select').hidden = false; $('#checkout-view').hidden = true; renderPurchase(); $('#pay-dialog').showModal();
}
$('#buy-button').onclick = $('#account-buy').onclick = openPurchase;
document.querySelectorAll('input[name=payment]').forEach(input => input.onchange = () => { state.payment = input.value; state.orderRequestId = null; });
function showOrder(order) {
  state.order = order; $('#purchase-select').hidden = true; $('#checkout-view').hidden = false;
  $('#payment-code').hidden = !order.qrUrl || order.expired || order.status === 'paid';
  if (order.qrUrl && !order.expired && order.status !== 'paid') $('#payment-code').src = order.qrUrl;
  $('.payment-code-wrap').hidden = $('#payment-code').hidden;
  $('#payment-link').hidden = !order.checkoutUrl || order.expired || order.status === 'paid';
  if (order.checkoutUrl) $('#payment-link').href = order.checkoutUrl;
  $('#payment-total').textContent = `¥${(order.amountCents / 100).toFixed(2)} · ${order.credits} 次`;
  $('#payment-status').textContent = order.status === 'paid' ? '支付成功，合成次数已到账' : order.expired ? '付款入口已到期。如果已经付款，请查询结果。' : order.provider === 'wechat' ? '请用微信扫码支付' : '请打开支付宝收银台完成付款';
  $('#payment-help').textContent = order.provider === 'wechat' ? '请使用另一台设备扫码。付款码 15 分钟内有效。' : '收银台在新标签页打开，完成后回到这里查询。订单 15 分钟内有效。';
  $('#payment-help').hidden = order.status === 'paid';
  $('#refresh-payment').hidden = order.status === 'paid';
  if (order.status === 'pending' && !order.expired) pollPayment(); else clearTimeout(state.checkoutTimer);
}
$('#checkout-button').onclick = async () => {
  $('#checkout-button').disabled = true; $('#pay-error').textContent = '';
  if (!state.orderRequestId) state.orderRequestId = crypto.randomUUID();
  const epoch = state.authEpoch;
  try {
    const { order } = await api('/api/orders', { method: 'POST', body: JSON.stringify({ requestId: state.orderRequestId, quantity: state.quantity, provider: state.payment }) });
    if (epoch === state.authEpoch) showOrder(order);
  } catch (error) { $('#pay-error').textContent = errorText(error); }
  finally { renderPurchase(); }
};
async function refreshOrder(force = false) {
  if (!state.order || !state.user) return;
  const epoch = state.authEpoch;
  const result = await api(`/api/orders/${state.order.id}${force ? '/refresh' : ''}`, force ? { method: 'POST', body: '{}' } : {});
  if (epoch !== state.authEpoch) return;
  state.user.credits = result.credits; updateAccount(); showOrder(result.order);
}
function pollPayment() {
  clearTimeout(state.checkoutTimer); if (!$('#pay-dialog').open || document.hidden) return;
  state.checkoutTimer = setTimeout(async () => { try { await refreshOrder(false); } catch { pollPayment(); } }, 5000);
}
$('#refresh-payment').onclick = async () => {
  $('#refresh-payment').disabled = true; $('#pay-error').textContent = '';
  try { await refreshOrder(true); if (state.order.status !== 'paid') $('#pay-error').textContent = '尚未查询到成功付款，请稍等片刻再查询。'; }
  catch (error) { $('#pay-error').textContent = errorText(error); }
  finally { $('#refresh-payment').disabled = false; }
};
$('#new-order').onclick = () => { clearTimeout(state.checkoutTimer); state.orderRequestId = null; state.order = null; $('#purchase-select').hidden = false; $('#checkout-view').hidden = true; $('#pay-error').textContent = ''; };
$('#pay-dialog').addEventListener('close', () => clearTimeout(state.checkoutTimer));
$('#orders-button').onclick = async () => {
  if (!state.user) return openAuth();
  try {
    const { orders } = await api('/api/orders'); $('#order-list').replaceChildren();
    if (!orders.length) $('#order-list').append(el('p', 'empty-history', '还没有购买记录。'));
    for (const order of orders) {
      const row = el('div', 'order-row'), summary = el('div', '', `${order.credits} 次合成 · ¥${(order.amountCents / 100).toFixed(2)}`);
      summary.append(el('small', '', `${order.provider === 'wechat' ? '微信' : '支付宝'} · ${order.id.slice(-8)}`)); row.append(summary);
      if (order.status === 'paid') row.append(el('span', '', '已到账'));
      else { const button = el('button', '', order.expired ? '查询结果' : '继续支付 / 查询'); button.onclick = () => { $('#orders-dialog').close(); $('#pay-dialog').showModal(); showOrder(order); }; row.append(button); }
      $('#order-list').append(row);
    }
    $('#orders-dialog').showModal();
  } catch (error) { toast(errorText(error)); }
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearTimeout(state.timer); clearTimeout(state.checkoutTimer); }
  else { if (state.jobs.some(job => ['queued','running'].includes(job.status))) pollJobs(); if (state.order?.status === 'pending') pollPayment(); }
});
bootstrap();
