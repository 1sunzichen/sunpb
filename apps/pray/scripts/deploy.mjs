import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,chmodSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8')),db=config.d1_databases[0];
if(config.name!=='sunpb-pray'||db.database_name!=='sunpb-pray'||db.database_id!=='d5e054dd-0400-44d7-a74a-7ae184993814'||config.routes.some(r=>!['sunpb.com.cn/pray','sunpb.com.cn/pray/*'].includes(r.pattern)))throw new Error('祈愿模块不得覆盖其他应用');
if(process.env.CI)throw new Error('需先配置持久私有备份再启用自动发布');
const cli=path.join(root,'node_modules/.bin/wrangler');
function run(cmd,args,privateOutput=false){const r=spawnSync(cmd,args,{encoding:'utf8',timeout:240000,maxBuffer:8*1024*1024});if(!privateOutput){process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');}if(r.status!==0||r.error)throw new Error(`${path.basename(cmd)} ${args.slice(0,2).join(' ')} 失败${privateOutput?'（私有输出已隐藏）':''}`);return r.stdout;}
const folder='.data/backups/'+new Date().toISOString().replace(/[:.]/g,'-');mkdirSync(folder,{recursive:true,mode:0o700});chmodSync(folder,0o700);
const immutable={prayer_orders:['id','owner_hash','request_id','category','wish_hash','amount_cents','created_at','expires_at'],prayer_rituals:['id','order_id','owner_hash','wish_hash','category','created_at'],prayer_messages:['id','order_id','owner_hash','category','message','created_at'],memorials:['id','owner_hash','request_id','recovery_hash','created_at']};
function backup(label){const file=path.join(folder,label+'.sql');run(cli,['d1','export',db.database_name,'--remote',`--output=${file}`],true);chmodSync(file,0o600);const sql=readFileSync(file,'utf8'),s=new DatabaseSync(':memory:');s.exec(sql);if(s.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('备份恢复验证失败');const rows={};for(const t of Object.keys(immutable))if(s.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t))rows[t]=s.prepare(`SELECT * FROM ${t}`).all();s.close();return{rows,sha256:createHash('sha256').update(sql).digest('hex')};}
try{
 run('npm',['test']);run('npm',['run','build']);run(cli,['deploy','--dry-run','--outdir','.build']);
 const before=backup('before');run(cli,['d1','migrations','apply',db.database_name,'--remote']);
 const i=process.argv.indexOf('--secrets');if(i>=0){const file=process.argv[i+1],secrets=JSON.parse(readFileSync(file,'utf8'));if(Object.keys(secrets).some(k=>!k.startsWith('WECHAT_')))throw new Error('只允许微信商户配置');run(cli,['secret','bulk',file],true);}
 run(cli,['deploy']);const after=backup('after');
 for(const[t,rows]of Object.entries(before.rows)){const next=new Map(after.rows[t].map(r=>[r.id,r]));for(const old of rows){const r=next.get(old.id);if(!r||immutable[t].some(k=>r[k]!==old[k])||(old.status==='paid'&&(r.status!=='paid'||r.transaction_id!==old.transaction_id))||old.callback_at&&!r.callback_at)throw new Error('已有祈愿或订单数据未保留');if(t==='memorials'&&(r.revision<old.revision||(r.revision===old.revision&&Object.keys(old).some(k=>r[k]!==old[k]))))throw new Error('纪念资料未完整保留');}}
 writeFileSync(path.join(folder,'manifest.json'),JSON.stringify({status:'deployed-and-verified',beforeSha256:before.sha256,afterSha256:after.sha256,verifiedAt:new Date().toISOString()},null,2)+'\n',{mode:0o600});console.log('祈愿模块发布及数据保留验证完成：'+folder);
}catch(e){console.error(e.message+'。已保留备份：'+folder);process.exitCode=1;}
