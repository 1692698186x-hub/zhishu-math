'use strict';
const assert = require('node:assert/strict');
const unit = require('./source/learning-unit.js');
const L = require('./source/learning.js').createEngine(unit);
const judge = require('./source/judge.js');
const { createEngine } = require('./source/ability.js');
let passed = 0;
function test(name, action) { action(); passed++; console.log('PASS ' + name); }
function runToEnd(outcome = () => 'correct', history = [], options = {}) {
  const r = L.create(history, options); L.next(r);
  for (let step = 0; step < 150 && !r.finished; step++) {
    if (r.phase === 'plan') L.beginTraining(r);
    else if (r.feedback) L.continueRun(r);
    else { assert.ok(r.current); L.record(r, outcome(r, L.items[r.current.questionId])); }
  }
  assert.ok(r.finished, 'run must terminate'); assert.ok(r.answers.length <= r.limit); return r;
}
function startTraining(diagnosis = 'correct') {
  const r = L.create(); L.next(r);
  for (let i = 0; i < 3; i++) L.record(r, diagnosis);
  assert.equal(r.phase, 'plan'); assert.equal(r.feedback, null); L.beginTraining(r); return r;
}
// Evaluate the actual expressions printed in exercises, without executing JavaScript.
function evaluate(raw, x, blank) {
  let text = raw.replace(/[−－]/g, '-').replace(/\s/g, '').replace(/□/g, '(' + blank + ')').replace(/x/g, '(' + x + ')');
  text = text.replace(/(\d|\))(?=\()/g, '$1*');
  const tokens = text.match(/\d+(?:\.\d+)?|[()+*\-/]/g) || [];
  assert.equal(tokens.join(''), text, 'unexpected expression: ' + text);
  let pos = 0;
  function atom() { const t = tokens[pos++]; if (t === '-') return -atom(); if (t === '+') return atom(); if (t === '(') { const value = sum(); assert.equal(tokens[pos++], ')'); return value; } assert.ok(t !== undefined); return Number(t); }
  function product() { let n = atom(); while (['*', '/'].includes(tokens[pos])) { const op = tokens[pos++], b = atom(); n = op === '*' ? n * b : n / b; } return n; }
  function sum() { let n = product(); while (['+', '-'].includes(tokens[pos])) { const op = tokens[pos++], b = product(); n = op === '+' ? n + b : n - b; } return n; }
  const value = sum(); assert.equal(pos, tokens.length); return value;
}
test('Every authored item has a unique ID, an existing skill, and an accepted reference answer', () => {
  assert.equal(new Set(unit.questions.map(q => q.id)).size, unit.questions.length);
  for (const q of unit.questions) { assert.ok(L.skills[q.skillId]); assert.equal(judge.judgeQuestion(q, q.answer).verdict, 'correct', q.id); }
});
test('All numeric exercise answers satisfy their printed equations or word problems', () => {
  for (const q of unit.questions.filter(q => q.type === 'numeric')) {
    const answer = Number(q.answer), prompt = q.prompt;
    assert.ok(Number.isFinite(answer), q.id);
    if (prompt.startsWith('去括号：') || prompt.startsWith('整理 ')) {
      const parts = prompt.startsWith('去括号：') ? prompt.slice(4).split(' = ') : prompt.slice(3).split('，可得 ');
      const right = parts[1].split('。')[0];
      for (const x of [-3, 0, 7]) assert.equal(evaluate(parts[0], x, answer), evaluate(right, x, answer), q.id);
    } else if (prompt.startsWith('解方程：')) {
      const [left, right] = prompt.slice(4).split('。')[0].split(' = ');
      assert.equal(evaluate(left, answer), evaluate(right, answer), q.id);
      assert.notEqual(evaluate(left, answer + 1), evaluate(right, answer + 1), 'equation needs a unique solution: ' + q.id);
    } else if (q.skillId === 'distribute') {
      const m = prompt.match(/长为 (\d+)，宽为 \(x \+ (\d+)\)/); assert.ok(m, q.id); assert.equal(answer, Number(m[1]) * Number(m[2]));
    } else if (q.skillId === 'balance') {
      const m = prompt.match(/买 (\d+) 支再加 (\d+) 元包装费，共 (\d+) 元/); assert.ok(m, q.id); assert.equal(Number(m[1]) * answer + Number(m[2]), Number(m[3]));
    } else {
      const m = prompt.match(/又得到 (\d+) 张。此时卡片数的 (\d+) 倍是 (\d+)/); assert.ok(m, q.id); assert.equal((answer + Number(m[1])) * Number(m[2]), Number(m[3]));
    }
  }
});
test('Initial diagnosis has exactly three items, no hints, and no answer feedback', () => {
  const r = L.create(); L.next(r);
  for (let i = 0; i < 3; i++) { assert.equal(L.hint(r), null); L.reveal(r); assert.equal(r.current.revealed, false); L.record(r, 'correct'); assert.equal(r.feedback, null); }
  assert.equal(r.phase, 'plan'); assert.ok(Object.values(r.skills).every(s => !s.ready));
});
test('Two independent new successes at the same level are required for promotion', () => {
  const r = startTraining(); assert.equal(r.current.level, 1);
  L.record(r, 'correct'); L.continueRun(r); assert.equal(r.current.level, 1);
  L.record(r, 'correct'); L.continueRun(r); assert.equal(r.current.level, 2);
});
test('Hinted success and viewed solutions do not promote the learner', () => {
  const r = startTraining(); const id = r.current.skillId;
  L.hint(r); const a = L.record(r, 'correct'); L.continueRun(r);
  assert.equal(a.assisted, true); assert.equal(r.skills[id].streak, 0); assert.equal(r.current.level, 1);
  L.reveal(r); L.record(r, 'correct'); assert.equal(r.skills[id].level, 1);
});
test('An error is only a hypothesis; a failed independent probe confirms a gap', () => {
  const r = startTraining('wrong'); assert.equal(r.current.stage, 'probe');
  const id = r.current.skillId; assert.equal(r.skills[id].verifiedGap, false);
  L.record(r, 'wrong'); assert.equal(r.skills[id].verifiedGap, true); L.continueRun(r);
  assert.equal(r.current.level, 0);
});
test('A successful probe does not confirm the original suspected error', () => {
  const r = startTraining('wrong'), id = r.current.skillId;
  L.record(r, 'correct'); assert.equal(r.skills[id].verifiedGap, false);
  assert.match(r.feedback.transition, /仍需更多证据/);
});
test('Strong, struggling, skipped, and not-yet-taught learners all finish within budget', () => {
  for (const outcome of ['correct', 'wrong', 'skip', 'not_learned']) {
    const r = runToEnd(() => outcome);
    assert.equal(new Set(r.answers.map(a => L.items[a.questionId].prompt)).size, r.answers.length);
    if (outcome === 'not_learned') { assert.equal(r.answers.length, 3); assert.equal(L.summary(r).transferCorrect, 0); assert.ok(Object.values(r.skills).every(s => !s.verifiedGap)); }
  }
});
test('Independent post-tests and reviews never reuse exposed problem content', () => {
  const original = runToEnd();
  const review = runToEnd(() => 'correct', original.answers, { review: true });
  const exposed = new Set(original.answers.map(a => L.items[a.questionId].prompt));
  for (const a of review.answers) assert.ok(!exposed.has(L.items[a.questionId].prompt));
  assert.equal(review.answers.length, 3); assert.equal(L.summary(review).transferCorrect, 3);
});
test('Exhausted fresh review items are reported instead of counted as new evidence', () => {
  const seen = unit.questions.filter(q => ['transfer', 'review'].includes(q.stage)).map(q => ({ questionId: q.id }));
  const r = runToEnd(() => 'correct', seen, { review: true });
  assert.equal(r.answers.length, 0); assert.match(r.finishReason, /没有足够的未见/);
});
test('Draft, current exercise, hint exposure, and feedback survive JSON persistence', () => {
  let r = startTraining(); r.draft = { answer: '5', steps: '2x = 10' }; L.hint(r);
  r = JSON.parse(JSON.stringify(r)); assert.deepEqual(L.next(r), r.current); assert.equal(r.current.hintCount, 1); assert.equal(r.draft.steps, '2x = 10');
  L.record(r, 'wrong', r.draft); r = JSON.parse(JSON.stringify(r)); assert.ok(r.feedback); assert.equal(L.next(r), null);
});
test('AI suggestions cannot change correctness, invent skills, or declare mastery', () => {
  const r = startTraining(); L.record(r, 'wrong'); const id = r.feedback.record.questionId;
  L.setCoach(r, id, { source: 'ai', suspectedSkillId: 'invented', hint: 'test' });
  assert.equal(r.answers.at(-1).outcome, 'wrong'); assert.ok(!r.probeQueue.includes('invented')); assert.ok(Object.values(r.skills).every(s => !s.ready));
});
test('Independent report excludes assisted and previously exposed learning items', () => {
  const E = createEngine({ topics: [], questions: [], dependencies: [] });
  const records = [1, 2, 3].map(n => ({ topicId: 'T', questionId: 'q' + n, difficulty: 'standard', outcome: 'correct', repeated: true, at: n }));
  assert.equal(E.evidence(records, 'T').n, 0);
});
console.log(JSON.stringify({ learningPassed: passed, authoredItemsChecked: unit.questions.length }));
