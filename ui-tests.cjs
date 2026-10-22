'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const html = fs.readFileSync(require('node:path').join(__dirname, 'dist/index.html'), 'utf8');
const KEY = 'zhishu.ability.v1';
function boot(store = new Map()) {
  const { window } = parseHTML(html); window.scrollTo = () => {}; window.print = () => {};
  const context = vm.createContext({ document: window.document, window, location: { protocol: 'file:' }, localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v) }, console, setTimeout, clearTimeout, Date, Math, URL, Blob, AbortSignal, fetch: () => { throw Error('DOM tests must not access the network'); } });
  for (const script of window.document.querySelectorAll('script')) vm.runInContext(script.textContent, context, { timeout: 5000 });
  const find = selector => { const el = window.document.querySelector(selector); assert.ok(el, 'missing UI element: ' + selector); return el; };
  const click = selector => { const el = find(selector); assert.ok(!el.disabled, 'disabled button: ' + selector); assert.equal(typeof el.onclick, 'function', selector); el.onclick({ target: el }); };
  const fill = (selector, value) => { const el = find(selector); el.value = value; el.oninput?.({ target: el }); };
  const db = () => JSON.parse(store.get(KEY));
  const profile = () => { const state = db(); return state.profiles.find(p => p.id === state.activeId); };
  const answer = (wrong = false) => { const q = context.LearningUnit.questions.find(x => x.id === profile().learningRun.current.questionId); if (q.type === 'choice') click('[data-learn-choice="' + (wrong ? q.choices.find(x => x.key !== q.answer).key : q.answer) + '"]'); else fill('#learning-answer', wrong ? '999999' : q.answer); click('[data-learn="submit"]'); };
  return { context, window, find, click, fill, db, profile, answer, store };
}
let passed = 0;
function test(name, action) { action(); passed++; console.log('PASS ' + name); }
test('Built offline HTML starts the real UI with all five navigation entries', () => {
  const app = boot(); assert.match(app.find('.main').textContent, /把不会的，变成会的/);
  assert.equal(app.window.document.querySelectorAll('.nav button').length, 5);
  assert.match(app.find('.main').textContent, /本地指导/);
});
test('Legacy profiles and records survive the new UI without schema resets', () => {
  const old = { version: 1, activeId: 'old', config: { grade: 7 }, profiles: [{ id: 'old', name: '旧档案', records: [{ topicId: 'cnm_040', questionId: 'old-record', outcome: 'wrong', at: 1 }], session: null }] };
  const app = boot(new Map([[KEY, JSON.stringify(old)]])); assert.equal(app.profile().name, '旧档案'); assert.equal(app.profile().records.length, 1);
  app.click('[data-nav="home"]'); assert.ok(app.find('[data-action="start"]'));
});
test('Wrong initial work is retained and leads through the learning plan to a confirming probe', () => {
  const app = boot(); app.click('[data-learn="start"]');
  assert.equal(app.window.document.querySelector('[data-learn="hint"]'), null);
  app.fill('#learning-working', '2(x+1)+1 = 2x+2'); app.answer(true); app.answer(); app.answer();
  assert.match(app.find('.main').textContent, /找到起点/); assert.equal(app.profile().learningRun.answers[0].steps, '2(x+1)+1 = 2x+2');
  app.click('[data-learn="train"]'); assert.equal(app.profile().learningRun.current.stage, 'probe'); assert.ok(app.find('[data-learn-choice]'));
});
test('Pause and reload preserve the exact exercise, draft, and assistance flag', () => {
  let app = boot(); app.click('[data-learn="start"]'); app.answer(); app.answer(); app.answer(); app.click('[data-learn="train"]');
  const id = app.profile().learningRun.current.questionId;
  app.fill('#learning-answer', '17'); app.fill('#learning-working', '先去括号'); app.click('[data-learn="hint"]'); app.click('[data-learn="pause"]');
  app = boot(app.store); app.click('[data-learn="resume"]');
  assert.equal(app.profile().learningRun.current.questionId, id); assert.equal(app.find('#learning-answer').value, '17'); assert.equal(app.find('#learning-working').value, '先去括号'); assert.equal(app.profile().learningRun.current.hintCount, 1);
  app.answer(); assert.equal(app.profile().learningRun.feedback.record.assisted, true); assert.match(app.find('.learning-feedback').textContent, /辅助作答/);
  app = boot(app.store); app.click('[data-learn="resume"]'); assert.ok(app.find('.learning-feedback')); assert.ok(app.find('[data-learn="next"]'));
});
test('A complete UI journey reaches a report and an early review uses different problems', () => {
  const app = boot(); app.click('[data-learn="start"]');
  for (let step = 0; step < 100 && !app.profile().learningRun.finished; step++) {
    const r = app.profile().learningRun;
    if (r.phase === 'plan') app.click('[data-learn="train"]');
    else if (r.feedback) app.click('[data-learn="next"]');
    else app.answer();
  }
  assert.equal(app.profile().learningRun.answers.length, 18); assert.match(app.find('.main').textContent, /新题复测/); assert.equal(app.profile().learningRuns.length, 1);
  const seen = new Set(app.profile().learningRun.answers.map(r => app.context.LearningUnit.questions.find(q => q.id === r.questionId).prompt));
  app.click('[data-learn="home"]'); app.click('[data-learn="review"]');
  assert.equal(app.profile().learningRun.kind, 'review');
  const q = app.context.LearningUnit.questions.find(q => q.id === app.profile().learningRun.current.questionId); assert.ok(!seen.has(q.prompt));
  app.click('[data-nav="history"]'); assert.match(app.find('.main').textContent, /整理/);
});
test('Profile switching keeps learning sessions separate', () => {
  const app = boot(); app.click('[data-learn="start"]'); app.answer();
  app.click('[data-action="new-profile"]'); app.fill('#new-name', '另一个档案'); app.click('#create-profile');
  assert.equal(app.profile().records.length, 0); assert.equal(app.profile().learningRun, undefined);
  app.click('[data-nav="learning"]'); assert.ok(app.find('[data-learn="start"]'));
  const firstId = app.db().profiles[0].id; app.find('#profile-select').onchange({ target: { value: firstId } });
  assert.equal(app.profile().learningRun.answers.length, 1);
});
test('In-progress initial answers stay hidden from the shared answer history', () => {
  const app = boot(); app.click('[data-learn="start"]'); app.answer(); app.click('[data-nav="history"]');
  assert.equal(app.window.document.querySelector('.history-entry'), null); assert.match(app.find('.main').textContent, /起点短测答案暂不开放/);
});
console.log(JSON.stringify({ uiPassed: passed, environment: 'offline DOM simulation; no real browser or network' }));
