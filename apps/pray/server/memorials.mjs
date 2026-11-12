import {ensure,id,now,sha256,validateRequestId} from './common.mjs';
const FIELDS='id,kind,name,relationship,birth_date,death_date,epitaph,is_public,revision,created_at,updated_at';
function text(value,max,required=false){ensure(typeof value==='string'&&value.length<=max&&(!required||value.trim()),400,`请填写有效内容（最多 ${max} 字）`);return value.trim();}
function date(value){if(!value)return '';ensure(typeof value==='string'&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value&&value<=new Date(Date.now()+8*3600000).toISOString().slice(0,10),400,'请填写真实的过往日期');return value;}
export function validatePhoto(photo){
 if(photo===null||photo==='')return null;
 ensure(typeof photo==='string'&&photo.length<=246000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo),400,'照片格式不正确，请重新选择照片');
 const bytes=Buffer.from(photo.slice(23),'base64');ensure(bytes.length<=180*1024&&bytes.length>20&&bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217,400,'照片过大或无法识别');
 let offset=2,valid=false;
 while(offset+8<bytes.length){if(bytes[offset]!==255)break;const marker=bytes[offset+1];if(marker===218||marker===217)break;const size=bytes.readUInt16BE(offset+2);if(size<2||offset+2+size>bytes.length)break;if([192,193,194].includes(marker)){const h=bytes.readUInt16BE(offset+5),w=bytes.readUInt16BE(offset+7);ensure(w>0&&h>0&&w<=1024&&h<=1024,400,'照片尺寸过大，请重新上传');valid=true;break;}offset+=2+size;}
 ensure(valid,400,'照片无法识别，请重新选择');return photo;
}
export function validateMemorial(body){
 ensure(['person','pet','animal'].includes(body.kind),400,'请选择纪念对象');ensure(body.deceasedConfirmed===true,400,'请确认此页用于纪念已离世的人或动物');ensure(typeof body.isPublic==='boolean',400,'请选择可见范围');
 const birth=date(body.birthDate),death=date(body.deathDate);ensure(!birth||!death||birth<=death,400,'离世日期不能早于出生日期');
 return{kind:body.kind,name:text(body.name,40,true),relationship:text(body.relationship??'',40),birth,death,epitaph:text(body.epitaph??'',80),story:text(body.story,5000,true),photo:validatePhoto(body.photo??null),isPublic:body.isPublic?1:0};
}
export function memorialDto(row,canEdit=false,detail=true){return{id:row.id,kind:row.kind,name:row.name,relationship:row.relationship,birthDate:row.birth_date,deathDate:row.death_date,epitaph:row.epitaph,isPublic:!!row.is_public,revision:row.revision,createdAt:row.created_at,updatedAt:row.updated_at,canEdit,...(detail?{story:row.story,photo:row.photo}: {})};}
async function canManage(row,owner,key){return !!row&&(!!owner&&row.owner_hash===owner||/^[a-f0-9]{64}$/.test(key||'')&&row.recovery_hash===await sha256(key));}
export async function getMemorial(db,recordId,owner,key){const row=await db.prepare('SELECT * FROM memorials WHERE id=?').bind(recordId).first();const editable=await canManage(row,owner,key);ensure(row&&(row.is_public||editable),404,'未找到这份纪念，私密记录需要管理凭证');return{row,editable};}
export async function createMemorial(db,owner,body){
 const requestId=validateRequestId(body.requestId);ensure(/^[a-f0-9]{64}$/.test(body.recoveryKey||''),400,'请重新打开创建窗口');const v=validateMemorial(body);
 const existing=await db.prepare('SELECT * FROM memorials WHERE owner_hash=? AND request_id=?').bind(owner,requestId).first();if(existing){ensure(existing.recovery_hash===await sha256(body.recoveryKey),409,'创建凭证不一致');ensure(JSON.stringify(v)===JSON.stringify(validateMemorial({...memorialDto(existing,true),deceasedConfirmed:true})),409,'这份纪念已经保存，请从“我的纪念”打开后编辑，避免重复创建');return memorialDto(existing,true);}
 const recovery=await sha256(body.recoveryKey),recordId=id(),time=now();
 await db.prepare(`INSERT INTO memorials(id,owner_hash,request_id,recovery_hash,kind,name,relationship,birth_date,death_date,epitaph,story,photo,is_public,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM memorials WHERE owner_hash=?)<20 ON CONFLICT(owner_hash,request_id) DO NOTHING`).bind(recordId,owner,requestId,recovery,v.kind,v.name,v.relationship,v.birth,v.death,v.epitaph,v.story,v.photo,v.isPublic,time,time,owner).run();
 const row=await db.prepare('SELECT * FROM memorials WHERE owner_hash=? AND request_id=?').bind(owner,requestId).first();ensure(row,409,'每个浏览器暂可保存 20 份纪念');ensure(row.recovery_hash===recovery,409,'创建凭证不一致');return memorialDto(row,true);
}
export async function updateMemorial(db,recordId,owner,key,body){
 const {row,editable}=await getMemorial(db,recordId,owner,key);ensure(editable,403,'只有创建者或持有管理凭证的人可以修改');ensure(Number.isSafeInteger(body.revision)&&body.revision>0,400,'请重新打开纪念页');const v=validateMemorial(body);
 const next=await db.prepare(`UPDATE memorials SET kind=?,name=?,relationship=?,birth_date=?,death_date=?,epitaph=?,story=?,photo=?,is_public=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=? RETURNING *`).bind(v.kind,v.name,v.relationship,v.birth,v.death,v.epitaph,v.story,v.photo,v.isPublic,now(),row.id,body.revision).first();ensure(next,409,'这份纪念已在另一处修改，请重新打开后编辑');return memorialDto(next,true);
}
export async function listMemorials(db,owner,cursor){
 if(owner){const {results}=await db.prepare(`SELECT ${FIELDS} FROM memorials WHERE owner_hash=? ORDER BY created_at DESC,id DESC LIMIT 20`).bind(owner).all();return{memorials:results.map(r=>memorialDto(r,true,false)),nextCursor:null};}
 let at=Number.MAX_SAFE_INTEGER,last='zzzz';if(cursor){ensure(cursor.length<=200,400,'翻页参数不正确');try{const c=JSON.parse(Buffer.from(cursor,'base64url').toString());at=c.at;last=c.id;}catch{ensure(false,400,'翻页参数不正确');}ensure(Number.isSafeInteger(at)&&at>0&&/^[a-f0-9]{32}$/.test(last),400,'翻页参数不正确');}
 const {results}=await db.prepare(`SELECT ${FIELDS} FROM memorials WHERE is_public=1 AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 13`).bind(at,at,last).all(),visible=results.slice(0,12),tail=visible.at(-1);return{memorials:visible.map(r=>memorialDto(r,false,false)),nextCursor:results.length>12?Buffer.from(JSON.stringify({at:tail.created_at,id:tail.id})).toString('base64url'):null};
}
