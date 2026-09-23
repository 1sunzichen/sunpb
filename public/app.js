const icons={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',math:'M5 5h14v14H5z M8 9h8 M8 13h2 M14 13h2 M8 16h2 M14 16h2',english:'M4 19 9 5l5 14 M6 14h6 M16 10h5 M18.5 7v11',book:'M12 5Q7 2 3 4v15q5-2 9 1 4-3 9-1V4q-4-2-9 1v15',trophy:'M8 3h8v6a4 4 0 0 1-8 0z M8 5H4v3a4 4 0 0 0 4 4 M16 5h4v3a4 4 0 0 1-4 4 M12 13v5 M8 21h8 M10 18h4',bolt:'m13 2-9 12h7l-1 8 10-13h-7z',check:'m5 12 4 4L19 6',flag:'M5 22V3 M5 3h14l-3 4 3 4H5',arrow:'M4 12h15 m-6-6 6 6-6 6',calendar:'M5 5h14v16H5z M8 2v6 M16 2v6 M5 10h14'};
const icon=name=>`<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name]||icons.book}"/></svg>`;
function hydrateIcons(){document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}
hydrateIcons();
document.querySelector('#today').textContent=new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date());
const $=selector=>document.querySelector(selector);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const grades={7:'七年级',8:'八年级',9:'九年级'};
const state={curriculum:null,me:null,board:{entries:[],total:0,myRank:null},nav:'overview',grade:7,lesson:null,index:0,choice:null,feedback:null,busy:false,earned:0,reviewMode:false,reviewFilter:'all',phase:'lesson',quizError:''};
let bootPromise,toastTimer;
try{const saved=Number(localStorage.getItem('study-grade'));if([7,8,9].includes(saved))state.grade=saved;}catch{}
$('#grade').value=state.grade;
const numberLine=$('#focus-visual').innerHTML;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4000);}
async function api(path,body){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 let response;
 try{response=await fetch('/api/'+path,{signal:controller.signal,credentials:'same-origin',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});}
 catch(error){throw new Error(error.name==='AbortError'?'连接超时，请重试。':'网络连接中断，请检查网络后重试。');}finally{clearTimeout(timer);}
 let data;try{data=await response.json();}catch{throw new Error('服务暂时没有响应，请稍后再试。');}
 if(!response.ok)throw new Error(data.error||'暂时无法完成操作');return data;
}
async function boot(){
 if(bootPromise)return bootPromise;
 $('#connection-status').hidden=false;$('#connection-status').textContent='正在加载学习记录…';
 $('#start-learning').disabled=true;
 bootPromise=(async()=>{try{
   const [curriculum,me]=await Promise.all([api('curriculum'),api('session',{})]);state.curriculum=curriculum;state.me=me;
   $('#connection-status').hidden=true;$('#start-learning').disabled=false;render();
   await refreshRanking();
 }catch(error){$('#connection-status').innerHTML=`${escape(error.message)} <button id="retry-connection">重新连接</button>`;$('#connection-status').hidden=false;}
 finally{bootPromise=null;}})();return bootPromise;
}
function lessonProgress(lesson){return lesson.questions.filter(q=>state.me.solved.includes(q.id)).length;}
function currentLesson(){const options=state.curriculum.lessons.filter(l=>l.grade===state.grade);return options.find(l=>l.id===state.me.lastLessonId&&!state.me.completed.includes(l.id))||options.find(l=>!state.me.completed.includes(l.id))||options[0];}
function setNavigation(nav){
 if(!['overview','math','english','chinese','ranking','review'].includes(nav))throw new Error('未知的学习页面');
 if(!state.curriculum||!state.me){toast('学习服务尚未连接，请点击重新连接。');return;}
 state.nav=nav;render();window.scrollTo({top:0,behavior:'smooth'});
}
function render(){
 if(!state.curriculum||!state.me)return;
 const titles={overview:'今天，也要向前一小步',math:'数学，让思考有迹可循',english:'英语，打开更大的世界',chinese:'语文，读懂文字的力量',ranking:'跑崩排行榜',review:'把错题，变成进步'};
 const descriptions={overview:'从一个知识点开始，让好奇心带你走得更远。',math:'从概念到推理，把每一道题真正学明白。',english:'读一句、想一想，再用练习巩固新的表达。',chinese:'读懂表达的方法，把理解变成自己的能力。',ranking:'这里记录每一份真实的努力。积分相同时，先加入的同学排在前面。',review:'答错的题目会留在这里，再次答对后自动移出。'};
 $('#page-title').innerHTML=escape(titles[state.nav])+'<span class="heading-star">✦</span>';
 $('#page-description').textContent=descriptions[state.nav];
 $('#breadcrumb-title').textContent=state.nav==='overview'?'学习概览':state.nav==='ranking'?'跑崩排行榜':state.nav==='review'?'我的错题本':state.curriculum.subjects.find(s=>s.id===state.nav).name;
 document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.nav===state.nav));
 $('#dashboard').hidden=state.nav!=='overview';$('#subject-view').hidden=!['math','english','chinese'].includes(state.nav);$('#ranking-view').hidden=state.nav!=='ranking';
 $('#review-view').hidden=state.nav!=='review';
 $('#review-count').textContent=(state.me.review||[]).length;
 $('#review-hint').textContent=(state.me.review||[]).length?`${state.me.review.length} 道题等待巩固，今天再试一次`:'暂时没有错题，继续探索新知识吧';
 $('#score').textContent=state.me.score;$('#solved-count').textContent=state.me.solved.length;$('#completed-count').textContent=state.me.completed.length;
 $('#nickname').textContent=state.me.nickname;$('#my-rank-score').innerHTML=`${state.me.score} <small>分</small>`;
 const focus=currentLesson();const subject=state.curriculum.subjects.find(s=>s.id===focus.subject);
 $('#focus-meta').textContent=`${subject.name} · ${grades[focus.grade]} · 约 ${focus.minutes} 分钟`;
 $('#focus-title').textContent=focus.title;$('#focus-description').textContent=focus.subtitle;$('#start-learning').innerHTML=`${lessonProgress(focus)?'继续学习':'开始学习'} ${icon('arrow')}`;
 if(focus.subject==='math'&&focus.grade===7)$('#focus-visual').innerHTML=numberLine;
 else $('#focus-visual').innerHTML=focus.subject==='math'?`<div class="formula-label">探索数学规律</div><div class="formula-alt">${focus.grade===8?'y = kx + b':'y = a(x − h)² + k'}<small>${focus.grade===8?'从变化中，发现关系':'从顶点，看见图像'}</small></div>`:focus.subject==='english'?'<div class="formula-label">A LITTLE EVERY DAY</div><div class="formula-alt">Learn. Try.<br>Grow.<small>每天学会一点新的表达</small></div>':'<div class="formula-label">读 · 思 · 表达</div><div class="formula-alt">一字一句，<br>皆有所得。<small>在文字中发现新的理解</small></div>';
 const tasks=state.curriculum.lessons.filter(l=>l.grade===state.grade);
 $('#task-progress').textContent=`完成 ${tasks.filter(l=>state.me.completed.includes(l.id)).length} / ${tasks.length}`;
 $('#task-list').innerHTML=tasks.map(l=>`<div class="task-row"><span class="task-check ${state.me.completed.includes(l.id)?'done':''}">${state.me.completed.includes(l.id)?icon('check'):''}</span><div class="task-text"><strong>${escape(l.title)}</strong><p>${state.curriculum.subjects.find(s=>s.id===l.subject).name} · ${lessonProgress(l)} / ${l.questions.length} 题已掌握</p></div><span class="task-reward">最高 +70</span><button class="small-button" data-lesson="${l.id}">${state.me.completed.includes(l.id)?'再巩固':lessonProgress(l)?'继续学':'去学习'}</button></div>`).join('');
 if(['math','english','chinese'].includes(state.nav))renderSubject();
 renderMastery();if(state.nav==='review')renderReview();
 renderRanking();
}
function renderSubject(){
 const lessons=state.curriculum.lessons.filter(l=>l.subject===state.nav).sort((a,b)=>(a.grade===state.grade?-1:b.grade===state.grade?1:a.grade-b.grade));
 $('#subject-view').innerHTML=`<div class="section-heading"><h2>循序渐进，学会一个再向前</h2><span>每个主题 5 道练习</span></div><div class="lesson-grid">${lessons.map(l=>`<article class="lesson-card"><span class="capsule light-capsule">${grades[l.grade]}${l.grade===state.grade?' · 当前年级':''}</span><h2>${escape(l.title)}</h2><p>${escape(l.subtitle)}</p><div class="tag-list">${l.tags.map(t=>`<span class="tag">${escape(t)}</span>`).join('')}</div><div class="progress-track" role="progressbar" aria-label="${escape(l.title)}掌握进度" aria-valuemin="0" aria-valuemax="${l.questions.length}" aria-valuenow="${lessonProgress(l)}"><span style="width:${lessonProgress(l)/l.questions.length*100}%"></span></div><div class="progress-caption">${lessonProgress(l)} / ${l.questions.length} 题已掌握 · 约 ${l.minutes} 分钟</div><button class="primary-button" data-lesson="${l.id}">${state.me.completed.includes(l.id)?'复习巩固':lessonProgress(l)?'继续学习':'开始学习'} ${icon('arrow')}</button></article>`).join('')}</div>`;
}
async function refreshRanking(){try{state.board=await api('leaderboard');renderRanking();}catch(error){toast('排行榜暂未更新：'+error.message);}}
function rankRows(entries){return entries.map(r=>`<div class="rank-row ${r.id===state.me.id?'mine':''}"><span class="rank-index ${r.rank<=3?'top':''}">${String(r.rank).padStart(2,'0')}</span><span class="avatar">${escape([...r.nickname][0])}</span><span class="rank-name">${escape(r.nickname)}${r.id===state.me.id?' <span class="me-tag">我</span>':''}<small>已完成 ${r.completed} 个主题</small></span><b>${r.score}</b></div>`).join('');}
function renderRanking(){
 if(!state.me)return;
 const entries=state.board.entries;
 $('#rank-list').className=entries.length?'rank-list-filled':'rank-empty';
 $('#rank-list').innerHTML=entries.length?rankRows(entries.slice(0,4)):'<span class="rank-number">01</span><strong>第一份努力，等你点亮</strong><p>答对第一道题，就能登上跑崩榜。</p>';
 $('#my-rank-label').textContent=state.board.myRank?`当前排名 · 第 ${state.board.myRank} 名`:'从 0 开始，也很棒';
 $('#ranking-view').innerHTML=`<div class="full-ranking"><div class="section-heading"><h2>${icon('trophy')} 努力，正在被看见</h2><button class="small-button" id="refresh-ranking">刷新榜单</button></div><p class="ranking-info">首次答对 +10，完成主题 +20。共 ${state.board.total} 位同学上榜，展示前 50 名。${state.board.myRank?`你当前排在第 ${state.board.myRank} 名。`:''}</p>${entries.length?rankRows(entries):'<div class="empty-state">还没有同学上榜。<br>完成第一道练习，留下你的第一份进步。<br><button class="primary-button" data-nav="overview">开始探索</button></div>'}</div>`;
}
function openLesson(id){
 if(!state.me)return toast('请先连接学习服务。');
 const lesson=state.curriculum.lessons.find(l=>l.id===id);if(!lesson)throw new Error('未找到该主题');
 if(state.busy)return;
 state.lesson=lesson;state.feedback=null;state.earned=0;state.reviewMode=false;state.phase='lesson';state.quizError='';
 $('#lesson-label').textContent=state.curriculum.subjects.find(s=>s.id===lesson.subject).name+' · '+grades[lesson.grade]+' · 知识探索';
 $('#lesson-body').innerHTML=`<h2 id="lesson-title">${escape(lesson.title)}</h2><p class="lesson-intro">${escape(lesson.intro)}</p><div class="knowledge-points">${lesson.points.map((p,i)=>`<div class="knowledge-point"><span class="step">${i+1}</span><div><h3>${escape(p[0])}</h3><p>${escape(p[1])}</p></div></div>`).join('')}</div><div class="example-box">${escape(lesson.example)}</div><div class="lesson-actions"><span>不着急，理解之后再试一试。</span><button class="primary-button" id="start-quiz">开始 ${lesson.questions.length} 题练习 ${icon('arrow')}</button></div>`;
 if(!$('#lesson-dialog').open)$('#lesson-dialog').showModal();$('#lesson-dialog').scrollTop=0;
}
function startQuiz(){state.index=Math.max(0,state.lesson.questions.findIndex(q=>!state.me.solved.includes(q.id)||(state.me.review||[]).includes(q.id)));state.choice=null;state.feedback=null;state.phase='quiz';state.quizError='';renderQuestion();}
function renderQuestion(){
 if(state.phase!=='quiz')return;
 const lesson=state.lesson,q=lesson.questions[state.index];
 $('#lesson-label').textContent=lesson.title+' · 巩固练习';
 const f=state.feedback;
 $('#lesson-body').innerHTML=`<div class="quiz-progress">第 ${state.index+1} / ${lesson.questions.length} 题${state.me.solved.includes(q.id)?' · 已获积分，复习不重复计分':''}</div><div class="quiz-track" role="progressbar" aria-label="答题进度" aria-valuemin="0" aria-valuemax="${lesson.questions.length}" aria-valuenow="${state.index+(f?1:0)}"><span style="width:${100*(state.index+(f?1:0))/lesson.questions.length}%"></span></div><h2 id="lesson-title" class="quiz-title">${escape(q.text)}</h2><div class="answers" role="group" aria-label="选择答案">${q.options.map((o,i)=>`<button class="answer-option ${state.choice===i?'selected':''} ${f&&i===f.answer?'correct':''} ${f&&state.choice===i&&!f.correct?'wrong':''}" data-choice="${i}" aria-pressed="${state.choice===i}" ${f||state.busy?'disabled':''}><span class="letter">${String.fromCharCode(65+i)}</span><span>${escape(o)}</span></button>`).join('')}</div>${state.quizError?`<p class="inline-error" role="alert">${escape(state.quizError)} 选项已保留，可以再次提交。</p>`:''}${f?`<div class="answer-feedback" role="status"><strong>${f.correct?f.awarded?`答对了！+${f.awarded} 跑崩值`:'答对了，又巩固了一次':`正确答案是 ${String.fromCharCode(65+f.answer)} · 已加入错题本`}</strong>${escape(f.explanation)}</div>`:''}<div class="lesson-actions quiz-sticky-actions"><span>${f&&!f.correct?'读懂解析后，可以再试一次。':'不用抢速度，把每一步想清楚。'}</span><div class="quiz-action-buttons">${f&&!f.correct?'<button class="small-button" id="retry-question">再试一次</button>':''}${f?`<button class="primary-button" id="next-question">${state.index===lesson.questions.length-1?'查看学习成果':'下一题'} ${icon('arrow')}</button>`:`<button class="primary-button" id="submit-answer" ${state.choice===null||state.busy?'disabled':''}>${state.busy?'正在保存…':'确认答案'}</button>`}</div></div>`;
}
async function submitAnswer(){
 if(state.busy||state.choice===null||state.feedback)return;
 state.busy=true;state.quizError='';const activeQuestion=state.lesson.questions[state.index],lessonId=activeQuestion.lessonId||state.lesson.id,questionId=activeQuestion.id;renderQuestion();
 try{
  const result=await api('answer',{lessonId,questionId,choice:state.choice});state.me=result.me;state.earned+=result.awarded;state.feedback=result;render();
  void refreshRanking();
 }catch(error){state.quizError=error.message;}finally{state.busy=false;if($('#lesson-dialog').open&&state.phase==='quiz')renderQuestion();}
}
function nextQuestion(){
 if(!state.feedback||state.busy)return;
 if(state.index<state.lesson.questions.length-1){state.index++;state.choice=null;state.feedback=null;renderQuestion();}
 else{
  state.phase='result';
  const unresolved=state.lesson.questions.filter(q=>!state.me.solved.includes(q.id)||(state.me.review||[]).includes(q.id)),done=unresolved.length===0,mastered=state.lesson.questions.length-unresolved.length;
  $('#lesson-body').innerHTML=`<div class="quiz-complete"><div class="success-symbol">${done?'✦':'↗'}</div><h2 id="lesson-title">${done?state.reviewMode?'这一轮错题，巩固好了！':'又学会了一个新主题！':'每一次尝试，都有收获'}</h2><p>${escape(state.lesson.title)} · ${mastered} / ${state.lesson.questions.length} 题已答对</p><div class="big-score">+${state.earned} <small>跑崩值</small></div><p>${done?'记录已经保存，今天的努力又多了一点。':'还没答对的题已放进错题本，理解之后再试一次。'}</p><div class="result-actions"><button class="primary-button" ${done?'data-close="lesson-dialog"':'id="start-quiz"'}>${done?'完成学习':'巩固未答对的题目'} ${icon('arrow')}</button>${done?'':'<button class="small-button" data-close="lesson-dialog">稍后再复习</button>'}</div></div>`;
 }
 $('#lesson-dialog').scrollTop=0;
}
document.addEventListener('click',async event=>{
 if(event.target.closest('.brand')){event.preventDefault();setNavigation('overview');return;}
 const button=event.target.closest('button');if(!button||button.disabled)return;
 if(button.dataset.nav)return setNavigation(button.dataset.nav);
 if(button.dataset.lesson)return openLesson(button.dataset.lesson);
 if(button.dataset.close){if(state.busy)return toast('正在保存答案，请稍候。');$('#'+button.dataset.close).close();return;}
 if(button.dataset.reviewFilter){state.reviewFilter=button.dataset.reviewFilter;renderReview();return;}
 if(button.dataset.reviewQuestion)return startReview(button.dataset.reviewQuestion);
 if(button.dataset.choice!==undefined){if(state.busy||state.feedback)return;state.choice=Number(button.dataset.choice);renderQuestion();$(`[data-choice="${state.choice}"]`).focus({preventScroll:true});return;}
 switch(button.id){
  case'retry-connection':return boot();
  case'start-learning':if(state.me)openLesson(currentLesson().id);return;
  case'start-quiz':return startQuiz();
  case'review-all':return startReview();
  case'submit-answer':return submitAnswer();
  case'next-question':return nextQuestion();
  case'retry-question':state.choice=null;state.feedback=null;state.quizError='';return renderQuestion();
  case'refresh-ranking':button.disabled=true;try{await refreshRanking();}finally{button.disabled=false;}return;
  case'profile-button':if(!state.me)return toast('请先连接学习服务。');$('#nickname-input').value=state.me.nickname;$('#profile-error')?.remove();$('#profile-dialog').showModal();return;
 }
});
$('#grade').addEventListener('change',event=>{state.grade=Number(event.target.value);try{localStorage.setItem('study-grade',String(state.grade));}catch{}render();});
$('#lesson-dialog').addEventListener('cancel',event=>{if(state.busy)event.preventDefault();});
$('#profile-form').addEventListener('submit',async event=>{
 event.preventDefault();const button=event.submitter;button.disabled=true;$('#profile-error')?.remove();
 try{state.me=await api('profile',{nickname:$('#nickname-input').value});render();$('#profile-dialog').close();toast('昵称已保存');await refreshRanking();}
 catch(error){const message=document.createElement('p');message.id='profile-error';message.className='inline-error';message.setAttribute('role','alert');message.textContent=error.message;button.before(message);}finally{button.disabled=false;}
});
function registerTools(){
 const context=document.modelContext;if(!context?.registerTool)return;
 for(const tool of [
  {name:'get_study_progress',title:'读取学习进度',description:'读取当前同学的分数、已掌握题目及已完成主题。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:async()=>{if(!state.me)throw new Error('学习服务未连接');return structuredClone(state.me);}},
  {name:'open_study_lesson',title:'打开学习主题',description:'打开指定主题的知识讲解，不提交答案或改变分数。',inputSchema:{type:'object',properties:{lessonId:{type:'string'}},required:['lessonId'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async input=>{if(!input||typeof input.lessonId!=='string')throw new Error('需要有效的主题编号');openLesson(input.lessonId);return {lessonId:state.lesson.id,title:state.lesson.title};}}
 ]){try{Promise.resolve(context.registerTool(tool)).catch(()=>{});}catch{}}
}
function reviewItems(){
 return (state.me.review||[]).map(id=>{
  const lesson=state.curriculum.lessons.find(l=>l.questions.some(q=>q.id===id));
  return lesson?{lesson,question:lesson.questions.find(q=>q.id===id)}:null;
 }).filter(Boolean);
}
function filteredReviews(){return reviewItems().filter(item=>state.reviewFilter==='all'||item.lesson.subject===state.reviewFilter);}
function startReview(questionId){
 if(state.busy)return;
 const items=questionId?reviewItems().filter(i=>i.question.id===questionId):filteredReviews();
 if(!items.length)return toast('这些题目都已经巩固好了。');
 state.lesson={id:'review',title:'错题复习',questions:items.map(({lesson,question})=>({...question,lessonId:lesson.id}))};
 state.reviewMode=true;state.earned=0;state.phase='quiz';state.index=0;state.choice=null;state.feedback=null;state.quizError='';
 renderQuestion();if(!$('#lesson-dialog').open)$('#lesson-dialog').showModal();$('#lesson-dialog').scrollTop=0;
}
function renderReview(){
 const all=reviewItems(),items=filteredReviews();
 const filters=[{id:'all',name:'全部'},...state.curriculum.subjects];
 $('#review-view').innerHTML=`<div class="review-toolbar"><div class="review-filters" role="group" aria-label="按学科筛选错题">${filters.map(s=>`<button data-review-filter="${s.id}" aria-pressed="${state.reviewFilter===s.id}" class="filter-button ${state.reviewFilter===s.id?'selected':''}">${s.name} <span>${s.id==='all'?all.length:all.filter(i=>i.lesson.subject===s.id).length}</span></button>`).join('')}</div><button class="primary-button" id="review-all" ${items.length?'':'disabled'}>开始复习 ${items.length} 题 ${icon('arrow')}</button></div><p class="review-note">涵盖所有年级。复习不会扣分，已经获得的跑崩值会保留。</p><div class="review-grid">${items.length?items.map(({lesson,question})=>`<article class="review-card"><div class="review-card-meta"><span>${state.curriculum.subjects.find(s=>s.id===lesson.subject).name} · ${grades[lesson.grade]}</span><span>待巩固</span></div><h2>${escape(question.text)}</h2><p>来自「${escape(lesson.title)}」</p><div class="review-card-actions"><button class="small-button" data-lesson="${lesson.id}">重看知识点</button><button class="primary-button" data-review-question="${question.id}">复习这道题 ${icon('arrow')}</button></div></article>`).join(''):`<div class="review-empty"><span class="review-empty-icon">${icon('check')}</span><h2>${all.length?'这门学科暂时没有错题':'错题本已经清空啦'}</h2><p>${all.length?'试试其他学科，或者继续学习新主题。':'继续探索新知识，遇到不会的也没关系。'}</p><button class="primary-button" data-nav="overview">继续学习 ${icon('arrow')}</button></div>`}</div>`;
}
function renderMastery(){
 $('#mastery-grade').textContent=grades[state.grade];
 $('#mastery-list').innerHTML=state.curriculum.subjects.map(s=>{
  const lessons=state.curriculum.lessons.filter(l=>l.grade===state.grade&&l.subject===s.id),ids=lessons.flatMap(l=>l.questions.map(q=>q.id));
  const solved=ids.filter(id=>state.me.solved.includes(id)).length,review=ids.filter(id=>(state.me.review||[]).includes(id)).length;
  return `<button class="mastery-row ${s.color}" data-nav="${s.id}"><span class="stat-icon ${s.color}">${icon(s.icon)}</span><span class="mastery-info"><span><strong>${s.name}</strong><small>${solved} / ${ids.length} 题曾答对${review?` · ${review} 题待复习`:''}</small></span><span class="progress-track" role="progressbar" aria-label="${s.name}学习进度" aria-valuemin="0" aria-valuemax="${ids.length}" aria-valuenow="${solved}"><span style="width:${100*solved/ids.length}%"></span></span></span>${icon('arrow')}</button>`;
 }).join('');
}
boot().then(registerTools);
