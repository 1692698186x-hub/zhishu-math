'use strict';
const assert = require('node:assert/strict');
const { createServer, parseReply } = require('./server.cjs');
const unit = require('./source/learning-unit.js');
async function main() {
  let passed = 0;
  async function test(name, action) { await action(); passed++; console.log('PASS ' + name); }
  async function withServer(config, fetchImpl, action) {
    const server = createServer({ config, fetchImpl });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    try { await action(base); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
  const q = unit.questions.find(x => x.stage === 'practice'), diagnostic = unit.questions.find(x => x.stage === 'diagnose');
  const payload = { operation: 'feedback', questionId: q.id, outcome: 'wrong', userAnswer: '1', steps: '2x + 3' };
  const config = { key: '', model: '', url: 'https://example.invalid/v2/chat/completions' };
  const post = (base, value = payload, headers = {}) => fetch(base + '/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value) });
  await withServer(config, () => { throw Error('must not call provider'); }, async base => {
    await test('Offline service reports unconfigured status and returns honest rule feedback', async () => {
      const status = await (await fetch(base + '/api/status')).json(); assert.equal(status.configured, false);
      const result = await (await post(base)).json(); assert.equal(result.source, 'rules'); assert.match(result.reason, /未配置/);
    });
    await test('Only the built application is served; env files and sources are inaccessible', async () => {
      assert.equal((await fetch(base + '/')).status, 200);
      for (const name of ['/.env.local', '/server.cjs', '/source/learning.js', '/%2e%2e%2fserver.cjs']) assert.equal((await fetch(base + name)).status, 404, name);
    });
    await test('Invalid exercises, malformed JSON, diagnosis coaching, and foreign origins are rejected', async () => {
      assert.equal((await post(base, { ...payload, questionId: 'unknown' })).status, 400);
      assert.equal((await post(base, { ...payload, questionId: diagnostic.id })).status, 409);
      assert.equal((await post(base, payload, { Origin: 'https://other.example' })).status, 403);
      const res = await fetch(base + '/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' }); assert.equal(res.status, 400);
      assert.equal((await post(base, null)).status, 400);
    });
    await test('Large input is rejected before any provider call', async () => { assert.equal((await post(base, { ...payload, steps: 'a'.repeat(9000) })).status, 413); });
  });
  let received;
  const fakeConfig = { ...config, key: 'fixture-secret-never-return', model: 'fixture-model' };
  const modelAnswer = { hypothesis: '可能需要检查去括号。', evidence: '学生写了关键步骤。', suspectedSkillId: 'distribute', hint: '分别乘到每一项。' };
  await withServer(fakeConfig, async (url, options) => { received = { url, options }; return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelAnswer) } }] })); }, async base => {
    await test('Configured provider receives a canonical exercise and returns validated feedback', async () => {
      const result = await (await post(base, { ...payload, studentName: 'NEVER_SEND_ME', apiKey: 'CLIENT_SECRET', prompt: 'FORGED_PROMPT' })).json();
      assert.equal(result.source, 'ai'); assert.equal(result.status, '待确认');
      const body = JSON.parse(received.options.body); assert.equal(body.model, 'fixture-model');
      assert.equal(JSON.parse(body.messages[1].content).question.skill, q.skillId);
      assert.ok(body.messages[1].content.includes(q.prompt));
      for (const text of ['NEVER_SEND_ME', 'CLIENT_SECRET', 'FORGED_PROMPT']) assert.ok(!received.options.body.includes(text));
      assert.equal(received.options.headers.Authorization, 'Bearer fixture-secret-never-return');
      const statusText = await (await fetch(base + '/api/status')).text(); assert.ok(!statusText.includes(fakeConfig.key)); assert.ok(!JSON.stringify(result).includes(fakeConfig.key));
    });
  });
  await withServer(fakeConfig, async () => { throw Error('fixture-secret-never-return'); }, async base => {
    await test('Provider failure falls back without leaking credentials or raw errors', async () => { const res = await post(base), text = await res.text(); assert.equal(JSON.parse(text).source, 'rules'); assert.ok(!text.includes(fakeConfig.key)); });
  });
  await test('Malformed or unstructured model responses are rejected', async () => { assert.throws(() => parseReply('not json')); assert.throws(() => parseReply('{"hint":"only hint"}')); assert.equal(parseReply('```json\n' + JSON.stringify(modelAnswer) + '\n```').source, 'ai'); });
  console.log(JSON.stringify({ serverPassed: passed, liveModelCalls: 0, providerFixtureOnly: true }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
