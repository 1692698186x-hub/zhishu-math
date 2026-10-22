(function () {
  'use strict';
  const E = Ability.createEngine(MATH_DATA);
  const KEY = 'zhishu.ability.v1';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const gradeName = g => '一二三四五六七八九'[g - 1] + '年级';
  const diffName = d => ({ basic: '基础', standard: '标准', advanced: '提高' }[d]);
  const svg = (name, cls = '') => '<svg class="icon ' + cls + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ({ home: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>', chart: '<path d="M4 4v16h17M8 15v-4m5 4V7m5 8v-7"/>', leaf: '<path d="M5 19C1 10 9 3 21 3c0 12-7 20-16 16Zm0 0L16 8m-9 9v-6m2 4h6"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>', check: '<path d="m5 12 4 4L19 6"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>', download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>', link: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="19" r="2"/><path d="m7 6 10 5M7 18l10-5"/>', back: '<path d="M20 12H4m6-6-6 6 6 6"/>', plus: '<path d="M12 5v14M5 12h14"/>' }[name] || '') + '</svg>';
  let storageOK = true;
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (_) { storageOK = false; }
  if (!db || db.version !== 1 || !Array.isArray(db.profiles) || !db.profiles.length) {
    db = { version: 1, activeId: 'student-1', profiles: [{ id: 'student-1', name: '体验同学', records: [], session: null, latestDiagnosis: null }], config: { grade: 7, semester: '上', domain: 'all', limit: 12, trace: true } };
  }
  // The preview intentionally opens one grade; the full upstream graph remains available for prerequisites.
  db.config = { grade: 7, semester: '上', domain: 'all', limit: 12, trace: true, ...db.config, grade: 7 };
  if (!db.profiles.some(p => p.id === db.activeId)) db.activeId = db.profiles[0].id;
  let view = 'learning', feedback = null, selected = '', message = '', questionStarted = Date.now(), reportFilter = 'all', historyLimit = 30;
  const profile = () => db.profiles.find(p => p.id === db.activeId);
  const currentQ = () => { const c = profile().session?.current; return c ? E.bank[c.topicId].find(q => q.id === c.questionId) : null; };
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) { storageOK = false; } }
  const tag = status => '<span class="status-tag tag-' + status + '">' + E.labels[status] + '</span>';
  function header(title, subtitle, eyebrow) { return '<div class="intro"><div><div class="eyebrow">' + eyebrow + '</div><h1>' + title + '</h1><p>' + subtitle + '</p></div><div class="intro-annotation">STEP BY STEP, FIND YOUR WAY.</div></div>'; }
  function renderLegacy() {
    const p = profile();
    $('#app').innerHTML = '<div class="layout"><aside class="sidebar"><div class="brand"><div class="brand-mark">' + svg('link') + '</div><div><div class="brand-name">知数</div><div class="brand-tag">MATH · FIND YOUR WAY</div></div></div><div class="side-label">学习空间</div><nav class="nav" aria-label="主导航">' + [['home', 'home', '自适应测评'], ['report', 'chart', '能力报告'], ['practice', 'leaf', '针对性练习'], ['history', 'clock', '答题记录']].map(([v, i, label]) => '<button data-nav="' + v + '" class="' + (view === v || v === 'home' && ['session', 'finished'].includes(view) ? 'active' : '') + '">' + svg(i) + label + '</button>').join('') + '</nav><div class="side-tip"><strong>每一道题，都有方向。</strong>沿着知识之间的联系，找到值得补的那一步。</div><div class="student"><div class="student-line"><div class="avatar">' + esc(p.name.slice(0, 1)) + '</div><div><select id="profile-select" aria-label="切换学生">' + db.profiles.map(x => '<option value="' + esc(x.id) + '"' + (x.id === p.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select><div style="font-size:9px;color:#9aa58e;margin-left:4px">七年级 · 独立学习记录</div></div></div><button class="new-student" data-action="new-profile">＋ 新建学生</button></div></aside><main class="main"><div class="topbar"><span>学习空间 <span style="margin:0 9px;color:#bac4b2">/</span> 七年级数学</span><div class="topright"><span class="save-label"><i class="status-dot"></i>' + (storageOK ? '记录保存在本机' : '当前记录暂未保存') + '</span><span class="pill">自适应体验版</span></div></div>' + (!storageOK ? '<div class="storage-warning">浏览器暂不允许保存记录。本次仍可使用，请在结束前导出答题记录。</div>' : '') + ({ home: home, report: report, practice: practice, history: history, session: sessionPage, finished: finished }[view] || home)() + '<footer class="footer"><span>知数 · 让每一次练习更有方向</span><span>基于 <a href="https://github.com/xiaoyang111222/cn-math-taxonomy" target="_blank" rel="noopener">cn-math-taxonomy</a> · <a href="https://creativecommons.org/licenses/by-nc/4.0/deed.zh-hans" target="_blank" rel="noopener">CC BY-NC 4.0</a><br>图谱与题库为 AI 初稿，未经教师审核；本次结果是学习线索。</span></footer></main></div>';
    bind();
  }
  function configFilters() {
    return '<div class="filter-row"><select class="select" data-config="semester" aria-label="选择测评册次">' + [['上', '七年级上册'], ['下', '七年级下册'], ['all', '七年级全册']].map(([v, l]) => '<option value="' + v + '"' + (db.config.semester === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select><select class="select" data-config="domain" aria-label="选择数学领域">' + [['all', '全部领域'], ...[...new Set(E.scope({ grade: 7 }).map(t => t.domain))].map(v => [v, v])].map(([v, l]) => '<option value="' + v + '"' + (db.config.domain === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>';
  }
  function home() {
    const p = profile(), active = p.session && !p.session.finished;
    return '<div class="intro"><h1>自适应测评</h1></div>' + (active ? '<div class="resume"><span>上次' + (p.session.mode === 'practice' ? '练习' : '测评') + '已答 ' + p.session.answers.length + ' 题</span><button class="secondary" data-action="resume">继续上次答题 ' + svg('arrow') + '</button></div>' : '') + '<section class="card assessment-setup" aria-label="测评设置"><div class="field"><div class="field-label">测评范围</div>' + configFilters() + '</div><div class="field"><div class="field-label">题量上限</div><div class="segmented" role="group" aria-label="题量上限">' + [8, 12, 18].map(n => '<button data-limit="' + n + '" class="' + (Number(db.config.limit) === n ? 'on' : '') + '" aria-pressed="' + (Number(db.config.limit) === n) + '">' + n + ' 题</button>').join('') + '</div></div><div class="settings"><label class="checkline"><input id="trace-check" type="checkbox" ' + (db.config.trace ? 'checked' : '') + '><span>沿相关基础继续追查</span></label></div><div class="start-row"><button class="primary" data-action="start">开始测评 ' + svg('arrow') + '</button></div></section>';
  }
  function rail(r) {
    const colors = { secure: '#8fb56c', shaky: '#d7ba76', weak: '#d5a18b', checking: '#b7a2cb', notlearned: '#dce3d3', unknown: '#edf1e7' };
    return '<div class="coverage-rail" aria-label="各知识状态分布">' + Object.keys(colors).map(k => '<span title="' + E.labels[k] + ' ' + r.counts[k] + ' 项" style="width:' + (r.total ? r.counts[k] / r.total * 100 : 0) + '%;background:' + colors[k] + '"></span>').join('') + '</div><div class="legend">' + ['secure', 'weak', 'checking', 'unknown'].map(k => '<span><i style="background:' + colors[k] + '"></i>' + E.labels[k] + '</span>').join('') + '</div>';
  }
  function start(mode, focusIds) {
    const p = profile();
    if (p.session && !p.session.finished && p.session.answers.length && !focusIds) {
      showModal('<h2>开始新的一次答题？</h2><p class="subtle">之前提交的答案已保留。未完成的答题可以继续，也可以结束后开始新测评。</p><div class="modal-actions" style="margin-top:23px"><button class="secondary" data-modal="resume">继续上次</button><button class="primary" data-modal="replace">开始新的</button></div>', () => {
        $('[data-modal="resume"]').onclick = () => { closeModal(); go('session'); };
        $('[data-modal="replace"]').onclick = () => { closeModal(); p.session.finished = true; create(); };
      });
      return;
    }
    create();
    function create() { p.session = E.newSession({ ...db.config, mode, focusIds, limit: mode === 'practice' ? 8 : db.config.limit }); feedback = null; selected = ''; message = ''; E.next(p.session, p.records); questionStarted = Date.now(); save(); go(p.session.finished ? 'finished' : 'session'); }
  }
  function sessionPage() {
    const p = profile(), s = p.session;
    if (!s) return home();
    if (s.finished && !feedback) return finished();
    const c = s.current, q = feedback ? E.bank[feedback.record.topicId].find(q => q.id === feedback.record.questionId) : currentQ();
    if (!q) return finished();
    const t = E.byId[q.topicId], done = s.answers.length, isPractice = s.mode === 'practice', questionNo = feedback ? done : done + 1;
    const deferredCount = [...E.deferred(s)].filter(id => s.scopeIds.includes(id)).length;
    const last = !feedback ? s.answers.at(-1) : null;
    const needsChoiceCheck = last?.type === 'choice' && s.answers.filter(r => r.topicId === last.topicId && r.outcome === 'correct').length < 2;
    return '<div class="session-wrap"><div class="session-top"><div class="session-type"><span class="badge' + (isPractice ? ' purple' : '') + '">' + (isPractice ? '针对性练习' : '自适应测评') + '</span><span class="muted" style="font-size:12px">七年级' + (s.semester === 'all' ? '全册' : s.semester + '册') + '</span></div><button class="text-btn" data-action="finish">结束并查看结果</button></div><div class="progress-label"><span>' + (isPractice ? '边练边巩固' : '沿知识联系，逐步缩小范围') + '</span><span class="mono">第 ' + questionNo + ' 题 / 最多 ' + s.limit + ' 题</span></div><div class="progress"><span style="width:' + done / s.limit * 100 + '%"></span></div>' + (last && !isPractice ? '<div class="adaptive-update"><span class="route-dot ' + (last.outcome === 'correct' ? 'pass' : '') + '"></span><div><b>上一站 · ' + esc(E.byId[last.topicId].name) + '</b><span>' + ({ correct: needsChoiceCheck ? '本题通过。再用新题交叉确认，减少蒙对的影响。' : '本题通过。相关前置知识本轮暂缓逐点追问。', wrong: '本题遇到困难。正在缩小需要检查的知识范围。', not_learned: '已记为尚未学习，不计入薄弱判断。', skip: '已跳过，本题不参与能力判断。' }[last.outcome] || '答案已记录。') + '</span></div></div>' : '') + '<section class="card question-card"><div class="question-meta"><span class="badge">' + esc(t.name) + '</span><span>' + gradeName(t.grade) + ' · ' + diffName(q.difficulty) + '题</span>' + (c?.outside ? '<span class="badge amber">相关基础检查</span>' : '') + (c?.repeated ? '<span class="muted">本题曾经练过</span>' : '') + '</div><h1 class="question-prompt">' + esc(q.prompt) + '</h1>' + (q.type === 'choice' ? '<div class="choices" role="group" aria-label="答案选项">' + q.choices.map(ch => '<button class="choice ' + (selected === ch.key ? 'selected' : '') + '" data-choice="' + esc(ch.key) + '" aria-pressed="' + (selected === ch.key) + '"' + (feedback ? ' disabled' : '') + '><span class="key">' + esc(ch.key) + '</span><span>' + esc(ch.text) + '</span></button>').join('') + '</div>' : '<label><span class="subtle" style="display:block;margin-top:18px">填写答案（分数可写成 1/2，多个答案用逗号分隔）</span><input id="answer-input" class="answer-input" autocomplete="off" placeholder="在这里填写答案" aria-label="填写答案" value="' + esc(selected) + '"' + (feedback ? ' disabled' : '') + '></label>') + (message ? '<p class="msg" role="alert">' + esc(message) + '</p>' : '') + (feedback ? '<div class="feedback ' + (feedback.record.outcome === 'wrong' ? 'wrong' : '') + '"><h3>' + ({ correct: '这道题答对了', wrong: '找到一个值得再练的地方', assisted: '先理解思路，再用新题试一试', not_learned: '这部分尚未学习', skip: '本题已跳过' }[feedback.record.outcome]) + '</h3><div class="reference">参考答案：' + esc(q.answer) + '</div>' + esc(q.explanation) + (feedback.record.assisted ? '<p class="subtle" style="margin-top:9px">本次看过答案，不计入独立掌握证据。</p>' : '') + '</div>' : '') + '<div class="question-actions"><div class="left">' + (!feedback ? '<button class="text-btn" data-answer="wrong">暂时不会</button><button class="text-btn" data-answer="not_learned">还没学过</button>' + (isPractice ? '<button class="text-btn" data-answer="assisted">看解析</button>' : '<button class="text-btn" data-answer="skip">跳过</button>') : '<span class="subtle">新题会根据本次表现继续调整。</span>') + '</div>' + (feedback ? '<button class="primary" data-action="next">' + (s.finished ? '查看练习结果' : '继续下一题') + svg('arrow') + '</button>' : '<button class="primary" data-action="submit">提交答案 ' + svg('arrow') + '</button>') + '</div></section>' + (!feedback && c ? '<div class="reason">' + svg('link') + '<div><b style="font-weight:600;color:#6a835c">为什么现在问这题</b><br>' + esc(c.reason) + '</div></div>' : '') + (!isPractice ? '<div class="route-stats"><span>' + svg('link') + ' <b>' + deferredCount + '</b> 个范围内前置点暂缓追问</span><span><b>' + (s.rootIds?.length || 0) + '</b> 个薄弱候选已复核</span></div><p class="subtle" style="text-align:center;margin-top:13px">暂缓追问只是选题策略，不代表这些知识已经确认掌握。</p>' : '') + route(s) + '</div>';
  }
  function route(s) {
    if (!s.answers.length) return '';
    return '<section class="card route-card"><div class="card-title"><h2 style="font-size:15px">这次的检查路线</h2><span class="sub">' + (s.mode === 'diagnose' ? '题目随作答改变' : '按表现调整练习') + '</span></div><div class="route-items">' + s.answers.slice(-7).map((r, i) => '<div class="route-item"><span class="route-state ' + (r.outcome === 'correct' ? 'pass' : r.outcome === 'wrong' ? 'fail' : 'neutral') + '">' + (r.outcome === 'correct' ? '✓' : r.outcome === 'wrong' ? '·' : '—') + '</span><div><strong>' + esc(E.byId[r.topicId].name) + '</strong><small>' + (r.linkedTo ? '检查「' + esc(E.byId[r.linkedTo].name) + '」的基础' : ['confirm', 'verify'].includes(r.kind) ? '用新题复核' : '关键点初筛') + '</small></div><span class="route-result">' + ({ correct: '本题通过', wrong: '待追查', not_learned: '尚未学习', assisted: '已看解析', skip: '已跳过' }[r.outcome]) + '</span></div>').join('') + '</div></section>';
  }
  function submit(outcome) {
    const p = profile(), s = p.session, q = currentQ();
    if (!q || feedback) return;
    selected = q.type === 'numeric' ? ($('#answer-input')?.value || '').trim() : selected;
    if (!outcome) {
      if (!selected) { message = '请先填写或选择一个答案，也可以选择“暂时不会”。'; render(); $('#answer-input')?.focus(); return; }
      const result = DiagEngine.judgeQuestion(q, selected).verdict;
      if (result === 'manual') { message = '这个写法暂时无法自动判断。请检查答案格式，也可以跳过，本题不会因此记错。'; render(); $('#answer-input')?.focus(); return; }
      outcome = result === 'correct' ? 'correct' : 'wrong';
    }
    const r = E.record(s, p.records, outcome, { userAnswer: selected, elapsedMs: Date.now() - questionStarted });
    message = '';
    if (s.mode === 'practice') { feedback = { record: r }; save(); render(); }
    else advance();
  }
  function advance() {
    const p = profile(), s = p.session;
    feedback = null; selected = ''; message = ''; E.next(s, p.records); questionStarted = Date.now();
    if (s.finished && s.mode === 'diagnose') p.latestDiagnosis = JSON.parse(JSON.stringify(s));
    save(); go(s.finished ? 'finished' : 'session');
  }
  function finishNow() {
    const p = profile(), s = p.session;
    if (!s) return;
    s.finished = true; s.finishReason = '你主动结束了本次答题，结果只反映已经测到的部分';
    if (s.mode === 'diagnose') p.latestDiagnosis = JSON.parse(JSON.stringify(s));
    feedback = null; save(); go('finished');
  }
  function finished() {
    const p = profile(), s = p.session;
    if (!s) return home();
    const deferredCount = [...E.deferred(s)].filter(id => s.scopeIds.includes(id)).length;
    const rootCount = s.rootIds?.length || 0;
    return '<div class="session-wrap"><section class="card finished"><div class="finished-icon">' + svg('check') + '</div><div class="eyebrow">A CLEARER NEXT STEP</div><h2 style="margin-top:12px">' + (s.mode === 'diagnose' ? '这次测评，找到了新的线索。' : '又向前走了一小步。') + '</h2><p>完成 ' + s.answers.length + ' 道题，直接检查 ' + new Set(s.answers.filter(r => ['correct', 'wrong'].includes(r.outcome)).map(r => r.topicId)).size + ' 个知识点。' + (s.mode === 'diagnose' ? '<br>本轮暂缓逐点追问 ' + deferredCount + ' 个范围内前置知识，复核 ' + rootCount + ' 个薄弱候选。' : '') + '</p><p style="font-size:11px">' + esc(s.finishReason || (s.answers.length >= s.limit ? '已到本次题量上限；尚未完成的追查会在报告中保留。' : '本次可检查的关键点已完成。')) + '</p><button class="primary" data-nav="report">查看能力报告 ' + svg('arrow') + '</button><button class="secondary" data-nav="practice">去针对性练习</button></section>' + route(s) + '</div>';
  }
  function latestFindings() {
    const s = profile().latestDiagnosis;
    if (!s) return '';
    const roots = s.rootIds || [];
    const deferredCount = [...E.deferred(s)].filter(id => s.scopeIds.includes(id)).length;
    return '<section class="card" style="margin-bottom:22px"><div class="card-title"><h2>' + svg('link') + ' 最近一次自适应发现</h2><span class="sub">' + s.answers.length + ' 题 · ' + deferredCount + ' 个前置点暂缓追问</span></div>' + (roots.length ? roots.map(id => { const t = E.byId[id]; const related = [...new Set(s.answers.filter(r => r.outcome === 'wrong' && r.topicId !== id && E.ancestors(r.topicId).has(id)).map(r => E.byId[r.topicId].name))]; const untested = (E.prerequisites[id] || []).filter(p => !s.answers.some(r => r.topicId === p)); return '<div class="finding"><span class="finding-icon">◎</span><div><strong>' + esc(t.name) + '</strong><p>两道独立题目未通过，建议优先补习。' + (related.length ? '它也可能影响「' + related.map(esc).join('」「') + '」。' : '') + '</p><small>' + (untested.length ? '还有 ' + untested.length + ' 个直接先修未逐一检查；这里仍是薄弱候选。' : '本次已检查相关直接先修，或它没有更早的硬先修。') + '</small></div><button class="secondary" data-focus="' + esc(id) + '">练习 ' + svg('arrow') + '</button></div>'; }).join('') : '<div class="notice" style="margin-bottom:0">' + (s.answers.some(r => r.outcome === 'wrong') ? '发现了需要继续检查的知识点，但证据还不足以确认薄弱源头。可以继续测评，或先练习报告中的待复测项。' : '已测题目暂未暴露明确薄弱点。暂缓追问的前置知识仍未得到独立测量。') + '</div>') + '<p class="subtle" style="margin-top:16px">答对题目只会改变后续选题，不会把未测的先修知识自动标成掌握。</p></section>';
  }
  function report() {
    const p = profile(), r = E.report(p.records, db.config), percentage = r.total ? r.tested / r.total * 100 : 0;
    const items = r.list.filter(t => reportFilter === 'all' ? t.status !== 'unknown' : t.status === reportFilter).sort((a, b) => ({ weak: 0, shaky: 1, checking: 2, secure: 3, notlearned: 4, unknown: 5 }[a.status] - { weak: 0, shaky: 1, checking: 2, secure: 3, notlearned: 4, unknown: 5 }[b.status]));
    return header('每一点进步，都有迹可循。', '把实际作答与推测分开，让下一步练习有据可依。', 'YOUR LEARNING MAP') + '<div class="print-title">' + esc(p.name) + ' · 七年级数学 · ' + new Date().toLocaleDateString('zh-CN') + '</div>' + configFilters() + latestFindings() + '<div class="report-grid"><section class="card"><div class="card-title"><h2>所选范围的测评覆盖</h2><span class="sub">已测 / 全部知识点</span></div><div class="report-overview"><div class="ring" style="background:conic-gradient(#8fb56c ' + percentage + '%,#edf2e6 0)"><div><b class="mono">' + r.tested + '<span style="font-size:13px;color:#a0ac95"> / ' + r.total + '</span></b><small>直接测过</small></div></div><div><h3 style="line-height:1.8">先把有限的题，<br>用在有价值的地方。</h3><p class="subtle" style="margin-top:12px">覆盖比例不等于正确率，<br>也不代表全年级能力分数。</p></div></div></section><section class="card"><div class="card-title"><h2>知识状态</h2><span class="sub">累计独立作答证据</span></div><div class="report-status">' + ['secure', 'shaky', 'weak', 'checking', 'unknown', 'notlearned'].map(k => '<div><b class="mono" style="color:' + ({ weak: '#ba8770', secure: '#73975b', checking: '#a18cb4' }[k] || '#7b8d6f') + '">' + r.counts[k] + '</b><small>' + E.labels[k] + '</small></div>').join('') + '</div></section></div><div class="notice">“较稳”需至少 3 道不同题目的证据，近 6 道中正确率至少 80%，且通过标准或提高题；一道题答对仍为“待复测”。同一道题反复答对不会增加独立证据。</div><section class="card"><div class="card-title"><h2>知识点明细</h2><div class="history-tools"><select id="report-filter" class="select" style="font-size:11px;padding:7px;min-height:34px" aria-label="按掌握状态筛选">' + [['all', '已测与未学'], ...Object.entries(E.labels)].map(([k, v]) => '<option value="' + k + '"' + (reportFilter === k ? ' selected' : '') + '>' + v + '</option>').join('') + '</select><button class="text-btn" data-action="print">打印</button></div></div>' + (items.length ? '<div class="topic-list">' + items.map(t => '<div class="topic-row"><div><div class="topic-name">' + esc(t.topic.name) + '</div><div class="topic-sub">' + esc(E.chapter(t.topic)) + ' · ' + (t.n ? '最近 ' + t.n + ' 道不同题目：' + t.correct + ' 对 / ' + t.wrong + ' 错' : '没有可用于判断的独立作答') + '</div></div><div class="topic-actions">' + tag(t.status) + (t.status !== 'unknown' && t.status !== 'notlearned' ? '<button class="text-btn" data-focus="' + t.topic.id + '">去练习 →</button>' : '') + '</div></div>').join('') + '</div>' : '<div class="empty">' + svg('chart') + '这里还没有相应记录。<br>完成一次短测评，逐步了解自己的学习情况。<br><button class="primary" data-nav="home">开始测评</button></div>') + '</section>';
  }
  function practice() {
    const p = profile();
    const rootIds = p.latestDiagnosis?.rootIds || [];
    const recs = E.recommendations(p.records, db.config).sort((a, b) => Number(rootIds.includes(b.topic.id)) - Number(rootIds.includes(a.topic.id))).slice(0, 9);
    return header('从值得补的地方，开始练。', '先补共用的基础，再回到原来的难点；作答后立即查看解析。', 'PRACTICE WITH A PURPOSE') + configFilters() + '<div class="notice">练习会优先选择未做过的题。持续答错时降低难度，表现变稳后逐步提高；看过解析的作答不计入独立掌握证据。</div>' + (recs.length ? '<div class="recommend-grid">' + recs.map((r, i) => '<section class="card rec-card"><div class="rec-no">' + String(i + 1).padStart(2, '0') + '</div><span class="badge ' + (rootIds.includes(r.topic.id) ? 'amber' : '') + '">' + (rootIds.includes(r.topic.id) ? '优先补习' : E.labels[r.evidence.status]) + '</span><div class="eyebrow" style="font-size:9px;letter-spacing:1px">' + gradeName(r.topic.grade) + ' · ' + esc(r.topic.domain) + '</div><h3>' + esc(r.topic.name) + '</h3><p>' + esc(r.reason) + (r.blocked.length ? '<br>相关基础：' + r.blocked.map(id => esc(E.byId[id].name)).join('、') : '') + '</p><button class="primary" data-focus="' + r.topic.id + '">' + (r.evidence.status === 'checking' ? '换新题试试' : '开始练习') + svg('arrow') + '</button></section>').join('') + '</div>' : '<section class="card"><div class="empty">' + svg('leaf') + '先测一小段，再练得更有方向。<br>完成测评后，这里会按实际表现推荐知识点。<br><button class="primary" data-nav="home">去做自适应测评 ' + svg('arrow') + '</button></div></section>');
  }
  function history() {
    const p = profile();
    const activeId = p.session && !p.session.finished && p.session.mode === 'diagnose' ? p.session.id : null;
    const activeLearningId = p.learningRun && !p.learningRun.finished && ['diagnose', 'plan'].includes(p.learningRun.phase) ? p.learningRun.id : null;
    const records = p.records.filter(r => r.sessionId !== activeId && r.sessionId !== activeLearningId).slice().reverse();
    const rows = records.slice(0, historyLimit).map(r => {
      const q = E.bank[r.topicId]?.find(q => q.id === r.questionId) || LearningUnit.questions.find(q => q.id === r.questionId);
      if (!q) return '';
      const independent = r.outcome === 'correct' && !r.assisted && !r.repeated;
      const label = r.assisted ? '辅助作答' : r.repeated ? '重复巩固' : ({ correct: '独立通过', wrong: '需要再练', assisted: '已看解析', not_learned: '未学', skip: '跳过' }[r.outcome]);
      const mode = r.mode === 'learning' ? '能力提升' : r.mode === 'diagnose' ? '测评' : '练习';
      return '<article class="history-entry"><div class="history-head"><div><span class="badge">' + esc(E.byId[r.topicId].name) + '</span><span class="muted" style="font-size:10px;margin-left:9px">' + mode + ' · ' + new Date(r.at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</span></div><span class="status-tag ' + (independent ? 'tag-secure' : r.outcome === 'wrong' ? 'tag-weak' : 'tag-checking') + '">' + label + '</span></div><p class="history-prompt">' + esc(q.prompt) + '</p><div class="history-answer">我的答案：' + esc(r.userAnswer || (r.outcome === 'wrong' ? '暂时不会' : '—')) + (r.steps ? '<br>关键步骤：' + esc(r.steps) : '') + (r.hintCount ? '<br>提示次数：' + r.hintCount : '') + '</div>' + (r.coaching ? '<p class="subtle">' + (r.coaching.source === 'ai' ? 'AI 推测' : '本地指导') + '：' + esc(r.coaching.hypothesis) + '（待检查验证）</p>' : '') + '<details><summary>查看参考答案和解析</summary><p>参考答案：' + esc(q.answer) + '<br>' + esc(q.explanation) + '</p></details></article>';
    }).join('');
    return header('回头看，每一步都有收获。', '保留真实作答、关键步骤与指导记录，独立完成和辅助作答分开呈现。', 'YOUR LEARNING JOURNEY') + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px"><span class="subtle">共 ' + p.records.length + ' 条记录' + (activeId || activeLearningId ? ' · 进行中的起点短测答案暂不开放' : '') + '</span><button class="secondary" data-action="export">' + svg('download') + ' 导出记录</button></div><section class="card">' + (records.length ? rows + (records.length > historyLimit ? '<button class="text-btn" data-action="more-history">再显示 30 条</button>' : '') : '<div class="empty">' + svg('clock') + '每一道认真作答的题，都会留在这里。</div>') + '</section>';
  }
  function go(nextView) { view = nextView; message = ''; render(); window.scrollTo({ top: 0, behavior: 'instant' }); }
  function showModal(html, ready) { $('#modal-root').innerHTML = '<div class="modal-overlay"><div class="modal" role="dialog" aria-modal="true" aria-label="学生与测评设置">' + html + '</div></div>'; ready?.(); $('#modal-root input, #modal-root button')?.focus(); }
  function closeModal() { $('#modal-root').innerHTML = ''; }
  const learningView = LearningUI.create({
    profile, save, refresh: render, export: exportRecords,
    confirm(title, text, action) {
      showModal('<h2>' + esc(title) + '</h2><p class="subtle">' + esc(text) + '</p><div class="modal-actions" style="margin-top:22px"><button class="secondary" id="learning-cancel">取消</button><button class="primary" id="learning-confirm">确认</button></div>', () => {
        $('#learning-cancel').onclick = closeModal;
        $('#learning-confirm').onclick = () => { closeModal(); action(); };
      });
    }
  });
  function render() {
    renderLegacy();
    $('.nav').insertAdjacentHTML('afterbegin', '<button data-nav="learning" class="' + (view === 'learning' ? 'active' : '') + '">' + svg('leaf') + '能力提升<span class="nav-new">新</span></button>');
    $('.topbar .pill').textContent = '能力提升版 · v0.2';
    if (view === 'learning') {
      const main = $('.main'), topbar = $('.topbar').outerHTML, footer = $('.footer').outerHTML;
      main.innerHTML = topbar + (!storageOK ? '<div class="storage-warning">当前浏览器无法保存，请及时导出学习记录。</div>' : '') + learningView.render() + footer;
    }
    bind();
    if (view === 'learning') learningView.bind();
  }
  function newProfile() {
    showModal('<h2>为学生建立独立记录</h2><p class="subtle">填写昵称即可，所有答题记录保存在这个浏览器。</p><input id="new-name" class="answer-input" placeholder="学生昵称" maxlength="12" aria-label="学生昵称"><div class="modal-actions"><button class="text-btn" id="cancel-profile">取消</button><button class="primary" id="create-profile">建立记录</button></div>', () => {
      $('#cancel-profile').onclick = closeModal;
      const create = () => { const name = $('#new-name').value.trim(); if (!name) { $('#new-name').focus(); return; } const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); db.profiles.push({ id, name, records: [], session: null, latestDiagnosis: null }); db.activeId = id; save(); closeModal(); go('home'); };
      $('#create-profile').onclick = create; $('#new-name').onkeydown = e => { if (e.key === 'Enter') create(); if (e.key === 'Escape') closeModal(); };
    });
  }
  function exportRecords() {
    const p = profile();
    const output = { app: '知数数学能力提升', schemaVersion: 2, exportedAt: new Date().toISOString(), student: p.name, config: db.config, records: p.records, latestDiagnosis: p.latestDiagnosis, learningRun: p.learningRun || null, learningRuns: p.learningRuns || [], learningSeenIds: p.learningSeenIds || [], source: 'https://github.com/xiaoyang111222/cn-math-taxonomy', license: 'CC BY-NC 4.0' };
    const a = document.createElement('a'); const url = URL.createObjectURL(new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' })); a.href = url; a.download = '知数-答题记录-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function bind() {
    document.querySelectorAll('[data-nav]').forEach(el => el.onclick = () => go(el.dataset.nav));
    document.querySelectorAll('[data-config]').forEach(el => el.onchange = () => { db.config[el.dataset.config] = el.value; save(); render(); });
    document.querySelectorAll('[data-limit]').forEach(el => el.onclick = () => { db.config.limit = Number(el.dataset.limit); save(); render(); });
    document.querySelectorAll('[data-choice]').forEach(el => el.onclick = () => { selected = el.dataset.choice; message = ''; render(); });
    document.querySelectorAll('[data-answer]').forEach(el => el.onclick = () => submit(el.dataset.answer));
    document.querySelectorAll('[data-focus]').forEach(el => el.onclick = () => start('practice', [el.dataset.focus]));
    document.querySelectorAll('[data-action]').forEach(el => el.onclick = () => ({ start: () => start('diagnose'), resume: () => { feedback = null; const p = profile(); E.next(p.session, p.records); go(p.session.finished ? 'finished' : 'session'); }, submit: () => submit(), next: advance, finish: finishNow, 'new-profile': newProfile, export: exportRecords, print: () => window.print(), 'more-history': () => { historyLimit += 30; render(); } }[el.dataset.action]?.()));
    if ($('#trace-check')) $('#trace-check').onchange = e => { db.config.trace = e.target.checked; save(); };
    if ($('#profile-select')) $('#profile-select').onchange = e => { db.activeId = e.target.value; feedback = null; selected = ''; save(); go('home'); };
    if ($('#report-filter')) $('#report-filter').onchange = e => { reportFilter = e.target.value; render(); };
    if ($('#answer-input')) { $('#answer-input').oninput = e => selected = e.target.value; $('#answer-input').onkeydown = e => { if (e.key === 'Enter' && !feedback) submit(); }; }
  }
  save(); render();
})();
