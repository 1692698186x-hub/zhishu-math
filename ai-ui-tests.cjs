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
console.log(JSON.stringify({ aiUiPassed: passed, liveModelCalls: 0, fixtureOnly: true }));
