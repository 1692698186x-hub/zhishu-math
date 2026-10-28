(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LinearMath = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const eps = 1e-8;
  const normalize = raw => String(raw).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[−–－]/g, '-').replace(/＋/g, '+').replace(/[×·]/g, '*').replace(/[÷]/g, '/').replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/[ＸｘX]/g, 'x').replace(/\s+/g, '');
  function expression(raw) {
    const text = normalize(raw);
    if (!text || text.length > 180 || /[^0-9x.+\-*/()]/.test(text)) throw Error('invalid expression');
    const tokens = text.match(/\d+(?:\.\d+)?|\.\d+|[x()+\-*/]/g) || [];
    if (tokens.join('') !== text || tokens.length > 100) throw Error('invalid tokens');
    let pos = 0, depth = 0;
    const add = (a, b, sign = 1) => [a[0] + sign * b[0], a[1] + sign * b[1]];
    function atom() {
      if (++depth > 24) throw Error('too deep');
      let out; const token = tokens[pos++];
      if (token === '+' || token === '-') { out = atom(); if (token === '-') out = out.map(n => -n); }
      else if (token === '(') { out = sum(); if (tokens[pos++] !== ')') throw Error('parenthesis'); }
      else if (token === 'x') out = [1, 0];
      else if (token && /^\d|^\./.test(token)) out = [0, Number(token)];
      else throw Error('expected atom');
      depth--; return out;
    }
    function product() {
      let out = atom();
      while (pos < tokens.length) {
        const token = tokens[pos], implicit = token === '(' || token === 'x' || /^\d|^\./.test(token);
        if (token !== '*' && token !== '/' && !implicit) break;
        if (!implicit) pos++;
        const right = atom();
        if (token === '/') { if (Math.abs(right[0]) > eps || Math.abs(right[1]) < eps) throw Error('invalid division'); out = out.map(n => n / right[1]); }
        else { if (Math.abs(out[0] * right[0]) > eps) throw Error('nonlinear'); out = [out[0] * right[1] + out[1] * right[0], out[1] * right[1]]; }
      }
      return out;
    }
    function sum() { let out = product(); while (tokens[pos] === '+' || tokens[pos] === '-') { const sign = tokens[pos++] === '+' ? 1 : -1; out = add(out, product(), sign); } return out; }
    const value = sum();
    if (pos !== tokens.length || value.some(n => !Number.isFinite(n) || Math.abs(n) > 1e9)) throw Error('invalid result');
    return value;
  }
  function equivalent(a, b) { try { const x = expression(a), y = expression(b); return x.every((n, i) => Math.abs(n - y[i]) < eps); } catch (_) { return false; } }
  function number(raw) { const value = expression(raw); if (Math.abs(value[0]) > eps) throw Error('not a number'); return value[1]; }
  function equation(raw) { const parts = String(raw).split('='); if (parts.length !== 2) throw Error('equation'); const a = expression(parts[0]), b = expression(parts[1]); return [a[0] - b[0], a[1] - b[1]]; }
  function solve(raw) { const [a, b] = equation(raw); if (Math.abs(a) < eps) throw Error('nonunique'); return -b / a; }
  function completionIssue(q, raw) {
    if (q.responseForm !== 'simplified-linear' && q.skillId !== 'distribute') return null;
    let text = normalize(raw);
    if (/^\([+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:\/(?:\d+(?:\.\d+)?|\.\d+))?\)$/.test(text)) text = text.slice(1, -1);
    if (/[()]/.test(text)) return '式子与原式等价，还需要去掉括号并合并同类项。请继续完成后再提交。';
    const literal = '(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
    const scalar = new RegExp('^[+-]?' + literal + '(?:/' + literal + ')?$');
    const monomial = new RegExp('^[+-]?(?:' + literal + '(?:/' + literal + ')?\\*?)?x(?:/' + literal + ')?$');
    const terms = text.match(/[+-]?[^+-]+/g) || [];
    let variables = 0, constants = 0;
    for (const term of terms) {
      if (term.includes('x')) {
        if (!monomial.test(term) || (term.match(/\//g) || []).length > 1) return '式子等价，还需要完成系数的计算。请写出化简后的式子。';
        variables++;
        if (Math.abs(expression(term)[0]) < eps) return '字母项的系数已经为零，请去掉这一项，写出最后结果。';
      } else {
        if (!scalar.test(term)) return '式子等价，还需要完成剩余计算。请写出化简后的式子。';
        constants++;
        if (terms.length > 1 && Math.abs(number(term)) < eps) return '式子等价，还可以去掉多余的零项。请写出最后结果。';
      }
    }
    if (terms.join('') !== text || variables > 1 || constants > 1) return '去括号后的式子等价，还需要合并同类项。请继续化简后再提交。';
    return null;
  }
  function judge(q, answer) {
    const text = String(answer || '').trim();
    if (!text || text.length > 180) return { verdict: 'invalid' };
    if (q.type === 'choice') return { verdict: text.toUpperCase() === q.answer ? 'correct' : q.choices.some(c => c.key === text.toUpperCase()) ? 'wrong' : 'invalid' };
    try {
      if (q.type === 'expression') {
        expression(text);
        if (!equivalent(text, q.answer)) return { verdict: 'wrong' };
        const message = completionIssue(q, text);
        return message ? { verdict: 'incomplete', equivalent: true, goalComplete: false, message } : { verdict: 'correct', equivalent: true, goalComplete: true };
      }
      const value = number(text.replace(/^x\s*[=＝]\s*/i, ''));
      return { verdict: Math.abs(value - Number(q.answer)) < eps ? 'correct' : 'wrong' };
    } catch (_) { return { verdict: 'invalid' }; }
  }
  return { expression, equivalent, number, equation, solve, judge, completionIssue };
});
