const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createEngine } = require('./source/ability.js');
const judge = require('./source/judge.js');
const load = f => JSON.parse(fs.readFileSync(path.join(__dirname, 'source', f), 'utf8'));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
const toyTopics = ['A', 'B', 'C', 'D', 'E'].map((id, i) => ({ id, name: id, grade: i ? 7 : 6, semester: '上', domain: '数与代数', chapter: '七上 第一章 ' + id }));
const toy = { topics: toyTopics, dependencies: [['B', 'A'], ['C', 'B'], ['D', 'B'], ['E', 'C'], ['E', 'D']].map(([topicId, prerequisiteId]) => ({ topicId, prerequisiteId, strength: 'hard' })), questions: toyTopics.flatMap(t => [1, 2, 3, 4].map(n => ({ id: t.id + '_q' + n, topicId: t.id, difficulty: n === 1 ? 'basic' : n === 4 ? 'advanced' : 'standard', type: 'numeric', prompt: '1+1', answer: '2' }))) };
const E = createEngine(toy);
function simulate(engine, student, opts = {}, existing = []) {
  const records = [...existing]; const session = engine.newSession({ grade: 7, semester: 'all', limit: 18, id: 'deterministic', ...opts });
  const trace = [];
  for (let step = 0; step < 100; step++) {
    const c = engine.next(session, records); if (!c) break;
    trace.push({ id: c.topicId, kind: c.kind, difficulty: engine.bank[c.topicId].find(q => q.id === c.questionId).difficulty });
    engine.record(session, records, student(c.topicId), { userAnswer: '2' });
  }
  assert.ok(session.finished); assert.ok(records.length <= session.limit + existing.length);
  assert.equal(new Set(session.answers.map(r => r.questionId)).size, session.answers.length);
  return { session, records, trace };
}
test('One successful gateway prunes prior questions without inventing mastery', () => {
  const x = simulate(E, () => 'correct');
  assert.equal(x.trace[0].id, 'E'); assert.equal(x.trace.length, 1);
  assert.ok(E.deferred(x.session).has('B')); assert.equal(E.evidence(x.records, 'B').status, 'unknown'); assert.equal(E.evidence(x.records, 'E').status, 'checking');
});
test('Wrong gateway follows dependencies to a confirmed shared foundation and stops redundant branches', () => {
  const x = simulate(E, id => id === 'A' ? 'correct' : 'wrong');
  assert.deepEqual(x.session.rootIds, ['B']);
  assert.equal(x.trace.filter(x => x.id === 'B').length, 2);
  assert.ok(x.trace.some(x => x.id === 'A')); assert.equal(x.trace.filter(x => x.id === 'D').length, 0);
  assert.equal(E.evidence(x.records, 'B').status, 'weak');
  console.log('  shared-foundation route: ' + x.trace.map(x => x.id + ':' + x.kind).join(' -> '));
});
test('A missed item followed by a successful check is not a confirmed root', () => {
  let first = true;
  const x = simulate(E, id => { if (id === 'B' && first) { first = false; return 'wrong'; } return 'correct'; }, { focusIds: ['B'], trace: false });
  assert.equal(x.session.rootIds.length, 0); assert.equal(E.evidence(x.records, 'B').status, 'shaky');
});
test('Not learned is not a wrong answer and can be revisited in a later session', () => {
  const x = simulate(E, () => 'not_learned', { focusIds: ['B'] });
  assert.equal(E.evidence(x.records, 'B').status, 'notlearned'); assert.equal(x.session.rootIds.length, 0);
  const y = simulate(E, () => 'correct', { focusIds: ['B'] }, x.records); assert.equal(y.trace.length, 1);
});
test('Assisted answers and repeated copies cannot manufacture secure mastery', () => {
  const repeated = Array.from({ length: 10 }, (_, i) => ({ topicId: 'B', questionId: 'B_q2', difficulty: 'standard', outcome: 'correct', at: i }));
  assert.equal(E.evidence(repeated, 'B').status, 'checking');
  const assisted = repeated.map(r => ({ ...r, assisted: true })); assert.equal(E.evidence(assisted, 'B').status, 'unknown');
  const diverse = [1, 2, 3].map(n => ({ topicId: 'B', questionId: 'B_q' + n, difficulty: n === 1 ? 'basic' : 'standard', outcome: 'correct', at: n }));
  assert.equal(E.evidence(diverse, 'B').status, 'secure');
});
test('Persistence preserves the exact pending question', () => {
  const s = E.newSession({ grade: 7, id: 'resume' }); const c = E.next(s, []);
  const restored = JSON.parse(JSON.stringify(s)); assert.deepEqual(E.next(restored, []), c);
});
test('A choice gateway needs an independent cross-check before deferring its prerequisites', () => {
  const choiceToy = JSON.parse(JSON.stringify(toy));
  choiceToy.questions.filter(q => q.topicId === 'E').forEach(q => q.type = 'choice');
  const engine = createEngine(choiceToy), session = engine.newSession({ grade: 7, id: 'choice' }), records = [];
  engine.next(session, records); engine.record(session, records, 'correct');
  assert.equal(engine.deferred(session).size, 0);
  const check = engine.next(session, records); assert.equal(check.topicId, 'E'); assert.equal(check.kind, 'verify');
  engine.record(session, records, 'correct'); assert.ok(engine.deferred(session).has('B'));
});
test('A local algebra miss does not immediately trigger early-primary arithmetic', () => {
  const localToy = JSON.parse(JSON.stringify(toy)); localToy.topics.find(t => t.id === 'A').grade = 2;
  const engine = createEngine(localToy), session = engine.newSession({ grade: 7, focusIds: ['B'], id: 'local' }), records = [];
  engine.next(session, records); engine.record(session, records, 'wrong');
  assert.equal(engine.next(session, records).topicId, 'B'); assert.equal(session.current.kind, 'confirm');
});
test('Equivalent fractions are accepted by the upstream grader', () => {
  assert.equal(judge.judgeQuestion({ type: 'numeric', answer: '1/2' }, '0.5').verdict, 'correct');
  assert.equal(judge.judgeQuestion({ type: 'numeric', answer: '1/2' }, '1/3').verdict, 'wrong');
});
const realData = { topics: load('topics.json'), dependencies: load('dependencies.json'), questions: load('questions.json') };
const R = createEngine(realData);
test('All seven-grade options and cross-grade prerequisites are available', () => {
  assert.equal(R.scope({ grade: 7 }).length, 119);
  for (const semester of ['上', '下', 'all']) assert.ok(R.scope({ grade: 7, semester }).length > 0);
  assert.ok(R.topics.some(t => t.grade === 1));
});
test('Real-data sessions respect budgets, question uniqueness, and profile-independent state', () => {
  for (const semester of ['上', '下', 'all']) {
    for (const outcome of ['correct', 'wrong', 'not_learned']) {
      const x = simulate(R, () => outcome, { semester, limit: 12, id: 'real-' + semester + outcome });
      assert.ok(x.trace.length > 0); assert.ok(x.trace.length <= 12);
      assert.equal(x.records.length, x.trace.length);
      console.log('  ' + semester + '/' + outcome + ': ' + x.trace.length + ' questions, ' + x.session.rootIds.length + ' root candidates, ' + [...R.deferred(x.session)].filter(id => x.session.scopeIds.includes(id)).length + ' scope prerequisites deferred');
    }
  }
});
test('Recommendations prioritize known prerequisite weaknesses over their dependants', () => {
  const x = simulate(E, id => id === 'A' ? 'correct' : 'wrong');
  const recs = E.recommendations(x.records, { grade: 7, semester: 'all' });
  assert.equal(recs[0].topic.id, 'B'); assert.ok(!recs.some(r => r.evidence.status === 'secure'));
});
test('Practising one skill lowers difficulty after failures and uses distinct questions', () => {
  const records = [{ topicId: 'B', questionId: 'B_q3', difficulty: 'standard', outcome: 'wrong', at: 1 }, { topicId: 'B', questionId: 'B_q4', difficulty: 'advanced', outcome: 'wrong', at: 2 }];
  const x = simulate(E, () => 'correct', { mode: 'practice', focusIds: ['B'], limit: 8 }, records);
  assert.equal(x.trace[0].difficulty, 'basic'); assert.ok(x.trace.every(r => r.id === 'B'));
});
console.log(JSON.stringify({ passed, failed: 0 }));
