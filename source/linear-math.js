(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LinearMath = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const eps = 1e-8;
  function expression(raw) {
    const text = String(raw).replace(/[−–]/g, '-').replace(/[×·]/g, '*').replace(/[÷]/g, '/').replace(/[（]/g, '(').replace(/[）]/g, ')').replace(/[ＸｘX]/g, 'x').replace(/\s+/g, '');
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
  function judge(q, answer) {
    const text = String(answer || '').trim();
    if (!text || text.length > 180) return { verdict: 'invalid' };
    if (q.type === 'choice') return { verdict: text.toUpperCase() === q.answer ? 'correct' : q.choices.some(c => c.key === text.toUpperCase()) ? 'wrong' : 'invalid' };
    try {
      if (q.type === 'expression') { expression(text); return { verdict: equivalent(text, q.answer) ? 'correct' : 'wrong' }; }
      const value = number(text.replace(/^x\s*[=＝]\s*/i, ''));
      return { verdict: Math.abs(value - Number(q.answer)) < eps ? 'correct' : 'wrong' };
    } catch (_) { return { verdict: 'invalid' }; }
  }
  return { expression, equivalent, number, equation, solve, judge };
});
