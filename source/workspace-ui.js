(function () {
  'use strict';
  const KEY = 'zhishu.ability.v1';
  const T = TopicTrainer.createEngine(MATH_DATA, LearningUnit);
  const E = Ability.createEngine(MATH_DATA);
  const $ = s => document.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const names = '一二三四五六七八九';
  const gradeName = n => names[n - 1] + '年级';
  const chapterName = t => E.chapter(t).replace(/\s+\d+[\d./]*\s*$/, '').replace(/\s+综合与实践$/, '');
  const statusNames = { secure: '较稳定', weak: '需加强', shaky: '巩固中', checking: '初步了解', unknown: '未练习', notlearned: '尚未学习' };
  const paths = {
    book: '<path d="M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4z"/><path d="M12 5v15M7 8h2m-2 4h2m6-4h2m-2 4h2"/>',
    brand: '<path d="M5 6h6v5H5zM13 13h6v5h-6zM14 5h4v4M6 15v4h4"/><path d="m14 9 5-5M5 20l5-5"/>',
    arrow: '<path d="M4 12h15m-5-5 5 5-5 5"/>', chevron: '<path d="m8 10 4 4 4-4"/>',
    chart: '<path d="M4 4v16h16M8 15v-4m4 4V7m4 8v-6"/>', check: '<path d="m5 12 4 4L19 6"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>', plus: '<path d="M12 5v14M5 12h14"/>',
    spark: '<path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4zM20 3v4m-2-2h4"/>',
    bulb: '<path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 .7-1 1.5-1 2H9c0-.5 0-1.3-1-2z"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    edit: '<path d="m15 4 5 5-11 11H4v-5zM13 6l5 5"/>', download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
    back: '<path d="M20 12H4m6-6-6 6 6 6"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>'
  };
  const icon = n => '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (paths[n] || '') + '</svg>';
  const brand = () => '<div class="brand"><span class="brand-mark">' + icon('brand') + '</span>知数</div>';
  let storageOK = true, db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (_) { storageOK = false; }
  if (!db || db.version !== 1 || !Array.isArray(db.profiles) || !db.profiles.length) db = { version: 1, activeId: 'student-1', profiles: [{ id: 'student-1', name: '体验同学', records: [] }], config: { grade: 7 } };
  if (!db.profiles.some(p => p.id === db.activeId)) db.activeId = db.profiles[0].id;
  db.config ||= {}; db.ui ||= { screen: 'grades', selectedGrade: null };
  if (!['grades', 'practice', 'report'].includes(db.ui.screen)) db.ui.screen = 'grades';
  let mobileOpen = false, note = '', modalReturnFocus = null, analysisBusy = false, aiStatus = { configured: false }, statusRequested = false, searchTimer;
  const profile = () => db.profiles.find(p => p.id === db.activeId);
  const grade = () => Number(profile().grade || db.config.grade || 7);
  function space() {
    const p = profile(); p.records ||= []; p.spaces ||= {};
    return p.spaces[grade()] ||= { semester: '上', topicId: null, runs: {}, query: '' };
  }
  const topic = () => T.topics[space().topicId];
  const run = () => space().runs[space().topicId];
  const gradeTopics = () => MATH_DATA.topics.filter(t => t.grade === grade());
  const visibleTopics = () => gradeTopics().filter(t => space().semester === 'all' || t.semester === space().semester);
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (_) { storageOK = false; } }
  function track(pct) { return '<div class="progress-track" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100" aria-label="掌握进度"><span style="width:' + pct + '%"></span></div>'; }
  function sourceFooter() { return '<footer class="source-footer"><span>知数 · 每一次练习，都算进步</span><details><summary>来源与学习记录</summary><p>题目基于 <a href="https://github.com/xiaoyang111222/cn-math-taxonomy" target="_blank" rel="noopener">cn-math-taxonomy</a> 与程序变式，待教师审核。遵照 <a href="https://creativecommons.org/licenses/by-nc/4.0/deed.zh-hans" target="_blank" rel="noopener">CC BY-NC 4.0</a>。学习记录保存在本浏览器。</p></details></footer>'; }
  function gradePage() {
    const selected = Number(db.ui.selectedGrade), last = profile().grade;
    const cards = grades => '<div class="grade-grid">' + grades.map(g => '<button class="grade-card ' + (selected === g ? 'selected' : '') + '" data-grade="' + g + '" aria-pressed="' + (selected === g) + '"><span class="grade-number">' + String(g).padStart(2, '0') + '</span><div><b>' + gradeName(g) + '</b><small>' + (last === g ? '上次学习' : (g <= 6 ? '小学数学' : '初中数学')) + '</small></div><span class="grade-check">' + icon('check') + '</span></button>').join('') + '</div>';
    return '<div class="grade-page"><header class="grade-top">' + brand() + '<span class="top-label">' + icon('book') + ' 数学学习空间</span></header><main class="grade-content"><div class="grade-steps" aria-label="学习步骤"><span class="current"><i class="step-circle">1</i>选择年级</span><i class="step-line"></i><span><i class="step-circle">2</i>知识点学习</span><i class="step-line"></i><span><i class="step-circle">3</i>能力报告</span></div><div class="grade-heading"><div><h1>选择你的年级</h1><p>今天，从适合自己的地方开始。</p></div><div class="grade-emblem">' + icon('book') + '</div></div><div class="school-heading">小学</div>' + cards([1, 2, 3, 4, 5, 6]) + '<div class="school-heading">初中</div>' + cards([7, 8, 9]) + '<div class="grade-bottom"><p>' + (selected ? '已选择 ' + gradeName(selected) + ' · 数学' : '选择后，进入对应年级的学习空间') + '</p><button class="primary" data-action="enter"' + (!selected ? ' disabled' : '') + '>进入学习 ' + icon('arrow') + '</button></div>' + sourceFooter() + '</main></div>';
  }
  function curriculum() {
    const s = space(), query = s.query.trim().toLowerCase();
    const filtered = visibleTopics().filter(t => !query || (t.name + t.chapter).toLowerCase().includes(query));
    const groups = new Map(); filtered.forEach(t => { const name = chapterName(t); if (!groups.has(name)) groups.set(name, []); groups.get(name).push(t); });
    return '<div class="curriculum"><div class="curriculum-head"><b>知识目录</b><span>' + visibleTopics().length + ' 个知识点</span></div><div class="semester-tabs" role="group" aria-label="册次">' + [['上', '上册'], ['下', '下册'], ['all', '全册']].map(([value, text]) => '<button data-semester="' + value + '" class="' + (s.semester === value ? 'active' : '') + '" aria-pressed="' + (s.semester === value) + '">' + text + '</button>').join('') + '</div><label class="search-wrap">' + icon('search') + '<input class="search-input" id="topic-search" aria-label="搜索本年级知识点" placeholder="搜索知识点" value="' + esc(s.query) + '"></label><div class="topic-scroll">' + (filtered.length ? [...groups].map(([name, list], index) => '<details class="chapter" data-chapter="' + esc(name) + '"' + (query || list.some(t => t.id === s.topicId) || !s.topicId && index === 0 || s.openChapters?.includes(name) ? ' open' : '') + '><summary>' + icon('chevron') + '<span>' + esc(name.replace(/^[一二三四五六七八九][上下]\s*/, '')) + '</span><small>' + list.length + '</small></summary>' + list.map(t => { const ev = T.evidence(profile().records, t.id); return '<button class="topic-button ' + (t.id === s.topicId ? 'active' : '') + '" data-topic="' + t.id + '"' + (t.id === s.topicId ? ' aria-current="true"' : '') + ' title="' + esc(t.name) + '"><i class="topic-dot ' + ev.status + '"></i><span class="topic-name">' + esc(t.name) + '</span>' + (ev.n ? '<span class="topic-score">' + ev.progress + '%</span>' : '') + '</button>'; }).join('') + '</details>').join('') : '<div class="no-topics">没有找到相关知识点</div>') + '</div></div>';
  }
  function sidebar() { const p = profile(); return '<aside class="sidebar" aria-label="学习导航"><div class="side-top">' + brand() + '<button class="grade-switch" data-action="grades" aria-label="切换年级"><span>' + gradeName(grade()) + ' <span class="muted">· 数学</span></span>' + icon('chevron') + '</button></div><nav class="side-tabs" aria-label="主导航"><button data-nav="practice" class="' + (db.ui.screen === 'practice' ? 'active' : '') + '">' + icon('book') + '学习练习</button><button data-nav="report" class="' + (db.ui.screen === 'report' ? 'active' : '') + '">' + icon('chart') + '能力报告</button></nav>' + curriculum() + '<div class="side-profile"><div class="avatar">' + esc(p.name.slice(0, 1)) + '</div><div class="profile-name"><select id="profile-select" aria-label="切换学生">' + db.profiles.map(x => '<option value="' + esc(x.id) + '"' + (x.id === p.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select><small>独立学习记录</small></div><button class="text-button" data-action="new-profile" aria-label="新建学生" title="新建学生">' + icon('plus') + '</button></div></aside>'; }
  function topbar() { return '<header class="topbar"><div class="breadcrumbs"><button class="mobile-menu" data-action="mobile" aria-label="展开知识目录">' + icon('menu') + '</button><span>' + gradeName(grade()) + '数学</span>' + icon('chevron') + '<b>' + (db.ui.screen === 'report' ? '能力报告' : '学习练习') + '</b></div><div class="top-right"><span class="saved"><i></i>' + (storageOK ? '进度已保存' : '暂未保存') + '</span><button class="secondary" data-nav="' + (db.ui.screen === 'report' ? 'practice' : 'report') + '">' + icon(db.ui.screen === 'report' ? 'back' : 'chart') + (db.ui.screen === 'report' ? '返回练习' : '能力报告') + '</button></div></header>'; }
  function mastery(t, r) {
    const ev = T.evidence(profile().records, t.id), level = r?.current ? Math.max(0, T.levels.indexOf(T.items[r.current.questionId]?.difficulty)) : r?.level ?? 1;
    const passedLevel = i => i < level && ev.recent.some(a => a.outcome === 'correct' && a.difficulty === T.levels[i]);
    return '<section class="mastery-panel" aria-label="本知识点掌握进度"><div><div class="mastery-label"><b>掌握进度</b><span class="mastery-value">' + ev.progress + '<small>%</small></span></div>' + track(ev.progress) + '<div class="mastery-note">' + statusNames[ev.status] + ' <span style="margin:0 5px">·</span> ' + (ev.n ? ev.n + ' 道独立作答' : '从第一道练习开始') + '</div></div><div class="difficulty-path" aria-label="练习难度">' + T.levelNames.map((name, i) => (i ? '<i class="difficulty-connector"></i>' : '') + '<div class="difficulty-step ' + (i === level ? 'current' : passedLevel(i) ? 'done' : '') + '"><i>' + (passedLevel(i) ? '✓' : '0' + (i + 1)) + '</i>' + name + '</div>').join('') + '</div></section>';
  }
  function questionCard(t, r) {
    if (r.finished) return '<section class="question-card"><div class="empty"><div class="empty-icon">' + icon('check') + '</div><h2>' + esc(r.reason || '本轮练习已完成') + '</h2><p>完成 ' + r.answers.length + ' 题，继续积累下一点进步。</p><button class="primary" data-nav="report">查看能力报告 ' + icon('arrow') + '</button><div style="margin-top:13px"><button class="text-button" data-action="new-round">再练一轮</button><button class="text-button" data-action="next-topic">下一个知识点</button></div></div></section>';
    const f = r.feedback, q = T.items[f ? f.record.questionId : r.current?.questionId];
    if (!q) return '<section class="question-card empty"><h2>当前暂无可用练习</h2><button class="secondary" data-action="next-topic">下一个知识点</button></section>';
    const level = T.levels.indexOf(q.difficulty), draft = r.draft || {};
    const meta = '<div class="question-top"><div class="question-meta"><span class="tag">' + T.levelNames[level] + '</span><span>' + (q.type === 'choice' ? '选择题' : '填空题') + (r.current?.repeated ? ' · 复习题' : '') + '</span></div><span class="question-number">' + String(f ? r.answers.length : r.answers.length + 1).padStart(2, '0') + ' <span style="color:#c1c9d7">/ 本轮</span></span></div>';
    if (f) {
      const a = f.record, correct = a.outcome === 'correct', label = a.outcome === 'not_learned' ? '已记录为尚未学习' : a.outcome === 'skip' ? '这一题先放一放' : correct ? a.assisted ? '提示后完成' : '回答正确' : '再检查一下这一步';
      return '<section class="question-card" aria-label="作答反馈">' + meta + '<div class="question-prompt">' + esc(q.prompt) + '</div><div class="feedback-box ' + (!correct ? 'wrong' : '') + '" role="status"><b>' + icon(correct ? 'check' : 'bulb') + label + '</b>' + esc(f.transition) + '</div>' + (['correct', 'wrong'].includes(a.outcome) ? '<div class="explanation"><div class="answer-comparison"><span>你的答案 <b>' + esc(a.userAnswer || '暂时不会') + '</b></span><span>参考答案 <b>' + esc(q.answer) + '</b></span></div><small>解题思路</small>' + esc(q.explanation) + '</div>' : '') + '<div class="question-bottom"><button class="text-button" data-nav="report">' + icon('chart') + '查看报告</button><button class="primary" data-action="next">下一题 ' + icon('arrow') + '</button></div></section>';
    }
    return '<section class="question-card" aria-label="知识点练习">' + meta + '<div class="question-prompt">' + esc(q.prompt) + '</div>' + (q.type === 'choice' ? '<div class="choices" role="group" aria-label="答案选项">' + q.choices.map(c => '<button class="choice ' + (draft.answer === c.key ? 'selected' : '') + '" data-choice="' + esc(c.key) + '" aria-pressed="' + (draft.answer === c.key) + '"><span>' + esc(c.key) + '</span>' + esc(c.text) + '</button>').join('') + '</div>' : '<div class="question-help">填写你的答案</div><div class="answer-field"><input class="answer-input" id="practice-answer" type="text" autocomplete="off" aria-label="练习答案" placeholder="在这里输入答案" value="' + esc(draft.answer) + '"></div>') + '<details class="working-details"' + (draft.steps ? ' open' : '') + '><summary>' + icon('edit') + ' 添加解题步骤</summary><textarea id="practice-steps" maxlength="1000" aria-label="解题步骤" placeholder="写下关键的一步，也可以直接提交答案">' + esc(draft.steps) + '</textarea></details>' + (r.current.assisted ? '<div class="hint-box" role="status">' + esc(t.description) + (t.mastery_criteria?.length ? '<br>' + esc(t.mastery_criteria[0]) : '') + '</div>' : '') + (note ? '<p class="notice-inline" role="alert">' + esc(note) + '</p>' : '') + '<div class="question-bottom"><div class="question-secondary"><button class="text-button" data-action="hint">' + icon('bulb') + '一点提示</button><button class="text-button" data-action="skip">暂时不会</button><button class="text-button" data-action="unlearned">还没学过</button></div><button class="primary" data-action="submit">提交答案 ' + icon('arrow') + '</button></div></section>';
  }
  function practicePage() {
    const t = topic(); if (!t) return '<div class="empty"><h2>从左侧选择一个知识点</h2><p>开始今天的练习。</p></div>';
    const r = run();
    return '<div class="topic-heading"><div><div class="eyebrow"><i class="eyebrow-line"></i>' + esc(chapterName(t).replace(/^[一二三四五六七八九][上下]\s*/, '')) + '</div><h1 tabindex="-1" id="page-heading">' + esc(t.name) + '</h1></div><div class="heading-actions"><button class="text-button" data-action="lesson">' + icon('book') + (space().lesson ? '收起知识点' : '看看知识点') + '</button></div></div>' + mastery(t, r) + questionCard(t, r) + '<div class="learning-tail"><span>' + (r.finished ? '本轮已完成' : '本轮已练 ' + r.answers.length + ' 题') + ' <span style="margin:0 5px">·</span> ' + (r.phase === 'diagnose' && !r.finished ? '了解起点' : T.levelNames[r.level]) + '</span><button class="text-button" data-action="next-topic">下一个知识点 ' + icon('arrow') + '</button></div>' + (space().lesson ? '<section class="topic-lesson"><h2>' + esc(t.name) + '</h2><p>' + esc(t.description) + '</p><ul>' + (t.mastery_criteria || []).map(c => '<li>' + esc(c) + '</li>').join('') + '</ul></section>' : '');
  }
  function reportData() {
    const ids = new Set(gradeTopics().map(t => t.id));
    const records = profile().records.filter(r => ids.has(r.topicId));
    const rows = gradeTopics().map(t => ({ id: t.id, name: t.name, chapter: chapterName(t), ...T.evidence(records, t.id) }));
    const tested = rows.filter(t => t.total), weak = tested.filter(t => ['weak', 'shaky'].includes(t.status));
    const unique = rows.reduce((n, t) => n + t.n, 0), correct = rows.reduce((n, t) => n + t.correct, 0);
    return { grade: grade(), at: Date.now(), total: records.length, independent: unique, correct, tested: tested.length, stable: rows.filter(t => t.stable).length, weak: weak.length, rows, recordCount: records.length, records: records.slice(-30), ai: null };
  }
  function reportPage() {
    const report = profile().reports?.[grade()];
    const intro = '<div class="report-heading"><div><div class="eyebrow"><i class="eyebrow-line"></i>' + gradeName(grade()) + ' · 数学</div><h1 tabindex="-1" id="page-heading">能力水平报告</h1><p>' + (report ? '更新于 ' + new Date(report.at).toLocaleString('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '看看已经走过的路，找到下一步。') + '</p></div><button class="primary" data-action="generate-report"' + (analysisBusy ? ' disabled' : '') + '>' + icon('spark') + (analysisBusy ? '正在分析' : report ? '更新报告' : '生成报告') + '</button></div>';
    if (!report) return intro + '<div class="report-prompt empty"><div class="empty-icon">' + icon('chart') + '</div><h2>你的学习进展，就在这里</h2><p>根据已经完成的练习，生成本年级的能力水平报告。</p><button class="primary" data-action="generate-report">生成能力报告 ' + icon('arrow') + '</button></div>';
    const rows = report.rows.filter(t => t.total).sort((a, b) => a.progress - b.progress), weak = rows.filter(t => ['weak', 'shaky'].includes(t.status));
    const unknown = report.rows.filter(t => !t.total), recommendations = [...weak, ...rows.filter(t => t.status === 'checking'), ...unknown].slice(0, 3);
    const rate = report.independent ? Math.round(report.correct / report.independent * 100) : 0;
    const stats = [['累计练习', report.total, '题'], ['独立作答正确率', report.independent ? rate : '—', report.independent ? '%' : ''], ['已练知识点', report.tested, '/ ' + report.rows.length], ['需要巩固', report.weak, '项']];
    const ai = report.ai;
    const analysis = report.total ? '<p>已练习 <strong>' + report.tested + '</strong> 个知识点，完成 <strong>' + report.total + '</strong> 道练习。' + (report.independent ? '最近各知识点的新题独立作答中，通过 <strong>' + report.correct + ' / ' + report.independent + '</strong> 道。' : '目前还没有足够的新题独立作答记录。') + '</p>' + (weak.length ? '<p>接下来优先巩固 <strong>' + weak.slice(0, 2).map(t => esc(t.name)).join('、') + '</strong>。</p>' : report.stable ? '<p><strong>' + report.stable + '</strong> 个知识点的作答较稳定，可以尝试进阶练习。</p>' : '<p>目前的作答线索还较少，可以继续用不同的新题确认。</p>') : '<p>当前还没有练习记录。先选一个知识点，完成几道题，再回来看看。</p>';
    return intro + '<div class="report-stats">' + stats.map(([label, value, unit]) => '<div class="stat-card"><div class="stat-label">' + label + '</div><div class="stat-value">' + value + '<small>' + unit + '</small></div></div>').join('') + '</div><div class="report-grid"><section class="report-panel"><h2>知识点掌握情况 <span class="tag">' + report.tested + ' 项已练习</span></h2>' + (rows.length ? rows.map(t => '<div class="report-topic"><button data-topic="' + t.id + '">' + esc(t.name) + '</button><span>' + t.progress + '%</span>' + track(t.progress) + '</div>').join('') : '<div class="empty"><p>完成练习后，这里会显示各知识点进度。</p></div>') + '</section><section class="report-panel"><h2>' + icon('spark') + '学习分析<span class="tag ' + (ai?.source === 'ai' ? 'green' : '') + '">' + (analysisBusy ? 'AI 分析中' : ai?.source === 'ai' ? 'AI 分析' : '本地分析') + '</span></h2><div class="report-analysis">' + (ai?.source === 'ai' ? '<p>' + esc(ai.summary) + '</p>' : analysis) + recommendations.map((t, i) => '<div class="analysis-step"><span class="analysis-number">0' + (i + 1) + '</span><div><strong>' + esc(t.name) + '</strong><p style="margin:3px 0 6px">' + (t.total ? t.status === 'weak' ? '先用基础新题把方法练稳。' : '换一道新题，继续确认和巩固。' : '还没有练习记录，可以从这里继续。') + '</p><button data-topic="' + t.id + '">去练习 ' + icon('arrow') + '</button></div></div>').join('') + (ai?.source === 'ai' && ai.advice ? '<p>' + esc(ai.advice) + '</p>' : '') + '<div class="analysis-notice">' + (aiStatus.configured ? '<label><input type="checkbox" id="report-ai"' + (profile().aiConsent ? ' checked' : '') + '> 更新报告时使用 AI 分析</label><br>' : 'AI 服务尚未连接，当前使用实际作答记录生成分析。<br>') + '掌握进度表示练习证据，不是考试分数。未练习、辅助作答与重复题分别记录。' + (report.aiError ? '<br>' + esc(report.aiError) : '') + '</div></div></section></div><div class="report-actions"><button class="text-button" data-action="print">' + icon('download') + '保存 / 打印报告</button><button class="text-button" data-action="export">导出学习记录 ' + icon('download') + '</button></div>' + (report.records.length ? '<section class="history-list"><h2>最近练习</h2>' + report.records.slice(-8).reverse().map(r => '<div class="history-row"><div><strong>' + esc(T.topics[r.topicId]?.name || '') + '</strong><small>' + new Date(r.at).toLocaleString('zh-CN') + ' · ' + ({ basic: '基础', standard: '标准', advanced: '进阶' }[r.difficulty] || '练习') + '</small></div><span class="tag ' + (r.outcome === 'correct' && !r.assisted ? 'green' : 'amber') + '">' + (r.outcome === 'not_learned' ? '尚未学习' : r.outcome === 'skip' ? '暂未作答' : r.assisted ? '提示后作答' : r.repeated ? '重复巩固' : r.outcome === 'correct' ? '独立通过' : '需要再练') + '</span></div>').join('') + '</section>' : '');
  }
  function render(focusHeading = false) {
    const sidebarScroll = $('.topic-scroll')?.scrollTop || 0;
    if (db.ui.screen !== 'grades') ensureTopic();
    $('#app').innerHTML = db.ui.screen === 'grades' ? gradePage() : '<div class="workspace ' + (mobileOpen ? 'mobile-open' : '') + '"><button class="mobile-shade" data-action="mobile" aria-label="收起知识目录"></button>' + sidebar() + '<main class="workspace-main">' + topbar() + '<div class="learning-content">' + (!storageOK ? '<div class="storage-warning">当前浏览器未能保存进度，可在能力报告中导出学习记录。</div>' : '') + (db.ui.screen === 'report' ? reportPage() : practicePage()) + sourceFooter() + '</div></main></div>';
    bind(); if ($('.topic-scroll')) $('.topic-scroll').scrollTop = sidebarScroll;
    save(); if (focusHeading) $('#page-heading')?.focus({ preventScroll: true });
  }
  function ensureTopic() {
    const s = space(), list = visibleTopics();
    if (!list.some(t => t.id === s.topicId)) s.topicId = list.find(t => T.bank[t.id]?.length)?.id || list[0]?.id || null;
    if (s.topicId) {
      let r = s.runs[s.topicId];
      if (!r || r.current && !T.items[r.current.questionId]) r = s.runs[s.topicId] = T.create(s.topicId, profile().records);
      T.next(r, profile().records);
    }
  }
  function go(screen, capture = true) { if (capture) captureDraft(); note = ''; mobileOpen = false; db.ui.screen = screen; render(true); window.scrollTo?.({ top: 0, behavior: 'instant' }); if (screen === 'report') checkStatus(); }
  function selectTopic(id) {
    const t = T.topics[id]; if (!t || t.grade !== grade()) return;
    captureDraft(); space().topicId = id;
    if (space().semester !== 'all') space().semester = t.semester;
    space().lesson = false; note = ''; mobileOpen = false; go('practice', false);
  }
  function captureDraft() {
    if (db.ui.screen !== 'practice') return;
    const r = run(); if (!r?.current || r.feedback) return;
    r.draft ||= {};
    if ($('#practice-answer')) r.draft.answer = $('#practice-answer').value;
    if ($('#practice-steps')) r.draft.steps = $('#practice-steps').value;
    save();
  }
  function submit(outcome) {
    const r = run(); if (!r?.current || r.feedback) return;
    captureDraft(); const q = T.items[r.current.questionId], answer = String(r.draft.answer || '').trim();
    if (!outcome) {
      if (!answer) { note = '先填写答案，或选择“暂时不会”。'; render(); return; }
      const verdict = DiagEngine.judgeQuestion(q, answer).verdict;
      if (verdict === 'manual') { note = '请只填写数值，也可以输入分数，例如 1/2。'; render(); return; }
      outcome = verdict === 'correct' ? 'correct' : 'wrong';
    }
    T.record(r, profile().records, outcome, { userAnswer: answer, steps: String(r.draft.steps || '').slice(0, 1000) }); note = ''; render();
  }
  async function checkStatus() {
    if (statusRequested || !/^https?:$/.test(location.protocol)) return;
    statusRequested = true;
    try { const res = await fetch('/api/status', { signal: AbortSignal.timeout(3500) }); if (res.ok) { const data = await res.json(); if (data.app === 'zhishu-math') aiStatus = { configured: !!data.configured }; } } catch (_) {}
    if (db.ui.screen === 'report') render();
  }
  async function generateReport() {
    const owner = profile(), selectedGrade = grade(), report = reportData();
    (owner.reports ||= {})[selectedGrade] = report;
    if (!aiStatus.configured || !owner.aiConsent || !report.total) { render(true); return; }
    analysisBusy = true; render();
    try {
      const response = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grade: selectedGrade, topics: report.rows.filter(t => t.total).map(t => ({ id: t.id, attempts: t.total, independent: t.n, correct: t.correct, status: t.status })), recent: report.records.slice(-8).map(r => ({ questionId: r.questionId, topicId: r.topicId, outcome: r.outcome, steps: r.steps || '', assisted: !!r.assisted, repeated: !!r.repeated })) }), signal: AbortSignal.timeout(25000) });
      const result = await response.json();
      if (!response.ok || result.source !== 'ai' || typeof result.summary !== 'string') throw Error('unavailable');
      report.ai = result;
    } catch (_) { report.aiError = 'AI 暂时不可用，本地报告和学习进度已保留。'; }
    finally { analysisBusy = false; save(); if (profile() === owner && grade() === selectedGrade && db.ui.screen === 'report') render(); }
  }
  function modal(content, bindModal) {
    modalReturnFocus = document.activeElement;
    $('#modal-root').innerHTML = '<div class="modal-overlay"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">' + content + '</section></div>';
    bindModal(); $('.modal input, .modal button')?.focus();
    $('.modal-overlay').onkeydown = e => {
      if (e.key === 'Escape') closeModal();
      if (e.key === 'Tab') { const nodes = [...$('.modal').querySelectorAll('input,button')]; const first = nodes[0], last = nodes.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    };
  }
  function closeModal() { $('#modal-root').innerHTML = ''; modalReturnFocus?.focus(); }
  function exportRecords() {
    const payload = { app: '知数', version: APP_VERSION, exportedAt: new Date().toISOString(), profile: profile() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = '知数-学习记录.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function bind() {
    document.querySelectorAll('[data-grade]').forEach(el => el.onclick = () => { db.ui.selectedGrade = Number(el.dataset.grade); render(); });
    document.querySelectorAll('[data-nav]').forEach(el => el.onclick = () => go(el.dataset.nav));
    document.querySelectorAll('[data-topic]').forEach(el => el.onclick = () => selectTopic(el.dataset.topic));
    document.querySelectorAll('[data-semester]').forEach(el => el.onclick = () => { captureDraft(); space().semester = el.dataset.semester; space().query = ''; render(true); });
    document.querySelectorAll('[data-choice]').forEach(el => el.onclick = () => { captureDraft(); if (!run()?.current || run().feedback) return; run().draft.answer = el.dataset.choice; note = ''; render(); });
    document.querySelectorAll('[data-action]').forEach(el => el.onclick = () => {
      const action = el.dataset.action;
      if (action === 'enter') { const value = Number(db.ui.selectedGrade); if (value >= 1 && value <= 9) { profile().grade = value; db.config.grade = value; go('practice'); } }
      else if (action === 'grades') { db.ui.selectedGrade = grade(); go('grades'); }
      else if (action === 'mobile') { captureDraft(); mobileOpen = !mobileOpen; render(); }
      else if (action === 'submit') submit();
      else if (action === 'skip') submit('skip');
      else if (action === 'unlearned') submit('not_learned');
      else if (action === 'hint') { captureDraft(); if (run()?.current) run().current.assisted = true; render(); }
      else if (action === 'next') { if (!run()?.feedback) return; run().feedback = null; T.next(run(), profile().records); note = ''; render(); }
      else if (action === 'lesson') { captureDraft(); space().lesson = !space().lesson; if (space().lesson && run()?.current) run().current.assisted = true; render(); }
      else if (action === 'new-round') { space().runs[space().topicId] = T.create(space().topicId, profile().records); render(); }
      else if (action === 'next-topic') { const list = visibleTopics(), index = list.findIndex(t => t.id === space().topicId); selectTopic(list[(index + 1) % list.length]?.id); }
      else if (action === 'generate-report') generateReport();
      else if (action === 'print') window.print();
      else if (action === 'export') exportRecords();
      else if (action === 'new-profile') modal('<h2 id="modal-title">新建学习档案</h2><input id="new-profile-name" maxlength="16" aria-label="学生昵称" placeholder="填一个昵称"><p style="margin-top:12px">每位同学各自保留学习进度。</p><div class="modal-actions"><button class="secondary" id="cancel-profile">取消</button><button class="primary" id="create-profile">创建</button></div>', () => {
        $('#cancel-profile').onclick = closeModal;
        $('#create-profile').onclick = () => { const name = $('#new-profile-name').value.trim(); if (!name) return; captureDraft(); const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); db.profiles.push({ id, name, records: [] }); db.activeId = id; db.ui.selectedGrade = null; closeModal(); go('grades', false); };
      });
    });
    if ($('#practice-answer')) { $('#practice-answer').oninput = captureDraft; $('#practice-answer').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }; }
    if ($('#practice-steps')) $('#practice-steps').oninput = captureDraft;
    if ($('#topic-search')) $('#topic-search').oninput = e => { captureDraft(); const value = e.target.value, cursor = e.target.selectionStart; space().query = value; clearTimeout(searchTimer); searchTimer = setTimeout(() => { render(); const input = $('#topic-search'); input?.focus(); input?.setSelectionRange?.(cursor, cursor); }, 120); };
    if ($('#profile-select')) $('#profile-select').onchange = e => { captureDraft(); db.activeId = e.target.value; db.ui.selectedGrade = profile().grade || null; go('grades', false); };
    if ($('#report-ai')) $('#report-ai').onchange = e => { profile().aiConsent = e.target.checked; save(); };
    document.querySelectorAll('[data-chapter]').forEach(el => el.ontoggle = () => { space().openChapters = [...document.querySelectorAll('[data-chapter]')].filter(d => d.open).map(d => d.dataset.chapter); save(); });
  }
  render();
  if (db.ui.screen === 'report') checkStatus();
})();
