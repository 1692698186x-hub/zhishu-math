(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AnswerUnits = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const units = {}, aliases = {};
  function add(name, label, base, n, d, words) { const item = { name, label, base, n: BigInt(n), d: BigInt(d) }; for (const word of [name, ...words]) { units[word] = item; aliases[word] = name; } }
  add('mm', '毫米', 'm', 1, 1000, ['毫米']); add('cm', '厘米', 'm', 1, 100, ['厘米']); add('dm', '分米', 'm', 1, 10, ['分米']); add('m', '米', 'm', 1, 1, ['米']); add('km', '千米', 'm', 1000, 1, ['千米', '公里']);
  add('mm^2', '平方毫米', 'm^2', 1, 1000000, ['平方毫米']); add('cm^2', '平方厘米', 'm^2', 1, 10000, ['平方厘米']); add('dm^2', '平方分米', 'm^2', 1, 100, ['平方分米']); add('m^2', '平方米', 'm^2', 1, 1, ['平方米']); add('km^2', '平方千米', 'm^2', 1000000, 1, ['平方千米']); add('ha', '公顷', 'm^2', 10000, 1, ['公顷']);
  add('mm^3', '立方毫米', 'm^3', 1, 1000000000, ['立方毫米']); add('cm^3', '立方厘米', 'm^3', 1, 1000000, ['立方厘米']); add('dm^3', '立方分米', 'm^3', 1, 1000, ['立方分米']); add('m^3', '立方米', 'm^3', 1, 1, ['立方米']); add('l', '升', 'm^3', 1, 1000, ['升']); add('ml', '毫升', 'm^3', 1, 1000000, ['毫升']);
  add('g', '克', 'g', 1, 1, ['克']); add('kg', '千克', 'g', 1000, 1, ['千克', '公斤']); add('t', '吨', 'g', 1000000, 1, ['吨']); add('mg', '毫克', 'g', 1, 1000, ['毫克']);
  add('s', '秒', 's', 1, 1, ['秒']); add('min', '分钟', 's', 60, 1, ['分钟']); add('h', '小时', 's', 3600, 1, ['小时', '时']); add('day', '天', 's', 86400, 1, ['天', '日']);
  add('元', '元', '元', 1, 1, []); add('角', '角', '元', 1, 10, []); add('fen', '分', '元', 1, 100, []); add('°', '度', '°', 1, 1, ['度']);
  for (const word of ['个', '本', '支', '张', '块', '条', '根', '辆', '只', '人', '份', '颗']) add(word, word, word, 1, 1, []);
  function info(name, context = '') { const token = String(name || '').replace(/²/g, '^2').replace(/³/g, '^3').normalize('NFKC').toLowerCase(); if (token === '分') return /人民币|钱|硬币|[\d一二三四五六七八九十百]\s*(元|角)/.test(context) ? units.fen : units.min; return units[token] || null; }
  const escaped = Object.keys(units).concat('分').sort((a, b) => b.length - a.length).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  function goal(q) {
    const prompt = String(q.prompt || '').replace(/²/g, '^2').replace(/³/g, '^3').normalize('NFKC').toLowerCase();
    if (q.expectedUnit) return info(q.expectedUnit, prompt);
    const pattern = new RegExp('(?:多少|几)\\s*(' + escaped + ')(?![a-z^])|单位\\s*[:：]?\\s*(' + escaped + ')(?![a-z^])|(?:换算成|换算为)\\s*(' + escaped + ')(?![a-z^])|以\\s*(' + escaped + ')\\s*为单位', 'g');
    const matches = [...prompt.matchAll(pattern)].map(m => info(m[1] || m[2] || m[3] || m[4], prompt)).filter(Boolean);
    return matches.length && matches.every(u => u.name === matches[0].name) ? matches[0] : null;
  }
  function hasUnit(part) { return part.kind === 'tuple' ? part.components?.some(c => c.unit.name) : !!part.unit?.name; }
  function check(q, user, parse, baseJudge) {
    const parsedUser = parse(user), refs = [q.answer, ...(q.accept || [])], expected = goal(q), context = String(q.prompt || '');
    if (!parsedUser.parts.length) return null;
    const parsedRefs = refs.map(parse);
    if (!expected && parsedRefs.some(r => r.norm === parsedUser.norm)) return { verdict: 'correct', reason: 'identical' };
    if (!parsedUser.parts.some(hasUnit) && !parsedRefs.some(r => r.parts.some(hasUnit))) return null;
    const message = expected ? '请按题意换算成“' + expected.label + '”后作答，或只填对应数值。' : '目前无法确认这个单位是否符合题意，请核对单位，或按题意只填写数值。';
    let undecided = false, wrong = false;
    for (const reference of parsedRefs) {
      let otherUnit = false, unsupported = false;
      function render(parts, anchors, isUser) {
        function numeric(part, anchor) {
          const anchorUnit = info(anchor?.unit?.name, context), ownUnit = info(part.unit?.name, context);
          const assumed = expected || anchorUnit;
          if (part.unit?.name && !ownUnit || !part.unit?.name && !assumed && anchor?.unit?.name) { unsupported = true; return ''; }
          const selected = ownUnit || assumed;
          if (!selected && part.unit?.name || isUser && ownUnit && !expected && !anchorUnit) { unsupported = true; return ''; }
          if (isUser && expected && ownUnit && ownUnit.name !== expected.name) otherUnit = true;
          if (!selected) return part.key;
          const [n, d] = part.key.split('/').map(BigInt);
          return String(n * selected.n) + '/' + String(d * selected.d) + selected.base;
        }
        return parts.map((part, i) => {
          const anchor = anchors[i] || anchors[0];
          if (part.kind === 'num') return (part.variable ? part.variable + '=' : '') + numeric(part, anchor);
          if (part.kind === 'tuple' && part.components) return '(' + part.components.map((component, j) => numeric(component, anchor?.components?.[j])).join(',') + ')';
          unsupported = true; return '';
        }).join(',');
      }
      const normalizedUser = render(parsedUser.parts, reference.parts, true), normalizedRef = render(reference.parts, reference.parts, false);
      if (unsupported) { undecided = true; continue; }
      const result = baseJudge(normalizedUser, { ...q, answer: normalizedRef, accept: [] });
      if (result.verdict === 'correct') return otherUnit ? { verdict: 'incomplete', reason: 'unit-goal-incomplete', message } : { verdict: 'correct', reason: 'unit-equivalent' };
      if (result.verdict === 'wrong') wrong = true; else undecided = true;
    }
    return undecided ? { verdict: 'manual', reason: 'unit-unconfirmed', message } : wrong ? { verdict: 'wrong', reason: 'unit-value-mismatch' } : null;
  }
  return { aliases, goal, check };
});
