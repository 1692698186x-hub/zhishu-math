(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LearningUnit = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const skills = [
    { id: 'distribute', topicId: 'cnm_035', name: '去括号', prerequisites: [], short: '括号外的数，要乘到每一项。', lesson: ['把括号看作一个整体，外面的数要分别乘里面的每一项。', '例如：2(x − 3) = 2x − 6，而不是 2x − 3。', '括号外是负数时，也要分别计算每一项的符号。'] },
    { id: 'balance', topicId: 'cnm_040', name: '等式变形', prerequisites: [], short: '等号两边做相同的运算，等式才保持成立。', lesson: ['想让 x 单独留在一边，就在等式两边做相同的运算。', '例如：x − 6 = 12，两边都加 6，得到 x = 18。', '如果 3x = 18，两边都除以 3，得到 x = 6。'] },
    { id: 'solve', topicId: 'cnm_043', name: '综合解方程', prerequisites: ['distribute', 'balance'], short: '去括号，再整理等式，最后代回检查。', lesson: ['先去括号，再把含 x 的项与常数项分别整理。', '例如：2(x + 1) = 8，先得到 2x + 2 = 8，再得 2x = 6，所以 x = 3。', '把答案代入原方程：2 × (3 + 1) = 8，左右相等。'] }
  ];
  const questions = [];
  const fmt = n => n < 0 ? ' − ' + Math.abs(n) : ' + ' + n;
  function item(skill, level, stage, n) {
    const a = 2 + n % 4, b = (n % 5 + 1) * (level === 2 ? -1 : 1), x = 2 + n, d = n % 3 + 1;
    let prompt, answer, explanation, context;
    if (skill.id === 'distribute') {
      const m = level === 2 ? -a : a;
      prompt = '去括号：' + m + '(x' + fmt(b) + ') = ' + m + 'x + □。□ 中应填几？';
      answer = m * b;
      explanation = '括号外的 ' + m + ' 要乘到两项：' + m + ' × x 和 ' + m + ' × (' + b + ')。常数项是 ' + answer + '。';
      context = { a: m, b };
      if (level === 1) { prompt = '整理 ' + a + '(x' + fmt(b) + ') + ' + d + '，可得 ' + a + 'x + □。□ 中应填几？'; answer = a * b + d; explanation += ' 再加上括号外的 ' + d + '，得到 ' + answer + '。'; }
    } else if (skill.id === 'balance') {
      const coefficient = level === 0 ? 1 : a;
      const rhs = coefficient * x + b;
      prompt = '解方程：' + (coefficient === 1 ? '' : coefficient) + 'x' + fmt(b) + ' = ' + rhs + '。x = ?';
      answer = x;
      explanation = '两边同时' + (b < 0 ? '加上 ' + -b : '减去 ' + b) + '，得到 ' + coefficient + 'x = ' + coefficient * x + '。' + (coefficient === 1 ? '' : '两边再同时除以 ' + coefficient + '，') + '得到 x = ' + x + '。';
      context = { a: coefficient, b, rhs };
      if (level === 2) { const right = a * x + b - d * x; prompt = '解方程：' + a + 'x' + fmt(b) + ' = ' + d + 'x' + fmt(right) + '。x = ?'; explanation = '两边同时减去 ' + d + 'x，再同时减去 (' + b + ')，得到 ' + (a - d) + 'x = ' + ((a - d) * x) + '，所以 x = ' + x + '。'; if (a === d) return item(skill, level, stage, n + 20); }
    } else {
      const extra = level === 0 ? 0 : d;
      const rhs = a * (x + b) + extra;
      prompt = '解方程：' + a + '(x' + fmt(b) + ')' + (extra ? ' + ' + extra : '') + ' = ' + rhs + '。x = ?';
      answer = x;
      explanation = '去括号得到 ' + a + 'x' + fmt(a * b + extra) + ' = ' + rhs + '。等式两边同时减去 (' + (a * b + extra) + ')，再同时除以 ' + a + '，得到 x = ' + x + '。';
      context = { a, b, extra, rhs, wrongDistribution: a + 'x' + fmt(b) };
      if (level === 2) { prompt = '解方程：' + a + '(x' + fmt(b) + ') = x' + fmt(a * (x + b) - x) + '。x = ?'; explanation = '先去括号，再把两边同时减去 x，整理为 ' + (a - 1) + 'x = ' + ((a - 1) * x) + '，所以 x = ' + x + '。'; }
    }
    if (stage === 'transfer' || stage === 'review') {
      if (skill.id === 'distribute') { prompt = '一个长方形长为 ' + a + '，宽为 (x + ' + Math.abs(b) + ')。面积写成 ' + a + 'x + □，□ 是几？'; answer = a * Math.abs(b); explanation = '面积 = 长 × 宽 = ' + a + '(x + ' + Math.abs(b) + ') = ' + a + 'x + ' + answer + '。'; }
      if (skill.id === 'balance') { prompt = '同样的笔每支 x 元，买 ' + a + ' 支再加 ' + d + ' 元包装费，共 ' + (a * x + d) + ' 元。每支笔几元？'; answer = x; explanation = '设每支 x 元，' + a + 'x + ' + d + ' = ' + (a * x + d) + '。两边先减 ' + d + '，再除以 ' + a + '，得 x = ' + x + '。'; }
      if (skill.id === 'solve') { prompt = '小林原有 x 张卡片，又得到 ' + Math.abs(b) + ' 张。此时卡片数的 ' + a + ' 倍是 ' + (a * (x + Math.abs(b))) + '。他原有几张卡片？'; answer = x; explanation = '设原有 x 张，' + a + '(x + ' + Math.abs(b) + ') = ' + (a * (x + Math.abs(b))) + '。去括号并保持等式平衡，得到 x = ' + x + '。'; }
    }
    return { id: 'learn_' + skill.id + '_' + stage + '_' + level + '_' + n, skillId: skill.id, topicId: skill.topicId, type: 'numeric', level, difficulty: ['basic', 'standard', 'advanced'][level], stage, prompt, answer: String(answer), explanation, context };
  }
  skills.forEach(skill => {
    for (const stage of ['diagnose', 'practice', 'transfer', 'review']) {
      const levels = stage === 'practice' ? [0, 1, 2] : [1];
      levels.forEach(level => { for (let n = 0; n < 12; n++) questions.push(item(skill, level, stage, n)); });
    }
    for (let n = 0; n < 8; n++) {
      const a = n + 2, b = n + 3;
      let prompt, choices, answer, explanation;
      if (skill.id === 'distribute') { prompt = '先只检查去括号：' + a + '(x − ' + b + ') 等于什么？'; choices = [{ key: 'A', text: a + 'x − ' + a * b }, { key: 'B', text: a + 'x − ' + b }, { key: 'C', text: a + 'x + ' + a * b }]; answer = 'A'; explanation = '外面的 ' + a + ' 要乘到 x 和 −' + b + '，所以是 ' + a + 'x − ' + a * b + '。'; }
      else if (skill.id === 'balance') { prompt = '先只检查等式变形：x − ' + b + ' = ' + (b + 5) + '，下一步怎样做？'; choices = [{ key: 'A', text: '两边都减 ' + b }, { key: 'B', text: '两边都加 ' + b }, { key: 'C', text: '只在左边加 ' + b }]; answer = 'B'; explanation = '要消去左边的 −' + b + '，等式两边都要加 ' + b + '。'; }
      else { prompt = '解方程后，怎样检查 x = ' + b + ' 是否正确？'; choices = [{ key: 'A', text: '看答案是不是整数' }, { key: 'B', text: '只检查最后一步计算' }, { key: 'C', text: '代入原方程，检查左右是否相等' }]; answer = 'C'; explanation = '把解代入原方程，才能检查它是否满足最初的等量关系。'; }
      questions.push({ id: 'learn_' + skill.id + '_probe_' + n, skillId: skill.id, topicId: skill.topicId, type: 'choice', level: 0, difficulty: 'basic', stage: 'probe', prompt, choices, answer, explanation });
    }
  });
  return { id: 'linear-equations-v1', title: '一元一次方程', subtitle: '去括号 · 等式变形 · 综合运用', skills, questions, reviewStatus: '程序校验通过，待学科教师审核', version: 1 };
});
