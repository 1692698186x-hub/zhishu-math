'use strict';
const fs = require('node:fs');
const path = require('node:path');
const providers = {
  deepseek: { label: 'DeepSeek', url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash' },
  maas: { label: '华为云 MaaS', url: 'https://api.modelarts-maas.com/v2/chat/completions', model: '' }
};
const file = path.join(__dirname, '.env.local');
function readConfig(env = process.env, filename = file) {
  const values = {};
  if (fs.existsSync(filename)) for (const line of fs.readFileSync(filename, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && /^(AI_PROVIDER|DEEPSEEK_API_KEY|DEEPSEEK_MODEL|MAAS_API_KEY|MAAS_MODEL|MAAS_CHAT_URL|HOST|PORT)$/.test(m[1])) values[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  const v = { ...values, ...env };
  const provider = v.AI_PROVIDER === 'maas' ? 'maas' : v.AI_PROVIDER === 'deepseek' || v.DEEPSEEK_API_KEY ? 'deepseek' : v.MAAS_API_KEY ? 'maas' : 'deepseek';
  const info = providers[provider];
  const key = provider === 'deepseek' ? v.DEEPSEEK_API_KEY || '' : v.MAAS_API_KEY || '';
  const model = provider === 'deepseek' ? v.DEEPSEEK_MODEL || info.model : v.MAAS_MODEL || '';
  return { provider, label: info.label, key, model, url: provider === 'maas' ? v.MAAS_CHAT_URL || info.url : info.url, host: v.HOST || '127.0.0.1', port: Number(v.PORT) || 8877 };
}
function publicConfig(config = readConfig()) {
  return { provider: config.provider, providerLabel: config.label, model: config.model, configured: !!(config.key && config.model), hasKey: !!config.key };
}
function saveConfig(input, filename = file) {
  if (!input || !Object.hasOwn(providers, input.provider)) throw Error('请选择服务商。');
  const model = String(input.model || providers[input.provider].model).trim();
  if (!/^[a-zA-Z0-9_.:/-]{1,120}$/.test(model)) throw Error('请填写有效的模型名称。');
  const previous = readConfig({}, filename), key = String(input.key || '').trim() || (previous.provider === input.provider ? previous.key : '');
  if (!/^[\x21-\x7e]{8,512}$/.test(key)) throw Error('请填写 API 密钥。');
  const prefix = input.provider === 'maas' ? 'MAAS' : 'DEEPSEEK';
  const content = '# 仅保存在本机；不提交到 Git，不打包分享。\nAI_PROVIDER=' + input.provider + '\n' + prefix + '_API_KEY=' + key + '\n' + prefix + '_MODEL=' + model + '\n';
  fs.writeFileSync(filename + '.tmp', content, { mode: 0o600 });
  fs.renameSync(filename + '.tmp', filename);
  return publicConfig(readConfig({}, filename));
}
async function callJSON(config, system, input, options = {}) {
  if (!config.key || !config.model) throw Error('unconfigured');
  const url = new URL(config.url);
  if (url.protocol !== 'https:') throw Error('endpoint');
  const payload = { model: config.model, stream: false, max_tokens: options.tokens || 1100, messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(input) }] };
  if (config.provider === 'deepseek') { payload.response_format = { type: 'json_object' }; payload.thinking = { type: 'disabled' }; }
  const res = await (options.fetchImpl || fetch)(url.href, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.key }, body: JSON.stringify(payload), signal: AbortSignal.timeout(options.timeout || 22000) });
  if (!res.ok) { const e = Error('provider'); e.status = res.status; throw e; }
  const text = await res.text(); if (text.length > 80000) throw Error('response size');
  const data = JSON.parse(text), content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw Error('invalid response');
  return JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
}
module.exports = { providers, readConfig, publicConfig, saveConfig, callJSON };
