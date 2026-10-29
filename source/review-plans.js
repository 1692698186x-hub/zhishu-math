(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReviewPlans = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const day = 86400000, intervals = [1, 3, 7];
  function update(profile, view, core, now = Date.now()) {
    const task = view.task;
    if (!task || task.status !== 'verified' || task.passingIds.length < 2) return;
    const ids = task.passingIds.slice(-2), rows = core.independent(profile.records || []), lookup = new Map(rows.map(r => [r.id, r]));
    if (ids.some(id => !lookup.has(id) || lookup.get(id).outcome !== 'correct' || lookup.get(id).skillId !== task.skillId)) return;
    const grade = view.grade || 7, key = grade + ':' + task.skillId;
    profile.reviewPlans ||= {};
    const previous = profile.reviewPlans[key];
    if (previous?.sourceSessionId === view.id && previous.evidenceIds.join('|') === ids.join('|')) return;
    const ready = previous && now >= previous.dueAt;
    const previousStatus = previous ? status(previous, rows) : null;
    const step = previous && previousStatus !== 'recheck' ? Math.min(3, previous.step + (ready ? 1 : 0)) : 1;
    profile.reviewPlans[key] = { grade, skillId: task.skillId, name: task.name, level: task.level, sourceSessionId: view.id, evidenceIds: ids, verifiedAt: now, dueAt: previous && !ready && previousStatus !== 'recheck' ? previous.dueAt : now + intervals[step - 1] * day, step, policy: 'experimental-review-1-3-7-days' };
  }
  function status(plan, rows) {
    const position = new Map(rows.map((r, i) => [r.id, i]));
    if (plan.evidenceIds.some(id => !position.has(id) || rows[position.get(id)].outcome !== 'correct' || rows[position.get(id)].skillId !== plan.skillId)) return 'recheck';
    const end = Math.max(...plan.evidenceIds.map(id => position.get(id)));
    return rows.slice(end + 1).some(r => r.skillId === plan.skillId && r.outcome === 'wrong') ? 'recheck' : 'scheduled';
  }
  function queue(profile, grade, core, now = Date.now()) {
    const rows = core.independent(profile.records || []);
    return Object.values(profile.reviewPlans || {}).filter(p => p.grade === Number(grade) && Object.hasOwn(core.skills, p.skillId)).map(p => {
      const state = status(p, rows), due = state === 'recheck' || now >= p.dueAt;
      return { ...p, evidenceIds: p.evidenceIds.slice(), status: state, due, label: state === 'recheck' ? '需要重新检查' : due ? '可以复习了' : '已安排复习' };
    }).sort((a, b) => Number(b.status === 'recheck') - Number(a.status === 'recheck') || Number(b.due) - Number(a.due) || a.dueAt - b.dueAt);
  }
  return { update, queue, day };
});
