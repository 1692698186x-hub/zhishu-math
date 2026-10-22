(function (root) {
  'use strict';
  root.LearningUI = { create };
  function create(host) {
    const L = Learning.createEngine(LearningUnit), $ = s => document.querySelector(s);
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    let opened = false, busy = false, note = '', started = Date.now(), status = { configured: false, connected: false }, statusChecked = false;
    const p = () => host.profile();
    const run = () => p().learningRun;
    const phaseName = s => ({ diagnose: '起点短测', plan: '学习起点', practice: '分层巩固', probe: '错因小检查', transfer: '独立复测', review: '复习检查' }[s] || '学习记录');
    const outcomeName = r => r.outcome === 'not_learned' ? '尚未学习' : r.outcome === 'skip' ? '暂未作答' : r.assisted ? '辅助作答' : r.outcome === 'correct' ? '独立通过' : '需要再练';
    const badge = () => '<span class="learning-service ' + (status.connected && p().aiConsent ? 'connected' : '') + '"><i></i>' + (status.connected && p().aiConsent ? 'AI 指导已连接' : status.configured && p().aiConsent ? 'AI 已配置 · 待验证' : '本地指导') + '</span>';
    function archive() {
      const r = run();
      if (r?.finished && !r.archived) { r.archived = true; (p().learningRuns ||= []).push(JSON.parse(JSON.stringify(r))); p().learningRuns = p().learningRuns.slice(-30); }
    }
    function save() { if (run()) p().learningSeenIds = [...new Set([...(p().learningSeenIds || []), ...(run().exposedIds || [])])]; archive(); host.save(); }
    function draw() { save(); host.refresh(); }
    function checkStatus() {
      if (statusChecked || !/^https?:$/.test(location.protocol)) return;
      statusChecked = true;
      fetch('/api/status', { signal: AbortSignal.timeout(3500) }).then(res => res.ok ? res.json() : null).then(data => { if (data?.app === 'zhishu-math') { status.configured = !!data.configured; host.refresh(); } }).catch(() => {});
    }
    function description() {
      return '<details class="learning-about"><summary><span>学习规则与指导方式</span>' + badge() + '</summary><div class="learning-about-body"><p>同层两道新题独立通过后升级；辅助作答与重复题单独记录。单次复测不代表长期掌握。</p><p>当前题目仍待教师审核。' + (status.configured ? '开启 AI 后，仅发送本题、答案和关键步骤，不发送学生昵称；错因推测还需小题验证。' : '当前使用本地规则指导，未连接真实 AI。模型接入方法见项目说明。') + '</p>' + (status.configured ? '<label class="checkline"><input id="learning-ai-consent" type="checkbox"' + (p().aiConsent ? ' checked' : '') + '>使用已配置的 AI 指导</label>' : '') + '</div></details>';
    }
    function home() {
      const r = run(), previous = [...(p().learningRuns || [])].reverse().find(x => x.kind === 'learn');
      const reviewed = previous && (p().learningRuns || []).some(x => x.reviewFor === previous.id && x.finished);
      const due = previous && !reviewed && Date.now() >= previous.reviewDueAt;
      const summary = r?.finished ? L.summary(r) : null;
      return '<div class="intro"><div><h1>能力提升</h1><p>先了解起点，再循序练习。</p></div></div>' +
        '<section class="card learning-unit-card"><div class="learning-unit-heading"><div><span class="learning-kicker">七年级数学 · 代数</span><h2>一元一次方程</h2></div><span class="learning-unit-status">' + (r && !r.finished ? '学习进行中' : '本期单元') + '</span></div><div class="learning-path" aria-label="本单元知识点">' + L.unit.skills.map(s => '<span>' + esc(s.name) + '</span>').join('') + '</div><div class="learning-unit-meta"><span>起点短测 <b>3 题</b></span><span>每轮最多 <b>28 题</b></span><span>可随时暂停</span></div>' +
        '<div class="learning-unit-bottom"><p>' + (r && !r.finished ? '上次已完成 ' + r.answers.length + ' 题，接着往下学。' : summary ? '上轮完成 ' + summary.total + ' 题，独立复测通过 ' + summary.transferCorrect + ' / ' + summary.transferCount + '。' : '从适合你的难度开始。') + '</p><div class="learning-hero-actions">' + (r ? '<button class="secondary" data-learn="' + (r.finished ? 'results' : 'restart') + '">' + (r.finished ? '上轮报告' : '重新开始') + '</button>' : '') + '<button class="primary" data-learn="' + (r && !r.finished ? 'resume' : 'start') + '">' + (r && !r.finished ? '继续学习 →' : '开始学习 →') + '</button></div></div></section>' +
        (previous && !reviewed ? '<section class="resume learning-review-reminder"><div><strong>' + (due ? '该复习一下了' : '下次复习') + '</strong><p>' + new Date(previous.reviewDueAt).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' · 3 道新题检查保持情况</p></div><button class="secondary" data-learn="review"' + (r && !r.finished ? ' disabled title="先完成或结束当前学习"' : '') + '>' + (due ? '开始复习' : '现在复习') + '</button></section>' : '') +
        '<section class="learning-process-strip" aria-label="学习流程"><div><span>01</span><p><b>了解起点</b><small>短测找出需要巩固的步骤</small></p></div><div><span>02</span><p><b>按需巩固</b><small>小题确认，逐步增加难度</small></p></div><div><span>03</span><p><b>独立复测</b><small>换个情境，看看能否运用</small></p></div></section>' + description();
    }
    function plan(r) {
      return '<div class="session-wrap learning-wrap"><div class="intro"><div><h1>你的学习起点</h1><p>短测完成。接下来先确认卡点，再按合适难度巩固。</p></div></div><section class="card">' + L.summary(r).skills.map(s => '<div class="learning-skill-row"><div><b>' + s.name + '</b><p>' + (s.diagnosis?.outcome === 'not_learned' ? '尚未学习，本轮先保留。' : s.diagnosis?.outcome === 'correct' ? '初步通过，继续用新题确认。' : s.diagnosis?.outcome === 'skip' ? '暂未作答，从基础题开始。' : '先用一道小题检查卡点。') + '</p></div><span class="badge">' + (s.notLearned ? '尚未学习' : L.levelNames[s.level]) + '</span></div>').join('') + '<div class="learning-button-row"><button class="text-btn" data-learn="pause">稍后继续</button><button class="primary" data-learn="train">开始巩固 →</button></div></section><p class="learning-footnote">一次作答是初步线索，后续会继续验证。</p></div>';
    }
    function question(r) {
      const c = r.current, q = L.items[c.questionId], skill = L.skills[q.skillId];
      const post = ['transfer', 'review'].includes(c.stage), draft = r.draft || {}, diagnostic = c.stage === 'diagnose';
      const count = diagnostic ? Math.min(3, r.answers.filter(a => a.stage === 'diagnose').length + 1) + ' / 3 题' : '已完成 ' + r.answers.length + ' 题 · 上限 ' + r.limit + ' 题';
      const progress = diagnostic ? r.answers.filter(a => a.stage === 'diagnose').length / 3 : r.answers.length / r.limit;
      const hints = c.hintCount ? '<aside class="learning-hint" aria-live="polite"><div><b>提示 ' + c.hintCount + '</b><span>本题记为辅助作答</span></div><p>' + esc(c.coach?.hint || L.localCoach(q, { hintCount: c.hintCount }).hint) + '</p><small>' + (c.coach?.source === 'ai' ? 'AI 指导' : '本地指导') + '</small></aside>' : '';
      return '<div class="session-wrap learning-wrap"><div class="session-top"><span class="learning-stage">' + phaseName(c.stage) + '</span><div class="learning-session-tools"><button class="text-btn" data-learn="pause">暂停</button><details class="learning-more"><summary aria-label="更多学习操作">更多</summary><div><button class="text-btn" data-learn="end">结束本轮</button></div></details></div></div><div class="progress-label"><span>' + esc(skill.name) + '</span><span>' + count + '</span></div><div class="progress"><span style="width:' + progress * 100 + '%"></span></div>' +
        '<section class="card learning-question"><div class="question-meta"><span class="badge">' + (c.stage === 'probe' ? '关键步骤检查' : L.levelNames[c.level]) + '</span><span>' + (post ? '新情境 · 独立复测' : c.repeated ? '重复巩固' : '新题') + '</span></div><h1 class="question-prompt">' + esc(q.prompt) + '</h1>' +
        (q.type === 'choice' ? '<div class="choices" aria-label="小检查选项">' + q.choices.map(ch => '<button class="choice' + (draft.answer === ch.key ? ' selected' : '') + '" data-learn-choice="' + ch.key + '" aria-pressed="' + (draft.answer === ch.key) + '"><span class="key">' + ch.key + '</span>' + esc(ch.text) + '</button>').join('') + '</div>' : '<label class="learning-answer-label">你的答案<input id="learning-answer" class="answer-input" autocomplete="off" inputmode="decimal" aria-label="你的答案" placeholder="填写数值，例如 6 或 −2" maxlength="160" value="' + esc(draft.answer || '') + '"></label>') +
        '<details class="learning-working-panel"' + (draft.steps ? ' open' : '') + '><summary>添加关键步骤 <span>选填</span></summary><label class="learning-working-label" for="learning-working">写一句你的思路，方便确认卡点。</label><textarea id="learning-working" class="learning-working" aria-label="关键解题步骤" maxlength="1000" placeholder="例如：先去括号，得到……">' + esc(draft.steps || '') + '</textarea></details>' + hints +
        (c.revealed ? '<div class="feedback"><b>参考答案：' + esc(q.answer) + '</b><p>' + esc(q.explanation) + '</p></div>' : '') + (note ? '<p class="msg" role="alert">' + esc(note) + '</p>' : '') +
        '<div class="question-actions"><div class="left"><button class="text-btn" data-learn="dontknow">暂时不会</button>' + (!diagnostic ? '<button class="text-btn learning-hint-action" data-learn="hint"' + (busy || c.hintCount >= 3 ? ' disabled' : '') + '>' + (busy ? '正在准备提示…' : c.hintCount ? '再给一点提示' : post ? '提示（记为辅助）' : '给一点提示') + '</button>' : '') + '<details class="learning-more"><summary>其他情况</summary><div><button class="text-btn" data-learn="unlearned">还没学过</button>' + (diagnostic ? '<button class="text-btn" data-learn="skip">跳过本题</button>' : c.hintCount ? '<button class="text-btn" data-learn="reveal">查看完整解法</button>' : '') + '</div></details></div><button class="primary" data-learn="submit"' + (busy ? ' disabled' : '') + '>提交答案 →</button></div></section>' +
        '<details class="learning-context"><summary>选题依据与最近记录</summary><p>' + esc(c.reason) + (post ? ' 提示和已见题不计为独立复测通过。' : '') + '</p>' + timeline(r) + '</details></div>';
    }
    function feedback(r) {
      const f = r.feedback, a = f.record, q = L.items[a.questionId], coach = f.coach || L.localCoach(q, a);
      const title = a.outcome === 'correct' ? a.assisted ? '提示后完成' : '回答正确' : a.outcome === 'not_learned' ? '已记为尚未学习' : a.outcome === 'skip' ? '本题已跳过' : '再巩固这一步';
      return '<div class="session-wrap learning-wrap"><div class="session-top"><span class="learning-stage">' + phaseName(a.stage) + '</span>' + badge() + '</div><section class="card learning-feedback"><div class="learning-feedback-heading"><span class="learning-feedback-symbol">' + (a.outcome === 'correct' ? '✓' : '↗') + '</span><div><h1>' + title + '</h1><p>' + outcomeName(a) + '</p></div></div><p class="learning-transition">' + esc(f.transition) + '</p>' +
        (a.outcome === 'wrong' ? '<div class="learning-coach"><div><b>' + (busy ? '正在分析…' : '下一步怎么补') + '</b><span>' + (coach.source === 'ai' ? 'AI 推测 · 待验证' : '本地指导 · 待确认') + '</span></div><p>' + esc(coach.hypothesis) + '</p><blockquote>' + esc(coach.hint) + '</blockquote><details class="learning-evidence-details"><summary>查看判断依据</summary><p>' + esc(coach.evidence) + '</p></details></div>' : '') +
        '<details class="learning-solution"><summary>参考答案与解法</summary><p><b>参考答案：' + esc(q.answer) + '</b><br>' + esc(q.explanation) + '</p></details>' + (note ? '<p class="msg" role="status">' + esc(note) + '</p>' : '') + '<div class="learning-button-row"><button class="text-btn" data-learn="pause">稍后继续</button><button class="primary" data-learn="next"' + (busy ? ' disabled' : '') + '>继续下一步 →</button></div></section><details class="learning-context"><summary>最近的学习记录</summary>' + timeline(r) + '</details></div>';
    }
    function timeline(r) {
      return r.answers.length ? '<div class="learning-timeline">' + r.answers.slice(-4).map(a => '<div><span>' + (a.outcome === 'correct' && !a.assisted ? '✓' : '·') + '</span><p><b>' + L.skills[a.skillId].name + '</b><small>' + phaseName(a.stage) + ' · ' + outcomeName(a) + '</small></p></div>').join('') + '</div>' : '';
    }
    function results(r) {
      const s = L.summary(r);
      return '<div class="learning-wrap"><div class="intro"><div><h1>' + (r.kind === 'review' ? '复习报告' : '本轮学习报告') + '</h1><p>一元一次方程 · ' + esc(r.finishReason) + '</p></div><button class="secondary" data-learn="print">打印报告</button></div>' +
        '<div class="learning-result-stats"><div><span>本轮作答</span><b>' + s.total + '<small>题</small></b></div><div><span>新题独立通过</span><b>' + s.independent + '<small>题</small></b></div><div><span>辅助作答</span><b>' + s.assisted + '<small>题</small></b></div><div><span>' + (r.kind === 'review' ? '复习' : '独立复测') + '通过</span><b>' + s.transferCorrect + '<small> / ' + s.transferCount + '</small></b></div></div>' +
        '<section class="card"><div class="card-title"><h2>知识点表现</h2></div><div class="learning-result-table"><div class="learning-result-head"><span>知识点</span><span>起点线索</span><span>练习表现</span><span>新题复测</span></div>' + s.skills.map(k => '<div><strong>' + k.name + '</strong><span>' + (k.diagnosis ? k.diagnosis.outcome === 'correct' ? '初步通过' : k.diagnosis.outcome === 'not_learned' ? '尚未学习' : '需要确认' : '未检查') + '</span><span>' + (k.highest >= 0 ? L.levelNames[k.highest] + '独立通过' : '继续积累证据') + '</span><span class="' + (k.post?.outcome === 'correct' && !k.post.assisted ? 'learning-pass' : '') + '">' + (k.post ? outcomeName(k.post) : '尚未复测') + '</span></div>').join('') + '</div><p class="learning-footnote">初筛与复测情境不同，不直接换算提分；一次通过仍需后续复习。</p></section>' +
        '<section class="card learning-next-step"><div><h2>下一步</h2><p>' + (s.transferCorrect === 3 ? '本次三项复测均独立通过，隔日换题再检查。' : '先巩固尚未独立通过的部分，再用新题确认。') + '</p><small>建议复习：' + new Date(r.reviewDueAt).toLocaleString('zh-CN') + '</small></div><button class="primary" data-learn="home">返回学习首页</button></section>' +
        '<details class="learning-context learning-report-evidence"><summary>错因证据与结果说明</summary>' + s.skills.map(k => '<p class="learning-evidence-line"><b>' + k.name + '</b>' + (k.verifiedGap ? '小检查也遇到困难，已安排补习。' : '尚未确认持续性障碍。') + '</p>').join('') + '<p>指导中的推测与小检查结果分开保存，题目仍待教师审核。</p></details><div class="learning-report-tools"><button class="text-btn" data-learn="export">导出完整学习记录</button></div></div>';
    }
    function render() { checkStatus(); const r = run(); return !opened || !r ? home() : r.finished ? results(r) : r.phase === 'plan' ? plan(r) : r.feedback ? feedback(r) : r.current ? question(r) : home(); }
    function start(review = false) {
      const owner = p();
      if (review && owner.learningRun && !owner.learningRun.finished) return;
      const previous = [...(owner.learningRuns || [])].reverse().find(x => x.kind === 'learn');
      owner.learningRun = L.create([...owner.records.filter(x => x.mode === 'learning'), ...(owner.learningSeenIds || []).map(questionId => ({ questionId }))], { review });
      if (review) owner.learningRun.reviewFor = previous?.id;
      L.next(owner.learningRun); opened = true; note = ''; busy = false; started = Date.now(); draw();
    }
    function input() { const r = run(); if (!r?.current) return; r.draft = { answer: $('#learning-answer')?.value ?? r.draft.answer ?? '', steps: $('#learning-working')?.value ?? r.draft.steps ?? '' }; }
    function submit(outcome) {
      const r = run(); if (!r?.current || busy) return;
      input(); const q = L.items[r.current.questionId], d = r.draft;
      if (!outcome) { if (!String(d.answer || '').trim()) { note = '先填一个答案，或选择“暂时不会”。'; draw(); return; } const verdict = DiagEngine.judgeQuestion(q, String(d.answer).trim()).verdict; if (verdict === 'manual') { note = '请只填写答案数值，也可以选择跳过或暂时不会。'; draw(); return; } outcome = verdict === 'correct' ? 'correct' : 'wrong'; }
      const a = L.record(r, outcome, { userAnswer: d.answer, steps: d.steps, elapsedMs: Date.now() - started });
      p().records.push(a); note = ''; started = Date.now(); draw();
      if (r.feedback && outcome === 'wrong') requestCoach('feedback', q, a, r);
    }
    async function requestCoach(operation, q, data, ownerRun) {
      if (!status.configured || !p().aiConsent) return;
      const owner = p(), token = ownerRun.current?.questionId;
      busy = true; host.refresh();
      try {
        const res = await fetch('/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation, questionId: q.id, userAnswer: data.userAnswer || ownerRun.draft.answer || '', steps: data.steps || ownerRun.draft.steps || '', outcome: data.outcome || '', hintCount: ownerRun.current?.hintCount || 1 }), signal: AbortSignal.timeout(25000) });
        const result = await res.json();
        if (!res.ok || !['ai', 'rules'].includes(result.source)) throw Error('service');
        if (operation === 'hint' && ownerRun.current?.questionId === token) ownerRun.current.coach = result;
        else if (operation === 'feedback') L.setCoach(ownerRun, q.id, result);
        status.connected = result.source === 'ai';
        if (result.source !== 'ai' && p() === owner) note = 'AI 暂时未响应，已使用本地指导，学习可以继续。';
      } catch (_) { status.connected = false; if (p() === owner) note = 'AI 暂时未响应，已使用本地指导，学习可以继续。'; }
      finally { busy = false; host.save(); if (p() === owner) host.refresh(); }
    }
    function bind() {
      document.querySelectorAll('[data-learn]').forEach(el => el.onclick = () => {
        const r = run(), action = el.dataset.learn;
        if (action === 'start') start();
        else if (action === 'restart') host.confirm('重新开始这一轮？', '已经提交的作答会保留。当前未完成的学习会存入历史记录。', () => { if (r && !r.finished) { L.close(r, '开始了新一轮学习，原学习提前结束。'); archive(); } start(); });
        else if (action === 'resume' || action === 'results') { opened = true; busy = false; note = ''; started = Date.now(); draw(); }
        else if (action === 'home' || action === 'pause') { input(); opened = false; draw(); }
        else if (action === 'train') { L.beginTraining(r); started = Date.now(); draw(); }
        else if (action === 'submit') submit();
        else if (action === 'dontknow') submit('wrong');
        else if (action === 'unlearned') submit('not_learned');
        else if (action === 'skip') submit('skip');
        else if (action === 'next') { L.continueRun(r); started = Date.now(); note = ''; draw(); }
        else if (action === 'hint') { input(); L.hint(r); draw(); requestCoach('hint', L.items[r.current.questionId], {}, r); }
        else if (action === 'reveal') { input(); L.reveal(r); draw(); }
        else if (action === 'review') start(true);
        else if (action === 'end') host.confirm('结束本轮学习？', '已完成的作答会保留；没有测到的部分会明确标注。', () => { L.close(r, '你提前结束了本轮学习，结果只反映已完成的部分。'); draw(); });
        else if (action === 'print') window.print();
        else if (action === 'export') host.export();
      });
      document.querySelectorAll('[data-learn-choice]').forEach(el => el.onclick = () => { input(); run().draft.answer = el.dataset.learnChoice; note = ''; draw(); });
      if ($('#learning-answer')) { $('#learning-answer').oninput = () => { input(); host.save(); }; $('#learning-answer').onkeydown = e => { if (e.key === 'Enter') submit(); }; }
      if ($('#learning-working')) $('#learning-working').oninput = () => { input(); host.save(); };
      if ($('#learning-ai-consent')) $('#learning-ai-consent').onchange = e => { p().aiConsent = e.target.checked; draw(); };
    }
    return { render, bind, engine: L };
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
