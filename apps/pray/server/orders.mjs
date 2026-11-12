import {ensure,id,now} from './common.mjs';
export const CATEGORIES=['考试顺利','升学上岸','学业有成','平安顺遂'];
export const publicOrder=o=>({id:o.id,amountCents:o.amount_cents,status:o.status,expiresAt:o.expires_at,category:o.category,createdAt:o.created_at});
export async function settlePrayer(db,transaction,source){
 ensure(transaction.provider==='wechat'&&transaction.paid&&transaction.amountCents===100&&typeof transaction.transactionId==='string'&&transaction.transactionId.length>0&&transaction.transactionId.length<128,400,'支付结果或金额不匹配');
 const order=await db.prepare('SELECT * FROM prayer_orders WHERE id=?').bind(transaction.orderId).first();
 ensure(order&&order.amount_cents===100,400,'订单不存在或金额不匹配');
 ensure(!order.transaction_id||order.transaction_id===transaction.transactionId,409,'订单交易冲突');
 const column=source==='callback'?'callback_at':'query_at';
 await db.prepare(`UPDATE prayer_orders SET status='paid',transaction_id=?,paid_at=COALESCE(paid_at,?),${column}=COALESCE(${column},?) WHERE id=? AND (transaction_id IS NULL OR transaction_id=?)`).bind(transaction.transactionId,now(),now(),order.id,transaction.transactionId).run();
 const saved=await db.prepare('SELECT * FROM prayer_orders WHERE id=?').bind(order.id).first();ensure(saved.transaction_id===transaction.transactionId,409,'订单交易冲突');return saved;
}
export async function completePrayer(db,order,owner,wishHash){
 ensure(order.owner_hash===owner,404,'未找到订单');ensure(order.status==='paid',409,'请先完成付款并确认到账');ensure(order.wish_hash===wishHash,409,'该笔付款只对应原先的心愿，请恢复原订单');
 await db.prepare("INSERT INTO prayer_rituals(id,order_id,owner_hash,wish_hash,category,created_at) SELECT ?,id,owner_hash,wish_hash,category,? FROM prayer_orders WHERE id=? AND owner_hash=? AND status='paid' ON CONFLICT(order_id) DO NOTHING").bind(id(),now(),order.id,owner).run();
 const ritual=await db.prepare('SELECT * FROM prayer_rituals WHERE order_id=? AND owner_hash=?').bind(order.id,owner).first();ensure(ritual,409,'祈愿记录暂未生成，请重试');return{id:ritual.id,createdAt:ritual.created_at,category:ritual.category};
}
