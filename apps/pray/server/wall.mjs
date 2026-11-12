import {ensure,id,now,sha256} from './common.mjs';
export async function sharePrayer(db,order,owner,message){
 ensure(order.owner_hash===owner,404,'未找到订单');ensure(order.status==='paid',409,'付款完成后才能公开祈愿');
 ensure(typeof message==='string'&&message.trim().length>0&&message.length<=120,400,'留言长度需为 1～120 字');
 ensure(await sha256(order.category+'\n'+message)===order.wish_hash,409,'只能公开这笔订单原来的心愿');
 const ritual=await db.prepare('SELECT id FROM prayer_rituals WHERE order_id=? AND owner_hash=?').bind(order.id,owner).first();ensure(ritual,409,'请先完成祈愿');
 await db.prepare('INSERT INTO prayer_messages(id,order_id,owner_hash,category,message,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(order_id) DO UPDATE SET hidden_at=NULL').bind(id(),order.id,owner,order.category,message,now()).run();
 return{shared:true};
}
export async function unsharePrayer(db,order,owner){ensure(order.owner_hash===owner,404,'未找到订单');await db.prepare('UPDATE prayer_messages SET hidden_at=? WHERE order_id=? AND owner_hash=?').bind(now(),order.id,owner).run();return{shared:false};}
export async function publicWall(db,cursor){
 let at=Number.MAX_SAFE_INTEGER,last='zzzz';if(cursor){ensure(cursor.length<=200,400,'翻页参数不正确');try{const parsed=JSON.parse(Buffer.from(cursor,'base64url').toString());at=parsed.at;last=parsed.id;}catch{ensure(false,400,'翻页参数不正确');}ensure(Number.isSafeInteger(at)&&at>0&&typeof last==='string'&&/^[a-f0-9]{32}$/.test(last),400,'翻页参数不正确');}
 const {results}=await db.prepare('SELECT id,category,message,created_at FROM prayer_messages WHERE hidden_at IS NULL AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 21').bind(at,at,last).all();
 const visible=results.slice(0,20),tail=visible.at(-1);return{messages:visible.map(r=>({id:r.id,category:r.category,message:r.message,createdAt:r.created_at})),nextCursor:results.length>20?Buffer.from(JSON.stringify({at:tail.created_at,id:tail.id})).toString('base64url'):null};
}
