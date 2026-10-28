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

test('Expansion goals reject unchanged and unfinished equivalent expressions without inventing an error response', () => {
  const q = C.blueprint('distribute', 1, { a: 3, b: 3, x: 5 });
  for (const answer of ['-(x-3)', '（−Ｘ＋３）', '-x+1+2', '2x-3x+3', '-x+3+0']) {
    assert.equal(M.judge(q, answer).verdict, 'incomplete', answer);
  }
  for (const answer of ['-x+3', '3-x', '-1x+3', '-1*x+3', '−Ｘ＋3'.replace('＋', '+')]) assert.equal(M.judge(q, answer).verdict, 'correct', answer);
  assert.equal(M.judge(q, '-x-3').verdict, 'wrong');
  const s = state(), before = s.revision;
  assert.throws(() => C.record(s, '-(x-' + s.current.question.params.b + ')'), /还需要/);
  assert.equal(s.attempts.length, 0); assert.equal(s.revision, before); assert.equal(s.feedback, null);
});
test('Simplified goals accept rational terms and canonical constant answers while retaining arithmetic safety', () => {
  const q = { type: 'expression', skillId: 'distribute', answer: '-x/2+3/2' };
  for (const answer of ['3/2-x/2', '-1/2*x+1.5', '-0.5x+1.5']) assert.equal(M.judge(q, answer).verdict, 'correct', answer);
  const advanced = C.blueprint('distribute', 2, { a: 3, b: 4, x: 5 });
  assert.equal(advanced.answer, '12'); assert.equal(M.judge(advanced, '0x+12').verdict, 'incomplete');
  assert.equal(M.judge(advanced, '-3x+12+3x').verdict, 'incomplete'); assert.equal(M.judge(advanced, '12').verdict, 'correct'); assert.equal(M.judge(advanced, '(12)').verdict, 'correct');
  assert.equal(M.judge({ type: 'expression', answer: 'x+3' }, '(x+3)').verdict, 'correct');
});
function recordAt(s, skill, level, correct = true, hint = false) {
  C.pick(s, skill, 'probe', level);
  if (hint) C.hint(s);
  return C.record(s, correct ? s.current.question.answer : '999');
}
function suspected(root = 'distribute') {
  const s = state(); recordAt(s, 'distribute', 1, false);
  C.applyPlan(s, { ...C.localPlan(s), rootId: root }); return s;
}
test('Two independent new checks can withdraw an inferred prerequisite hypothesis while preserving its source evidence', () => {
  const s = suspected('sign'), h = s.hypotheses[0], original = h.evidenceIds[0];
  recordAt(s, 'sign', 0); assert.equal(h.statusCode, 'pending');
  recordAt(s, 'sign', 0); assert.equal(h.statusCode, 'not_supported'); assert.equal(h.supportIds.length, 0);
  assert.equal(h.passingEvidenceIds.length, 2); assert.ok(h.evidenceIds.includes(original)); assert.ok(h.history.some(e => e.code === 'pending'));
});
test('Hints, repeated attempts, unrelated skills and lower-level passes cannot close a harder suspected gap', () => {
  const s = suspected(), h = s.hypotheses[0];
  recordAt(s, 'distribute', 0); recordAt(s, 'distribute', 0); assert.equal(h.statusCode, 'pending');
  recordAt(s, 'balance', 2); recordAt(s, 'balance', 2); assert.equal(h.statusCode, 'pending');
  recordAt(s, 'distribute', 1, true, true); C.retry(s); C.record(s, s.current.question.answer);
  recordAt(s, 'distribute', 1, true, true); assert.equal(h.statusCode, 'pending'); assert.equal(h.passingEvidenceIds.length, 0);
});
test('Independent retests record improvement and later errors reopen the same hypothesis without deleting history', () => {
  const s = suspected(), h = s.hypotheses[0];
  recordAt(s, 'distribute', 1); recordAt(s, 'distribute', 1); assert.equal(h.statusCode, 'improved');
  assert.equal(C.reportFacts(s).active, 0);
  recordAt(s, 'distribute', 1, false); assert.equal(h.statusCode, 'reopened'); assert.equal(h.passingEvidenceIds.length, 0);
  recordAt(s, 'distribute', 1, false); assert.equal(h.statusCode, 'supported');
  recordAt(s, 'distribute', 1); recordAt(s, 'distribute', 2); assert.equal(h.statusCode, 'improved');
  assert.ok(h.history.some(e => e.code === 'reopened'));
});
test('Teaching a suspected prerequisite before retesting records independent progress rather than claiming the original hypothesis was disproved', () => {
  const s = suspected('sign'); recordAt(s, 'sign', 0, true, true); recordAt(s, 'sign', 0); recordAt(s, 'sign', 0);
  assert.equal(s.hypotheses[0].statusCode, 'improved');
});
test('Evidence classifications do not overlap or let an earlier assisted exposure become a later independent observation', () => {
  const base = { outcome: 'correct', skillId: 'sign', dimension: 'symbol' };
  const rows = [{ ...base, id: 'a', contentKey: 'a' }, { ...base, id: 'b', contentKey: 'b', assisted: true }, { ...base, id: 'c', contentKey: 'b' }, { ...base, id: 'd', contentKey: 'd', assisted: true, repeated: true }, { id: 'e', outcome: 'skip' }, { id: 'f', outcome: 'not_learned' }, { ...base, id: 'g', evidenceEligible: false }];
  const e = C.evidenceSummary(rows);
  assert.equal(e.independent, 1); assert.equal(e.assisted, 1); assert.equal(e.repeated, 2);
  assert.equal(e.independent + e.assisted + e.repeated + e.skipped + e.notLearned + e.needsReview, e.total);
});
test('Previously accepted unfinished answers are retained but excluded from both unit and grade evidence', () => {
  const q = C.blueprint('distribute', 1), old = { id: 'old', mode: 'ai-unit', questionId: q.id, contentKey: q.prompt, skillId: q.skillId, topicId: q.topicId, dimension: q.dimension, outcome: 'correct', userAnswer: '-(x-5)', itemB: q.b };
  const row = C.auditAttempts([old])[0]; assert.equal(row.outcome, 'correct'); assert.equal(row.userAnswer, old.userAnswer);
  assert.equal(row.evidenceEligible, false); assert.equal(C.estimate([row]).n, 0); assert.equal(C.profile([row])[0].n, 0);
  const Trainer = require('./source/trainer.js').createEngine({ topics: require('./source/topics.json'), questions: require('./source/questions.json'), dependencies: require('./source/dependencies.json') }, require('./source/learning-unit.js'));
  assert.equal(Trainer.evidence([row], q.topicId).n, 0);
  const legacy = state(); C.pick(legacy, 'distribute', 'practice', 2, { a: 3, b: 4, x: 5, context: 'books' });
  legacy.current.question.answer = '0x + 12'; legacy.current.revealed = true;
  assert.equal(C.view(legacy).question.answer, '12');
});
test('Legacy hypotheses upgrade from actual retained evidence and do not fabricate missing source records', () => {
  const s = suspected('sign'); delete s.hypotheses[0].triggerIds; delete s.hypotheses[0].history; delete s.hypotheses[0].statusCode;
  recordAt(s, 'sign', 0); recordAt(s, 'sign', 0);
  const copy = JSON.parse(JSON.stringify(s)); assert.equal(C.view(copy).hypotheses[0].statusCode, 'not_supported');
  copy.attempts = []; C.refreshHypotheses(copy); assert.equal(copy.hypotheses[0].statusCode, 'pending'); assert.match(copy.hypotheses[0].explanation, /原始作答/);
});
test('Narrative reports are invalidated by later responses while current facts remain available', () => {
  const s = suspected(); const facts = C.reportFacts(s);
  s.report = { source: 'rules', summary: facts.summary, advice: facts.advice, evidenceKey: facts.evidenceKey };
  assert.ok(C.view(s).report); recordAt(s, 'distribute', 1);
  assert.equal(C.view(s).report, null); assert.equal(C.view(s).reportStale, true); assert.equal(C.view(s).facts.counts.independent, 2);
});

console.log(JSON.stringify({ aiLearningPassed: passed, generatedCasesChecked: 1440, liveModelCalls: 0 }));
