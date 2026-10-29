'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { check, readEnv } = require('./deploy/preflight.cjs');
let passed = 0; function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
const sample = { AI_PROVIDER: 'maas', MAAS_API_KEY: 'fixture-private-model-key', MAAS_MODEL: 'fixture', REDIS_URL: 'rediss://default:fixture-private-redis@redis.internal:6379/0', REDIS_PREFIX: 'zhishu:{learning}' };
test('Cloud configuration checks report readiness without returning credentials or connection addresses', () => {
  const result = check(sample); assert.equal(result.ready, true); assert.equal(result.createsResources, false); assert.equal(result.liveConnectionTested, false); assert.ok(!JSON.stringify(result).includes('fixture-private')); assert.ok(!JSON.stringify(result).includes('redis.internal'));
});
test('Public-demo validation requires a real domain and a password hash before enabling that profile', () => {
  assert.equal(check(sample, true).ready, false); assert.equal(check({ ...sample, ZHISHU_PUBLIC_DOMAIN: 'demo.example.com', ZHISHU_DEMO_USER: 'demo', ZHISHU_DEMO_PASSWORD_HASH: '$2b$12$' + 'a'.repeat(53) }, true).ready, true);
  assert.equal(check({ ...sample, REDIS_URL: 'https://invalid.example' }).ready, false); assert.equal(check({ ...sample, REDIS_URL: 'redis://redis.internal:6379' }).ready, false);
});
test('Environment files are parsed as data and never execute shell substitutions', () => {
  const filename = path.join(__dirname, '.local', 'fixture-cloud-env-' + Date.now()); fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, "AI_PROVIDER=deepseek\nDEEPSEEK_API_KEY='$(do-not-run)'\nDEEPSEEK_MODEL=test\n"); assert.equal(readEnv(filename).DEEPSEEK_API_KEY, '$(do-not-run)');
});
console.log(JSON.stringify({ deploymentPassed: passed, createdCloudResources: false }));
