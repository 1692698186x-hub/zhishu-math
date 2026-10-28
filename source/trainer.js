(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TopicTrainer = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const levels = ['basic', 'standard', 'advanced'];
  const levelNames = ['基础巩固', '标准练习', '进阶挑战'];
  const key = q => q.type + '|' + q.prompt.replace(/\s/g, '');
  function supplemental(topic) {
    const out = [];
    for (let n = 1; n <= 18; n++) for (let level = 0; level < 3; level++) {
      const a = n + 2, b = n % 5 + 2, x = n + 1, signed = n % 2 ? -a : a;
      let prompt, answer, explanation;
      if (topic.id === 'cnm_006') {
        prompt = level === 0 ? '写出 ' + signed + ' 的相反数。' : level === 1 ? '若 a = ' + signed + '，求 −a 的值。' : '若 a 的相反数是 ' + signed + '，求 a + ' + b + ' 的值。';
        answer = level === 2 ? -signed + b : -signed;
        explanation = '互为相反数的两个数相加得 0。' + (level === 2 ? 'a = ' + -signed + '，所以 a + ' + b + ' = ' + answer + '。' : '因此相反数为 ' + answer + '。');
      } else if (['cnm_007', 'cnm_008'].includes(topic.id)) {
        prompt = level === 0 ? '计算 |−' + a + '|。' : level === 1 ? '计算 |−' + a + '| + |' + b + '|。' : '计算 |−' + a + '| − |' + (a + b) + '|。';
        answer = level === 0 ? a : level === 1 ? a + b : -b;
        explanation = '先求各数到 0 的距离，再进行运算，结果为 ' + answer + '。';
      } else if (['cnm_010', 'cnm_012', 'cnm_014', 'cnm_017'].includes(topic.id)) {
        const add = topic.id === 'cnm_010', sub = topic.id === 'cnm_012', mul = topic.id === 'cnm_014';
        const left = mul ? -a : topic.id === 'cnm_017' ? -a * b : signed;
        const right = level === 0 ? b : -b;
        const op = add ? '+' : sub ? '−' : mul ? '×' : '÷';
        const base = add ? left + right : sub ? left - right : mul ? left * right : left / right;
        prompt = '计算 ' + left + ' ' + op + ' (' + right + ')' + (level === 2 ? ' + ' + a : '') + '。';
        answer = base + (level === 2 ? a : 0);
        explanation = '先计算 ' + left + ' ' + op + ' (' + right + ') = ' + base + '。' + (level === 2 ? '再加 ' + a + '，结果为 ' + answer + '。' : '结果为 ' + answer + '。');
      } else if (topic.id === 'cnm_034') {
        const coefficient = level === 0 ? a + b : level === 1 ? a - b : -a - b;
        prompt = '合并同类项：' + (level === 2 ? '−' : '') + a + 'x ' + (level === 0 ? '+' : '−') + ' ' + b + 'x = □x。□ 中填几？';
        answer = coefficient; explanation = '同类项的系数相加减，字母和指数不变，系数为 ' + answer + '。';
      } else if (topic.id === 'cnm_042') {
        const rhs = a * x + (level === 2 ? -b * x : 0) + b;
        prompt = '解方程：' + a + 'x + ' + b + ' = ' + (level === 2 ? b + 'x + ' : '') + rhs + '。（只填 x 的值）';
        if (level === 2 && a === b) continue;
        answer = x; explanation = '移项并合并同类项后得到 ' + (level === 2 ? a - b : a) + 'x = ' + (rhs - b) + '，解得 x = ' + x + '。';
      } else continue;
      out.push({ id: 'variant_' + topic.id + '_' + level + '_' + n, topicId: topic.id, type: 'numeric', difficulty: levels[level], prompt, answer: String(answer), explanation, source: 'template' });
    }
    return out;
  }
  function createEngine(data, authored) {
    const topics = Object.fromEntries(data.topics.map(t => [t.id, t]));
    const bank = {}, items = Object.fromEntries([...data.questions, ...(authored?.questions || [])].map(q => [q.id, q]));
    for (const t of data.topics) {
      const pool = [...data.questions.filter(q => q.topicId === t.id && ['numeric', 'choice'].includes(q.type)), ...(authored?.questions || []).filter(q => q.topicId === t.id && q.stage === 'practice'), ...supplemental(t)];
      const unique = new Map();
      pool.forEach(q => { if (!unique.has(key(q))) unique.set(key(q), q); });
      bank[t.id] = [...unique.values()]; bank[t.id].forEach(q => { items[q.id] = q; });
    }
    const historyFor = (records, topicId) => records.filter(r => r.topicId === topicId);
    function evidence(records, topicId) {
      const all = historyFor(records, topicId), independent = new Map();
      const seen = new Set();
      for (const r of all) {
        const contentKey = r.contentKey || (items[r.questionId] ? key(items[r.questionId]) : r.questionId), repeated = seen.has(contentKey);
        seen.add(contentKey);
        if (['correct', 'wrong'].includes(r.outcome) && !r.assisted && !r.repeated && !repeated && r.evidenceEligible !== false && r.goalComplete !== false) independent.set(contentKey, r);
      }
      const recent = [...independent.values()].sort((a, b) => a.at - b.at).slice(-6);
      const correct = recent.filter(r => r.outcome === 'correct').length, n = recent.length;
      const stable = n >= 3 && correct / n >= .8 && recent.at(-1)?.outcome === 'correct' && recent.some(r => r.outcome === 'correct' && r.difficulty !== 'basic');
      const challenge = stable && recent.some(r => r.outcome === 'correct' && r.difficulty === 'advanced');
      const progress = !n ? 0 : Math.min(challenge ? 100 : stable ? 88 : 72, Math.round((correct / n) * Math.min(n, 6) * 13 + (stable ? 12 : 0) + (challenge ? 10 : 0)));
      const status = !n ? all.some(r => r.outcome === 'not_learned') ? 'notlearned' : 'unknown' : stable ? 'secure' : n < 2 ? 'checking' : recent.filter(r => r.outcome === 'wrong').length / n >= .6 ? 'weak' : 'shaky';
      return { n, correct, progress, stable, challenge, status, total: all.length, last: recent.at(-1), recent };
    }
    function create(topicId, records = []) {
      const ev = evidence(records, topicId);
      return { id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), topicId, phase: ev.n >= 3 ? 'practice' : 'diagnose', level: ev.stable ? 2 : ev.status === 'weak' ? 0 : 1, streak: 0, answers: [], exposed: [], draft: { answer: '', steps: '' }, current: null, feedback: null, finished: false, startedAt: Date.now() };
    }
    function next(run, records) {
      if (run.current || run.feedback || run.finished) return run.current;
      if (run.answers.length >= 12) { run.finished = true; run.reason = '本轮练习已完成'; return null; }
      const used = new Set(run.exposed || []);
      const seen = new Set(historyFor(records, run.topicId).map(r => r.contentKey || (items[r.questionId] ? key(items[r.questionId]) : r.questionId)));
      const fresh = (bank[run.topicId] || []).filter(q => !used.has(key(q)) && !seen.has(key(q)));
      // A new round may revisit old material, but those attempts never count as fresh evidence.
      const repeat = (bank[run.topicId] || []).filter(q => !used.has(key(q)));
      const candidates = fresh.length ? fresh : repeat;
      if (!candidates.length) { run.finished = true; run.reason = '本知识点本轮题目已完成'; return null; }
      candidates.sort((a, b) => Math.abs(levels.indexOf(a.difficulty) - run.level) - Math.abs(levels.indexOf(b.difficulty) - run.level));
      const q = candidates[0]; run.current = { questionId: q.id, repeated: seen.has(key(q)), assisted: false };
      run.exposed.push(key(q)); run.draft = { answer: '', steps: '' }; return run.current;
    }
    function record(run, records, outcome, extra = {}) {
      if (!run.current || run.feedback || !['correct', 'wrong', 'skip', 'not_learned'].includes(outcome)) throw Error('Invalid practice state');
      const q = items[run.current.questionId];
      const r = { ...extra, mode: 'topic-learning', stage: run.phase, sessionId: run.id, topicId: q.topicId, questionId: q.id, contentKey: key(q), type: q.type, difficulty: q.difficulty, outcome, assisted: !!run.current.assisted, repeated: !!run.current.repeated, at: Date.now() };
      run.answers.push(r); records.push(r); run.current = null; run.draft = { answer: '', steps: '' };
      const previous = run.level, independent = outcome === 'correct' && !r.assisted && !r.repeated;
      run.streak = independent ? (run.streakLevel === q.difficulty ? run.streak : 0) + 1 : 0; run.streakLevel = q.difficulty;
      if (outcome === 'wrong' && !r.assisted) run.level = Math.max(0, levels.indexOf(q.difficulty) - 1);
      else if (run.streak >= 2) { run.level = Math.min(2, levels.indexOf(q.difficulty) + 1); run.streak = 0; }
      if (run.answers.length >= 3) run.phase = 'practice';
      const transition = outcome === 'not_learned' ? '已记录。可以先看看知识点，再开始练习。' : outcome === 'skip' ? '先保留这一题，换一道再试试。' : r.assisted ? '完成得不错，接下来换一道题独立试试。' : r.repeated ? '这道题已练过，已保存本次巩固记录。' : run.level > previous ? '连续独立通过，下一题试试更高难度。' : run.level < previous ? '先把基础练稳，下一题会更简单一些。' : independent ? '做得不错，换一道新题继续巩固。' : '看看这一步，再用新题试一次。';
      run.feedback = { record: r, transition }; return r;
    }
    return { topics, bank, items, create, next, record, evidence, key, levels, levelNames, supplemental };
  }
  return { createEngine, supplemental, levels, levelNames };
});
