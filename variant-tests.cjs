'use strict';
const assert = require('node:assert/strict');
const V = require('./source/curriculum-variants.js'), J = require('./source/judge.js'), M = require('./source/linear-math.js'), C = require('./source/ai-learning.js');
const data = { topics: require('./source/topics.json'), questions: require('./source/questions.json'), dependencies: require('./source/dependencies.json') };
const T = require('./source/trainer.js').createEngine(data, require('./source/learning-unit.js'));
C.configureCurriculum(data, T, J, V);
let passed = 0, parameterCases = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
const answerText = q => q.type === 'choice' ? q.choices.find(c => c.key === q.answer).text : q.answer;
test('All controlled families cover nine grades and produce canonical questions under 3960 parameter combinations', () => {
  assert.equal(new Set(V.supported.map(id => T.topics[id].grade)).size, 9);
  for (const id of V.supported) for (let level = 0; level < 3; level++) for (let n = 0; n < 120; n++) {
    const q = V.item(id, level, n), canonical = C.fromId('aiv_' + id + '_' + level + '_' + n);
    assert.equal(q.prompt, canonical.prompt); assert.equal(q.answer, canonical.answer); assert.equal(J.judgeQuestion(q, q.answer).verdict, 'correct'); assert.equal(canonical.topicId, id); parameterCases++;
    if (q.type === 'choice') assert.equal(new Set(q.choices.map(c => c.text)).size, q.choices.length);
  }
});
test('Printed arithmetic, unit conversions, place values and quadratic coefficients agree with independent calculations', () => {
  for (let n = 0; n < 120; n++) {
    let q = V.item('cnm_p061', 1, n), m = q.prompt.match(/^(\d+) 分/); assert.equal(Number(q.answer), Number(m[1]) * 60);
    q = V.item('cnm_p096', 1, n); m = q.prompt.match(/数 (\d+)/); assert.equal(Number(q.answer), Math.floor(Number(m[1]) / 1000) % 10);
    q = V.item('cnm_p132', 1, n); m = q.prompt.match(/计算：([\d.]+) × (\d+)/); assert.ok(Math.abs(M.number(q.answer) - M.number(m[1]) * Number(m[2])) < 1e-10);
    q = V.item('cnm_002', 1, n); m = q.prompt.match(/上升 (\d+) 厘米，再下降 (\d+)/); assert.equal(Number(q.answer), Number(m[1]) - Number(m[2]));
    q = V.item('cnm_219', 1, n); m = q.prompt.match(/(\d+)x² - (\d+)x \+ (\d+) =/); assert.deepEqual(q.answer.split(',').map(Number), [Number(m[1]), -Number(m[2]), Number(m[3])]);
  }
});
test('Ratio judgements compare the actual four printed values and triangle correspondence follows letter order', () => {
  for (let n = 0; n < 120; n++) {
    let q = V.item('cnm_p210', 1, n), m = q.prompt.match(/比 (\d+):(\d+) 与 (\d+):(\d+)/), equal = Number(m[1]) * Number(m[4]) === Number(m[2]) * Number(m[3]);
    assert.ok(answerText(q).startsWith(equal ? '能，' : '不能，'));
    q = V.item('cnm_120', 1, n); m = q.prompt.match(/≌ △([DEF]{3})/); assert.equal(answerText(q), m[1].slice(0, 2));
    q = V.item('cnm_001', 1, n); assert.equal(answerText(q), '-a');
    q = V.item('cnm_p001', 1, n); const row = q.prompt.split('：')[1].split('。')[0].split('，').map(x => x === '□' ? Number(q.answer) : Number(x)); assert.deepEqual(row, [1, 2, 3, 4, 5]);
  }
});
test('Unsupported subjects, malformed identifiers and out-of-range model parameters cannot create a question', () => {
  for (const params of [{ variant: -1 }, { variant: 120 }, { variant: 1.5 }, { variant: '1' }, { variant: 1, answer: 999 }, { a: 3, b: 7, x: 5 }]) assert.throws(() => C.generationParameters('cnm_p001', 1, params));
  assert.throws(() => C.generationParameters('cnm_p002', 1, { variant: 1 }));
  for (const id of ['aiv_cnm_p001_1_120', 'aiv_unknown_1_0', 'aiv_cnm_p001_3_0']) assert.throws(() => C.fromId(id));
});
test('All five former retest shortages are filled while removed source questions remain readable as history', () => {
  for (const id of ['cnm_p210', 'cnm_001', 'cnm_002', 'cnm_003', 'cnm_120']) assert.ok(T.bank[id].filter(q => q.difficulty !== 'basic').length >= 2, id);
  assert.ok(!T.bank.cnm_p001.some(q => q.id === 'cnm_p001_q4')); assert.match(C.fromId('aic_cnm_p001_q4').prompt, /排队/);
  assert.ok(!T.bank.cnm_p210.some(q => q.id === 'cnm_p210_q4')); assert.equal(C.fromId('aic_cnm_p210_q4').answer, 'A');
});
test('Directed model variants keep the target topic, avoid exposed content and survive JSON resume', () => {
  const s = C.create({ skill: 'cnm_p132' }); C.next(s); C.record(s, s.current.question.answer); const plan = C.localPlan(s);
  C.applyPlan(s, { ...plan, parameters: { variant: 73 }, source: 'ai' }); C.next(s); assert.equal(s.current.question.origin, 'ai-parameters'); assert.equal(s.current.question.variantIndex, 73); assert.ok(s.current.question.id.startsWith('aiv_'));
  const restored = JSON.parse(JSON.stringify(s)); assert.equal(C.view(restored).question.prompt, s.current.question.prompt); C.record(restored, restored.current.question.answer); assert.equal(C.taskProgress(restored).status, 'verified');
});
test('Retired topic-mismatch questions retain the original response but stop affecting progress or success claims', () => {
  const original = { id: 'old', mode: 'ai-unit', questionId: 'aic_cnm_p001_q4', skillId: 'cnm_p001', topicId: 'cnm_p001', outcome: 'correct', userAnswer: 'A', difficulty: 'standard', itemB: -.35 };
  const row = C.auditAttempts([original])[0]; assert.equal(row.outcome, 'correct'); assert.equal(row.userAnswer, 'A'); assert.equal(row.evidenceEligible, false); assert.equal(C.independent([row]).length, 0);
  const s = C.create({ skill: 'cnm_p001' }); C.next(s); s.attempts = [original]; s.feedback = { record: original, label: '独立完成' }; const view = C.view(s);
  assert.equal(view.facts.counts.needsReview, 1); assert.equal(view.task.passed, 0); assert.match(view.nextPlan.reason, /目标不一致/);
});
test('Exhausted fixed items use checked variants without treating repeats as independent new observations', () => {
  const s = C.create({ skill: 'cnm_p132' }); s.exposed = T.bank.cnm_p132.map(q => q.prompt); C.next(s); assert.equal(s.current.question.origin, 'validated-variant');
  const first = s.current.question.prompt; C.record(s, s.current.question.answer); C.applyPlan(s, C.localPlan(s)); C.next(s); assert.notEqual(s.current.question.prompt, first);
});
console.log(JSON.stringify({ variantPassed: passed, parameterCases, supportedTopics: V.supported.length, gradesCovered: 9, liveModelCalls: 0 }));
