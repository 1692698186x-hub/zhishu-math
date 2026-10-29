'use strict';
const fs = require('node:fs'), path = require('node:path');
const clone = value => value == null ? value : structuredClone(value);
const failure = (status, message) => Object.assign(Error(message), { status });
function createLocalStore(options = {}) {
  const filename = options.filename;
  let sessions = {};
  if (filename && fs.existsSync(filename)) {
    const stored = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (stored.version !== 5 || !stored.sessions || typeof stored.sessions !== 'object' || Array.isArray(stored.sessions)) throw failure(503, '学习记录格式无法读取，请先检查本机备份。');
    sessions = stored.sessions;
  }
  function commit(next) {
    if (filename) {
      fs.mkdirSync(path.dirname(filename), { recursive: true });
      fs.writeFileSync(filename + '.tmp', JSON.stringify({ version: 5, sessions: next }), { mode: 0o600 });
      fs.renameSync(filename + '.tmp', filename);
    }
    sessions = next;
  }
  return {
    kind: filename ? 'file' : 'memory',
    async get(id) { return Object.hasOwn(sessions, id) ? clone(sessions[id]) : null; },
    async create(id, state) {
      if (Object.hasOwn(sessions, id)) throw failure(409, '学习记录已存在，请重新开始。');
      if (Object.keys(sessions).length >= (options.maxSessions || 500)) throw failure(429, '学习档案较多，请先导出记录。');
      commit({ ...sessions, [id]: clone(state) });
    },
    async put(id, expected, state) {
      if (!Object.hasOwn(sessions, id) || sessions[id].revision !== expected) throw failure(409, '学习记录已更新，请恢复当前学习再继续。');
      commit({ ...sessions, [id]: clone(state) });
    },
    async close() {}
  };
}
const createScript = "if redis.call('EXISTS',KEYS[1])==1 then return 0 end if redis.call('SCARD',KEYS[2])>=tonumber(ARGV[2]) then return 2 end redis.call('SET',KEYS[1],ARGV[1]); redis.call('SADD',KEYS[2],KEYS[1]); return 1";
const putScript = "local old=redis.call('GET',KEYS[1]); if not old then return 0 end local row=cjson.decode(old); if tonumber(row.revision)~=tonumber(ARGV[1]) then return 0 end redis.call('SET',KEYS[1],ARGV[2]); return 1";
function createRedisStore(options = {}) {
  const prefix = options.prefix || 'zhishu:{learning}', url = options.url;
  if (!/^[a-zA-Z0-9:_{}-]{1,100}$/.test(prefix)) throw failure(503, 'Redis 记录前缀无效。');
  try { const parsed = new URL(url); if (!['redis:', 'rediss:'].includes(parsed.protocol) || !parsed.hostname) throw Error(); } catch (_) { throw failure(503, 'Redis 连接配置无效，请检查云端环境变量。'); }
  let client = options.client, connecting;
  async function ready() {
    if (!client) {
      const socket = { connectTimeout: 5000, reconnectStrategy: false };
      if (options.caFile) socket.ca = fs.readFileSync(options.caFile);
      client = require('redis').createClient({ url, socket, disableOfflineQueue: true, commandsQueueMaxLength: 100 });
      client.on('error', () => {});
    }
    if (!client.isOpen) {
      connecting ||= client.connect().finally(() => { connecting = null; });
      await connecting;
    }
    return client.withAbortSignal(AbortSignal.timeout(options.timeout || 5000));
  }
  const key = id => prefix + ':session:' + id;
  async function guarded(fn) {
    try { return await fn(await ready()); }
    catch (e) { if ([409, 429].includes(e.status)) throw e; throw failure(503, '云端学习记录暂时无法读写，请稍后重试；本机草稿会保留。'); }
  }
  return {
    kind: 'redis',
    async get(id) { return guarded(async c => { const raw = await c.get(key(id)); if (raw == null) return null; const state = JSON.parse(raw); if (state.version !== 5 || state.id !== id || !Number.isInteger(state.revision)) throw Error('invalid stored session'); return state; }); },
    async create(id, state) { return guarded(async c => { const result = await c.eval(createScript, { keys: [key(id), prefix + ':index'], arguments: [JSON.stringify(state), String(options.maxSessions || 500)] }); if (result === 2) throw failure(429, '学习档案较多，请先导出记录。'); if (result !== 1) throw failure(409, '学习记录已存在，请重新开始。'); }); },
    async put(id, expected, state) { return guarded(async c => { const result = await c.eval(putScript, { keys: [key(id)], arguments: [String(expected), JSON.stringify(state)] }); if (result !== 1) throw failure(409, '学习记录已更新，请恢复当前学习再继续。'); }); },
    async close() { if (client?.isOpen) await client.close(); }
  };
}
function createSessionStore(options = {}) {
  if (options.persist === false) return createLocalStore();
  if (options.storePath) return createLocalStore({ filename: options.storePath });
  const url = options.redisUrl || process.env.REDIS_URL;
  return url ? createRedisStore({ url, prefix: options.redisPrefix || process.env.REDIS_PREFIX, caFile: options.redisCaFile || process.env.REDIS_CA_FILE }) : createLocalStore({ filename: path.join(__dirname, '.local', 'learning-sessions.json') });
}
module.exports = { createSessionStore, createLocalStore, createRedisStore };
