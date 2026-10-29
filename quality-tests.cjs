'use strict';
const assert=require('node:assert/strict');
const data={topics:require('./source/topics.json'),questions:require('./source/questions.json'),dependencies:require('./source/dependencies.json')};
const J=require('./source/judge.js'),C=require('./source/ai-learning.js'),V=require('./source/curriculum-variants.js');
const T=require('./source/trainer.js').createEngine(data,require('./source/learning-unit.js'));
const A=require('./source/ability.js').createEngine(data), R=require('./source/review-plans.js');
const revisions=require('./docs/development/2026-10-29-question-revisions.json').revisions;
C.configureCurriculum(data,T,J,V);
const item=id=>data.questions.find(q=>q.id===id);
function boot(seed){
 const fs=require('node:fs'),vm=require('node:vm'),{parseHTML}=require('linkedom'),store=new Map();if(seed)store.set('zhishu.ability.v1',JSON.stringify(seed));
 const {window}=parseHTML(fs.readFileSync('dist/index.html','utf8'));window.scrollTo=()=>{};window.print=()=>{};
 const ctx=vm.createContext({window,document:window.document,location:{protocol:'file:'},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},console,setTimeout,clearTimeout,Date,Math,URL,Blob,AbortSignal});
 for(const s of window.document.querySelectorAll('script'))vm.runInContext(s.textContent,ctx);
 const find=s=>{const e=window.document.querySelector(s);assert.ok(e,s);return e;},click=s=>{const e=find(s);e.onclick({target:e});},fill=(s,v)=>{const e=find(s);e.value=v;e.oninput?.();};
 return {window,find,click,fill,profile:()=>JSON.parse(store.get('zhishu.ability.v1')).profiles[0]};
}
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
async function main(){
 await test('Every source item has unique valid options and explicit requested goals accept its canonical answer',()=>{
  const ids=new Set();
  for(const q of data.questions){assert.ok(!ids.has(q.id),q.id);ids.add(q.id);assert.ok(['numeric','choice'].includes(q.type),q.id);assert.ok(q.prompt&&q.answer&&q.explanation,q.id);assert.equal(J.judgeQuestion(q,q.answer).verdict,'correct',q.id);
   if(q.type==='choice'){assert.equal(q.choices.filter(c=>c.key===q.answer).length,1,q.id);assert.equal(new Set(q.choices.map(c=>c.text.replace(/\s/g,''))).size,q.choices.length,q.id);}
  }
  assert.equal(new Set(revisions.map(r=>r.id)).size,revisions.length);
 });
 await test('All supplemental arithmetic and linear-equation templates agree with their printed mathematics',()=>{
  const vm=require('node:vm');let checked=0;
  const evaluate=(expr,x)=>{
   let s=expr.replace(/\|([^|]+)\|/g,(_,inside)=>String(Math.abs(evaluate(inside,x)))).replace(/[−－]/g,'-').replace(/＋/g,'+').replace(/×/g,'*').replace(/÷/g,'/').replace(/x/g,'('+x+')').replace(/(\d|\))(?=\()/g,'$1*');
   assert.match(s,/^[0-9+\-*/().\s]+$/);return vm.runInNewContext(s,Object.create(null),{timeout:50});
  };
  for(const q of Object.values(T.bank).flat().filter(q=>q.id.startsWith('variant_'))){
   let m;if((m=q.prompt.match(/^写出 (-?\d+) 的相反数/)))assert.equal(Number(q.answer),-Number(m[1]),q.id);
   else if((m=q.prompt.match(/^若 a = (-?\d+)，求 −a/)))assert.equal(Number(q.answer),-Number(m[1]),q.id);
   else if((m=q.prompt.match(/^若 a 的相反数是 (-?\d+)，求 a \+ (\d+)/)))assert.equal(Number(q.answer),-Number(m[1])+Number(m[2]),q.id);
   else if((m=q.prompt.match(/^计算 (.+)。$/)))assert.ok(Math.abs(evaluate(m[1])-Number(q.answer))<1e-9,q.id);
   else if((m=q.prompt.match(/^合并同类项：(.+) = □x/)))assert.ok(Math.abs(evaluate(m[1],1)-Number(q.answer))<1e-9,q.id);
   else if((m=q.prompt.match(/^解方程：(.+?)。（/))){const sides=m[1].split('=');assert.ok(Math.abs(evaluate(sides[0],q.answer)-evaluate(sides[1],q.answer))<1e-9,q.id);}
   else assert.fail('Unaudited supplemental template '+q.id);
   checked++;
  }assert.ok(checked>400);
 });
 await test('Wrong-dimension numeric answers cannot pass the revised geometry or time questions',()=>{
  assert.equal(J.judgeQuestion(item('cnm_p208_q1'),'87.92厘米').verdict,'wrong');
  assert.equal(J.judgeQuestion(item('cnm_p061_q1'),'60米').verdict,'wrong');
  assert.equal(J.judgeQuestion(item('cnm_p208_q1'),'87.92平方厘米').verdict,'correct');
 });
 await test('An unsimplified fraction or decimal cannot satisfy a request for a reduced fraction',()=>{
  const q=item('cnm_p168_q1');for(const a of ['6/8','0.75','12/16'])assert.equal(J.judgeQuestion(q,a).verdict,'incomplete',a);
  assert.equal(J.judgeQuestion(q,'3/4').verdict,'correct');assert.equal(J.judgeQuestion(q,'2/3').verdict,'wrong');
  assert.equal(J.judgeQuestion(item('cnm_005_q4'),'-0.5').verdict,'correct');
 });
 await test('Precision and significant trailing zeroes are required only when the actual answer asks for them',()=>{
  assert.equal(J.judgeQuestion(item('cnm_023_q4'),'2.1').verdict,'incomplete');assert.equal(J.judgeQuestion(item('cnm_023_q4'),'2.10').verdict,'correct');
  assert.equal(J.judgeQuestion(item('cnm_023_q1'),'2').verdict,'correct');
  assert.equal(J.judgeQuestion(item('cnm_p121_q4'),'10').verdict,'incomplete');assert.equal(J.judgeQuestion(item('cnm_p121_q4'),'10.0').verdict,'correct');
  assert.equal(J.judgeQuestion(item('cnm_p135_q3'),'2.820').verdict,'incomplete');assert.equal(J.judgeQuestion(item('cnm_p135_q3'),'2.82').verdict,'correct');
 });
 await test('Percent answers use their actual ratios instead of treating 25 percent as the number 25',()=>{
  const q=item('cnm_p197_q1');assert.equal(J.judgeQuestion(q,'25%').verdict,'correct');assert.equal(J.judgeQuestion(q,'0.25').verdict,'correct');assert.equal(J.judgeQuestion(q,'25').verdict,'wrong');
 });
 await test('Every revised old outcome is preserved and excluded from ability evidence',()=>{
  const old=revisions.map((r,i)=>({id:'legacy-'+i,questionId:r.id,topicId:r.topicId,skillId:r.topicId,mode:'topic-learning',outcome:i%2?'correct':'wrong',userAnswer:r.previous.answer,difficulty:r.previous.difficulty,at:i}));
  const audited=C.auditAttempts(old);for(let i=0;i<old.length;i++){assert.equal(audited[i].outcome,old[i].outcome);assert.equal(audited[i].userAnswer,old[i].userAnswer);assert.equal(audited[i].evidenceEligible,false);}
  assert.equal(C.independent(old).length,0);for(const t of new Set(old.map(r=>r.topicId))){assert.equal(T.evidence(old,t).n,0);assert.equal(A.evidence(old,t).n,0);}
 });
 await test('A revised item becomes fresh independent evidence even if its old ID was answered before',()=>{
  const s=C.create({skill:'cnm_p003'});C.next(s);const q=s.current.question;
  s.attempts=[{id:'old',questionId:q.id,topicId:q.topicId,skillId:q.skillId,outcome:'correct',userAnswer:'5',at:1}];s.roundStart=1;
  const row=C.record(s,q.answer);assert.equal(row.questionRevision,1);assert.equal(row.repeated,false);assert.equal(C.independent(s.attempts).length,1);assert.equal(C.taskProgress(s).passed,1);
  const initial=T.create('cnm_p003');T.next(initial,[]);const raw=T.items[initial.current.questionId];
  const legacy={id:'old-ordinary',questionId:raw.id,topicId:raw.topicId,outcome:'correct',difficulty:raw.difficulty,at:1};
  const records=[legacy],run=T.create(raw.topicId,records);T.next(run,records);
  assert.equal(run.current.questionId,raw.id);assert.equal(run.current.repeated,false);
  T.record(run,records,'correct');assert.equal(T.evidence(records,raw.topicId).n,1);
 });
 await test('Exposure tracking distinguishes old IDs and actual revised content across client/server handoff',()=>{
  const q=C.fromId('aic_cnm_p003_q1'),old=C.create({skill:'cnm_p003'}),current=C.create({skill:'cnm_p003'});
  C.rememberExposure(old,[q.id]);assert.ok(!old.exposed.includes(q.prompt));C.rememberExposure(current,[q.id+'@1']);assert.ok(current.exposed.includes(q.prompt));
 });
 await test('An incomplete fraction adds no record and keeps the current question available',()=>{
  const s=C.create({skill:'cnm_p168'});C.next(s);assert.equal(s.current.question.answerForm,'reduced-fraction');
  const id=s.current.question.id,rev=s.revision;assert.throws(()=>C.record(s,'8/12'),/最简分数/);assert.equal(s.attempts.length,0);assert.equal(s.revision,rev);assert.equal(s.current.question.id,id);
 });
 await test('Revised historical evidence reopens a scheduled review without deleting its history',()=>{
  const skill='cnm_p003',rows=[1,3].map(n=>({id:'old-'+n,mode:'ai-unit',questionId:'aic_'+skill+'_q'+n,skillId:skill,topicId:skill,outcome:'correct',userAnswer:'4',at:n}));
  const profile={records:rows,reviewPlans:{x:{grade:1,skillId:skill,evidenceIds:rows.map(r=>r.id),dueAt:Date.now()+100000,step:2}}};
  assert.equal(R.queue(profile,1,C)[0].status,'recheck');assert.equal(profile.records.length,2);
 });
 await test('Offline resume refreshes a changed prompt and clears an answer drafted for the old question',()=>{
  const s=C.create({skill:'cnm_p003'});C.next(s);s.current.question={...s.current.question,contentRevision:0,prompt:'旧题',answer:'999'};s.draft={answer:'999'};
  const rev=s.revision,v=C.view(s);assert.notEqual(v.question.prompt,'旧题');assert.deepEqual(s.draft,{});assert.equal(v.revision,rev+1);C.view(s);assert.equal(s.revision,rev+1);
 });
 await test('A backend with a pre-update session rejects stale submissions and persists the migrated revision',async()=>{
  const store=require('./session-store.cjs').createSessionStore({persist:false});
  const h=require('./tutor-service.cjs').createHandler({sessionStore:store,getConfig:()=>({})});
  try{const s=C.create({id:'legacy-session',skill:'cnm_p003'});C.next(s);s.current.question={...s.current.question,contentRevision:0,prompt:'旧题',answer:'999'};const rev=s.revision;await store.create(s.id,s);
   await assert.rejects(h('answer',{sessionId:s.id,revision:rev,questionId:s.current.question.id,answer:'999'}),e=>e.status===409);
   const resumed=await h('resume',{sessionId:s.id});assert.equal(resumed.revision,rev+1);assert.equal(resumed.attempts.length,0);assert.notEqual(resumed.question.prompt,'旧题');
   const answered=await h('answer',{sessionId:s.id,revision:resumed.revision,questionId:resumed.question.id,answer:C.fromId(resumed.question.id).answer});assert.equal(answered.feedback.record.questionRevision,1);assert.equal(answered.feedback.record.outcome,'correct');
  }finally{await h.close();}
 });
 await test('A hint cannot disclose option D after four-option question repairs',()=>{
  const q=item('cnm_219_q2');assert.equal(require('./tutor-service.cjs').leaksAnswer('选D',q),true);
 });
 await test('Ordinary and AI pages retain an unfinished reduced-fraction draft without adding a score',()=>{
  const a=boot();a.click('[data-grade="5"]');a.click('[data-action="enter"]');a.click('[data-semester="下"]');a.click('[data-topic="cnm_p168"]');a.fill('#practice-answer','8/12');a.click('[data-action="submit"]');assert.equal(a.find('#practice-answer').value,'8/12');assert.equal(a.profile().records.length,0);
  a.click('[data-action="ai-entry"]');a.click('[data-ai="start"]');a.fill('#ai-answer','8/12');a.click('[data-ai="submit"]');assert.equal(a.find('#ai-answer').value,'8/12');assert.equal(a.profile().records.length,0);assert.match(a.find('#app').textContent,/最简分数/);
 });
 await test('Page reload cannot carry an offline AI answer drafted for a replaced question into the new prompt',()=>{
  const s=C.create({skill:'cnm_p003'});C.next(s);const old=C.view(s);s.current.question={...s.current.question,contentRevision:0,prompt:'旧题',answer:'999'};old.question={...old.question,prompt:'旧题',contentRevision:0};
  const db={version:1,activeId:'p',config:{grade:1},ui:{screen:'practice'},profiles:[{id:'p',name:'测试',grade:1,records:[],spaces:{1:{semester:'上',topicId:'cnm_p003',query:'',runs:{},aiActive:true}},aiUnits:{1:{mode:'offline',state:s,view:old,draft:{answer:'999'}}}}]};
  const a=boot(db);assert.equal(a.find('#ai-answer').value,'');assert.ok(!a.find('.question-prompt').textContent.includes('旧题'));
 });
 await test('Ordinary practice reload refreshes a replaced prompt and clears the old response',()=>{
  const r=T.create('cnm_p003');T.next(r,[]);r.current.questionRevision=0;r.draft={answer:'999',steps:'旧步骤'};
  const db={version:1,activeId:'p',config:{grade:1},ui:{screen:'practice'},profiles:[{id:'p',name:'测试',grade:1,records:[],spaces:{1:{semester:'上',topicId:'cnm_p003',query:'',runs:{cnm_p003:r}}}}]};
  const a=boot(db);assert.equal(a.find('#practice-answer').value,'');
 });
 console.log(JSON.stringify({qualityPassed:passed,reviewedSourceItems:data.questions.length,revisedSourceItems:revisions.length}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
