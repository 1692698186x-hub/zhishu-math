'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { parseHTML } = require('linkedom');
const C = require('./source/ai-learning.js');
const html = fs.readFileSync(path.join(__dirname, 'dist/index.html'), 'utf8'), KEY = 'zhishu.ability.v1';
function boot(store = new Map()) {
  const { window } = parseHTML(html); window.scrollTo = () => {}; window.print = () => {};
  const context = vm.createContext({ window, document: window.document, location: { protocol: 'file:' }, localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v) }, console, setTimeout, clearTimeout, Date, Math, URL, Blob, AbortSignal, fetch: () => { throw Error('No provider calls in UI fixtures'); } });
  for (const script of window.document.querySelectorAll('script')) vm.runInContext(script.textContent, context, { timeout: 5000 });
  const find = s => { const e = window.document.querySelector(s); assert.ok(e, 'Missing ' + s); return e; };
  const click = s => { const e = find(s); assert.ok(!e.disabled, s); e.onclick({ target: e }); };
  const fill = (s, value) => { const e = find(s); e.value = value; e.oninput?.({ target: e }); };
  const db = () => JSON.parse(store.get(KEY)), profile = () => db().profiles.find(p => p.id === db().activeId), unit = () => profile().aiUnit;
  const start = () => { click('[data-grade="7"]'); click('[data-action="enter"]'); click('[data-action="ai-entry"]'); click('[data-ai="start"]'); };
  const answer = (wrong = false) => { const q = C.fromId(unit().view.question.id); if (q.type === 'choice') click('[data-ai-choice="' + (wrong ? q.choices.find(x => x.key !== q.answer).key : q.answer) + '"]'); else fill('#ai-answer', wrong ? '999' : q.answer); click('[data-ai="submit"]'); };
  return { window, context, store, find, click, fill, db, profile, unit, start, answer };
}
let passed = 0; function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
test('AI learning is integrated into the existing grade-seven workspace and keeps original navigation', () => { const a = boot(); a.start(); assert.ok(a.find('.ai-card')); assert.equal(a.window.document.querySelectorAll('[data-primary]').length, 3); assert.match(a.find('.ai-mode').textContent, /本地教学/); });
test('Wrong feedback does not disclose the answer and actually chooses a diagnostic next step', () => { const a = boot(); a.start(); a.answer(true); assert.equal(a.window.document.querySelector('.ai-solution'), null); assert.match(a.find('[data-ai="next"]').textContent, /检查/); a.click('[data-ai="next"]'); assert.equal(a.unit().view.phase, 'probe'); assert.equal(a.unit().view.question.answer, undefined); });
test('Hinted answers stay distinct from independent answers and lead to new retest items', () => { const a = boot(); a.start(); const id = a.unit().view.question.id; a.click('[data-ai="hint"]'); assert.ok(a.find('.ai-hint')); a.answer(); assert.equal(a.unit().view.feedback.record.assisted, true); assert.match(a.find('[data-ai="next"]').textContent, /独立验证/); a.click('[data-ai="next"]'); assert.notEqual(a.unit().view.question.id, id); assert.equal(a.unit().view.hintCount, 0); });
test('Drafts, feedback and the exact current AI question survive reload', () => { let a = boot(); a.start(); a.fill('#ai-answer', '123'); a.fill('#ai-steps', '先检查符号'); const id = a.unit().view.question.id; a = boot(a.store); assert.equal(a.find('#ai-answer').value, '123'); assert.equal(a.find('#ai-steps').value, '先检查符号'); assert.equal(a.unit().view.question.id, id); a.answer(true); a = boot(a.store); assert.ok(a.find('.feedback-box')); });
test('An intentional reveal marks a later success as assisted and repeated retries do not inflate mastery', () => { const a = boot(); a.start(); a.click('[data-ai="reveal"]'); assert.ok(a.find('.ai-solution')); a.answer(); assert.equal(a.unit().view.feedback.record.assisted, true); const b = boot(); b.start(); b.answer(true); b.click('[data-ai="retry"]'); b.answer(); assert.equal(b.unit().view.feedback.record.repeated, true); });
test('Five-axis reports live on the report page and missing axes are not rendered as zero scores', () => { const a = boot(); a.start(); a.answer(); a.click('[data-ai="report-nav"]'); assert.equal(a.window.document.querySelector('.ai-card'), null); assert.ok(a.find('.ai-radar')); assert.match(a.find('.ai-unit-report').textContent, /证据较少/); assert.equal(a.window.document.querySelectorAll('.ai-radar circle').length, 0); a.click('[data-ai="report"]'); assert.match(a.find('.ai-unit-report').textContent, /本地分析/); });
test('The new unit does not mix records or drafts across student profiles', () => { const a = boot(); a.start(); a.answer(true); a.click('[data-action="new-profile"]'); a.fill('#new-profile-name', '另一同学'); a.click('#create-profile'); assert.equal(a.profile().records.length, 0); assert.equal(a.profile().aiUnit, undefined); });
test('Normal topic practice and the knowledge graph remain reachable from the pilot unit', () => { const a = boot(); a.start(); a.click('[data-ai="exit"]'); assert.ok(a.find('[data-action="submit"]')); a.click('[data-primary="graph"]'); assert.ok(a.find('#knowledge-graph-root')); });

