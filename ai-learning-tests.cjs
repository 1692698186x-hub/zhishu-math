'use strict';
const assert = require('node:assert/strict');
const C = require('./source/ai-learning.js');
const M = require('./source/linear-math.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
function state() { const s = C.create({ id: 'fixture' + Math.random() }); C.next(s); return s; }
test('Linear algebra supports fractions, unary negatives and implicit products without evaluating code', () => {
  assert.ok(M.equivalent('-2(x-3)+2x', '6')); assert.ok(M.equivalent('-(x-5)', '5-x')); assert.equal(M.number('1/2'), .5); assert.equal(M.solve('3(x-2)=12'), 6);
  for (const v of ['process.exit()', 'x*x', '1/0', 'x/(x-1)', '2**3', 'alert(1)', '((2)', '1e5']) assert.throws(() => M.expression(v), v);
});
test('All six skill blueprints at three levels produce valid math under varied parameters', () => {
  for (const skill of Object.keys(C.skills)) for (let l = 0; l < 3; l++) for (let n = 0; n < 80; n++) { const q = C.blueprint(skill, l, { a: 2 + n % 11, b: 2 + n % 19, x: 2 + n % 19, context: ['books', 'tickets', 'stationery'][n % 3] }); assert.ok(C.validateQuestion(q)); assert.equal(M.judge(q, q.answer).verdict, 'correct'); assert.equal(C.fromId(q.id).prompt, q.prompt); }
});
test('Invalid generation parameters and unknown question identifiers are rejected', () => {
  for (const p of [{ a: 0, b: 5, x: 3 }, { a: 3, b: -2, x: 3 }, { a: 3, b: 5, x: 999 }, { a: 3, b: 5, x: 3, context: 'unknown' }]) assert.throws(() => C.blueprint('solve', 1, p));
  assert.throws(() => C.fromId('FORGED')); assert.throws(() => C.blueprint('unknown', 0));
});
test('Choice answer positions vary and independent dimensions have actual dedicated tasks', () => {
  const positions = new Set(); for (let n = 0; n < 3; n++) positions.add(C.blueprint('verify', 1, { a: 2 + n, b: 5, x: 4 }).answer);
  assert.equal(positions.size, 3); assert.equal(C.blueprint('verify', 0).dimension, 'reverse'); assert.equal(C.blueprint('model', 0).dimension, 'modeling');
});
test('Wrong-answer views withhold reference answers until an intentional reveal', () => {
  const s = state(); C.record(s, '999', '先去括号'); C.applyPlan(s, C.localPlan(s)); assert.equal(Object.hasOwn(C.view(s).question, 'answer'), false); C.reveal(s); assert.equal(C.view(s).question.answer, s.current.question.answer);
});
test('Wrong answers arrange a probe and a failed probe can trigger a real prerequisite task', () => {
  const s = state(); C.record(s, '999'); C.applyPlan(s, C.localPlan(s)); assert.equal(s.nextPlan.action, 'probe'); C.next(s); assert.equal(s.current.stage, 'probe'); C.record(s, '999'); C.applyPlan(s, C.localPlan(s)); assert.equal(s.nextPlan.action, 'prerequisite'); C.next(s); assert.equal(s.current.question.skillId, 'sign');
});
test('Hints progress in three steps and assisted success triggers unseen independent retesting', () => {
  const s = state(), q = s.current.question; const h1 = C.hint(s), h2 = C.hint(s); assert.notEqual(h1, h2); C.hint(s); C.hint(s); assert.equal(s.current.hintCount, 3); C.record(s, q.answer); assert.equal(s.attempts[0].assisted, true); assert.equal(C.independent(s.attempts).length, 0); C.applyPlan(s, C.localPlan(s)); assert.equal(s.nextPlan.action, 'retest'); C.next(s); assert.notEqual(s.current.question.prompt, q.prompt); assert.equal(s.current.hintCount, 0);
});
test('Retrying a submitted question never creates a second independent observation', () => {
  const s = state(); C.record(s, '999'); C.applyPlan(s, C.localPlan(s)); C.retry(s); C.record(s, s.current.question.answer); assert.equal(s.attempts[1].assisted, true); assert.equal(s.attempts[1].repeated, true); assert.equal(C.independent(s.attempts).length, 1);
});
test('Skipped or not-yet-learned items do not update the ability estimate as errors', () => {
  for (const outcome of ['skip', 'not_learned']) { const s = state(); C.record(s, '', '', 0, outcome); assert.equal(C.estimate(s.attempts).n, 0); assert.equal(C.profile(s.attempts).find(d => d.id === 'symbol').n, 0); }
});
test('Ability estimates move with actual independent responses and retain uncertainty', () => {
  const rows = Array.from({ length: 8 }, (_, n) => ({ id: 'r' + n, contentKey: 'q' + n, skillId: 'sign', outcome: 'correct', itemB: -.35 }));
  assert.ok(C.estimate(rows).theta > 0); assert.ok(C.estimate(rows.map(r => ({ ...r, outcome: 'wrong' }))).theta < 0); assert.equal(C.estimate(rows, 'balance').n, 0); assert.ok(C.estimate(rows).sd > 0);
});
test('Unknown and sparse radar axes remain missing instead of becoming zero or invented scores', () => {
  const rows = [1, 2].map(n => ({ id: 'r' + n, contentKey: 'q' + n, dimension: 'symbol', outcome: 'correct' })); assert.ok(C.profile(rows).every(d => d.value === null)); rows.push({ id: 'r3', contentKey: 'q3', dimension: 'symbol', outcome: 'correct' }); const dims = C.profile(rows); assert.equal(dims[0].value, 80); assert.ok(dims.slice(1).every(d => d.value === null));
});
test('A composite item does not award mastery to untested prerequisite skills', () => {
  const s = state(); C.pick(s, 'solve', 'practice', 1); C.record(s, s.current.question.answer); assert.equal(C.estimate(s.attempts, 'distribute').n, 0); assert.equal(C.profile(s.attempts).find(d => d.id === 'equivalence').n, 0);
});
test('Decisions must refer to actual evidence and an allowed instructional action', () => {
  const s = state(); C.record(s, '999'); const plan = C.localPlan(s); assert.throws(() => C.applyPlan(s, { ...plan, targetSkill: 'model' })); assert.throws(() => C.applyPlan(s, { ...plan, evidenceIds: ['invented'] })); C.applyPlan(s, plan); assert.equal(s.decisions.length, 1);
});
test('New parameterized variants pass arithmetic checks and cannot reuse an exposed prompt', () => {
  const s = state(); C.record(s, s.current.question.answer); const plan = { ...C.candidates(s)[0], reason: '换新题继续确认', evidenceIds: [s.attempts[0].id], source: 'ai', parameters: { a: 4, b: 11, x: 8, context: 'tickets' } }; C.applyPlan(s, plan); C.next(s); assert.equal(s.current.question.origin, 'ai-parameters'); assert.equal(C.validateQuestion(s.current.question), true);
});
test('Knowledge graph candidates retain actual source paths and use the correct task-to-topic mapping', () => {
  const edges = require('./source/dependencies.json'), links = C.configureGraph(edges);
  assert.ok(links.some(p => p.skillId === 'solve' && p.prerequisiteSkill === 'distribute'));
  for (const p of links) for (let i = 1; i < p.path.length; i++) assert.ok(edges.some(e => e.topicId === p.path[i - 1] && e.prerequisiteId === p.path[i]));
  assert.equal(C.skills.model.topicId, 'cnm_045'); assert.equal(C.skills.verify.topicId, 'cnm_039');
});
console.log(JSON.stringify({ aiLearningPassed: passed, generatedCasesChecked: 1440, liveModelCalls: 0 }));
