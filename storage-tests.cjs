'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createLocalStore, createRedisStore } = require('./session-store.cjs');
const { createHandler } = require('./tutor-service.cjs'), C = require('./source/ai-learning.js');
let passed = 0, completed = false;
process.on('beforeExit', () => { if (!completed) { console.error('Storage checks did not reach completion'); process.exitCode = 1; } });
async function test(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
async function main() {
  await test('Session reads are independent copies and stale writes cannot replace committed evidence', async () => {
    const store = createLocalStore(); await store.create('a', { id: 'a', revision: 0, attempts: [] }); const first = await store.get('a'); first.attempts.push('pending'); assert.equal((await store.get('a')).attempts.length, 0);
    await store.put('a', 0, { ...first, revision: 1 }); await assert.rejects(store.put('a', 0, { id: 'a', revision: 2 }), { status: 409 }); assert.equal((await store.get('a')).revision, 1);
  });
  await test('The existing JSON format reloads exact questions and refuses to overwrite corrupt data', async () => {
    const filename = path.join(__dirname, '.local', 'fixture-storage-' + Date.now() + '.json'), store = createLocalStore({ filename }); await store.create('a', { id: 'a', version: 5, revision: 0, draft: '保留' }); assert.equal((await createLocalStore({ filename }).get('a')).draft, '保留');
    fs.writeFileSync(filename, '{bad-json'); assert.throws(() => createLocalStore({ filename })); assert.equal(fs.readFileSync(filename, 'utf8'), '{bad-json');
  });
  await test('A failed persistence operation does not turn an uncommitted answer into a saved success', async () => {
    const backing = createLocalStore(); let fail = true; const store = { ...backing, async put(...args) { if (fail) throw Object.assign(Error('记录暂时无法保存'), { status: 503 }); return backing.put(...args); } };
    const h = createHandler({ sessionStore: store, getConfig: () => ({}) }), initial = await h('start', {}), input = { sessionId: initial.id, revision: initial.revision, questionId: initial.question.id, answer: C.fromId(initial.question.id).answer };
    await assert.rejects(h('answer', input), { status: 503 }); const resumed = await h('resume', { sessionId: initial.id }); assert.equal(resumed.revision, initial.revision); assert.equal(resumed.attempts.length, 0);
    fail = false; assert.equal((await h('answer', input)).attempts.length, 1);
  });
  await test('Two handlers sharing a store can accept only one answer with the same revision', async () => {
    const store = createLocalStore(), a = createHandler({ sessionStore: store, getConfig: () => ({}) }), b = createHandler({ sessionStore: store, getConfig: () => ({}) }); const v = await a('start', {}), input = { sessionId: v.id, revision: v.revision, questionId: v.question.id, answer: C.fromId(v.question.id).answer };
    const results = await Promise.allSettled([a('answer', input), b('answer', input)]); assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(results.find(r => r.status === 'rejected').reason.status, 409); assert.equal((await b('resume', { sessionId: v.id })).attempts.length, 1);
  });
  await test('Saving another student cannot persist a half-finished model decision from an in-flight request', async () => {
    const store = createLocalStore(); let release, entered;
    const waiting = new Promise(resolve => { entered = resolve; }), gate = new Promise(resolve => { release = resolve; });
    const slow = createHandler({ sessionStore: store, getConfig: () => ({ key: 'fixture', model: 'fixture', url: 'https://fixture.invalid' }), fetchImpl: async () => { entered(); await gate; throw Error('fixture fallback'); } }), fast = createHandler({ sessionStore: store, getConfig: () => ({}) });
    const a = await slow('start', { aiEnabled: true }), b = await fast('start', {}), pending = slow('answer', { sessionId: a.id, revision: a.revision, questionId: a.question.id, answer: C.fromId(a.question.id).answer }); await waiting;
    await fast('answer', { sessionId: b.id, revision: b.revision, questionId: b.question.id, answer: C.fromId(b.question.id).answer }); assert.equal((await store.get(a.id)).attempts.length, 0); release(); await pending; assert.equal((await store.get(a.id)).attempts.length, 1);
  });
  await test('Redis connection errors remain generic and cannot expose connection passwords', async () => {
    const store = createRedisStore({ url: 'redis://user:fixture-private@localhost:6379', client: { isOpen: true, withAbortSignal() { return this; }, async get() { throw Error('redis://user:fixture-private@localhost'); } } });
    await assert.rejects(store.get('a'), e => e.status === 503 && !e.message.includes('fixture-private'));
    assert.throws(() => createRedisStore({ url: 'https://wrong.invalid' }), { status: 503 });
  });
  await test('Session limits apply atomically and failed creation leaves existing evidence untouched', async () => {
    const store = createLocalStore({ maxSessions: 1 }); await store.create('a', { id: 'a', revision: 0 }); await assert.rejects(store.create('b', { id: 'b', revision: 0 }), { status: 429 }); assert.equal(await store.get('b'), null); assert.equal((await store.get('a')).revision, 0);
  });
  const url = process.env.ZHISHU_TEST_REDIS_URL;
  if (url) await test('A real Redis server restores across clients and atomically rejects stale writes', async () => {
    const prefix = 'zhishu:{ci-' + process.pid + '-' + Date.now() + '}', one = createRedisStore({ url, prefix }), two = createRedisStore({ url, prefix });
    const a = createHandler({ sessionStore: one, getConfig: () => ({}) }), b = createHandler({ sessionStore: two, getConfig: () => ({}) });
    try { let v = await a('start', { grade: 9, skill: 'cnm_219' }); const input = { sessionId: v.id, revision: v.revision, questionId: v.question.id, answer: C.fromId(v.question.id).answer }; const concurrent = await Promise.allSettled([a('answer', input), b('answer', input)]); assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1); v = await b('resume', { sessionId: v.id }); assert.equal(v.attempts.length, 1); assert.equal(v.feedback.record.outcome, 'correct'); await assert.rejects(a('answer', input), { status: 409 }); }
    finally { await a.close(); await b.close(); }
  });
  completed = true; console.log(JSON.stringify({ storagePassed: passed, realRedisTested: !!url, liveModelCalls: 0 }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
