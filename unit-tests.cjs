'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { parseHTML } = require('linkedom'), J = require('./source/judge.js'), C = require('./source/ai-learning.js'), R = require('./source/review-plans.js');
const { createHandler } = require('./tutor-service.cjs');
const data = { topics: require('./source/topics.json'), questions: require('./source/questions.json'), dependencies: require('./source/dependencies.json') }, T = require('./source/trainer.js').createEngine(data, require('./source/learning-unit.js'));
C.configureCurriculum(data, T, J, require('./source/curriculum-variants.js'));
let passed = 0; async function test(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
const q = (prompt, answer, extra = {}) => ({ type: 'numeric', prompt, answer, ...extra });
function boot() {
  const store = new Map(), { window } = parseHTML(fs.readFileSync('dist/index.html', 'utf8')); window.scrollTo = () => {}; window.print = () => {};
  const ctx = vm.createContext({ window, document: window.document, location: { protocol: 'file:' }, localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v) }, console, setTimeout, clearTimeout, Date, Math, URL, Blob, AbortSignal });
  for (const script of window.document.querySelectorAll('script')) vm.runInContext(script.textContent, ctx);
  const find = s => { const e = window.document.querySelector(s); assert.ok(e, s); return e; }, click = s => { const e = find(s); e.onclick({ target: e }); }, fill = (s, v) => { const e = find(s); e.value = v; e.oninput?.(); };
  click('[data-grade="2"]'); click('[data-action="enter"]'); click('[data-topic="cnm_p041"]');
  const profile = () => JSON.parse(store.get('zhishu.ability.v1')).profiles[0];
  return { window, find, click, fill, profile };
}
async function main() {
  await test('An equal number with the wrong dimension or wrong scale is not a correct answer', () => {
    for (const user of ['120米', '120分钟', '120kg']) assert.equal(J.judgeQuestion(q('2分是多少秒？', '120'), user).verdict, 'wrong', user);
    assert.equal(J.judgeQuestion(q('还剩多少厘米？', '4'), '4米').verdict, 'wrong'); assert.equal(J.judgeQuestion(q('质量是多少千克？', '0'), '0米').verdict, 'wrong');
  });
  await test('Plain numbers, fractions, fullwidth characters and correctly named units remain accepted', () => {
    for (const user of ['120', '120秒', '１２０ｓ', '240/2秒']) assert.equal(J.judgeQuestion(q('2分是多少秒？', '120'), user).verdict, 'correct', user);
    assert.equal(J.judgeQuestion(q('2米是多少厘米？', '200'), '200cm').verdict, 'correct');
  });
  await test('Equivalent quantities in a different requested unit require completion instead of becoming success or failure', () => {
    for (const [prompt, answer, user] of [['2米是多少厘米？', '200', '2米'], ['2分是多少秒？', '120', '2分'], ['面积是多少cm²？', '10000', '1m²'], ['体积是多少毫升？', '1000', '1升'], ['质量是多少千克？', '2', '2000克']]) { const result = J.judgeQuestion(q(prompt, answer), user); assert.equal(result.verdict, 'incomplete'); assert.match(result.message, /换算成/); }
    assert.equal(J.judgeQuestion(q('以米为单位填写', '1'), '100cm').verdict, 'incomplete');
  });
  await test('Without a requested output unit, equivalent explicit reference quantities can be accepted', () => {
    assert.equal(J.judgeQuestion(q('质量是多少？', '2千克'), '2000g').verdict, 'correct'); assert.equal(J.judgeQuestion(q('长度是多少？', '1米'), '100cm').verdict, 'correct');
    assert.equal(J.judgeQuestion(q('填写参考结果', '5平方单位'), '5平方单位').verdict, 'correct');
  });
  await test('Money cents and time minutes are distinguished using the actual question context', () => {
    assert.equal(J.judgeQuestion(q('1元是多少分？', '100'), '1元').verdict, 'incomplete'); assert.equal(J.judgeQuestion(q('1元是多少分？', '100'), '100分').verdict, 'correct');
    assert.equal(J.judgeQuestion(q('分针转过一圈是几分？', '60'), '60分').verdict, 'correct');
  });
  await test('Multiple answers and coordinate tuples cannot discard explicit units during comparison', () => {
    assert.equal(J.judgeQuestion(q('两段分别是多少厘米？', '2,3'), '2厘米,3厘米').verdict, 'correct'); assert.equal(J.judgeQuestion(q('两段分别是多少厘米？', '2,3'), '2米,3米').verdict, 'wrong');
    assert.equal(J.judgeQuestion(q('填写坐标', '(2,3)'), '(2m,3kg)').verdict, 'manual'); assert.equal(J.judgeAnswer('(2m,3kg)', '(2m,3s)').verdict, 'wrong');
  });
  await test('Unsupported units remain unconfirmed and never create guessed correctness', () => {
    assert.equal(J.judgeQuestion(q('2分是多少秒？', '120'), '120节').verdict, 'manual'); assert.equal(J.judgeQuestion(q('x的值是多少？', '3'), '3米').verdict, 'manual');
  });
  await test('Old unit mistakes keep their original response but leave ability, topic progress and review evidence', () => {
    const raw = T.bank.cnm_p041.find(q => q.type === 'numeric' && q.difficulty === 'standard'), row = { id: 'old-unit', mode: 'ai-unit', questionId: 'aic_' + raw.id, skillId: raw.topicId, topicId: raw.topicId, outcome: 'correct', userAnswer: raw.answer + '米', itemB: -.35, difficulty: 'standard' };
    const checked = C.auditAttempts([row])[0]; assert.equal(checked.userAnswer, row.userAnswer); assert.equal(checked.outcome, 'correct'); assert.equal(checked.evidenceEligible, false); assert.equal(C.estimate([checked]).n, 0); assert.equal(T.evidence([checked], raw.topicId).n, 0);
    const p = { records: [row], reviewPlans: { a: { grade: 2, skillId: raw.topicId, evidenceIds: [row.id], dueAt: Date.now(), step: 1 } } }; assert.equal(R.queue(p, 2, C)[0].status, 'recheck');
  });
  await test('A previously penalized valid quantity also needs new evidence instead of silently changing its outcome', () => {
    const raw = T.bank.cnm_p041.find(q => q.type === 'numeric' && q.difficulty === 'standard'), row = { id: 'old-format', mode: 'topic-learning', questionId: raw.id, topicId: raw.topicId, outcome: 'wrong', userAnswer: Number(raw.answer) / 100 + '米', difficulty: 'standard' };
    const checked = C.auditAttempts([row])[0]; assert.equal(checked.outcome, 'wrong'); assert.equal(checked.evidenceEligible, false); assert.equal(C.independent([row]).length, 0);
  });
  await test('Ordinary practice retains the draft and adds no attempt when conversion is unfinished', () => {
    const a = boot(), p = a.profile(), run = p.spaces[2].runs.cnm_p041, item = T.items[run.current.questionId], answer = Number(item.answer) / 100 + '米';
    a.fill('#practice-answer', answer); a.click('[data-action="submit"]'); assert.equal(a.find('#practice-answer').value, answer); assert.equal(a.profile().records.length, 0); assert.match(a.find('#app').textContent, /换算成/);
  });
  await test('Offline AI learning also preserves an unfinished conversion without creating a decision', () => {
    const a = boot(); a.click('[data-action="ai-entry"]'); a.click('[data-ai="start"]'); const before = a.profile().aiUnits[2].view, item = C.fromId(before.question.id), answer = Number(item.answer) / 100 + '米';
    a.fill('#ai-answer', answer); a.click('[data-ai="submit"]'); const after = a.profile().aiUnits[2].view; assert.equal(after.revision, before.revision); assert.equal(after.attempts.length, 0); assert.equal(after.decisions.length, 0); assert.equal(a.find('#ai-answer').value, answer); assert.match(a.find('#app').textContent, /换算成/);
  });
  await test('The server enforces canonical units and refuses a client attempt to redefine the required unit', async () => {
    const h = createHandler({ persist: false, getConfig: () => ({}) }); let v = await h('start', { grade: 2, skill: 'cnm_p041' }); const item = C.fromId(v.question.id), input = { sessionId: v.id, revision: v.revision, questionId: item.id };
    await assert.rejects(h('answer', { ...input, answer: Number(item.answer) / 100 + '米', expectedUnit: 'm' }), /换算成/); assert.equal((await h('resume', { sessionId: v.id })).attempts.length, 0);
    v = await h('answer', { ...input, answer: item.answer + '米', expectedUnit: 'm' }); assert.equal(v.feedback.record.outcome, 'wrong');
  });
  console.log(JSON.stringify({ unitsPassed: passed, liveModelCalls: 0 }));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
