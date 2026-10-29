'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { parseHTML } = require('linkedom'), C = require('./source/ai-learning.js'), R = require('./source/review-plans.js'), V = require('./source/curriculum-variants.js');
const data = { topics: require('./source/topics.json'), questions: require('./source/questions.json'), dependencies: require('./source/dependencies.json') };
const T = require('./source/trainer.js').createEngine(data, require('./source/learning-unit.js'));
C.configureCurriculum(data, T, require('./source/judge.js'), V);
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
function complete(profile, skill = 'cnm_p132') {
  const s = C.create({ skill }); s.attempts = (profile.records || []).slice(); s.roundStart = s.attempts.length; s.limit += s.roundStart; C.rememberExposure(s, s.attempts.map(r => r.questionId)); C.next(s);
  for (let n = 0; n < 2; n++) { C.record(s, s.current.question.answer); C.applyPlan(s, C.localPlan(s)); if (!n) C.next(s); }
  profile.records = s.attempts.slice(); return C.view(s);
}
function boot(store = new Map()) {
  const { window } = parseHTML(fs.readFileSync('dist/index.html', 'utf8')); window.scrollTo = () => {}; window.print = () => {};
  const ctx = vm.createContext({ window, document: window.document, location: { protocol: 'file:' }, localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v) }, console, setTimeout, clearTimeout, Date, Math, URL, Blob, AbortSignal });
  for (const script of window.document.querySelectorAll('script')) vm.runInContext(script.textContent, ctx);
  const find = q => { const el = window.document.querySelector(q); assert.ok(el, q); return el; }, click = q => { const el = find(q); el.onclick({ target: el }); }, fill = (q, text) => { const el = find(q); el.value = text; el.oninput?.(); };
  const profile = () => JSON.parse(store.get('zhishu.ability.v1')).profiles[0], unit = () => profile().aiUnits[5];
  const start = () => { click('[data-grade="5"]'); click('[data-action="enter"]'); click('[data-action="ai-entry"]'); click('[data-ai="start"]'); };
  const answer = () => { const q = C.fromId(unit().view.question.id); if (q.type === 'choice') click('[data-ai-choice="' + q.answer + '"]'); else fill('#ai-answer', q.answer); click('[data-ai="submit"]'); };
  return { window, store, find, click, fill, profile, unit, start, answer };
}
async function main() {
  const now = Date.UTC(2026, 9, 29, 2);
  await test('Two actual independent passes create review plans in each of the nine actual grades', () => {
    for (let grade = 1; grade <= 9; grade++) { const p = { records: [] }, skill = V.supported.find(id => T.topics[id].grade === grade), v = complete(p, skill); R.update(p, v, C, now); const queue = R.queue(p, grade, C, now); assert.equal(queue.length, 1); assert.equal(queue[0].dueAt, now + R.day); assert.equal(queue[0].due, false); assert.equal(queue[0].grade, grade); }
  });
  await test('A hint, a repeated question or missing evidence cannot create a verified review plan', () => {
    for (const field of ['assisted', 'repeated']) { const p = { records: [] }, v = complete(p); p.records[1][field] = true; R.update(p, v, C, now); assert.equal(R.queue(p, 5, C, now).length, 0); }
    const p = { records: [] }, v = complete(p); p.records.pop(); R.update(p, v, C, now); assert.equal(R.queue(p, 5, C, now).length, 0);
  });
  await test('Refreshing the same completed task does not keep postponing its due date', () => {
    const p = { records: [] }, v = complete(p); R.update(p, v, C, now); R.update(p, v, C, now + R.day / 2); assert.equal(R.queue(p, 5, C, now)[0].dueAt, now + R.day);
  });
  await test('Independent checks after the due date grow intervals to three and seven days', () => {
    const p = { records: [] }; R.update(p, complete(p), C, now); R.update(p, complete(p), C, now + R.day); let plan = R.queue(p, 5, C, now + R.day)[0]; assert.equal(plan.step, 2); assert.equal(plan.dueAt, now + 4 * R.day);
    R.update(p, complete(p), C, now + 4 * R.day); plan = R.queue(p, 5, C, now + 4 * R.day)[0]; assert.equal(plan.step, 3); assert.equal(plan.dueAt, now + 11 * R.day);
  });
  await test('Practising early retains the original due date instead of indefinitely delaying review', () => {
    const p = { records: [] }; R.update(p, complete(p), C, now); R.update(p, complete(p), C, now + 3600000); const plan = R.queue(p, 5, C, now)[0]; assert.equal(plan.step, 1); assert.equal(plan.dueAt, now + R.day);
  });
  await test('Later independent errors and reclassified old evidence reopen the target for checking', () => {
    const p = { records: [] }; R.update(p, complete(p), C, now); p.records.push({ id: 'new-error', contentKey: 'new-error', skillId: 'cnm_p132', outcome: 'wrong', difficulty: 'standard', itemB: -.35 }); assert.equal(R.queue(p, 5, C, now)[0].status, 'recheck'); assert.equal(R.queue(p, 5, C, now)[0].due, true);
    const p2 = { records: [] }; R.update(p2, complete(p2), C, now); p2.records[0].evidenceEligible = false; assert.equal(R.queue(p2, 5, C, now)[0].status, 'recheck');
  });
  await test('Profiles, grades and different topics cannot share review evidence', () => {
    const p = { records: [] }; R.update(p, complete(p), C, now); assert.equal(R.queue(p, 6, C, now).length, 0); assert.equal(R.queue({ records: [] }, 5, C, now).length, 0);
    const v = complete({ records: [] }, 'cnm_p096'); R.update(p, v, C, now); assert.equal(R.queue(p, 4, C, now).length, 0);
  });
  await test('A later error that has been corrected still requires a fresh verified task before rescheduling', () => {
    const p = { records: [] }; R.update(p, complete(p), C, now); p.records.push({ id: 'error', contentKey: 'error', skillId: 'cnm_p132', outcome: 'wrong', itemB: -.35 }); p.records.push({ id: 'one-pass', contentKey: 'one-pass', skillId: 'cnm_p132', outcome: 'correct', itemB: -.35 }); assert.equal(R.queue(p, 5, C, now)[0].status, 'recheck');
    R.update(p, complete(p), C, now + R.day); const plan = R.queue(p, 5, C, now + R.day)[0]; assert.equal(plan.status, 'scheduled'); assert.equal(plan.step, 1);
  });
  await test('The report offers a real new-question review action and preserves it after reload', async () => {
    const a = boot(); a.start(); a.answer(); a.click('[data-ai="next"]'); a.answer(); a.click('[data-primary="report"]'); assert.ok(a.find('.ai-review-panel')); const oldId = a.unit().view.question.id;
    const b = boot(a.store); assert.ok(b.find('.ai-review-panel')); b.click('[data-ai="review"]'); await Promise.resolve(); assert.ok(b.find('.ai-card')); assert.notEqual(b.unit().view.question.id, oldId); assert.equal(b.unit().view.task.used, 0); assert.equal(b.unit().view.task.passed, 0);
  });
  await test('Starting another task archives a pending draft and lets the student restore the exact question', async () => {
    const a = boot(); a.start(); a.answer(); a.click('[data-ai="next"]'); a.answer(); a.click('[data-primary="report"]'); a.click('[data-ai="review"]'); await Promise.resolve(); a.fill('#ai-answer', '未完成的草稿'); const id = a.unit().view.question.id;
    a.click('[data-primary="report"]'); a.click('[data-ai="review"]'); await Promise.resolve(); a.click('[data-primary="report"]'); assert.ok(a.find('[data-ai="resume-task"]')); a.click('[data-ai="resume-task"]'); assert.equal(a.unit().view.question.id, id); assert.equal(a.find('#ai-answer').value, '未完成的草稿');
  });
  console.log(JSON.stringify({ reviewPassed: passed, liveModelCalls: 0, intervalsExperimental: true }));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
