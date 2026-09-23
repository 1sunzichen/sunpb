import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApi } from '../src/api.mjs';
import { JsonStore } from '../src/json-store.mjs';
import { D1Store } from '../src/d1-store.mjs';
import { lessons, publicCurriculum, summarize } from '../src/curriculum.mjs';

function client(api) {
  let cookie='';
  return async(route,body,extra={})=>{
    const response=await api(new Request('https://study.test/api/'+route,{method:body===undefined?'GET':'POST',headers:{cookie,origin:'https://study.test',...(body===undefined?{}:{'content-type':'application/json'}),...extra},...(body===undefined?{}:{body:JSON.stringify(body)})}));
    if(response.headers.has('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    return {status:response.status,headers:response.headers,data:await response.json()};
  };
}
async function exerciseStore(store){
 const api=createApi(store),alice=client(api),bob=client(api);
 const session=await alice('session',{});assert.equal(session.data.score,0);assert.match(session.headers.get('set-cookie'),/HttpOnly/);assert.match(session.headers.get('set-cookie'),/Secure/);assert.ok(!('session_hash' in session.data));
 assert.equal((await alice('session',{})).data.id,session.data.id);
 await bob('session',{});
 const lesson=lessons[0],q=lesson.questions[0];
 assert.equal((await alice('answer',{lessonId:lesson.id,questionId:q.id,choice:(q.answer+1)%4})).data.me.score,0);
 assert.equal((await alice('answer',{lessonId:lesson.id,questionId:q.id,choice:q.answer})).data.awarded,10);
 assert.equal((await alice('answer',{lessonId:lesson.id,questionId:q.id,choice:q.answer})).data.awarded,0);
 await Promise.all(Array.from({length:8},()=>alice('answer',{lessonId:lesson.id,questionId:q.id,choice:q.answer})));
 assert.equal((await alice('me')).data.score,10);
 for(const item of lesson.questions.slice(1))await alice('answer',{lessonId:lesson.id,questionId:item.id,choice:item.answer});
 assert.equal((await alice('me')).data.score,70);assert.deepEqual((await alice('me')).data.completed,[lesson.id]);
 assert.equal((await bob('me')).data.score,0);
 assert.equal((await alice('answer',{lessonId:lesson.id,questionId:q.id,choice:(q.answer+1)%4})).data.me.score,70);
 const board=(await alice('leaderboard')).data;assert.equal(board.entries.length,1);assert.equal(board.entries[0].score,70);assert.equal(board.myRank,1);
 assert.equal((await bob('leaderboard')).data.myRank,null);assert.ok(!JSON.stringify(board).includes('session_hash'));
 assert.deepEqual((await alice('me')).data.review,[q.id], 'a formerly correct question can need review again');
 const reviewed=await alice('answer',{lessonId:lesson.id,questionId:q.id,choice:q.answer});
 assert.deepEqual(reviewed.data.me.review,[]);assert.equal(reviewed.data.awarded,0);assert.equal(reviewed.data.me.score,70);
 const concurrent=await Promise.all(Array.from({length:8},()=>bob('answer',{lessonId:lesson.id,questionId:q.id,choice:q.answer})));
 assert.equal(concurrent.reduce((sum,r)=>sum+r.data.awarded,0),10,'concurrent first correct submissions award only once');
 assert.equal((await bob('me')).data.score,10);
 assert.equal((await alice('profile',{nickname:'奋进同学'})).data.nickname,'奋进同学');
 assert.equal((await alice('profile',{nickname:'<script>alert(1)</script>'})).status,400);
 assert.equal((await alice('answer',{lessonId:lesson.id,questionId:q.id,choice:99})).status,400);
 assert.equal((await alice('answer',{lessonId:lesson.id,questionId:q.id,choice:q.answer},{origin:'https://evil.test'})).status,403);
 assert.equal((await client(api)('me')).status,401);
 assert.equal((await alice('unknown')).status,404);
 return session.data.id;
}
test('JSON persistence, session isolation, exact scoring, retries and validation',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'junior-study-test-'));
 try{const file=path.join(dir,'students.json');await exerciseStore(new JsonStore(file));const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(saved.users.length,2);assert.equal(saved.progress.length,6);assert.equal(summarize(saved.progress).score,70);const reopened=new JsonStore(file);assert.equal((await reopened.leaderboard())[0].score,70);}
 finally{assert.ok(dir.startsWith(path.join(tmpdir(),'junior-study-test-')));await rm(dir,{recursive:true,force:true});}
});
test('Cloudflare D1 SQL adapter matches JSON behavior on SQLite',async()=>{
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(await readFile(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
 sqlite.exec(await readFile(new URL('../migrations/0002_review.sql',import.meta.url),'utf8'));
 const db={prepare(sql){const statement=sqlite.prepare(sql);const bound=(args=[])=>({bind(...values){return bound(values);},syncAll(){return {results:statement.all(...args)};},async first(){return statement.get(...args)||null;},async all(){return this.syncAll();},async run(){return statement.run(...args);}});return bound();},async batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(s=>s.syncAll());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
 try{await exerciseStore(new D1Store(db));}finally{sqlite.close();}
});
test('curriculum is complete, consistent, and does not expose answer keys',()=>{
 assert.equal(lessons.length,9);const ids=new Set();
 for(const lesson of lessons){assert.equal(lesson.questions.length,5);for(const q of lesson.questions){assert.ok(!ids.has(q.id));ids.add(q.id);assert.ok(q.answer>=0&&q.answer<q.options.length);assert.ok(q.explanation);}}
 const serialized=JSON.stringify(publicCurriculum());assert.ok(!serialized.includes('"answer":'));assert.ok(!serialized.includes('"explanation":'));
 const allSolved=lessons.flatMap(l=>l.questions.map(q=>({question_id:q.id,correct:true})));
 assert.equal(summarize(allSolved).score,630);
});
test('legacy progress remains readable and missing new columns do not lose earned points',()=>{
 const legacy=[{question_id:'m7-1',lesson_id:'m7',correct:1},{question_id:'e7-1',lesson_id:'e7',correct:0}];
 const summary=summarize(legacy);assert.equal(summary.score,10);assert.deepEqual(summary.review,['e7-1']);
 const revised=summarize([{question_id:'m7-1',lesson_id:'m7',correct:1,last_correct:0}]);assert.equal(revised.score,10);assert.deepEqual(revised.review,['m7-1']);
});