test('An unfinished equivalent expression keeps the draft editable and never appears as a wrong or correct attempt', () => {
  const a = boot(); a.start(); const q = C.fromId(a.unit().view.question.id), original = '-(x-' + q.params.b + ')';
  a.fill('#ai-answer', original); a.fill('#ai-steps', '我先抄下式子'); a.click('[data-ai="submit"]');
  assert.equal(a.unit().view.attempts.length, 0); assert.equal(a.profile().records.length, 0);
  assert.equal(a.find('#ai-answer').value, original); assert.equal(a.find('#ai-steps').value, '我先抄下式子');
  assert.match(a.find('[role="alert"]').textContent, /还需要/); assert.equal(a.window.document.querySelector('.feedback-box'), null);
});
test('Report facts lead the unit report and categories do not double-count a hinted retry', () => {
  const a = boot(); a.start(); a.answer(true); a.click('[data-ai="retry"]'); a.answer(); a.click('[data-ai="report-nav"]');
  const text = a.find('.ai-unit-report').textContent; assert.match(text, /1 道新题独立作答/); assert.match(text, /1 次重复作答/);
  assert.ok(!text.includes('1 次提示后作答')); assert.match(text, /最近最多六道/);
  assert.ok(a.find('.ai-unit-report').innerHTML.indexOf('ai-facts') < a.find('.ai-unit-report').innerHTML.indexOf('ai-radar'));
});
test('Reload rechecks old accepted drafts and refreshes a stale grade report without losing original records', () => {
  let a = boot(); a.start(); a.answer(); a.click('[data-ai="report-nav"]'); a.click('[data-action="generate-report"]');
  const db = a.db(), p = db.profiles[0], q = C.fromId(p.aiUnit.view.question.id), original = '-(x-' + q.params.b + ')';
  p.records[0].userAnswer = original; p.aiUnit.state.attempts[0].userAnswer = original;
  p.aiUnit.state.report = { source: 'ai', summary: '过时的模型结论' }; delete p.reports[7].schemaVersion;
  a.store.set(KEY, JSON.stringify(db)); a = boot(a.store);
  assert.equal(a.profile().records.length, 1); assert.equal(a.profile().records[0].userAnswer, original);
  assert.equal(a.profile().records[0].evidenceEligible, false); assert.equal(a.profile().reports[7].independent, 0);
  assert.match(a.find('.ai-unit-report').textContent, /1 条旧记录待复核/); assert.ok(!a.find('.ai-unit-report').textContent.includes('过时的模型结论'));
});
test('Resolved hypotheses are shown with their evidence and do not remain labelled as active difficulties', () => {
  const a = boot(); a.start(); a.answer(true); const db = a.db(), p = db.profiles[0], s = p.aiUnit.state;
  for (let n = 0; n < 2; n++) { C.pick(s, 'distribute', 'retest', 1); C.record(s, s.current.question.answer); }
  p.records = s.attempts; db.ui.screen = 'report'; a.store.set(KEY, JSON.stringify(db)); const b = boot(a.store);
  assert.match(b.find('.ai-roots').textContent, /本轮独立复测通过/); assert.match(b.find('.ai-roots').textContent, /查看作答依据/);
  assert.equal(b.unit().view.facts.active, 0); assert.equal(b.unit().view.facts.resolved, 1);
});


test('Starting another offline round preserves suspected gaps and their status history just like the backend', () => {
  const a = boot(); a.start();
  for (let n = 0; n < 30 && !a.unit().view.finished; n++) { a.answer(true); a.click('[data-ai="next"]'); }
  assert.equal(a.unit().view.finished, true);
  const oldId = a.unit().state.id, trigger = a.unit().state.hypotheses[0].triggerIds[0], history = a.unit().state.hypotheses[0].history.map(h => h.code), count = a.profile().records.length;
  a.click('[data-ai="start"]');
  assert.notEqual(a.unit().state.id, oldId); assert.ok(a.unit().state.hypotheses[0].triggerIds.includes(trigger));
  assert.deepEqual(a.unit().state.hypotheses[0].history.map(h => h.code), history);
  assert.equal(a.profile().records.length, count);
});
console.log(JSON.stringify({ aiUiPassed: passed, liveModelCalls: 0, fixtureOnly: true }));
