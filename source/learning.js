(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Learning = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const levelNames = ['基础巩固', '标准运用', '进阶挑战'];
  function createEngine(unit) {
    const skills = Object.fromEntries(unit.skills.map(s => [s.id, s]));
    const items = Object.fromEntries(unit.questions.map(q => [q.id, q]));
    function create(history = [], options = {}) {
      return { id: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), unitId: unit.id, kind: options.review ? 'review' : 'learn', phase: options.review ? 'review' : 'diagnose', startedAt: options.now || Date.now(), limit: options.review ? 3 : 28, answers: [], seenIds: [...new Set(history.map(r => r.questionId))], exposedIds: [], skills: Object.fromEntries(unit.skills.map(s => [s.id, { level: 0, streak: 0, attempts: 0, highest: -1, ready: false, notLearned: false, hypotheses: [], verifiedGap: false }])), current: null, feedback: null, probeQueue: [], finished: false, draft: {} };
    }
    const contentKey = q => q ? q.type + '|' + q.prompt.replace(/\s/g, '') : '';
    function pick(run, skillId, stage, level) {
      const used = new Set(run.answers.map(r => r.questionId));
      const usedContent = new Set(run.answers.map(r => contentKey(items[r.questionId])));
      const seen = new Set(run.seenIds.map(id => contentKey(items[id])));
      const pool = unit.questions.filter(q => q.skillId === skillId && q.stage === stage && q.level === level && !used.has(q.id) && !usedContent.has(contentKey(q)));
      // Independent post-tests and next-day reviews must never reuse a previously exposed item.
      const fresh = pool.filter(q => !seen.has(contentKey(q)));
      return (fresh.length ? fresh : ['transfer', 'review'].includes(stage) ? [] : pool)[0] || null;
    }
    function close(run, reason, now = Date.now()) { run.finished = true; run.phase = 'complete'; run.finishReason = reason; run.endedAt = now; run.reviewDueAt = now + 86400000; run.current = null; return null; }
    function next(run) {
      if (run.finished || run.feedback || run.phase === 'plan') return run.current;
      if (run.current) return run.current;
      if (run.answers.length >= run.limit) return close(run, '到达本轮题量上限，尚未完成的部分留待下次。');
      let q, reason, phase = run.phase;
      if (phase === 'diagnose') {
        const skill = unit.skills.find(s => !run.answers.some(r => r.stage === 'diagnose' && r.skillId === s.id));
        if (!skill) { run.phase = 'plan'; return null; }
        q = pick(run, skill.id, 'diagnose', 1); reason = '先用一道短题了解「' + skill.name + '」的起点，一次作答只提供初步线索。';
      } else if (phase === 'review' || phase === 'transfer') {
        const skill = unit.skills.find(s => !run.skills[s.id].notLearned && !run.answers.some(r => r.stage === phase && r.skillId === s.id));
        if (!skill) return close(run, phase === 'review' ? '本次复习已完成。' : unit.skills.every(s => run.skills[s.id].notLearned) ? '已记录尚未学习的内容，本轮未作掌握判断。' : '本轮学习与独立复测已完成。');
        q = pick(run, skill.id, phase, 1); reason = phase === 'review' ? '用另一道未见过的题，看看知识是否保留下来。' : '换一个情境独立完成，检查能否把刚才的方法用起来。';
        if (!q) { run.skills[skill.id].notLearned = false; return close(run, '当前没有足够的未见复测题，不能把重复题计为新证据。'); }
      } else {
        while (run.probeQueue.length && !q) {
          const id = run.probeQueue.shift();
          if (run.skills[id].notLearned) continue;
          q = pick(run, id, 'probe', 0); phase = 'probe'; reason = '先做一个小检查，确认「' + skills[id].name + '」是否真的需要补习。';
        }
        if (!q) {
          const skill = unit.skills.find(s => !run.skills[s.id].notLearned && !run.skills[s.id].ready && run.skills[s.id].attempts < 6);
          if (!skill) { run.phase = 'transfer'; return next(run); }
          const state = run.skills[skill.id];
          q = pick(run, skill.id, 'practice', state.level); phase = 'practice';
          reason = state.verifiedGap ? '小检查发现了需要补的步骤，先在这一层练稳，再逐步提高。' : '当前处于「' + levelNames[state.level] + '」；同层两道新题独立通过后，再增加难度。';
        }
      }
      if (!q) return close(run, '本轮可用题目已完成，已有证据已保存。');
      run.current = { questionId: q.id, skillId: q.skillId, stage: phase, level: q.level, hintCount: 0, revealed: false, repeated: run.seenIds.some(id => contentKey(items[id]) === contentKey(q)), reason };
      (run.exposedIds ||= []).push(q.id);
      run.draft = {}; return run.current;
    }
    function beginTraining(run) { if (run.phase !== 'plan') return; run.phase = 'practice'; next(run); }
    function hint(run) { if (!run.current || run.current.stage === 'diagnose') return null; run.current.hintCount = Math.min(3, run.current.hintCount + 1); return run.current.hintCount; }
    function reveal(run) { if (run.current && run.current.stage !== 'diagnose') { run.current.revealed = true; run.current.hintCount = Math.max(1, run.current.hintCount); } }
    function record(run, outcome, extra = {}) {
      if (!run.current || run.feedback || !['correct', 'wrong', 'skip', 'not_learned'].includes(outcome)) throw Error('没有可提交的学习题目');
      const c = run.current, q = items[c.questionId], state = run.skills[c.skillId];
      const r = { sessionId: run.id, mode: 'learning', questionId: q.id, skillId: q.skillId, topicId: q.topicId, type: q.type, difficulty: q.difficulty, stage: c.stage, outcome, assisted: c.hintCount > 0 || c.revealed, hintCount: c.hintCount, revealed: c.revealed, repeated: c.repeated, userAnswer: String(extra.userAnswer || '').slice(0, 160), steps: String(extra.steps || '').slice(0, 1000), elapsedMs: Math.max(0, Number(extra.elapsedMs) || 0), at: extra.now || Date.now(), reason: c.reason };
      run.answers.push(r); run.current = null; run.draft = {};
      const independent = outcome === 'correct' && !r.assisted && !r.repeated;
      let transition = '';
      if (outcome === 'not_learned') { state.notLearned = true; transition = '已记为尚未学习，不会当作薄弱证据。'; }
      else if (c.stage === 'diagnose') {
        state.level = independent ? 1 : 0;
        if (outcome === 'wrong') { state.hypotheses.push({ source: 'rules', status: 'pending', evidence: q.id }); run.probeQueue.push(q.skillId); }
        transition = independent ? '这一步初步通过，接下来还会换题确认。' : '先保留这条线索，初筛结束后再安排小检查与指导。';
      } else if (c.stage === 'probe') {
        if (outcome === 'wrong' && !r.assisted) { state.verifiedGap = true; state.ready = false; state.level = 0; state.streak = 0; state.attempts = Math.min(state.attempts, 4); transition = '小检查也遇到困难，先补这一步。'; }
        else transition = independent ? '这个检查点通过了；原题的错因仍需更多证据确认。' : '先保留判断，提示后的完成不算独立掌握。';
      } else if (c.stage === 'practice') {
        state.attempts++; state.streak = independent ? state.streak + 1 : 0;
        if (independent) state.highest = Math.max(state.highest, c.level);
        if (state.streak >= 2) {
          if (state.level < 2) { state.level++; state.streak = 0; transition = '同一层的两道新题独立通过，下一步增加难度。'; }
          else { state.ready = true; transition = '进阶题独立通过，随后用新情境复测。'; }
        } else if (outcome === 'wrong') {
          state.level = Math.max(0, state.level - 1);
          const probeId = q.skillId === 'solve' ? skills.solve.prerequisites.find(id => !run.answers.some(a => a.stage === 'probe' && a.skillId === id)) || 'solve' : q.skillId;
          if (!run.answers.some(a => a.stage === 'probe' && a.skillId === probeId)) run.probeQueue.push(probeId);
          transition = '先讲清楚卡住的步骤，再安排合适难度的新题。';
        } else transition = r.assisted ? '已记录为提示后完成。换一道新题独立试试，暂不升级。' : '先在同一层巩固，再用另一道新题确认。';
      } else transition = independent ? '这道未见过的新题独立通过；仍建议隔日复习。' : r.assisted ? '提示后完成可以帮助学习，但不计为独立复测通过。' : '保留这个复习点，下次继续巩固。';
      // No answer or worked solution is disclosed during the three-item initial diagnosis.
      if (c.stage !== 'diagnose') run.feedback = { record: r, transition, coach: null };
      next(run); return r;
    }
    function setCoach(run, recordId, result) {
      if (!run.feedback || run.feedback.record.questionId !== recordId) return;
      run.feedback.coach = result;
      const r = run.feedback.record;
      r.coaching = result;
      if (r.outcome === 'wrong' && result.suspectedSkillId && skills[result.suspectedSkillId] && result.suspectedSkillId !== r.skillId && !run.answers.some(a => a.stage === 'probe' && a.skillId === result.suspectedSkillId)) run.probeQueue.unshift(result.suspectedSkillId);
    }
    function continueRun(run) { run.feedback = null; return next(run); }
    function localCoach(q, input = {}) {
      const skill = skills[q.skillId];
      let suspectedSkillId = q.skillId;
      if (q.skillId === 'solve' && input.steps) {
        const text = input.steps.replace(/[\s（）]/g, '').replace(/[−－]/g, '-');
        if (q.context?.wrongDistribution && text.includes(q.context.wrongDistribution.replace(/\s/g, '').replace(/−/g, '-'))) suspectedSkillId = 'distribute';
      }
      const wrong = input.outcome === 'wrong';
      return { source: 'rules', hypothesis: wrong ? (input.steps ? '从这份作答还不能确定唯一错因，建议先检查「' + skills[suspectedSkillId].name + '」。' : '目前只有最终答案，无法判断具体错在哪一步，先用一道小题确认。') : '先按当前知识点的关键方法，再独立走一步。', evidence: input.steps ? '已保留你填写的关键步骤，后续会结合小检查验证。' : '尚未填写解题步骤，暂不确定具体错因。', suspectedSkillId: wrong ? suspectedSkillId : null, hint: skill.lesson[Math.min(Math.max(0, (input.hintCount || 1) - 1), 2)], status: '待确认' };
    }
    function summary(run) {
      const independent = r => r.outcome === 'correct' && !r.assisted && !r.repeated;
      return { total: run.answers.length, independent: run.answers.filter(independent).length, assisted: run.answers.filter(r => r.assisted).length, diagnosisCorrect: run.answers.filter(r => r.stage === 'diagnose' && independent(r)).length, transferCorrect: run.answers.filter(r => ['transfer', 'review'].includes(r.stage) && independent(r)).length, transferCount: run.answers.filter(r => ['transfer', 'review'].includes(r.stage)).length, skills: unit.skills.map(s => ({ ...s, ...run.skills[s.id], diagnosis: run.answers.find(r => r.stage === 'diagnose' && r.skillId === s.id), post: run.answers.find(r => ['transfer', 'review'].includes(r.stage) && r.skillId === s.id) })) };
    }
    return { unit, skills, items, create, next, beginTraining, hint, reveal, record, setCoach, continueRun, close, summary, localCoach, levelNames };
  }
  return { createEngine, levelNames };
});
