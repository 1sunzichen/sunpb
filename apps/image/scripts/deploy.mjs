import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
const closePaymentTest = process.argv.includes('--close-payment-test');
if (closePaymentTest && (config.vars?.PAYMENT_TEST_ENABLED !== '0' || process.argv.includes('--secrets'))) throw new Error('收尾发布必须关闭测试开关，且不能同时导入测试密钥。');
const db = config.d1_databases?.[0];
if (config.name !== 'sunpb-image' || db?.database_name !== 'sunpb-image' || !db.database_id || db.database_id.startsWith('00000000') || db.database_id === 'ad9a4e6b-4764-466f-a88f-416739a2d37c') throw new Error('必须绑定 sunpb-image 独立数据库，禁止替换或访问自习室数据库。');
if (!config.routes?.length || config.routes.some(route => route.custom_domain || !['sunpb.com.cn/ai/*','sunpb.com.cn/ai'].includes(route.pattern))) throw new Error('图片模块只允许挂载 /ai，禁止覆盖原站。');
if (process.env.CI) throw new Error('自动部署须先配置持久私有备份。目前请在本机执行 npm run deploy。');
const cli = path.join(root, 'node_modules/.bin/wrangler');
function run(cmd,args,privateOutput=false) {
  const result=spawnSync(cmd,args,{encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
  if(!privateOutput){if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);}
  if(result.status!==0||result.error)throw new Error(`${path.basename(cmd)} ${args.slice(0,2).join(' ')} 失败，停止发布。${privateOutput?'私有输出已隐藏。':''}`);
  return result.stdout;
}
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const folder=path.join('.data/backups',stamp);mkdirSync(folder,{recursive:true,mode:0o700});chmodSync(folder,0o700);
const tables={users:['id','username','password_hash','created_at'],orders:['id','user_id','request_id','provider','amount_cents','credits','created_at','expires_at'],jobs:['id','user_id','request_id','prompt','size','cost','created_at'],credit_ledger:['id','user_id','delta','reason','reference_id','created_at'],payment_test_orders:['id','run_hash','provider','amount_cents','created_at','expires_at']};
function backup(label) {
  const sqlFile=path.join(folder,`${label}.sql`);run(cli,['d1','export',db.database_name,'--remote',`--output=${sqlFile}`],true);chmodSync(sqlFile,0o600);
  const sql=readFileSync(sqlFile,'utf8'),sqlite=new DatabaseSync(':memory:');sqlite.exec(sql);
  if(sqlite.prepare('PRAGMA quick_check').get().quick_check!=='ok')throw new Error('备份恢复验证失败');
  const snapshot={};for(const table of Object.keys(tables))if(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))snapshot[table]=sqlite.prepare(`SELECT * FROM ${table}`).all();
  sqlite.close();return {snapshot,sha256:createHash('sha256').update(sql).digest('hex')};
}
try {
  run('npm',['run','check']);run('npm',['test']);run('npm',['run','build']);
  const before=backup('before');
  run(cli,['d1','migrations','apply',db.database_name,'--remote']);
  const secretIndex=process.argv.indexOf('--secrets');
  if(secretIndex>=0){const file=process.argv[secretIndex+1];if(!file)throw new Error('缺少私有 secrets 文件');const secrets=JSON.parse(readFileSync(file,'utf8'));if(Object.keys(secrets).some(key=>!key.startsWith('WECHAT_')&&!['PAYMENT_TEST_TOKEN','DASHSCOPE_API_KEY'].includes(key)))throw new Error('图片模块 secrets 字段不正确');run(cli,['secret','bulk',file],true);}
  run(cli,['deploy']);
  if (closePaymentTest) {
    const secretNames = () => JSON.parse(run(cli,['secret','list','--format','json'],true)).map(item=>item.name);
    if (secretNames().includes('PAYMENT_TEST_TOKEN')) run(cli,['secret','delete','PAYMENT_TEST_TOKEN'],true);
    if (secretNames().includes('PAYMENT_TEST_TOKEN')) throw new Error('测试入口已禁用，但临时测试密钥未撤销；请重试收尾发布。');
  }
  const after=backup('after');
  for(const [table,rows]of Object.entries(before.snapshot)){const next=new Map((after.snapshot[table]||[]).map(row=>[row.id,row]));for(const row of rows){const current=next.get(row.id);if(!current||tables[table].some(key=>row[key]!==current[key]))throw new Error(`${table} 原始数据未保留`);if(row.status==='paid'&&(current.status!=='paid'||row.transaction_id!==current.transaction_id))throw new Error('已付款记录校验失败');}}
  writeFileSync(path.join(folder,'manifest.json'),JSON.stringify({status:'deployed-and-verified',database:db.database_name,beforeSha256:before.sha256,afterSha256:after.sha256,verifiedAt:new Date().toISOString(),paymentTestClosed:closePaymentTest},null,2)+'\n',{mode:0o600});
  console.log('独立图片模块发布完成，完整备份及原始账户、订单、账本校验通过。备份位置：'+folder);
} catch(error){console.error(error.message+' 备份保留在 '+folder+'，不会自动覆盖数据库。');process.exitCode=1;}
