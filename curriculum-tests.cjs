'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const { parseHTML } = require('linkedom');
const C = require('./source/ai-learning.js'), Judge = require('./source/judge.js');
const data = { topics: require('./source/topics.json'), questions: require('./source/questions.json'), dependencies: require('./source/dependencies.json') };
const T = require('./source/trainer.js').createEngine(data, require('./source/learning-unit.js'));
C.configureCurriculum(data, T, Judge, require('./source/curriculum-variants.js')); C.configureGraph(data.dependencies);
const { createHandler } = require('./tutor-service.cjs');
let passed = 0, checkedItems = 0;
async function test(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
function submit(s, outcome = 'correct') { const q = s.current.question, wrong = q.type === 'choice' ? q.choices.find(c => c.key !== q.answer).key : '999999999999'; C.record(s, outcome === 'correct' ? q.answer : wrong, '', 0, ['skip', 'not_learned'].includes(outcome) ? outcome : undefined); C.applyPlan(s, C.localPlan(s)); }
function boot(store = new Map()) {
  const { window } = parseHTML(fs.readFileSync('dist/index.html', 'utf8')); window.scrollTo = () => {}; window.print = () => {};
  const context = vm.createContext({ window, document: window.document, location: { protocol: 'file:' }, localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v) }, console, setTimeout, clearTimeout, Date, Math, URL, Blob, AbortSignal, fetch: () => { throw Error('No network in DOM checks'); } });
  for (const script of window.document.querySelectorAll('script')) vm.runInContext(script.textContent, context, { timeout: 5000 });
  const find = selector => { const el = window.document.querySelector(selector); assert.ok(el, selector); return el; };
  const click = selector => { const el = find(selector); el.onclick({ target: el }); };
  const fill = (selector, text) => { const el = find(selector); el.value = text; el.oninput?.(); };
  const profile = () => { const db = JSON.parse(store.get('zhishu.ability.v1')); return db.profiles.find(p => p.id === db.activeId); };
  const unit = g => g === 7 ? profile().aiUnit : profile().aiUnits[g];
  const start = g => { click('[data-action="grades"]'); click('[data-grade="' + g + '"]'); click('[data-action="enter"]'); click('[data-primary="practice"]'); if (window.document.querySelector('[data-action="ai-entry"]')) { click('[data-action="ai-entry"]'); click('[data-ai="start"]'); } };
  const answer = g => { const q = C.fromId(unit(g).view.question.id); if (q.type === 'choice') click('[data-ai-choice="' + q.answer + '"]'); else fill('#ai-answer', q.answer); click('[data-ai="submit"]'); };
  return { window, store, find, click, fill, profile, unit, start, answer };
}
async function main() {
  await test('Every one of 531 topics has canonical AI tasks in its actual grade and accepts its reference answers', () => {
    for (const topic of data.topics) {
      assert.ok(T.bank[topic.id].length);
      for (const raw of T.bank[topic.id]) { const q = C.fromId('aic_' + raw.id); assert.equal(q.topicId, topic.id); assert.equal(q.grade, topic.grade); assert.equal(Judge.judgeQuestion(raw, q.answer).verdict, 'correct', q.id); checkedItems++; }
    }
  });
  await test('Every topic either passes two distinct standard-or-higher tasks or honestly stops for insufficient fresh items', () => {
    for (const topic of data.topics) {
      const s = C.create({ skill: topic.id }); C.next(s); submit(s); C.next(s);
      if (!s.finished) { submit(s); assert.equal(C.taskProgress(s).status, 'verified', topic.id); C.next(s); }
      assert.equal(s.finished, true); assert.ok(s.attempts.every(r => r.topicId === topic.id));
      if (C.taskProgress(s).status !== 'verified') assert.match(s.finishReason, /不足/);
    }
  });
  await test('All nine grades can fail, inspect prerequisites, use hints, skip and stop within the short-task budget', () => {
    for (let grade = 1; grade <= 9; grade++) for (const outcome of ['wrong', 'skip', 'not_learned']) {
      const topic = data.topics.find(t => t.grade === grade), s = C.create({ skill: topic.id }); C.next(s);
      while (!s.finished) { if (outcome === 'not_learned') C.hint(s); submit(s, outcome); C.next(s); }
      assert.ok(s.attempts.length <= 8); assert.notEqual(C.taskProgress(s).status, 'verified');
      assert.ok(s.attempts.every(r => C.skills[r.skillId].grade <= grade));
    }
  });
  await test('Hints, repeats, lower-level tasks and prior rounds cannot manufacture the two independent passes', () => {
    const s = C.create(); C.next(s); submit(s); assert.equal(C.taskProgress(s).passed, 1); C.next(s); C.hint(s); submit(s); assert.equal(C.taskProgress(s).passed, 0);
    C.retry(s); submit(s); assert.equal(C.taskProgress(s).passed, 0);
    C.pick(s, 'distribute', 'practice', 0); submit(s); assert.equal(C.taskProgress(s).passed, 0);
    s.roundStart = s.attempts.length; assert.equal(C.taskProgress(s).used, 0); assert.equal(C.taskProgress(s).passed, 0);
  });
  await test('The second independent pass makes finish mandatory and rejects an AI attempt to expand the task', () => {
    const s = C.create(); C.next(s); submit(s); C.next(s); submit(s);
    assert.deepEqual(C.candidates(s).map(p => p.action), ['finish']);
    assert.throws(() => C.applyPlan(s, { action: 'probe', targetSkill: 'model', level: 1, reason: 'expand', evidenceIds: [s.attempts.at(-1).id] }), /outside/);
  });
  await test('Eight recorded attempts stop even if a model wants to keep practising and do not claim success', () => {
    const s = C.create(); C.next(s);
    for (let n = 0; n < 8; n++) { submit(s, 'skip'); if (n < 7) C.next(s); }
    assert.equal(s.nextPlan.action, 'finish'); C.next(s); assert.equal(s.finished, true); assert.equal(C.taskProgress(s).status, 'paused'); assert.match(C.reportFacts(s).advice, /还需/);
  });
  await test('After a prerequisite is checked the local path returns to the original target without changing grade', () => {
    const s = C.create({ skill: 'cnm_p132' }); C.next(s); submit(s, 'wrong');
    const prerequisite = C.candidates(s).find(p => p.action === 'prerequisite'); assert.ok(prerequisite);
    C.applyPlan(s, { ...prerequisite, reason: '检查前置基础', evidenceIds: [s.attempts.at(-1).id] }); C.next(s); submit(s);
    assert.equal(s.nextPlan.targetSkill, s.goal.skillId); assert.equal(s.nextPlan.action, 'retest');
  });
  await test('Old long-round sessions keep their original flow and do not invent a short-task result', () => {
    const s = C.create(); delete s.goal; s.limit = 24; C.next(s); submit(s); C.next(s); submit(s);
    assert.equal(C.taskProgress(s), null); assert.ok(C.candidates(s).some(p => p.action === 'challenge')); assert.equal(s.finished, false);
  });
  await test('A question already answered in ordinary practice cannot become fresh AI evidence', () => {
    const s = C.create({ skill: 'cnm_p001' }); C.rememberExposure(s, ['cnm_p001_q3', 'FORGED']); C.next(s);
    assert.notEqual(s.current.question.originalId, 'cnm_p001_q3'); submit(s); C.next(s);
    assert.notEqual(s.current.question.originalId, 'cnm_p001_q3'); assert.equal(C.taskProgress(s).passed, 1);
  });
  await test('Unrelated grade histories cannot be silently imported into a new server task', async () => {
    const h = createHandler({ persist: false, getConfig: () => ({}) }); const old = await h('start', { grade: 1, skill: 'cnm_p001' });
    await h('answer', { sessionId: old.id, revision: old.revision, questionId: old.question.id, answer: C.fromId(old.question.id).answer });
    const next = await h('start', { grade: 9, skill: 'cnm_219', previousSessionId: old.id }); assert.equal(next.attempts.length, 0); assert.equal(next.grade, 9);
  });
  await test('The real server decision boundary works for each grade and rejects grade-topic mismatches', async () => {
    let request;
    const h = createHandler({ persist: false, getConfig: () => ({ key: 'fixture-private-key', model: 'fixture', label: 'Fixture', url: 'https://fixture.invalid' }), fetchImpl: async (_, options) => { request = JSON.parse(JSON.parse(options.body).messages[1].content); const result = request.allowedDecisions ? { decisionIndex: 0, reason: '先检查本题用到的方法，再回到本次目标。', rootId: request.allowedRoots[0], evidenceIds: [request.suppliedAttempts.at(-1).id] } : { hint: '先找出题目要你求什么，再圈出可以用到的条件。' }; return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] })); } });
    for (let grade = 1; grade <= 9; grade++) { const topic = data.topics.find(t => t.grade === grade); let v = await h('start', { skill: topic.id, grade, aiEnabled: true });
      const q = C.fromId(v.question.id), wrong = q.type === 'choice' ? q.choices.find(c => c.key !== q.answer).key : '999999999999';
      v = await h('answer', { sessionId: v.id, revision: v.revision, questionId: q.id, answer: wrong }); assert.equal(v.nextPlan.source, 'ai'); assert.equal(request.task.grade, grade); assert.equal(v.question.answer, undefined);
      v = await h('hint', { sessionId: v.id, revision: v.revision }); assert.equal(v.hintSource, 'ai'); assert.equal(request.grade, grade);
    }
    await assert.rejects(h('start', { skill: 'cnm_p001', grade: 9 }), /不一致/); await assert.rejects(h('start', { skill: 'fake' }), /不存在/);
  });
  await test('Model parameters for an unsupported subject are rejected before the next task is built or saved', async () => {
    assert.throws(() => C.blueprint('cnm_p001', 1, { a: 3, b: 7, x: 5, context: 'books' }), /invalid blueprint/);
    const h = createHandler({ persist: false, getConfig: () => ({ key: 'fixture', model: 'fixture', url: 'https://fixture.invalid' }), fetchImpl: async (_, options) => { const input = JSON.parse(JSON.parse(options.body).messages[1].content); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ decisionIndex: 0, reason: '换一道新题独立检查。', evidenceIds: [input.suppliedAttempts.at(-1).id], rootId: null, parameters: { a: 3, b: 7, x: 5, context: 'books' } }) } }] })); } });
    let v = await h('start', { grade: 1, skill: 'cnm_p001', aiEnabled: true }); v = await h('answer', { sessionId: v.id, revision: v.revision, questionId: v.question.id, answer: C.fromId(v.question.id).answer });
    assert.equal(v.nextPlan.source, 'ai'); assert.equal(v.nextPlan.parameters, undefined); v = await h('next', { sessionId: v.id, revision: v.revision });
    assert.ok(v.question.id.startsWith('aic_')); assert.equal(C.fromId(v.question.id).topicId, 'cnm_p001'); assert.equal(v.question.origin, 'curated-bank');
  });
  await test('Verified server tasks stop without an unnecessary final model call and survive resume', async () => {
    let calls = 0; const h = createHandler({ persist: false, getConfig: () => ({ key: 'fixture', model: 'fixture', url: 'https://fixture.invalid', label: 'Fixture' }), fetchImpl: async () => { calls++; throw Error('fixture fallback'); } });
    let v = await h('start', { skill: 'cnm_p001', grade: 1, aiEnabled: true });
    for (let n = 0; n < 2; n++) { const q = C.fromId(v.question.id); v = await h('answer', { sessionId: v.id, revision: v.revision, questionId: q.id, answer: q.answer }); if (!n) v = await h('next', { sessionId: v.id, revision: v.revision }); }
    assert.equal(calls, 1); assert.equal(v.task.status, 'verified'); v = await h('next', { sessionId: v.id, revision: v.revision }); assert.equal(v.finished, true); assert.equal((await h('resume', { sessionId: v.id })).task.status, 'verified');
  });
  await test('All nine grade interfaces start actual matching tasks and show only their own AI report', () => {
    const a = boot(); for (let grade = 1; grade <= 9; grade++) { a.start(grade); assert.ok(a.unit(grade), 'Grade ' + grade + ': ' + a.find('#app').textContent.slice(-1200)); const v = a.unit(grade).view; assert.equal(v.grade, grade); assert.equal(C.fromId(v.question.id).grade, grade); assert.equal(a.window.document.querySelector('.knowledge-sidebar'), null); assert.ok(a.find('.ai-task-strip')); a.answer(grade); assert.ok(a.find('.ai-your-response')); a.click('[data-ai="report-nav"]'); assert.match(a.find('.ai-unit-report').textContent, new RegExp('一二三四五六七八九'[grade - 1] + '年级')); assert.equal(a.window.document.querySelector('.ai-radar'), null); }
  });
  await test('Grade switching and page reload preserve separate pending questions and exact drafts', () => {
    const a = boot(); a.start(1); const id1 = a.unit(1).view.question.id; a.fill('#ai-answer', '一年级草稿'); a.start(9); const id9 = a.unit(9).view.question.id; a.fill('#ai-answer', '九年级草稿');
    const b = boot(a.store); assert.equal(b.unit(9).view.question.id, id9); assert.equal(b.find('#ai-answer').value, '九年级草稿'); b.start(1); assert.equal(b.unit(1).view.question.id, id1); assert.equal(b.find('#ai-answer').value, '一年级草稿');
  });
  await test('The simple completion screen distinguishes verified targets and unfinished tasks and keeps one primary action', () => {
    const a = boot(); a.start(1); a.answer(1); a.click('[data-ai="next"]'); a.answer(1); assert.equal(a.find('[data-ai="next"]').textContent, '查看本次小结'); a.click('[data-ai="next"]'); assert.match(a.find('.ai-complete').textContent, /本次目标已验证/); assert.equal(a.window.document.querySelectorAll('.ai-complete .primary').length, 1);
  });
  console.log(JSON.stringify({ curriculumPassed: passed, gradesChecked: 9, topicsChecked: data.topics.length, canonicalItemsChecked: checkedItems, liveModelCalls: 0 }));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
