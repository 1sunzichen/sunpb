import QRCode from 'qrcode';
import {ensure,id,json,now,readJson,readLimited,sha256,validateRequestId,HttpError} from './common.mjs';
import {createPayment,paymentReady,queryPayment,decryptWechatNotification,refreshWechatCertificates,closeWechatPayment} from './payments.mjs';
import {CATEGORIES,publicOrder,settlePrayer,completePrayer} from './orders.mjs';
import {sharePrayer,unsharePrayer,publicWall} from './wall.mjs';
const PREFIX='/pray';
async function limit(db,key,max,seconds){const bucket=Math.floor(now()/seconds);const row=await db.prepare('INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(`${key}:${bucket}`,(bucket+1)*seconds).first();ensure(row.count<=max,429,'操作有些频繁，请稍后再试');}
async function handle(request,env){
 const url=new URL(request.url);if(url.pathname===PREFIX)return Response.redirect(url.origin+PREFIX+'/',308);ensure(url.pathname.startsWith(PREFIX+'/'),404,'页面不存在');
 const path=url.pathname.slice(PREFIX.length);
 if(path==='/api/health')return json({ok:true,service:'sunpb-pray'});
 if(path==='/api/payments/wechat/notify'&&request.method==='POST'){
  const raw=new TextDecoder().decode(await readLimited(request,32768));const transaction=await decryptWechatNotification(raw,request.headers,env);await settlePrayer(env.DB,transaction,'callback');return new Response(null,{status:204});
 }
 if(!path.startsWith('/api/')){const assetUrl=new URL(request.url);assetUrl.pathname=path==='/'?'/index.html':path;return env.ASSETS.fetch(new Request(assetUrl,request));}
 if(path==='/api/config'&&request.method==='GET')return json({priceCents:100,paymentReady:env.SALES_ENABLED==='1'&&paymentReady(env,'wechat')});
 if(path==='/api/wall'&&request.method==='GET')return json(await publicWall(env.DB,url.searchParams.get('cursor')));
 if(request.method!=='GET'&&request.method!=='HEAD')ensure(request.headers.get('origin')===url.origin,403,'请从本站发起请求');
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'');ensure(/^[a-f0-9]{64}$/.test(token||''),401,'请使用原浏览器打开订单');const owner=await sha256(token);
 if(path==='/api/orders'&&request.method==='POST'){
  ensure(env.SALES_ENABLED==='1'&&paymentReady(env,'wechat'),503,'支付通道准备中，暂不收款');const body=await readJson(request,4096),requestId=validateRequestId(body.requestId);
  ensure(CATEGORIES.includes(body.category)&&/^[a-f0-9]{64}$/.test(body.wishHash||''),400,'请填写有效的祈愿内容');
  await limit(env.DB,`create:${owner}`,12,900);await limit(env.DB,`ip:${await sha256(request.headers.get('cf-connecting-ip')||'local')}`,30,900);
  await env.DB.prepare('INSERT INTO prayer_orders(id,owner_hash,request_id,category,wish_hash,amount_cents,created_at,expires_at) VALUES(?,?,?,?,?,100,?,?) ON CONFLICT(owner_hash,request_id) DO NOTHING').bind('PRAY'+id().slice(4),owner,requestId,body.category,body.wishHash,now(),now()+1800).run();
  let order=await env.DB.prepare('SELECT * FROM prayer_orders WHERE owner_hash=? AND request_id=?').bind(owner,requestId).first();
  ensure(order.wish_hash===body.wishHash&&order.category===body.category,409,'订单内容不能修改');
  if(order.status==='pending'&&!order.code_url){ensure(order.expires_at>now(),410,'订单已过期，请取消后重新许愿');const code=await createPayment({...order,provider:'wechat',description:'一念 3D 祈愿体验与祈愿笺（一次）'},env);await env.DB.prepare('UPDATE prayer_orders SET code_url=? WHERE id=?').bind(code,order.id).run();}
  return json({order:publicOrder(order)},201);
 }
 const match=/^\/api\/orders\/(PRAY[a-f0-9]{28})(?:\/(qr|refresh|complete|cancel|share|unshare))?$/.exec(path);ensure(match,404,'接口不存在');
 let order=await env.DB.prepare('SELECT * FROM prayer_orders WHERE id=? AND owner_hash=?').bind(match[1],owner).first();ensure(order,404,'未找到订单');
 const action=match[2];if(!action&&request.method==='GET')return json({order:publicOrder(order)});
 if(action==='qr'&&request.method==='GET'){ensure(order.status==='pending'&&order.code_url&&order.expires_at>now(),410,'付款码已失效，请查询订单');return new Response(await QRCode.toString(order.code_url,{type:'svg',width:280,margin:2}),{headers:{'content-type':'image/svg+xml','cache-control':'no-store','x-content-type-options':'nosniff'}});}
 ensure(request.method==='POST',405,'请求方式不正确');
 if(action==='refresh'||action==='cancel'){
  await limit(env.DB,`query:${owner}`,8,60);const transaction=await queryPayment({...order,provider:'wechat'},env);ensure(transaction.orderId===order.id,502,'微信订单响应不匹配');
  if(transaction.paid)order=await settlePrayer(env.DB,transaction,'query');
  if(action==='cancel'){ensure(order.status!=='paid',409,'此单已经付款，请查询结果并完成祈愿');await closeWechatPayment(order,env);await env.DB.prepare("UPDATE prayer_orders SET status='closed' WHERE id=? AND status='pending'").bind(order.id).run();order=await env.DB.prepare('SELECT * FROM prayer_orders WHERE id=?').bind(order.id).first();}
  return json({order:publicOrder(order)});
 }
 if(action==='complete'){const body=await readJson(request,2048);return json({ritual:await completePrayer(env.DB,order,owner,body.wishHash)});}
 if(action==='share'){await limit(env.DB,`share:${owner}`,10,60);const body=await readJson(request,2048);return json(await sharePrayer(env.DB,order,owner,body.message));}
 if(action==='unshare')return json(await unsharePrayer(env.DB,order,owner));
 throw new HttpError(404,'接口不存在');
}
export default {
 async fetch(request,env){try{const response=await handle(request,env);const result=new Response(response.body,response);result.headers.set('x-content-type-options','nosniff');result.headers.set('referrer-policy','same-origin');result.headers.set('x-frame-options','DENY');return result;}catch(error){if(!(error instanceof HttpError))console.error(JSON.stringify({event:'prayer_error',type:error.name}));else if(error.upstreamCode)console.error(JSON.stringify({event:'wechat_error',code:error.upstreamCode,status:error.upstreamStatus}));return json({error:error instanceof HttpError?error.message:'服务暂时不可用，请稍后重试'},error instanceof HttpError?error.status:500);}},
 async scheduled(_event,env,ctx){ctx.waitUntil((async()=>{await refreshWechatCertificates(env);await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(now()-3600).run();})().catch(error=>console.error(JSON.stringify({event:'prayer_maintenance_error',type:error.name}))));}
};
