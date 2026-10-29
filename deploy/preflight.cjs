'use strict';
const fs = require('node:fs'), path = require('node:path');
function check(values, publicMode = false) {
  const checks = [], add = (name, ok) => checks.push({ name, passed: !!ok });
  const provider = values.AI_PROVIDER;
  add('modelProvider', ['deepseek', 'maas'].includes(provider));
  add('modelCredential', (provider === 'maas' ? values.MAAS_API_KEY : values.DEEPSEEK_API_KEY)?.length >= 8);
  add('modelName', !!(provider === 'maas' ? values.MAAS_MODEL : values.DEEPSEEK_MODEL));
  let redis = false;
  try { const u = new URL(values.REDIS_URL); redis = ['redis:', 'rediss:'].includes(u.protocol) && !!u.hostname && !!u.password; } catch (_) {}
  add('authenticatedRedis', redis);
  add('redisNamespace', /^[a-zA-Z0-9:_{}-]{1,100}$/.test(values.REDIS_PREFIX || 'zhishu:{learning}'));
  if (publicMode) {
    add('publicDomain', /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/.test(values.ZHISHU_PUBLIC_DOMAIN || ''));
    add('demoUsername', /^[a-zA-Z0-9_-]{3,40}$/.test(values.ZHISHU_DEMO_USER || ''));
    add('demoPasswordHash', /^\$2[aby]\$\d\d\$[./a-zA-Z0-9]{53}$/.test(values.ZHISHU_DEMO_PASSWORD_HASH || ''));
  }
  return { ready: checks.every(c => c.passed), checks, createsResources: false, deploysApplication: false, liveConnectionTested: false };
}
function readEnv(filename) {
  const values = {};
  for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) { const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m) values[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2'); }
  return values;
}
if (require.main === module) {
  try { const index = process.argv.indexOf('--env'), filename = index >= 0 ? process.argv[index + 1] : path.join(__dirname, '.env.cloud'); const report = check(readEnv(filename), process.argv.includes('--public')); console.log(JSON.stringify(report, null, 2)); if (!report.ready) process.exitCode = 1; }
  catch (_) { console.error('未找到可读取的云端配置文件，请先在部署主机填写 deploy/.env.cloud。'); process.exitCode = 1; }
}
module.exports = { check, readEnv };
