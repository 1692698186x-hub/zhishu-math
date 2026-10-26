'use strict';
const assert=require('node:assert/strict');
const {createServer}=require('./server.cjs'),{validateReport,parseReport}=require('./report-service.cjs');
const sample={grade:7,topics:[{id:'cnm_043',attempts:3,independent:2,correct:1,status:'shaky'}],recent:[{topicId:'cnm_043',questionId:'cnm_043_q1',outcome:'wrong',steps:'2x-3=9'}]};
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
async function withServer(options,fn){const server=createServer(options);await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await fn('http://127.0.0.1:'+server.address().port);}finally{await new Promise(r=>server.close(r));}}
const config={key:'',model:'',url:'https://api.modelarts-maas.com/v2/chat/completions'};
const post=(url,body,headers={})=>fetch(url+'/api/report',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
(async()=>{
 await test('Report validation strips names and refuses mixed grades or fabricated counts',()=>{const clean=validateReport({...sample,name:'private name',key:'private token'});assert.equal(clean.name,undefined);assert.equal(clean.key,undefined);assert.throws(()=>validateReport({...sample,grade:8}));assert.throws(()=>validateReport({...sample,topics:[{...sample.topics[0],correct:7}]}));});
 await test('An unconfigured report endpoint honestly reports local analysis',()=>withServer({config},async url=>{const res=await post(url,sample);assert.equal(res.status,200);assert.equal((await res.json()).source,'rules');}));
 await test('A configured report uses the provider and sends only selected-grade evidence',()=>{let request;return withServer({config:{...config,key:'fixture-secret',model:'fixture-model'},fetchImpl:async(url,opts)=>{request=JSON.parse(opts.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'目前方程练习仍需巩固。',advice:'先练去括号，再用一道新题确认。'})}}]}),{status:200});}},async url=>{const res=await post(url,{...sample,name:'must not be sent'});const data=await res.json();assert.equal(data.source,'ai');assert.equal(data.summary,'目前方程练习仍需巩固。');assert.ok(!JSON.stringify(request).includes('must not be sent'));assert.ok(!JSON.stringify(request).includes('fixture-secret'));assert.equal(request.messages[1].role,'user');});});
 await test('Bad methods, foreign origins, and mixed-grade records are rejected',()=>withServer({config},async url=>{assert.equal((await fetch(url+'/api/report')).status,405);assert.equal((await post(url,sample,{Origin:'https://unrelated.test'})).status,403);assert.equal((await post(url,{...sample,grade:8})).status,400);}));
 await test('Report provider errors preserve local reporting and never leak credentials',()=>withServer({config:{...config,key:'fixture-secret',model:'fixture'},fetchImpl:async()=>{throw Error('fixture-secret');}},async url=>{const res=await post(url,sample);const text=await res.text();assert.ok(!text.includes('fixture-secret'));assert.equal(JSON.parse(text).source,'rules');}));
 await test('Malformed model reports are rejected and report text has bounded length',()=>{assert.throws(()=>parseReport('plain text'));assert.throws(()=>parseReport('{}'));const r=parseReport(JSON.stringify({summary:'a'.repeat(3000),advice:'b'.repeat(3000)}));assert.equal(r.summary.length,1200);assert.equal(r.advice.length,1000);});
 console.log(JSON.stringify({reportPassed:passed,liveModelCalls:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
