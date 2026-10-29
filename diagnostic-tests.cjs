'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('./source/ai-learning.js'),J=require('./source/judge.js');
const data={topics:require('./source/topics.json'),questions:require('./source/questions.json'),dependencies:require('./source/dependencies.json')};
const T=require('./source/trainer.js').createEngine(data,require('./source/learning-unit.js'));
C.configureCurriculum(data,T,J,require('./source/curriculum-variants.js'));C.configureGraph(data.dependencies);
const Service=require('./tutor-service.cjs');
const wrong=q=>q.type==='choice'?q.choices.find(c=>c.key!==q.answer).key:['999','998','997'].find(a=>(q.curriculum?J:require('./source/linear-math.js'))[q.curriculum?'judgeQuestion':'judge'](q,a).verdict==='wrong');
const record=(s,correct=false)=>C.record(s,correct?s.current.question.answer:wrong(s.current.question));
function start(skill='cnm_p168'){const s=C.create({skill});C.next(s);return s;}
function choosePre(s,pre='cnm_p167'){const p=C.candidates(s).find(p=>p.action==='prerequisite'&&p.targetSkill===pre);assert.ok(p,pre);C.applyPlan(s,{...p,reason:'先检查相关基础，再返回原目标。',evidenceIds:[s.attempts.at(-1).id],rootId:pre});C.next(s);}
function withTwoPasses(){const s=start();for(let n=0;n<2;n++){C.pick(s,'cnm_p158','probe',0);record(s,true);}s.roundStart=s.attempts.length;s.limit+=s.roundStart;C.pick(s,s.goal.skillId,'diagnose',1);record(s);return s;}
let passed=0;async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
async function main(){
await test('Every topic limits diagnostic targets to its actual goal or direct prerequisites in the correct grade',()=>{
 for(const t of data.topics){const s=start(t.id);record(s);const context=C.diagnosticContext(s);assert.equal(context.focusSkill,t.id);for(const p of C.candidates(s)){assert.ok(p.targetSkill===t.id||C.skills[t.id].prerequisites.includes(p.targetSkill),t.id);assert.ok(C.skills[p.targetSkill].grade<=t.grade,t.id);}for(const c of context.checks.filter(c=>c.relation==='prerequisite'))assert.equal(c.status,'unseen');}
});
await test('All 531 failure paths spend at most two attempts off goal and never claim verification',()=>{
 let usedPrerequisite=false;
 for(const t of data.topics){const s=start(t.id);let guard=0;while(!s.finished){assert.ok(++guard<=8,t.id);record(s);C.applyPlan(s,C.localPlan(s));C.next(s);}const off=s.attempts.filter(r=>r.skillId!==t.id);usedPrerequisite ||= off.length>0;assert.ok(off.length<=2,t.id);assert.ok(off.every(r=>C.skills[t.id].prerequisites.includes(r.skillId)),t.id);assert.notEqual(C.taskProgress(s).status,'verified');}assert.ok(usedPrerequisite);
});
await test('Two real independent checks remove a prerequisite from new suspicions and candidate detours',()=>{
 const s=withTwoPasses(),check=C.diagnosticContext(s).checks.find(c=>c.skillId==='cnm_p158');assert.equal(check.status,'checks_passed');assert.equal(check.passingIds.length,2);assert.ok(!C.candidates(s).some(p=>p.action==='prerequisite'&&p.targetSkill===check.skillId));assert.ok(!C.diagnosticRoots(s).includes(check.skillId));assert.throws(()=>C.applyPlan(s,{...C.localPlan(s),rootId:check.skillId}),/diagnosis outside/);
});
await test('A later independent error reopens a previously passed foundation check',()=>{
 const s=withTwoPasses();C.pick(s,'cnm_p158','probe',0);record(s);C.pick(s,s.goal.skillId,'diagnose',1);record(s);const check=C.diagnosticContext(s).checks.find(c=>c.skillId==='cnm_p158');assert.equal(check.status,'needs_check');assert.equal(check.passingIds.length,0);assert.ok(C.diagnosticRoots(s).includes(check.skillId));
});
await test('Assisted and repeated completions do not become independent prerequisite checks',()=>{
 const s=start();C.pick(s,'cnm_p158','probe',0);C.hint(s);record(s,true);C.retry(s);record(s,true);s.roundStart=s.attempts.length;s.limit+=s.roundStart;C.pick(s,s.goal.skillId,'diagnose',1);record(s);const check=C.diagnosticContext(s).checks.find(c=>c.skillId==='cnm_p158');assert.equal(check.independent,0);assert.equal(check.status,'no_independent_check');assert.ok(C.candidates(s).some(p=>p.action==='prerequisite'&&p.targetSkill===check.skillId));
});
await test('A failed prerequisite cannot open another prerequisite chain',()=>{
 const s=start();record(s);choosePre(s);record(s);const choices=C.candidates(s);assert.ok(choices.every(p=>p.targetSkill===s.goal.skillId||p.targetSkill==='cnm_p167'));assert.ok(choices.every(p=>p.action!=='prerequisite'));assert.throws(()=>C.applyPlan(s,{action:'prerequisite',targetSkill:C.skills.cnm_p167.prerequisites[0],level:0,reason:'继续向下查',evidenceIds:[s.attempts.at(-1).id]}),/outside/);
});
await test('A second foundation attempt makes returning to the original goal mandatory even after errors',()=>{
 const s=start();record(s);choosePre(s);record(s);C.applyPlan(s,C.localPlan(s));C.next(s);assert.equal(s.current.hintCount,1);record(s);const choices=C.candidates(s);assert.equal(choices.length,1);assert.equal(choices[0].targetSkill,s.goal.skillId);assert.equal(C.diagnosticContext(s).prerequisiteRemaining,0);assert.equal(C.taskProgress(s).passed,0);
});
await test('An independent prerequisite pass returns to the goal without claiming two checks or crediting the goal',()=>{
 const s=start();record(s);choosePre(s);record(s,true);const choices=C.candidates(s);assert.equal(choices.length,1);assert.equal(choices[0].targetSkill,s.goal.skillId);assert.equal(C.diagnosticContext(s).checks.find(c=>c.skillId==='cnm_p167').status,'one_pass');assert.equal(C.taskProgress(s).passed,0);
});
await test('The last two task slots are reserved for the original goal rather than a new foundation detour',()=>{
 const s=start('solve');for(let n=0;n<6;n++){C.pick(s,'solve','probe',1);record(s);}assert.equal(C.diagnosticContext(s).attemptsRemaining,2);assert.ok(C.candidates(s).every(p=>p.targetSkill==='solve'));
});
await test('Exhausted foundation items cannot prematurely end an otherwise runnable original goal',()=>{
 const s=start();for(const pre of C.skills[s.goal.skillId].prerequisites)s.exposed.push(...T.bank[pre].map(q=>q.prompt));record(s);assert.ok(C.candidates(s).every(p=>p.targetSkill===s.goal.skillId));C.applyPlan(s,C.localPlan(s));C.next(s);assert.equal(s.finished,false);assert.equal(s.current.question.skillId,s.goal.skillId);
});
await test('A saved older plan cannot bypass the current detour budget when resuming the next question',()=>{
 const s=start();record(s);choosePre(s);record(s);C.applyPlan(s,C.localPlan(s));C.next(s);record(s);s.nextPlan={action:'prerequisite',targetSkill:'cnm_p158',level:0,reason:'旧版本继续补基础',evidenceIds:[s.attempts.at(-1).id]};C.next(s);assert.equal(s.current.question.skillId,s.goal.skillId);assert.match(s.current.purpose,/约分/);assert.ok(s.events.some(e=>e.type==='teaching-route-refreshed'));
});
await test('AI receives canonical item context for earlier responses and the actual diagnostic budget',async()=>{
 let payload;const h=Service.createHandler({persist:false,getConfig:()=>({key:'fixture',model:'fixture',label:'Fixture',url:'https://fixture.invalid'}),fetchImpl:async(_,o)=>{payload=JSON.parse(JSON.parse(o.body).messages[1].content);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({decisionIndex:0,reason:'先检查这一步，再回到本次目标。',rootId:payload.allowedRoots[0],evidenceIds:[payload.suppliedAttempts.at(-1).id]})}}]}));}});
 try{let v=await h('start',{grade:5,skill:'cnm_p168',aiEnabled:true});for(let n=0;n<2;n++){const q=C.fromId(v.question.id);v=await h('answer',{sessionId:v.id,revision:v.revision,questionId:q.id,answer:wrong(q),nickname:'DO_NOT_SEND'});if(n===0)v=await h('next',{sessionId:v.id,revision:v.revision});}assert.equal(v.nextPlan.source,'ai');assert.equal(payload.suppliedAttempts.length,2);for(const r of payload.suppliedAttempts){const q=C.fromId(r.questionId);assert.equal(r.question.prompt,q.prompt);assert.equal(r.question.referenceAnswer,q.answer);}assert.equal(payload.diagnosticContext.focusSkill,'cnm_p168');assert.equal(payload.diagnosticContext.prerequisiteRemaining,2);assert.ok(!JSON.stringify(payload).includes('DO_NOT_SEND'));assert.equal(v.question.answer,undefined);}finally{await h.close();}
});
await test('Different student steps can cause the model to select different valid foundation checks without asserting a cause',async()=>{
 const h=Service.createHandler({persist:false,getConfig:()=>({key:'fixture',model:'fixture',label:'Fixture',url:'https://fixture.invalid'}),fetchImpl:async(_,o)=>{const input=JSON.parse(JSON.parse(o.body).messages[1].content),pre=input.suppliedAttempts.at(-1).steps.includes('公因数')?'cnm_p158':'cnm_p167';return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({decisionIndex:input.allowedDecisions.findIndex(p=>p.action==='prerequisite'&&p.targetSkill===pre),reason:'先用一道新题检查这个基础是否影响约分。',rootId:pre,evidenceIds:[input.suppliedAttempts.at(-1).id]})}}]}));}});
 try{for(const [steps,target] of [['不会找公因数','cnm_p158'],['只把分子同时变了','cnm_p167']]){let v=await h('start',{grade:5,skill:'cnm_p168',aiEnabled:true});v=await h('answer',{sessionId:v.id,revision:v.revision,questionId:v.question.id,answer:'1/2',steps});assert.equal(v.nextPlan.source,'ai');assert.equal(v.nextPlan.targetSkill,target);assert.equal(v.hypotheses.find(h=>h.rootId===target).statusCode,'pending');assert.equal(v.nextPlan.checkSnapshot.status,'unseen');}}finally{await h.close();}
});
await test('Model evidence cannot cite a superseded question version even alongside the current response',()=>{
 const s=start();record(s);const last=s.attempts.at(-1);s.attempts.unshift({id:'stale',mode:'ai-unit',questionId:'aic_cnm_p168_q3',skillId:'cnm_p168',topicId:'cnm_p168',outcome:'correct',userAnswer:'8/12',at:1});const plan=C.candidates(s)[0];assert.throws(()=>Service.validateDecision(s,{decisionIndex:0,reason:'先检查这一步。',rootId:null,evidenceIds:[last.id,'stale']},'Fixture'),/invalid evidence/);assert.throws(()=>C.applyPlan(s,{...plan,reason:'先检查这一步。',evidenceIds:[last.id,'stale']}),/unknown evidence/);
});
await test('A mandatory return uses its deterministic rule without an unnecessary model call',async()=>{
 let calls=0;const h=Service.createHandler({persist:false,getConfig:()=>({key:'fixture',model:'fixture',label:'Fixture',url:'https://fixture.invalid'}),fetchImpl:async(_,o)=>{calls++;const input=JSON.parse(JSON.parse(o.body).messages[1].content);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({decisionIndex:input.allowedDecisions.findIndex(p=>p.action==='prerequisite'&&p.targetSkill==='cnm_p167'),reason:'先检查相关基础。',evidenceIds:[input.suppliedAttempts.at(-1).id],rootId:null})}}]}));}});
 try{let v=await h('start',{grade:5,skill:'cnm_p168',aiEnabled:true});v=await h('answer',{sessionId:v.id,revision:v.revision,questionId:v.question.id,answer:'1/2'});assert.equal(v.nextPlan.source,'ai');v=await h('next',{sessionId:v.id,revision:v.revision});v=await h('answer',{sessionId:v.id,revision:v.revision,questionId:v.question.id,answer:C.fromId(v.question.id).answer});assert.equal(calls,1);assert.equal(v.nextPlan.targetSkill,'cnm_p168');assert.equal(v.nextPlan.source,'rules');assert.equal(v.nextPlan.fallbackReason,undefined);}finally{await h.close();}
});
await test('AI reports receive the same direct foundation evidence displayed to the learner',async()=>{
 let reportInput;const h=Service.createHandler({persist:false,getConfig:()=>({key:'fixture',model:'fixture',label:'Fixture',url:'https://fixture.invalid'}),fetchImpl:async(_,o)=>{const input=JSON.parse(JSON.parse(o.body).messages[1].content);let result;if(input.allowedDecisions){let index=input.allowedDecisions.findIndex(p=>p.action==='prerequisite'&&p.targetSkill==='cnm_p167');result={decisionIndex:Math.max(index,0),reason:'检查相关基础，再回到约分。',evidenceIds:[input.suppliedAttempts.at(-1).id],rootId:null};}else{reportInput=input;result={summary:'约分目标仍需新题独立检查。',advice:'回到约分，使用新题继续验证。'};}return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}));}});
 try{let v=await h('start',{grade:5,skill:'cnm_p168',aiEnabled:true});const call=async(action,extra={})=>v=await h(action,{sessionId:v.id,revision:v.revision,...extra});await call('answer',{questionId:v.question.id,answer:'1/2'});await call('next');await call('answer',{questionId:v.question.id,answer:C.fromId(v.question.id).answer});await call('report');assert.equal(v.report.source,'ai');const check=reportInput.facts.diagnosticChecks.find(c=>c.skillId==='cnm_p167');assert.equal(check.status,'one_pass');assert.equal(check.passingIds.length,1);assert.deepEqual(reportInput.facts.diagnosticChecks,v.facts.diagnosticChecks);}finally{await h.close();}
});
await test('The learning page shows the return goal and the report separates direct foundation checks from a causal claim',()=>{
 const s=start();record(s);choosePre(s);record(s);C.applyPlan(s,C.localPlan(s));const view=C.view(s);
 const db={version:1,activeId:'p',config:{grade:5},ui:{screen:'practice'},profiles:[{id:'p',name:'测试',grade:5,records:[],spaces:{5:{semester:'下',topicId:'cnm_p168',query:'',runs:{},aiActive:true}},aiUnits:{5:{mode:'offline',state:s,view,draft:{}}}}]};
 const store=new Map([['zhishu.ability.v1',JSON.stringify(db)]]),{window}=require('linkedom').parseHTML(fs.readFileSync('dist/index.html','utf8'));window.scrollTo=()=>{};window.print=()=>{};const context=vm.createContext({window,document:window.document,location:{protocol:'file:'},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},console,setTimeout,clearTimeout,Date,Math,URL,Blob,AbortSignal});for(const script of window.document.querySelectorAll('script'))vm.runInContext(script.textContent,context);
 assert.match(window.document.querySelector('.ai-question-purpose').textContent,/约分/);const report=window.document.querySelector('[data-ai="report-nav"]');assert.ok(report);report.onclick({target:report});const checks=window.document.querySelector('.ai-foundation-checks');assert.ok(checks);assert.match(checks.textContent,/分数的基本性质/);assert.match(checks.textContent,/独立检查仍有困难/);assert.match(checks.textContent,/不能据此确定原题错因/);assert.ok(!window.document.querySelector('.ai-card'));
});
console.log(JSON.stringify({diagnosticPassed:passed,topicsChecked:data.topics.length}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
