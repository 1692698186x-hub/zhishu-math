(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./linear-math.js'));
  else root.AILearning = factory(root.LinearMath);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (MathCheck) {
  'use strict';
  const dimensions = [{ id: 'symbol', name: '符号运算' }, { id: 'equivalence', name: '等价变形' }, { id: 'reasoning', name: '步骤推理' }, { id: 'reverse', name: '逆向检验' }, { id: 'modeling', name: '情境建模' }];
  const skills = {
    sign: { name: '相反数与负号', topicId: 'cnm_006', dimension: 'symbol', prerequisites: [] },
    distribute: { name: '去括号与变号', topicId: 'cnm_035', dimension: 'symbol', prerequisites: ['sign'] },
    balance: { name: '等式两边同做运算', topicId: 'cnm_040', dimension: 'equivalence', prerequisites: ['sign'] },
    solve: { name: '综合解方程', topicId: 'cnm_043', dimension: 'reasoning', prerequisites: ['distribute', 'balance'] },
    verify: { name: '代入检查与反例', topicId: 'cnm_039', dimension: 'reverse', prerequisites: ['solve'] },
    model: { name: '从情境列方程', topicId: 'cnm_045', dimension: 'modeling', prerequisites: ['balance'] }
  };
  const roots = {
    sign: { skill: 'sign', label: '负号与相反数的理解待检查' },
    distribute: { skill: 'distribute', label: '括号外因数可能未作用到每一项' },
    balance: { skill: 'balance', label: '等式两边可能没有做相同运算' },
    solve: { skill: 'solve', label: '综合解方程的步骤衔接待检查' },
    verify: { skill: 'verify', label: '代入检验的方法待检查' },
    model: { skill: 'model', label: '题目中的等量关系待检查' }
  };
  const targetSkills = ['distribute', 'balance', 'solve', 'verify', 'model'];
  const actionNames = { probe: '做一个小检查', prerequisite: '先补相关基础', hint: '用提示继续这一步', practice: '同层换题巩固', challenge: '试试更高梯度', retest: '换新题独立验证', finish: '结束并查看本轮记录' };
  const levelNames = ['基础巩固', '标准运用', '进阶挑战'];
  const sigmoid = x => 1 / (1 + Math.exp(-x));
  const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
  const fmt = n => n < 0 ? ' - ' + -n : ' + ' + n;
  let curriculum = null, curriculumJudge = null, variants = null;
  function configureCurriculum(data, trainer, judge, variationEngine) {
    curriculum = { topics: data.topics, bank: trainer.bank, items: trainer.items };
    curriculumJudge = judge;
    variants = variationEngine || variants;
    for (const t of data.topics) {
      const prerequisites = data.dependencies.filter(e => e.topicId === t.id && e.strength === 'hard').map(e => e.prerequisiteId).filter(id => data.topics.some(p => p.id === id && p.grade <= t.grade) && trainer.bank[id]?.length);
      skills[t.id] = { name: t.name, topicId: t.id, grade: t.grade, dimension: null, prerequisites, curriculum: true };
      roots[t.id] = { skill: t.id, label: '“' + t.name + '”的方法或步骤待检查' };
    }
  }
  function topicsForGrade(grade) { return (curriculum?.topics || []).filter(t => t.grade === Number(grade)); }
  function rememberExposure(state, ids = []) {
    for (const id of ids.slice(-150)) {
      try { const q = fromId(/^(aic_|aiv_|ai5_)/.test(String(id)) ? id : 'aic_' + id); if ((q.grade || 7) <= (state.grade || 7) && !state.exposed.includes(q.prompt)) state.exposed.push(q.prompt); } catch (_) {}
    }
  }
  function curriculumItem(raw) {
    const t = skills[raw.topicId], topic = curriculum.topics.find(t => t.id === raw.topicId), level = ['basic', 'standard', 'advanced'].indexOf(raw.difficulty);
    return { ...raw, id: 'aic_' + raw.id, originalId: raw.id, curriculum: true, skillId: raw.topicId, grade: t.grade, dimension: null, level, b: [-1.3, -.35, .6][level], hints: ['先说说这道题要找什么，哪些条件能用上？', topic.description + ' 请先写出与你这道题有关的一步。', '回看你的这一步：数量、单位或运算关系是否符合题意？先检查这一处，再继续。'], calibration: 'experimental-manual', origin: 'curated-bank' };
  }
  function variation(skill, level, index) { const q = curriculumItem(variants.item(skill, level, index)); q.id = 'aiv_' + skill + '_' + level + '_' + index; q.origin = 'validated-variant'; return q; }
  function generationParameters(skill, level, params) {
    if (!skills[skill]?.curriculum) return blueprint(skill, level, params).params;
    if (!variants?.supported.includes(skill) || !params || Object.keys(params).some(key => key !== 'variant') || !Number.isInteger(params.variant)) throw Error('unsupported parameters');
    variation(skill, level, params.variant); return { variant: params.variant };
  }
  function configureGraph(dependencies) {
    const graph = new Map(), evidence = [];
    for (const edge of dependencies || []) if (edge.strength === 'hard') { if (!graph.has(edge.topicId)) graph.set(edge.topicId, []); graph.get(edge.topicId).push(edge.prerequisiteId); }
    for (const [id, skill] of Object.entries(skills)) {
      if (skill.curriculum) { for (const pre of skill.prerequisites) evidence.push({ skillId: id, prerequisiteSkill: pre, path: [id, pre], source: 'knowledge-graph' }); continue; }
      const visited = new Set([skill.topicId]), queue = [[skill.topicId]];
      while (queue.length) {
        const path = queue.shift(); if (path.length > 8) continue;
        for (const next of graph.get(path.at(-1)) || []) {
          if (visited.has(next)) continue; visited.add(next); const route = path.concat(next); queue.push(route);
          const mapped = Object.keys(skills).find(s => !skills[s].curriculum && !['verify', 'model'].includes(s) && skills[s].topicId === next && s !== id);
          if (mapped) { if (!skill.prerequisites.includes(mapped)) skill.prerequisites.push(mapped); evidence.push({ skillId: id, prerequisiteSkill: mapped, path: route, source: 'knowledge-graph' }); }
        }
      }
    }
    return evidence;
  }
  function blueprint(skill, level, p = {}) {
    if (!Object.hasOwn(skills, skill) || skills[skill].curriculum || !Number.isInteger(level) || level < 0 || level > 2) throw Error('invalid blueprint');
    const { a = 3, b = 5, x = 4, context = 'books' } = p;
    if (![a, b, x].every(Number.isInteger) || a < 2 || a > 12 || b < 2 || b > 20 || x < 2 || x > 20 || !['books', 'tickets', 'stationery'].includes(context)) throw Error('invalid parameters');
    let prompt, answer, type = 'numeric', choices, equation, hints, explanation;
    if (skill === 'sign') {
      prompt = level === 0 ? '计算：-(-' + b + ')。' : level === 1 ? '已知 a = -' + b + '，求 -a。' : '已知 -a = -' + b + '，求 a - ' + a + '。';
      answer = String(level === 2 ? b - a : b);
      hints = ['相反数与原数相加应得到多少？', '先找到负号正在作用的那个数，再写出它的相反数。', '在草稿上分开处理外面的负号和里面数的符号，再做剩余运算。'];
      explanation = '先取相反数，再进行剩余运算，结果是 ' + answer + '。';
    } else if (skill === 'distribute') {
      const m = level === 0 ? 1 : level === 1 ? -1 : -a;
      prompt = '去括号并化简：' + (m === 1 ? '' : m === -1 ? '-' : m) + '(x - ' + b + ')' + (level === 2 ? ' + ' + a + 'x' : '') + '。';
      answer = level === 2 ? String(-m * b) : (m === 1 ? 'x' : m === -1 ? '-x' : m + 'x') + fmt(-m * b); type = 'expression';
      hints = ['括号外的数需要作用到括号里的几项？', '把括号前的负号看成乘以 -1，分别写出每一项的乘积。', '先保留字母项和常数项的两个乘积，再检查符号，最后合并同类项。'];
      explanation = '分别乘到括号中的每一项，再合并同类项，得到 ' + answer + '。';
    } else if (skill === 'balance') {
      equation = level === 0 ? 'x - ' + b + ' = ' + (x - b) : level === 1 ? a + 'x + ' + b + ' = ' + (a * x + b) : a + 'x - ' + b + ' = ' + (a * x - b);
      prompt = '解方程：' + equation + '。（填写 x 的值）'; answer = String(x);
      hints = ['你想先消去 x 旁边的哪一项？等式两边要一起做什么？', '先在两边做相同的加减运算，消去常数项。', '常数消去后，等式两边再同时除以 x 的系数。'];
      explanation = '先同时消去常数项，再同时除以系数，得到 x = ' + answer + '。';
    } else if (skill === 'solve') {
      equation = level === 0 ? a + '(x + ' + b + ') = ' + (a * (x + b)) : level === 1 ? a + '(x - ' + b + ') + ' + b + ' = ' + (a * (x - b) + b) : '-' + a + '(x - ' + b + ') = ' + (-(a - 1) * x + a * b) + ' - ' + (a - 1) + 'x';
      if (level === 2) equation = '-' + a + '(x - ' + b + ') = ' + (-x + a * b) + ' - ' + (a - 1) + 'x';
      prompt = '解方程：' + equation + '。（填写 x 的值，可写关键步骤）'; answer = String(x);
      hints = ['先观察括号和等号：你准备先处理哪个结构？', '先去括号，再将含 x 的项与常数项分别整理；每一步都保持两边相等。', '写出整理后的“系数 × x = 常数”，再考虑用哪个相同运算得到 x。'];
      explanation = '去括号、保持等式两边同做运算，整理后得到 x = ' + answer + '；代回原式检查。';
    } else if (skill === 'verify') {
      const proposed = level === 0 ? x : x + 1, lhs = a * proposed + b, rhs = a * x + b;
      equation = a + 'x + ' + b + ' = ' + rhs;
      prompt = '对于方程 ' + equation + '，同学说 x = ' + proposed + '。哪一项检验最完整？'; type = 'choice'; answer = 'B';
      choices = [{ key: 'A', text: '答案是整数，所以正确' }, { key: 'B', text: '代回原方程：左边为 ' + lhs + '，右边为 ' + rhs + '，所以' + (lhs === rhs ? '成立' : '不成立') }, { key: 'C', text: '只检查最后一步算式就足够' }];
      hints = ['要验证一个解，应代入原方程还是只看最后一步？', '分别计算原方程左边和右边，再比较两个结果。', '完整检验要同时包含代入位置、左右计算结果和是否相等。'];
      explanation = '代入原方程，左边为 ' + lhs + '，右边为 ' + rhs + '，所以' + (lhs === rhs ? '成立' : '不成立') + '。';
    } else {
      const noun = context === 'tickets' ? '张门票' : context === 'stationery' ? '支笔' : '本书', cost = a * x + b;
      prompt = '买了 ' + a + ' ' + noun + '，每份 x 元，另付 ' + b + ' 元费用，共花 ' + cost + ' 元。哪一个方程表示这件事？';
      type = 'choice'; answer = 'C'; choices = [{ key: 'A', text: a + '(x + ' + b + ') = ' + cost }, { key: 'B', text: a + ' + x + ' + b + ' = ' + cost }, { key: 'C', text: a + 'x + ' + b + ' = ' + cost }];
      hints = ['先分别找出单价、数量和额外费用。', '购买部分的总价，应怎样用“单价”和“数量”表示？', '把购买部分的费用与只付一次的额外费用相加，再与总费用相等。'];
      explanation = '购买部分为 ' + a + 'x 元，额外费用只加一次，所以 ' + a + 'x + ' + b + ' = ' + cost + '。';
    }
    if (choices) {
      const shift = (a + b + x) % 3, original = choices.find(c => c.key === answer);
      choices = choices.slice(shift).concat(choices.slice(0, shift)).map((c, i) => ({ key: 'ABC'[i], text: c.text, correct: c === original }));
      answer = choices.find(c => c.correct).key; choices = choices.map(({ key, text }) => ({ key, text }));
    }
    const id = ['ai5', skill, level, a, b, x, context].join('_');
    const q = { id, skillId: skill, topicId: skills[skill].topicId, dimension: skills[skill].dimension, level, difficulty: ['basic', 'standard', 'advanced'][level], b: [-1.3, -.35, .6][level], prompt, answer, type, choices, hints, explanation, equation, params: { a, b, x, context }, calibration: 'experimental-manual', family: skill + ':' + level, responseForm: skill === 'distribute' ? 'simplified-linear' : null };
    if (!validateQuestion(q)) throw Error('invalid generated mathematics');
    return q;
  }
  function validateQuestion(q) {
    try {
      if (q.type === 'expression') { MathCheck.expression(q.answer); const m = q.level === 0 ? 1 : q.level === 1 ? -1 : -q.params.a; const original = m + '*(x-' + q.params.b + ')' + (q.level === 2 ? '+' + q.params.a + '*x' : ''); return MathCheck.equivalent(original, q.answer); }
      if (q.type === 'numeric') return Number.isFinite(Number(q.answer)) && (!q.equation || Math.abs(MathCheck.solve(q.equation) - Number(q.answer)) < 1e-8);
      return q.type === 'choice' && q.choices.length === 3 && q.choices.some(c => c.key === q.answer) && new Set(q.choices.map(c => c.text)).size === 3;
    } catch (_) { return false; }
  }
  function fromId(id) { if (String(id).startsWith('aiv_')) { const m = /^aiv_(cnm_p?\d+)_([012])_(\d+)$/.exec(String(id)); if (!m) throw Error('unknown question'); return variation(m[1], Number(m[2]), Number(m[3])); } if (String(id).startsWith('aic_')) { const raw = curriculum?.items[String(id).slice(4)]; if (!raw || !skills[raw.topicId]?.curriculum || !['numeric', 'choice'].includes(raw.type)) throw Error('unknown question'); return curriculumItem(raw); } const p = String(id).split('_'); if (p.length !== 7 || p[0] !== 'ai5') throw Error('unknown question'); return blueprint(p[1], Number(p[2]), { a: Number(p[3]), b: Number(p[4]), x: Number(p[5]), context: p[6] }); }
  function auditAttempts(attempts) {
    return attempts.map(r => {
      if (variants?.deprecated.includes(String(r.questionId || '').replace(/^aic_/, ''))) return { ...r, evidenceEligible: false, evidenceReview: '旧题侧重点与本次知识点目标不一致，保留原作答，需用新题复核', assessmentVersion: 2 };
      if (r.mode !== 'ai-unit' || r.skillId !== 'distribute' || r.outcome !== 'correct') return r;
      try {
        const q = fromId(r.questionId), verdict = MathCheck.judge(q, r.userAnswer);
        return { ...r, evidenceEligible: verdict.verdict === 'correct', goalComplete: verdict.verdict === 'correct', evidenceReview: verdict.verdict === 'correct' ? null : '旧记录未完成题目要求，需要用新题复核', assessmentVersion: 1 };
      } catch (_) { return { ...r, evidenceEligible: false, goalComplete: false, evidenceReview: '旧记录无法核对，需要用新题复核', assessmentVersion: 1 }; }
    });
  }
  function evidenceSummary(attempts) {
    const counts = { total: attempts.length, independent: 0, correct: 0, assisted: 0, repeated: 0, skipped: 0, notLearned: 0, needsReview: 0 }, rows = [], seen = new Set();
    for (const r of auditAttempts(attempts)) {
      const key = r.contentKey || r.questionId || r.id, seenBefore = key != null && seen.has(key);
      if (key != null) seen.add(key);
      if (r.evidenceEligible === false || r.goalComplete === false) counts.needsReview++;
      else if (r.outcome === 'skip') counts.skipped++;
      else if (r.outcome === 'not_learned') counts.notLearned++;
      else if (!['correct', 'wrong'].includes(r.outcome)) counts.needsReview++;
      else if (r.repeated || seenBefore) counts.repeated++;
      else if (r.assisted) counts.assisted++;
      else { rows.push(r); counts.independent++; if (r.outcome === 'correct') counts.correct++; }
    }
    return { ...counts, rows };
  }
  const independent = attempts => evidenceSummary(attempts).rows;
  const hypothesisNames = { pending: '待小检查验证', supported: '多题支持，仍待复测', not_supported: '新题证据暂不支持原判断', improved: '本轮独立复测通过，待复习验证', reopened: '再次出现困难，重新检查' };
  const resolvedHypothesis = h => ['not_supported', 'improved'].includes(h.statusCode);
  const itemLevel = r => Number.isInteger(r.itemLevel) ? r.itemLevel : ['basic', 'standard', 'advanced'].indexOf(r.difficulty);
  function refreshHypotheses(state) {
    const attempts = auditAttempts(state.attempts || []), index = new Map(attempts.map((r, i) => [r.id, i])), rows = independent(attempts);
    state.hypotheses ||= [];
    for (const h of state.hypotheses) {
      if (!Object.hasOwn(roots, h.rootId)) continue;
      h.triggerIds ||= (h.evidenceIds || []).filter(id => attempts.some(r => r.id === id && r.outcome === 'wrong'));
      h.history ||= [];
      const starts = h.triggerIds.map(id => index.get(id)).filter(Number.isInteger);
      const start = starts.length ? Math.min(...starts) : -1;
      const relevant = start < 0 ? [] : rows.filter(r => r.skillId === h.rootId && index.get(r.id) >= start);
      const wrong = relevant.filter(r => r.outcome === 'wrong');
      h.requiredLevel = Math.max(h.requiredLevel ?? 0, ...wrong.map(itemLevel));
      const lastWrong = wrong.at(-1), after = lastWrong ? index.get(lastWrong.id) : start;
      const passes = relevant.filter(r => r.outcome === 'correct' && index.get(r.id) > after && itemLevel(r) >= h.requiredLevel);
      const helped = start >= 0 && attempts.some((r, i) => i >= start && r.skillId === h.rootId && r.assisted);
      const lastResolution = [...h.history].reverse().find(e => ['not_supported', 'improved'].includes(e.code));
      const resolutionIndex = index.get(lastResolution?.attemptId) ?? -1;
      const newWrong = wrong.filter(r => index.get(r.id) > resolutionIndex);
      let code = passes.length >= 2 ? wrong.length || helped ? 'improved' : 'not_supported' : newWrong.length >= 2 ? 'supported' : lastResolution && newWrong.length ? 'reopened' : 'pending';
      if (start < 0) code = 'pending';
      h.supportIds = wrong.map(r => r.id);
      h.counterEvidenceIds = relevant.filter(r => r.outcome === 'correct').map(r => r.id);
      h.passingEvidenceIds = passes.map(r => r.id);
      h.evidenceIds = [...new Set([...(h.evidenceIds || []), ...h.triggerIds, ...relevant.map(r => r.id)])].filter(id => index.has(id));
      if (h.statusCode !== code) h.history.push({ code, status: hypothesisNames[code], attemptId: (code === 'improved' || code === 'not_supported' ? passes.at(-1)?.id : relevant.at(-1)?.id) || h.triggerIds.at(-1), at: attempts.at(-1)?.at || Date.now() });
      h.statusCode = code; h.status = hypothesisNames[code];
      h.explanation = start < 0 ? '原始作答已不在当前记录中，需要新题复核。' : resolvedHypothesis(h) ? code === 'not_supported' ? '相关基础已通过至少两道新题独立检查，暂时撤下原来的猜测；记录继续保留。' : '在不低于原卡点难度的新题中连续独立通过，记录本轮改善；之后还需复习验证。' : '只用本技能的新题独立作答更新判断；提示、重复题和更低难度的通过不能解除这个卡点。';
    }
    return state.hypotheses;
  }
  function reportFacts(state) {
    refreshHypotheses(state);
    const { rows, ...counts } = evidenceSummary(state.attempts || []), active = state.hypotheses.filter(h => !resolvedHypothesis(h)), resolved = state.hypotheses.filter(resolvedHypothesis);
    const task = taskProgress(state);
    const evidenceKey = JSON.stringify([(state.attempts || []).map(r => [r.id, r.outcome, r.assisted, r.repeated, auditAttempts([r])[0].evidenceEligible]), state.hypotheses.map(h => [h.rootId, h.statusCode, h.requiredLevel, h.passingEvidenceIds]), task && [task.skillId, task.roundStart, task.status, task.passingIds]]);
    const summary = '已记录 ' + counts.total + ' 次作答，其中 ' + counts.independent + ' 道新题独立作答，通过 ' + counts.correct + ' 道。' + (counts.needsReview ? counts.needsReview + ' 条旧记录待复核，已从表现估计中排除。' : '');
    const advice = task ? task.status === 'verified' ? '“' + task.name + '”本次已通过两道新题独立验证。下次换新题复习，观察能否保持。' : task.status === 'paused' || state.finished ? '这次先到这里，“' + task.name + '”还需独立新题验证。下次从这个目标继续，已完成的作答会保留。' : '这次只练“' + task.name + '”：需要时先补基础，再回到原目标，用两道新题独立验证。' : active.length ? '接下来先检查“' + skills[active[0].rootId].name + '”，再用同等或更高难度的新题独立验证。' : resolved.length ? '本轮已有卡点通过新题复核。下一次再换新题复习，观察能否保持独立完成。' : '继续积累不同新题的独立作答；提示后完成的题，需要另换新题验证。';
    return { counts, active: active.length, resolved: resolved.length, evidenceKey, summary, advice, task };
  }
  function estimate(attempts, skill) {
    const rows = independent(attempts).filter(r => !skill || r.skillId === skill).slice(-30);
    const grid = [];
    for (let i = 0; i <= 60; i++) { const theta = -3 + i * .1; let log = -.5 * theta * theta; for (const r of rows) { const p = sigmoid(theta - r.itemB); log += Math.log(r.outcome === 'correct' ? p : 1 - p); } grid.push({ theta, log }); }
    const max = Math.max(...grid.map(x => x.log)); let weight = 0, mean = 0;
    for (const g of grid) { g.w = Math.exp(g.log - max); weight += g.w; mean += g.theta * g.w; } mean /= weight;
    const sd = Math.sqrt(grid.reduce((n, g) => n + g.w * (g.theta - mean) ** 2, 0) / weight);
    return { theta: Math.round(mean * 100) / 100, sd: Math.round(sd * 100) / 100, n: rows.length, experimental: true };
  }
  function profile(attempts) {
    const rows = independent(attempts);
    return dimensions.map(d => { const evidence = rows.filter(r => r.dimension === d.id), n = evidence.length, correct = evidence.filter(r => r.outcome === 'correct').length; return { ...d, n, correct, value: n >= 3 ? Math.round((correct + 1) / (n + 2) * 100) : null, status: n === 0 ? '未覆盖' : n < 3 ? '证据较少' : '实验估计', attempts: evidence.map(r => r.id) }; });
  }
  function create(options = {}) {
    const skill = Object.hasOwn(skills, options.skill) ? options.skill : 'distribute';
    return { version: 5, id: options.id || 'offline-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10), revision: 0, phase: 'diagnose', attempts: [], events: [], decisions: [], hypotheses: [], exposed: [], current: null, feedback: null, draft: {}, counters: {}, nextPlan: null, finished: false, startedAt: Date.now(), aiEnabled: !!options.aiEnabled, preferredSkill: skill, grade: skills[skill].grade || 7, roundStart: 0, goal: { skillId: skill, level: 1, requiredPasses: 2, maxAttempts: 8 }, limit: 8 };
  }
  function taskProgress(state) {
    if (!state.goal || !Object.hasOwn(skills, state.goal.skillId)) return null;
    const goal = state.goal, roundStart = state.roundStart || 0, attempts = auditAttempts(state.attempts || []);
    const eligible = new Set(independent(attempts).map(r => r.id));
    let passingIds = [];
    for (const r of attempts.slice(roundStart)) {
      if (r.skillId !== goal.skillId) continue;
      if (eligible.has(r.id) && r.outcome === 'correct' && itemLevel(r) >= goal.level) passingIds.push(r.id);
      else passingIds = [];
    }
    const used = attempts.length - roundStart, passed = Math.min(goal.requiredPasses, passingIds.length);
    return { ...goal, grade: state.grade || 7, roundStart, name: skills[goal.skillId].name, used, passed, passingIds, status: passed >= goal.requiredPasses ? 'verified' : used >= goal.maxAttempts ? 'paused' : 'working' };
  }
  function taskFinish(state) {
    const task = taskProgress(state);
    if (!task || task.status === 'working') return null;
    return { action: 'finish', targetSkill: task.skillId, level: task.level, reason: task.status === 'verified' ? '本次目标已通过两道新题独立验证，先看小结，下次再复习。' : '本次已记录 ' + task.used + ' 次作答，先停下来看看卡点；还未完成独立验证，下次继续。' };
  }
  function levelFor(state, skill, preferred) {
    if (Number.isInteger(preferred)) return clamp(preferred, 0, 2);
    const est = estimate(state.attempts, skill);
    const candidates = [-1.3, -.35, .6].map((b, i) => ({ i, p: sigmoid(est.theta - b) }));
    return candidates.sort((a, b) => Math.abs(a.p - .7) - Math.abs(b.p - .7))[0].i;
  }
  function pick(state, skill, stage, level, generated) {
    const used = new Set(state.exposed), start = state.counters[skill] || 0;
    let q;
    if (skills[skill]?.curriculum) {
      if (generated) { try { q = variation(skill, level, generationParameters(skill, level, generated).variant); if (used.has(q.prompt)) q = null; else q.origin = 'ai-parameters'; } catch (_) {} }
      const pool = (curriculum.bank[skill] || []).filter(raw => !used.has(raw.prompt));
      const eligible = stage === 'retest' && skill === state.goal?.skillId ? pool.filter(raw => ['basic', 'standard', 'advanced'].indexOf(raw.difficulty) >= state.goal.level) : pool;
      eligible.sort((a, b) => Math.abs(['basic', 'standard', 'advanced'].indexOf(a.difficulty) - level) - Math.abs(['basic', 'standard', 'advanced'].indexOf(b.difficulty) - level));
      const exact = eligible.find(raw => ['basic', 'standard', 'advanced'].indexOf(raw.difficulty) === level);
      if (!q && exact) q = curriculumItem(exact);
      if (!q && variants?.supported.includes(skill)) for (let n = 0; n < 120 && !q; n++) { const candidate = variation(skill, level, n); if (!used.has(candidate.prompt)) q = candidate; }
      if (!q && eligible.length) q = curriculumItem(eligible[0]);
      if (!q) { state.finished = true; state.finishReason = '这个目标可用的独立新题不足，先保留记录；尚不能据此宣布本次目标已验证。'; return null; }
    }
    if (generated && !skills[skill]?.curriculum) { try { q = blueprint(skill, level, generated); if (used.has(q.prompt)) q = null; else q.origin = 'ai-parameters'; } catch (_) {} }
    for (let n = start; !q && n < start + 120; n++) {
      const params = { a: 2 + n % 11, b: 2 + Math.floor(n / 3) % 19, x: 2 + n % 19, context: ['books', 'tickets', 'stationery'][n % 3] };
      const candidate = blueprint(skill, level, params); state.counters[skill] = n + 1;
      if (!used.has(candidate.prompt)) q = candidate;
    }
    if (!q) { state.finished = true; state.finishReason = '当前可用的新题已完成，记录已保存。'; return null; }
    state.current = { question: q, stage, hintCount: 0, revealed: false, retry: false, activeMs: 0, displayedAt: Date.now() };
    state.exposed.push(q.prompt); state.draft = {}; state.feedback = null; state.phase = stage;
    return q;
  }
  function next(state) {
    if (state.finished) return null;
    if (state.current && !state.feedback) return state.current.question;
    const terminal = taskFinish(state);
    if (terminal) { state.finished = true; state.finishReason = terminal.reason; return null; }
    if (state.attempts.length >= state.limit) { state.finished = true; state.finishReason = '本轮学习已完成，下一次可以继续验证与巩固。'; return null; }
    const plan = state.nextPlan;
    if (plan?.action === 'finish') { state.finished = true; state.finishReason = plan.reason; return null; }
    if (plan) {
      state.nextPlan = null;
      const q = pick(state, plan.targetSkill, plan.action === 'hint' ? 'practice' : plan.action, levelFor(state, plan.targetSkill, plan.level), plan.parameters);
      if (q && plan.action === 'hint') hint(state);
      return q;
    }
    return pick(state, state.preferredSkill, 'diagnose', 1);
  }
  function candidates(state) {
    const last = state.attempts.at(-1), q = state.current?.question;
    if (!last || !q) return [];
    const terminal = taskFinish(state);
    if (terminal) return [terminal];
    const own = { targetSkill: last.skillId }, list = [];
    if (last.outcome === 'not_learned') return [{ action: 'hint', ...own, level: 0 }];
    if (last.outcome === 'skip') return [{ action: 'probe', ...own, level: 0 }, { action: 'practice', ...own, level: q.level }];
    if (last.outcome === 'wrong') {
      list.push({ action: 'probe', ...own, level: state.goal && last.skillId === 'distribute' ? Math.max(1, q.level) : 0 }, ...skills[last.skillId].prerequisites.map(s => ({ action: 'prerequisite', targetSkill: s, level: 0 })), { action: 'hint', ...own, level: q.level });
    } else if (last.assisted || last.repeated) list.push({ action: 'retest', ...own, level: q.level });
    else {
      const recent = independent(state.attempts).filter(r => r.skillId === last.skillId).slice(-3), enough = recent.length >= 2 && recent.slice(-2).every(r => r.outcome === 'correct');
      list.push({ action: 'practice', ...own, level: levelFor(state, last.skillId) }, { action: 'retest', ...own, level: q.level });
      if (state.goal) {
        if (last.skillId === state.goal.skillId) return [{ action: 'retest', ...own, level: state.goal.level }];
        list.push({ action: 'retest', targetSkill: state.goal.skillId, level: state.goal.level });
      }
      if (enough && !state.goal) {
        list.push({ action: 'challenge', ...own, level: Math.min(2, q.level + 1) });
        const untested = targetSkills.find(s => !independent(state.attempts).some(r => r.skillId === s));
        if (untested) list.push({ action: 'probe', targetSkill: untested, level: 1 });
      }
      if (last.stage === 'prerequisite' && state.decisions.length) {
        const prior = [...state.attempts].reverse().find(r => r.outcome === 'wrong' && skills[r.skillId].prerequisites.includes(last.skillId));
        if (prior) list.push({ action: 'retest', targetSkill: prior.skillId, level: 0 });
      }
    }
    if (!state.goal && state.attempts.length >= state.limit - 1) list.push({ action: 'finish', ...own, level: 0 });
    return list.filter((p, i, a) => a.findIndex(x => x.action === p.action && x.targetSkill === p.targetSkill && x.level === p.level) === i);
  }
  function localPlan(state) {
    const last = state.attempts.at(-1), options = candidates(state);
    if (!options.length) throw Error('no teaching decision');
    let choice = options[0];
    if (choice.action === 'finish') return { ...choice, source: 'rules', evidenceIds: [last.id], rootId: null };
    if (last.outcome === 'wrong' && last.stage === 'probe') choice = options.find(p => p.action === 'prerequisite') || options.find(p => p.action === 'hint') || choice;
    if (last.outcome === 'wrong' && last.steps && /括号|\(/.test(last.steps)) choice = options.find(p => p.targetSkill === 'distribute') || choice;
    if (last.outcome === 'correct' && !last.assisted) choice = options.find(p => p.action === 'retest' && p.targetSkill !== last.skillId) || options.find(p => p.action === 'probe' && p.targetSkill !== last.skillId) || options.find(p => p.action === 'challenge') || choice;
    const reason = state.goal && last.outcome === 'correct' && !last.assisted ? choice.targetSkill !== last.skillId ? '这个基础有了新线索，现在回到本次目标，用新题检查能否独立完成。' : '这道题独立完成了，再换一道新题验证本次目标。' : last.outcome === 'not_learned' ? '先了解这个方法，再用新题练习。' : last.outcome === 'skip' ? '先做一个更短的检查，看看卡在哪一步。' : last.assisted ? '这次获得了提示，下一题换个数独立试一次。' : last.outcome === 'wrong' ? last.steps ? '结合这一步的作答，先用小检查确认具体卡点。' : '只有最终答案还不能确定错因，先用一个小检查补充线索。' : '这一步独立完成了，接下来换题继续确认和拓展。';
    return { ...choice, reason, source: 'rules', evidenceIds: [last.id], rootId: last.outcome === 'wrong' ? last.skillId : null };
  }
  function applyPlan(state, plan) {
    const allowed = candidates(state), choice = allowed.find(c => c.action === plan.action && c.targetSkill === plan.targetSkill && c.level === plan.level);
    if (!choice) throw Error('decision outside allowed actions');
    if (typeof plan.reason !== 'string' || !plan.reason.trim()) throw Error('missing decision reason');
    const ids = Array.isArray(plan.evidenceIds) ? plan.evidenceIds : [];
    if (!ids.length || ids.some(id => !state.attempts.some(r => r.id === id))) throw Error('unknown evidence');
    const safe = { ...choice, reason: plan.reason.slice(0, 220), source: plan.source === 'ai' ? 'ai' : 'rules', provider: plan.provider || null, evidenceIds: ids, rootId: Object.hasOwn(roots, plan.rootId) ? plan.rootId : null, at: Date.now(), estimate: estimate(state.attempts, choice.targetSkill) };
    if (plan.parameters) { safe.parameters = generationParameters(choice.targetSkill, choice.level, plan.parameters); }
    state.nextPlan = safe; state.decisions.push(safe);
    if (safe.rootId && state.attempts.at(-1).outcome === 'wrong') {
      let hypothesis = state.hypotheses.find(h => h.rootId === safe.rootId);
      if (!hypothesis) { hypothesis = { rootId: safe.rootId, label: roots[safe.rootId].label, evidenceIds: [], triggerIds: [], history: [] }; state.hypotheses.push(hypothesis); }
      hypothesis.triggerIds ||= (hypothesis.evidenceIds || []).filter(id => state.attempts.some(r => r.id === id && r.outcome === 'wrong'));
      if (!hypothesis.triggerIds.includes(state.attempts.at(-1).id)) hypothesis.triggerIds.push(state.attempts.at(-1).id);
      for (const id of ids) if (!hypothesis.evidenceIds.includes(id)) hypothesis.evidenceIds.push(id);
    }
    refreshHypotheses(state);
    return safe;
  }
  function record(state, answer, steps = '', activeMs = 0, outcomeOverride) {
    if (!state.current || state.feedback || state.finished) throw Error('没有可提交的题目。');
    const c = state.current, q = c.question;
    if (outcomeOverride && !['skip', 'not_learned'].includes(outcomeOverride)) throw Error('invalid outcome');
    const rawVerdict = outcomeOverride ? null : q.curriculum ? curriculumJudge.judgeQuestion(q, answer) : MathCheck.judge(q, answer);
    const judged = rawVerdict?.verdict === 'manual' ? { verdict: 'invalid' } : rawVerdict;
    const verdict = outcomeOverride || judged.verdict;
    if (verdict === 'incomplete') throw Error(judged.message);
    if (verdict === 'invalid') throw Error(q.type === 'expression' ? '请填写化简后的式子，例如 -x + 3。' : q.type === 'choice' ? '请先选择一个选项。' : '请填写数值或分数，例如 1/2。');
    const row = { id: state.id + '-a' + (state.attempts.length + 1), mode: 'ai-unit', sessionId: state.id, questionId: q.id, contentKey: q.type + '|' + q.prompt.replace(/\s/g, ''), topicId: q.topicId, skillId: q.skillId, grade: state.grade || 7, dimension: q.dimension, stage: c.stage, difficulty: q.difficulty, itemLevel: q.level, itemB: q.b, calibration: q.calibration, outcome: verdict, userAnswer: String(answer).slice(0, 180), steps: String(steps).slice(0, 1000), assisted: c.hintCount > 0 || c.revealed || c.retry, hintCount: c.hintCount, revealed: c.revealed, repeated: c.retry || state.attempts.some(r => r.questionId === q.id), elapsedMs: clamp(Number(activeMs) || 0, 0, 1800000), at: Date.now(), origin: q.origin || 'validated-template', assessmentVersion: 1, evidenceEligible: true, goalComplete: true };
    state.attempts.push(row); state.feedback = { record: row, label: verdict === 'correct' ? row.assisted ? '提示后完成' : '独立完成' : verdict === 'wrong' ? '先保留这条线索' : verdict === 'skip' ? '先做一个小检查' : '先了解这个方法', diagnosis: null };
    refreshHypotheses(state); state.revision++; return row;
  }
  function hint(state) {
    if (!state.current || state.finished) throw Error('当前没有提示。');
    const c = state.current; c.hintCount = Math.min(3, c.hintCount + 1); state.revision++;
    const text = c.question.hints[c.hintCount - 1]; state.events.push({ type: 'hint', questionId: c.question.id, level: c.hintCount, at: Date.now() });
    return text;
  }
  function reveal(state) { if (!state.current) throw Error('没有当前题目。'); state.current.revealed = true; state.revision++; state.events.push({ type: 'reveal', questionId: state.current.question.id, at: Date.now() }); }
  function retry(state) { if (!state.feedback || !state.current) throw Error('当前不能重试。'); state.current.retry = true; state.feedback = null; state.draft = {}; state.revision++; }
  function refreshEvidence(state) {
    state.attempts = auditAttempts(state.attempts || []);
    if (state.feedback?.record) state.feedback.record = state.attempts.find(r => r.id === state.feedback.record.id) || state.feedback.record;
    if (state.feedback?.record.evidenceEligible === false) {
      state.feedback.label = '这条旧记录需要用新题复核'; state.feedback.diagnosis = null;
      const row = state.feedback.record;
      state.nextPlan = { action: 'retest', targetSkill: row.skillId, level: Math.max(0, itemLevel(row)), reason: row.evidenceReview || '旧版只检查了式子等价，本次换新题检查是否完成了去括号与化简。', evidenceIds: [row.id], source: 'rules' };
    }
    return state;
  }
  function view(state) {
    if (state.current?.question?.id?.startsWith('ai5_') || state.current?.question?.id?.startsWith('aic_') || state.current?.question?.id?.startsWith('aiv_')) {
      const previous = state.current.question;
      state.current.question = { ...fromId(previous.id), origin: previous.origin };
    }
    refreshEvidence(state);
    const facts = reportFacts(state), report = state.report?.evidenceKey === facts.evidenceKey ? state.report : null;
    const c = state.current, q = c?.question;
    const publicQ = q ? { id: q.id, skillId: q.skillId, topicId: q.topicId, level: q.level, difficulty: q.difficulty, type: q.type, prompt: q.prompt, choices: q.choices, origin: q.origin || 'validated-template' } : null;
    const showAnswer = c?.revealed || state.feedback?.record.outcome === 'correct' && state.feedback.record.evidenceEligible !== false;
    if (showAnswer && publicQ) { publicQ.answer = q.answer; publicQ.explanation = q.explanation; }
    return { id: state.id, revision: state.revision, grade: state.grade || 7, phase: state.phase, finished: state.finished, finishReason: state.finishReason, aiEnabled: state.aiEnabled, goal: state.goal, roundStart: state.roundStart, task: facts.task, question: publicQ, hintCount: c?.hintCount || 0, hint: c?.aiHint || (c?.hintCount ? q.hints[c.hintCount - 1] : null), hintSource: c?.hintSource || 'rules', report, reportStale: !!state.report && !report, facts, revealed: !!c?.revealed, retrying: !!c?.retry, feedback: state.feedback, nextPlan: state.nextPlan, attempts: state.attempts, decisions: state.decisions, hypotheses: state.hypotheses, dimensions: profile(state.attempts), estimate: estimate(state.attempts), targetBand: [.65, .75], calibration: '实验参数，未经学生数据校准' };
  }
  return { dimensions, skills, roots, targetSkills, actionNames, levelNames, configureGraph, configureCurriculum, topicsForGrade, rememberExposure, generationParameters, blueprint, fromId, validateQuestion, independent, auditAttempts, evidenceSummary, refreshEvidence, refreshHypotheses, reportFacts, hypothesisNames, taskProgress, estimate, profile, create, pick, next, candidates, localPlan, applyPlan, record, hint, reveal, retry, view, sigmoid };
});
