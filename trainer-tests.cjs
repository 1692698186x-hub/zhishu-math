'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const data = { topics: require('./source/topics.json'), questions: require('./source/questions.json'), dependencies: require('./source/dependencies.json') };
const unit = require('./source/learning-unit.js');
const { createEngine } = require('./source/trainer.js');
const T = createEngine(data, unit), judge = require('./source/judge.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
function answer(run, records, outcome, extra) { T.next(run, records); const q = T.items[run.current.questionId]; const row = T.record(run, records, outcome, { userAnswer: q.answer, ...extra }); run.feedback = null; return row; }
test('Every grade has practice items and every selected item belongs to its topic', () => {
  for (let grade = 1; grade <= 9; grade++) {
    const topics = data.topics.filter(t => t.grade === grade); assert.ok(topics.length);
    for (const t of topics) { assert.ok(T.bank[t.id].length, t.id); for (const q of T.bank[t.id]) assert.equal(q.topicId, t.id); }
  }
});
test('All supplemental answers are accepted and their printed arithmetic is correct', () => {
  let count = 0;
  for (const t of data.topics) for (const q of T.supplemental(t)) {
    assert.equal(judge.judgeQuestion(q, q.answer).verdict, 'correct', q.id);
    let expected;
    if (['cnm_010','cnm_012','cnm_014','cnm_017'].includes(t.id)) {
      const m=q.prompt.match(/计算 (-?\d+) ([+−×÷]) \((-?\d+)\)(?: \+ (\d+))?/); assert.ok(m,q.prompt);
      const a=Number(m[1]), b=Number(m[3]); expected=({'+':()=>a+b,'−':()=>a-b,'×':()=>a*b,'÷':()=>a/b}[m[2]])()+Number(m[4]||0);
    } else if (t.id==='cnm_042') {
      const m=q.prompt.match(/方程：(\d+)x \+ (\d+) = (?:(\d+)x \+ )?(-?\d+)/); assert.ok(m,q.prompt);
      const x=Number(q.answer); assert.equal(Number(m[1])*x+Number(m[2]), Number(m[3]||0)*x+Number(m[4]),q.id);
    } else if (t.id==='cnm_034') {
      const m=q.prompt.match(/：(−?)(\d+)x ([+−]) (\d+)x/); assert.ok(m,q.prompt); expected=(m[1]? -1:1)*Number(m[2])+(m[3]==='+'?1:-1)*Number(m[4]);
    } else if (['cnm_007','cnm_008'].includes(t.id)) {
      const m=q.prompt.match(/计算 \|−(\d+)\|(?: ([+−]) \|(\d+)\|)?/); assert.ok(m,q.prompt); expected=Number(m[1])+(m[2]==='−'?-1:1)*Number(m[3]||0);
    } else if(t.id==='cnm_006') {
      if(q.prompt.startsWith('写出')) expected=-Number(q.prompt.match(/写出 (-?\d+)/)[1]);
      else if(q.prompt.startsWith('若 a =')) expected=-Number(q.prompt.match(/a = (-?\d+)/)[1]);
      else {const m=q.prompt.match(/相反数是 (-?\d+)，求 a \+ (\d+)/);expected=-Number(m[1])+Number(m[2]);}
    }
    if(expected!==undefined)assert.equal(Number(q.answer),expected,q.id); count++;
  }
  assert.ok(count>400); console.log('Supplemental items checked: '+count);
});
test('Two independent successes at the same level raise difficulty; one miss lowers it', () => {
  const records=[],r=T.create('cnm_043',records); answer(r,records,'correct'); assert.equal(r.level,1); answer(r,records,'correct'); assert.equal(r.level,2); answer(r,records,'wrong'); assert.equal(r.level,1);
});
test('Hints and repeated items never count as independent mastery or promotion', () => {
  const records=[],r=T.create('cnm_043'); T.next(r,records);r.current.assisted=true;answer(r,records,'correct'); assert.equal(T.evidence(records,r.topicId).n,0); assert.equal(r.streak,0);
  T.next(r,records);r.current.repeated=true;answer(r,records,'correct');assert.equal(T.evidence(records,r.topicId).n,0);assert.equal(r.level,1);
});
test('A single answer has conservative progress and cannot establish stable mastery', () => {
  const records=[],r=T.create('cnm_006');answer(r,records,'correct');const ev=T.evidence(records,r.topicId);assert.equal(ev.stable,false);assert.ok(ev.progress>0&&ev.progress<25);
});
test('Skip and unlearned do not become independent errors', () => {
  const records=[],r=T.create('cnm_006');answer(r,records,'skip');answer(r,records,'not_learned');const ev=T.evidence(records,r.topicId);assert.equal(ev.n,0);assert.equal(ev.status,'notlearned');
});
test('Content identity prevents duplicate wording from creating independent evidence', () => {
  const records=[{topicId:'cnm_006',questionId:'one',contentKey:'same',difficulty:'standard',outcome:'correct',at:1},{topicId:'cnm_006',questionId:'two',contentKey:'same',difficulty:'standard',outcome:'correct',at:2}];assert.equal(T.evidence(records,'cnm_006').n,1);
});
test('Every topic terminates within the round budget even if all answers are skipped', () => {
  for(const t of data.topics){const records=[],r=T.create(t.id);for(let n=0;n<15&&!r.finished;n++){T.next(r,records);if(r.current)answer(r,records,'skip');}assert.ok(r.finished,t.id);assert.ok(r.answers.length<=12);}
});
test('Practice never repeats a printed problem inside the same round', () => {
  const records=[],r=T.create('cnm_043');for(let n=0;n<12;n++)answer(r,records,'correct');assert.equal(new Set(records.map(a=>a.contentKey)).size,records.length);
});
test('Draft and question resume from persisted state; no wrong topic is substituted', () => {
  const records=[],r=T.create('cnm_043');T.next(r,records);r.draft={answer:'12',steps:'先去括号'};r.current.assisted=true;const restored=JSON.parse(JSON.stringify(r));assert.equal(T.next(restored,records).questionId,r.current.questionId);assert.equal(restored.draft.answer,'12');assert.equal(restored.current.assisted,true);
});
test('Untested prerequisites remain untested after a composite problem is solved', () => {
  const records=[],r=T.create('cnm_043');answer(r,records,'correct');assert.equal(T.evidence(records,'cnm_035').n,0);assert.equal(T.evidence(records,'cnm_040').progress,0);
});
console.log(JSON.stringify({trainerPassed:passed,allGrades:9,topics:data.topics.length}));
