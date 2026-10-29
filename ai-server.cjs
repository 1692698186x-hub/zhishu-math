'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createServer: legacyServer } = require('./server.cjs');
const Provider = require('./provider-config.cjs');
const { setupPage } = require('./setup-page.cjs');
const { createReportHandler } = require('./report-service.cjs');
const version = require('./package.json').version;
async function bodyJSON(req, max = 16000) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw Object.assign(Error('需要 JSON 请求。'), { status: 415 });
  const chunks = []; let length = 0;
  for await (const c of req) { length += c.length; if (length > max) throw Object.assign(Error('请求内容过长。'), { status: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) { throw Object.assign(Error('请求格式无效。'), { status: 400 }); }
}
function createServer(options = {}) {
  const getConfig = options.getConfig || (() => Provider.readConfig());
  const token = crypto.randomBytes(32).toString('hex');
  const legacy = legacyServer({ config: getConfig(), fetchImpl: options.fetchImpl });
  const fallback = legacy.listeners('request')[0]; legacy.removeAllListeners('request');
  let unitHandler, lastCheck = null, checking = false;
  const rates = new Map();
  function json(res, status, result) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(result)); }
  const sameOrigin = req => !req.headers.origin || req.headers.origin === 'http://' + req.headers.host || req.headers.origin === 'https://' + req.headers.host;
  const local = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && /^(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(req.headers.host || '');
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/status') return json(res, 200, { app: 'zhishu-math', version, ...Provider.publicConfig(getConfig()), lastCheck, localSetup: local(req) });
      if (url.pathname === '/setup' || url.pathname === '/api/settings' || url.pathname === '/api/ai/check') {
        if (!local(req) || !sameOrigin(req)) return json(res, 403, { error: 'AI 配置只在本机开放。' });
        if (req.method === 'GET' && url.pathname === '/setup') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'" }); return res.end(setupPage(token)); }
        if (req.method === 'GET' && url.pathname === '/api/settings') return json(res, 200, Provider.publicConfig(getConfig()));
        if (req.method !== 'POST') return json(res, 405, { error: '不支持此操作。' });
        if (req.headers['x-setup-token'] !== token) return json(res, 403, { error: '请重新打开本地设置页面。' });
        const input = await bodyJSON(req);
        if (url.pathname === '/api/settings') { const c = Provider.saveConfig(input, options.configFile); lastCheck = null; return json(res, 200, c); }
        if (checking) return json(res, 429, { error: '正在测试连接，请稍候。' });
        const config = getConfig(); if (!config.key || !config.model) return json(res, 400, { error: '请先保存密钥和模型名称。' });
        checking = true;
        try { const result = await Provider.callJSON(config, '只输出 JSON 对象 {"ok":true}。', { task: 'connection-test' }, { tokens: 80, fetchImpl: options.fetchImpl }); if (result.ok !== true) throw Error('invalid'); lastCheck = { ok: true, at: Date.now(), provider: config.provider }; return json(res, 200, { ok: true, message: config.label + ' 连接成功。返回知数，选择年级与知识点，点击“AI 辅导”即可体验。' }); }
        catch (e) { lastCheck = { ok: false, at: Date.now() }; const message = e.status === 401 ? '密钥未通过验证，请检查密钥。' : e.status === 402 ? '账户余额不足，请检查服务账户。' : e.status === 404 ? '模型名称不可用，请按控制台填写。' : '连接暂未成功，请检查网络、模型名称与服务状态。'; return json(res, 502, { error: message }); }
        finally { checking = false; }
      }
      if (url.pathname.startsWith('/api/unit/')) {
        if (!sameOrigin(req)) return json(res, 403, { error: '仅接受当前应用的请求。' });
        if (req.method !== 'POST') return json(res, 405, { error: '请使用 POST 请求。' });
        const ip = req.socket.remoteAddress, now = Date.now();
        if (rates.size > 1000) for (const [id, r] of rates) if (now - r.at > 60000) rates.delete(id);
        let rate = rates.get(ip); if (!rate || now - rate.at > 60000) { rate = { at: now, n: 0 }; rates.set(ip, rate); }
        if (++rate.n > 90) return json(res, 429, { error: '操作较多，请稍后再试。' });
        if (!unitHandler) { const file = path.join(__dirname, 'tutor-service.cjs'); if (!fs.existsSync(file)) return json(res, 503, { error: '学习引擎正在准备中。' }); unitHandler = require('./tutor-service.cjs').createHandler({ getConfig, fetchImpl: options.fetchImpl, storePath: options.storePath, sessionStore: options.sessionStore, redisUrl: options.redisUrl, redisPrefix: options.redisPrefix }); }
        const result = await unitHandler(url.pathname.split('/').pop(), await bodyJSON(req));
        return json(res, 200, result);
      }
      if (url.pathname === '/api/report') return await createReportHandler({ config: getConfig(), fetchImpl: options.fetchImpl || fetch, json })(req, res);
      return await fallback(req, res);
    } catch (e) { if (!res.headersSent) json(res, e.status || 400, { error: e.status ? e.message : '请求未完成，请重试。' }); else res.end(); }
  });
  server.on('close', () => { unitHandler?.close?.().catch(() => {}); });
  return server;
}
if (require.main === module) { const config = Provider.readConfig(); createServer().listen(config.port, config.host, () => console.log('知数 AI 学习：http://' + config.host + ':' + config.port + '\n本地 AI 配置：http://' + config.host + ':' + config.port + '/setup')); }
module.exports = { createServer, bodyJSON };
