(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ability = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const labels = { secure: '较稳', shaky: '待巩固', weak: '薄弱', checking: '待复测', unknown: '未测', notlearned: '尚未学习' };
  function createEngine(data) {
    const topics = data.topics;
    const byId = Object.fromEntries(topics.map(t => [t.id, t]));
    const questions = data.questions.filter(q => ['numeric', 'choice'].includes(q.type));
    const bank = {};
    questions.forEach(q => (bank[q.topicId] ||= []).push(q));
    const prerequisites = {};
    data.dependencies.filter(e => e.strength === 'hard').forEach(e => (prerequisites[e.topicId] ||= []).push(e.prerequisiteId));
    const ancestorCache = {};
    function ancestors(id) {
      if (ancestorCache[id]) return ancestorCache[id];
      const found = new Set(), queue = [...(prerequisites[id] || [])];
      while (queue.length) { const p = queue.pop(); if (!found.has(p)) { found.add(p); queue.push(...(prerequisites[p] || [])); } }
      ancestorCache[id] = found; return found;
    }
    function deferred(session) {
      const ids = new Set();
      session.answers.filter(r => r.outcome === 'correct' && (r.type !== 'choice' || session.answers.filter(x => x.topicId === r.topicId && x.outcome === 'correct').length >= 2)).forEach(r => ancestors(r.topicId).forEach(id => ids.add(id)));
      session.answers.forEach(r => ids.delete(r.topicId));
      return ids;
    }
    function evidence(records, id) {
      const all = records.filter(r => r.topicId === id);
      const scored = all.filter(r => ['correct', 'wrong'].includes(r.outcome) && !r.assisted);
      // Repeated exposure to the same item is one piece of evidence, not a new independent success.
      const unique = new Map();
      scored.forEach(r => unique.set(r.questionId, r));
      const recent = [...unique.values()].sort((a, b) => a.at - b.at).slice(-6);
      const n = recent.length;
      const correct = recent.filter(r => r.outcome === 'correct').length;
      const wrong = n - correct;
      const last = recent.at(-1);
      let status = 'unknown';
      if (!n && all.some(r => r.outcome === 'not_learned')) status = 'notlearned';
      else if (n === 1) status = 'checking';
      else if (n >= 3 && correct / n >= 0.8 && last.outcome === 'correct' && recent.some(r => r.outcome === 'correct' && r.difficulty !== 'basic')) status = 'secure';
      else if (wrong >= 2 && wrong / n >= 0.6) status = 'weak';
      else if (n > 1) status = 'shaky';
      return { status, n, correct, wrong, attempts: scored.length, latest: last?.at || 0 };
    }
    function scope(config) {
      return topics.filter(t => t.grade === Number(config.grade) && (!config.semester || config.semester === 'all' || t.semester === config.semester) && (!config.domain || config.domain === 'all' || t.domain === config.domain));
    }
    function chapter(t) { return t.chapter.replace(/\s+\d+(?:\.\d+)*\s*$/, ''); }
    function hash(s) { let h = 0; for (const c of s) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0; return h; }
    function newSession(config) {
      const ids = config.focusIds?.filter(id => byId[id]) || scope(config).map(t => t.id);
      return { id: config.id || 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), mode: config.mode || 'diagnose', grade: Number(config.grade), semester: config.semester || 'all', domain: config.domain || 'all', limit: Number(config.limit) || 12, trace: config.trace !== false, scopeIds: ids, answers: [], rootIds: [], current: null, finished: false, createdAt: Date.now() };
    }
    function recommendations(records, config) {
      const allowed = new Set(scope(config).map(t => t.id));
      records.forEach(r => { if (byId[r.topicId]?.grade <= Number(config.grade)) allowed.add(r.topicId); });
      const out = [];
      for (const id of allowed) {
        const ev = evidence(records, id);
        if (['weak', 'shaky', 'checking'].includes(ev.status)) {
          const weakPrereqs = (prerequisites[id] || []).filter(p => ['weak', 'shaky'].includes(evidence(records, p).status));
          out.push({ topic: byId[id], evidence: ev, blocked: weakPrereqs, reason: weakPrereqs.length ? '先补相关基础，再回来练习' : ev.status === 'weak' ? '先用基础题补缺，再用新题复测' : ev.status === 'checking' ? '换一道题，确认是否真正掌握' : '用不同题型巩固，再逐步提高难度' });
        }
      }
      return out.sort((a, b) => Number(a.blocked.length > 0) - Number(b.blocked.length > 0) || ({ weak: 0, shaky: 1, checking: 2 }[a.evidence.status] - { weak: 0, shaky: 1, checking: 2 }[b.evidence.status]) || a.topic.grade - b.topic.grade || a.topic.id.localeCompare(b.topic.id));
    }
    function next(session, records) {
      if (session.finished) return null;
      if (session.current) return session.current;
      if (session.answers.length >= session.limit) { session.finished = true; return null; }
      const counts = {};
      session.answers.forEach(r => counts[r.topicId] = (counts[r.topicId] || 0) + 1);
      const used = new Set(session.answers.map(r => r.questionId));
      const available = id => (bank[id] || []).filter(q => !used.has(q.id));
      const notLearned = id => session.answers.some(r => r.topicId === id && r.outcome === 'not_learned');
      let id, reason, kind = 'screen', linkedTo = null;
      const protectedIds = session.mode === 'diagnose' ? deferred(session) : new Set();
      const roots = session.rootIds || (session.rootIds = []);
      if (session.mode === 'diagnose' && roots.length >= 2) {
        session.finished = true; session.finishReason = '已找到两个可以优先补习的薄弱候选，先练习再复测更有价值'; return null;
      }
      if (session.mode === 'diagnose') {
        const failures = [...new Set(session.answers.filter(r => r.outcome === 'wrong').map(r => r.topicId))].reverse();
        for (const failed of failures) {
          const attempts = session.answers.filter(r => r.topicId === failed);
          if (attempts.some(r => r.outcome === 'correct' || r.outcome === 'not_learned') || roots.includes(failed) || roots.some(p => ancestors(failed).has(p))) continue;
          const allCandidates = session.trace ? [...ancestors(failed)].filter(p => byId[p].grade <= session.grade && !counts[p] && available(p).length && !notLearned(p) && !protectedIds.has(p) && evidence(records, p).status !== 'secure') : [];
          // Stay near the student's current learning stage. A single miss on algebra does not
          // justify an immediate jump to early-primary arithmetic; confirm the local gap first.
          const candidates = allCandidates.filter(p => byId[p].grade >= Math.max(1, byId[failed].grade - 2));
          // Probe a balanced checkpoint in the unresolved prerequisite graph instead of walking every edge.
          // A shared prerequisite is more useful because it can resolve several open branches.
          const pool = new Set(candidates);
          const value = p => {
            const below = [...ancestors(p)].filter(a => pool.has(a)).length + 1;
            return Math.min(below, candidates.length - below) * 10 + failures.filter(f => ancestors(f).has(p)).length * 2 + byId[p].grade / 100;
          };
          candidates.sort((a, b) => value(b) - value(a));
          if (candidates.length) { id = candidates[0]; linkedTo = failed; kind = 'trace'; reason = '「' + byId[failed].name + '」未通过，抽查相关基础「' + byId[id].name + '」，缩小待查范围，省去逐层提问'; break; }
          if (attempts.length < 2 && available(failed).length) { id = failed; kind = 'confirm'; reason = '暂未发现更早的明确薄弱点，换一道基础题复核，区分偶然失误与持续困难'; break; }
        }
      }
      const lastAnswer = session.answers.at(-1);
      if (!id && session.mode === 'diagnose' && lastAnswer?.outcome === 'correct' && lastAnswer.type === 'choice' && ancestors(lastAnswer.topicId).size && session.answers.filter(r => r.topicId === lastAnswer.topicId && r.outcome === 'correct').length < 2 && available(lastAnswer.topicId).length) {
        id = lastAnswer.topicId; kind = 'verify'; reason = '这是一道选择题，用另一道新题交叉确认后，再暂缓追问相关基础，减少蒙对的影响';
      }
      if (!id && session.mode === 'practice') {
        const recs = recommendations(records, session).filter(r => session.scopeIds.includes(r.topic.id) && available(r.topic.id).length && !notLearned(r.topic.id));
        if (recs.length) {
          // Rotate across weak skills; one topic may recur with distinct items.
          recs.sort((a, b) => (counts[a.topic.id] || 0) - (counts[b.topic.id] || 0));
          id = recs[0].topic.id; reason = recs[0].reason;
        }
      }
      if (!id) {
        const chapterCounts = {}, domainCounts = {};
        session.answers.forEach(r => { const t = byId[r.topicId]; const ch = chapter(t); chapterCounts[ch] = (chapterCounts[ch] || 0) + 1; domainCounts[t.domain] = (domainCounts[t.domain] || 0) + 1; });
        const candidates = session.scopeIds.filter(p => available(p).length && (counts[p] || 0) < (session.mode === 'practice' ? 8 : 1) && !notLearned(p) && !protectedIds.has(p) && (session.mode === 'practice' || !roots.some(r => ancestors(p).has(r))));
        const score = p => (counts[p] || 0) * 100 + (chapterCounts[chapter(byId[p])] || 0) * 14 + (domainCounts[byId[p].domain] || 0) * 6 + (evidence(records, p).status === 'secure' ? 25 : 0) - Math.log2([...ancestors(p)].filter(a => session.scopeIds.includes(a)).length + 1) * 1.4 + hash(session.id + p) % 1000 / 1000;
        candidates.sort((a, b) => score(a) - score(b));
        if (candidates.length) { id = candidates[0]; reason = session.mode === 'practice' ? '根据当前记录，选择适合继续练习的题目' : '优先检查能连接多项基础知识的关键点，减少逐点作答'; }
      }
      if (!id) { session.finished = true; session.finishReason = roots.length ? '当前分支已找到薄弱候选，相关后续知识暂不重复提问，先补基础再复测' : '当前关键点初筛已完成；相关前置知识暂缓逐点追问'; return null; }
      const ev = evidence(records, id);
      const hasWrong = session.answers.some(r => r.topicId === id && r.outcome === 'wrong');
      const desired = kind === 'trace' || kind === 'confirm' || hasWrong || ev.status === 'weak' ? 'basic' : session.mode === 'practice' && ev.status === 'secure' ? 'advanced' : 'standard';
      const seen = new Set(records.map(r => r.questionId));
      const ranks = { basic: 0, standard: 1, advanced: 2 };
      const options = available(id);
      const itemScore = q => Math.abs(ranks[q.difficulty] - ranks[desired]) * 10 + Number(seen.has(q.id)) * 2 + hash(session.id + q.id + session.answers.length) % 1000 / 1000;
      options.sort((a, b) => itemScore(a) - itemScore(b));
      const q = options[0];
      session.current = { questionId: q.id, topicId: id, reason, kind, linkedTo, reach: ancestors(id).size, outside: !session.scopeIds.includes(id), repeated: seen.has(q.id) };
      return session.current;
    }
    function record(session, records, outcome, extra) {
      if (!session.current || !['correct', 'wrong', 'not_learned', 'assisted', 'skip'].includes(outcome)) throw Error('Invalid answer state');
      const q = bank[session.current.topicId].find(q => q.id === session.current.questionId);
      const r = { ...(extra || {}), sessionId: session.id, mode: session.mode, topicId: q.topicId, questionId: q.id, difficulty: q.difficulty, type: q.type, outcome, at: Date.now(), kind: session.current.kind, linkedTo: session.current.linkedTo, assisted: outcome === 'assisted' || !!extra?.assisted };
      session.answers.push(r); records.push(r); session.current = null;
      if (r.kind === 'confirm' && r.outcome === 'wrong' && !session.rootIds.includes(q.topicId)) session.rootIds.push(q.topicId);
      if (session.answers.length >= session.limit) session.finished = true;
      return r;
    }
    function report(records, config) {
      const list = scope(config).map(topic => ({ topic, ...evidence(records, topic.id) }));
      const counts = Object.fromEntries(Object.keys(labels).map(k => [k, 0]));
      list.forEach(t => counts[t.status]++);
      return { list, counts, tested: list.filter(t => t.n > 0).length, total: list.length };
    }
    return { topics, byId, bank, prerequisites, ancestors, deferred, evidence, scope, chapter, newSession, next, record, report, recommendations, labels };
  }
  return { createEngine, labels };
});
