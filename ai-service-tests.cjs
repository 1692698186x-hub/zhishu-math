'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('./ai-server.cjs');
const { createHandler } = require('./tutor-service.cjs');
const { blueprint } = require('./source/ai-learning.js');
const Provider = require('./provider-config.cjs');
async function main() {
  let passed = 0; async function test(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
  const noConfig = { provider: 'deepseek', label: 'DeepSeek', key: '', model: 'deepseek-flash', url: 'https://api.deepseek.com/chat/completions' };
  let received, shouldFail = false, parametersInvalid = false;
  const fixtureFetch = async (url, options) => {
    received = JSON.parse(options.body); if (shouldFail) throw Error('fixture-secret');
    const input = JSON.parse(received.messages[1].content); let result;
    if (input.allowedDecisions) result = { decisionIndex: Math.max(0, input.allowedDecisions.findIndex(p => p.action === 'prerequisite')), reason: '先检查负号的含义，再回到原来的题目。', evidenceIds: [input.suppliedAttempts.at(-1).id], rootId: input.allowedRoots[0], parameters: { a: parametersInvalid ? 999 : 4, b: 7, x: 5, context: 'books' } };
    else if (input.teachingIntent) result = { hint: '括号外的数要分别作用到哪些项？' };
    else result = { summary: '本轮独立作答仍在积累，符号处理需要继续检查。', advice: '先完成小检查，再换新题独立验证。', ok: true };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }));
  };
  const handler = createHandler({ persist: false, getConfig: () => ({ ...noConfig, key: 'fixture-secret' }), fetchImpl: fixtureFetch });
  let v = await handler('start', { aiEnabled: true });
  const request = (action, body = {}) => handler(action, { sessionId: v.id, revision: v.revision, ...body }).then(result => v = result);
  await test('Server recomputes correctness and supplies canonical questions to the real decision boundary', async () => {
    await request('answer', { questionId: v.question.id, answer: '999', steps: '-x - 2', outcome: undefined, prompt: 'FORGED_PROMPT', nickname: 'NEVER_SEND' }); assert.equal(v.feedback.record.outcome, 'wrong'); assert.equal(v.nextPlan.source, 'ai'); assert.equal(v.nextPlan.action, 'prerequisite'); assert.ok(!JSON.stringify(received).includes('FORGED_PROMPT')); assert.ok(!JSON.stringify(received).includes('NEVER_SEND')); assert.ok(!JSON.stringify(v).includes('fixture-secret')); assert.equal(v.question.answer, undefined);
  });
  await test('Stale revisions and changed question IDs cannot double-submit or alter the current exercise', async () => {
    await assert.rejects(handler('next', { sessionId: v.id, revision: -1 }), /记录已经更新/); await request('next'); await assert.rejects(request('answer', { questionId: 'unknown', answer: '4' }), /题目已更新/);
  });
  await test('AI-created parameters pass the same math validator and hints mark subsequent work assisted', async () => {
    assert.equal(v.question.origin, 'ai-parameters'); await request('hint'); assert.equal(v.hintSource, 'ai'); const q = blueprint(v.question.skillId, v.question.level, { a: 4, b: 7, x: 5, context: 'books' }); await request('answer', { questionId: v.question.id, answer: q.answer }); assert.equal(v.feedback.record.assisted, true);
  });
  await test('Client supplied correctness cannot bypass mathematical judging', async () => {
    await request('next'); await assert.rejects(request('answer', { questionId: v.question.id, answer: '999', outcome: 'correct' }), /invalid outcome/);
  });
  await test('Invalid model parameters are discarded while a valid decision remains usable', async () => {
    v = await handler('start', { aiEnabled: true }); parametersInvalid = true; await request('answer', { questionId: v.question.id, answer: '999' }); assert.equal(v.nextPlan.source, 'ai'); assert.equal(v.nextPlan.parameters, undefined); await request('next'); assert.equal(v.question.origin, 'validated-template'); parametersInvalid = false;
  });
  await test('Model failure preserves the actual answer and transparently uses local decisions', async () => {
    shouldFail = true; await request('answer', { questionId: v.question.id, answer: '999' }); assert.equal(v.nextPlan.source, 'rules'); assert.match(v.nextPlan.fallbackReason, /模型/); assert.ok(!JSON.stringify(v).includes('fixture-secret')); shouldFail = false;
  });
  await test('Report and hint contents survive a session resume', async () => {
    await request('report'); assert.equal(v.report.source, 'ai'); await request('resume'); assert.equal(v.report.source, 'ai');
  });
  await test('Stored sessions reload without fabricating or losing response evidence', async () => {
    const storePath = path.join(__dirname, '.local', 'fixture-session-' + Date.now() + '.json'); const h1 = createHandler({ storePath, getConfig: () => noConfig }); const s = await h1('start', {}); const a = await h1('answer', { sessionId: s.id, revision: s.revision, questionId: s.question.id, answer: '999' }); const h2 = createHandler({ storePath, getConfig: () => noConfig }); const b = await h2('resume', { sessionId: s.id }); assert.equal(a.attempts[0].id, b.attempts[0].id); assert.equal(b.question.answer, undefined);
  });

  await test('Unfinished equivalent answers keep the current question and cannot trigger an AI decision or evidence update', async () => {
    const h = createHandler({ persist: false, getConfig: () => noConfig });
    const s = await h('start', { aiEnabled: false }), q = require('./source/ai-learning.js').fromId(s.question.id);
    await assert.rejects(h('answer', { sessionId: s.id, revision: s.revision, questionId: q.id, answer: '-(x-' + q.params.b + ')', responseForm: null }), /还需要/);
    const restored = await h('resume', { sessionId: s.id });
    assert.equal(restored.revision, s.revision); assert.equal(restored.attempts.length, 0); assert.equal(restored.feedback, null); assert.equal(restored.question.id, q.id);
  });
  await test('Server reports use exclusive evidence counts and hide obsolete narrative after further learning', async () => {
    const h = createHandler({ persist: false, getConfig: () => noConfig }); let s = await h('start', {});
    const call = async (action, more = {}) => s = await h(action, { sessionId: s.id, revision: s.revision, ...more });
    await call('answer', { questionId: s.question.id, answer: '999' }); await call('report'); assert.equal(s.report.source, 'rules'); assert.match(s.report.summary, /1 道新题独立作答/);
    await call('next'); const q = require('./source/ai-learning.js').fromId(s.question.id);
    await call('hint'); await call('answer', { questionId: q.id, answer: q.answer });
    assert.equal(s.facts.counts.independent, 1); assert.equal(s.facts.counts.assisted, 1);
    assert.equal(s.report, null); assert.equal(s.reportStale, true);
    await call('report'); assert.equal(s.report.evidenceKey, s.facts.evidenceKey);
  });
  await test('Old stored acceptances are rechecked on resume without deleting their original answer', async () => {
    const storePath = path.join(__dirname, '.local', 'fixture-legacy-' + Date.now() + '.json'), h = createHandler({ storePath, getConfig: () => noConfig });
    const s = await h('start', {}), raw = JSON.parse(fs.readFileSync(storePath, 'utf8')), state = raw.sessions[s.id], q = state.current.question;
    const row = { id: s.id + '-a1', mode: 'ai-unit', questionId: q.id, skillId: q.skillId, topicId: q.topicId, dimension: q.dimension, contentKey: q.prompt, outcome: 'correct', userAnswer: '-(x-' + q.params.b + ')', difficulty: q.difficulty, itemB: q.b, at: Date.now() };
    state.attempts = [row]; state.feedback = { record: row, label: '独立完成' }; state.report = { source: 'ai', summary: '旧版分析' }; fs.writeFileSync(storePath, JSON.stringify(raw));
    const resumed = await createHandler({ storePath, getConfig: () => noConfig })('resume', { sessionId: s.id });
    assert.equal(resumed.attempts[0].userAnswer, row.userAnswer); assert.equal(resumed.attempts[0].outcome, 'correct');
    assert.equal(resumed.facts.counts.needsReview, 1); assert.equal(resumed.estimate.n, 0);
    assert.equal(resumed.report, null); assert.equal(resumed.nextPlan.action, 'retest'); assert.equal(resumed.question.answer, undefined);
  });


  await test('An old session that directly asks for next is rechecked before its outdated promotion can run', async () => {
    const storePath = path.join(__dirname, '.local', 'fixture-direct-next-' + Date.now() + '.json'), h = createHandler({ storePath, getConfig: () => noConfig });
    const s = await h('start', {}), raw = JSON.parse(fs.readFileSync(storePath, 'utf8')), state = raw.sessions[s.id], q = state.current.question;
    const row = { id: s.id + '-a1', mode: 'ai-unit', questionId: q.id, skillId: q.skillId, topicId: q.topicId, dimension: q.dimension, contentKey: q.prompt, outcome: 'correct', userAnswer: '-(x-' + q.params.b + ')', difficulty: q.difficulty, itemB: q.b, at: Date.now() };
    state.attempts = [row]; state.feedback = { record: row, label: '独立完成' };
    state.nextPlan = { action: 'challenge', targetSkill: 'distribute', level: 2, source: 'rules', reason: '旧版进阶', evidenceIds: [row.id] }; fs.writeFileSync(storePath, JSON.stringify(raw));
    const next = await createHandler({ storePath, getConfig: () => noConfig })('next', { sessionId: s.id, revision: s.revision });
    assert.equal(next.question.level, 1); assert.equal(next.phase, 'retest'); assert.equal(next.facts.counts.independent, 0); assert.equal(next.facts.counts.needsReview, 1);
  });

  const configFile = path.join(__dirname, '.local', 'fixture-provider-' + Date.now() + '.env');
  const server = createServer({ getConfig: () => Provider.readConfig({}, configFile), configFile, fetchImpl: fixtureFetch, storePath: path.join(__dirname, '.local', 'fixture-http.json') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = 'http://127.0.0.1:' + server.address().port;
  const post = (url, body, headers = {}) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try {
    await test('Local setup requires its page token and rejects foreign origins', async () => {
      assert.equal((await post('/api/settings', {})).status, 403); assert.equal((await fetch(base + '/setup', { headers: { Origin: 'https://foreign.invalid' } })).status, 403);
      const html = await (await fetch(base + '/setup')).text(), token = html.match(/const token="([a-f0-9]+)"/)[1]; const response = await post('/api/settings', { provider: 'deepseek', model: 'deepseek-flash', key: 'fixture-secret' }, { 'X-Setup-Token': token }); const body = await response.text(); assert.equal(response.status, 200); assert.ok(!body.includes('fixture-secret')); assert.equal((await post('/api/ai/check', {}, { 'X-Setup-Token': token })).status, 200);
    });
    await test('Configuration and runtime session files are inaccessible to static requests', async () => {
      for (const url of ['/.env.local', '/provider-config.cjs', '/.local/learning-sessions.json', '/%2e%2e%2f.env.local']) assert.equal((await fetch(base + url)).status, 404); const status = await (await fetch(base + '/api/status')).text(); assert.ok(!status.includes('fixture-secret'));
    });
    await test('Learning API rejects malformed input and unrelated browser origins', async () => {
      assert.equal((await post('/api/unit/start', null)).status, 400); assert.equal((await post('/api/unit/start', {}, { Origin: 'https://foreign.invalid' })).status, 403); const response = await post('/api/unit/start', { aiEnabled: false }); assert.equal(response.status, 200); assert.equal((await response.json()).question.answer, undefined);
    });
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  console.log(JSON.stringify({ aiServicePassed: passed, liveModelCalls: 0, fixtureOnly: true }));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
