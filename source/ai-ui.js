(function (root) {
  'use strict';
  const C = root.AILearning;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stageNames = { diagnose: '了解起点', probe: '错因小检查', prerequisite: '补一个基础', hint: '分步练习', practice: '定向巩固', challenge: '进阶挑战', retest: '独立复测' };
  root.AITutorUI = {
    create(options) {
      let busy = false, notice = '', clock = { id: null, at: 0, ms: 0 }, connection = null;
      const currentOwner = () => options.getProfile();
      const redraw = owner => { options.save(); if (currentOwner() === owner) options.render(); };
      const view = owner => owner.aiUnit?.view;
      function time(qid) {
        if (clock.id !== qid) clock = { id: qid, at: Date.now(), ms: 0 };
        return clock;
      }
      function accrue(force = false) { if (clock.id && clock.at && (force || !document.hidden)) clock.ms += Math.max(0, Date.now() - clock.at); clock.at = Date.now(); }
      document.addEventListener('visibilitychange', () => { if (document.hidden) accrue(true); clock.at = document.hidden ? 0 : Date.now(); });
      async function post(action, data) {
        const response = await fetch('/api/unit/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(35000) });
        const result = await response.json(); if (!response.ok) throw Error(result.error || '本次操作未完成。'); return result;
      }
      function merge(owner, result) {
        owner.records ||= []; const ids = new Set(owner.records.map(r => r.id).filter(Boolean));
        for (const r of result.attempts) if (!ids.has(r.id)) { owner.records.push({ ...r }); ids.add(r.id); }
        if (currentOwner() === owner && result.question) options.onQuestion?.(result.question.topicId);
      }
      function capture() {
        const owner = currentOwner(), unit = owner.aiUnit;
        if (!unit) return;
        unit.draft ||= {};
        const answer = document.querySelector('#ai-answer'), steps = document.querySelector('#ai-steps');
        if (answer) unit.draft.answer = answer.value;
        if (steps) unit.draft.steps = steps.value;
        options.save();
      }
      async function start() {
        const owner = currentOwner(), previous = owner.aiUnit;
        busy = true; notice = ''; redraw(owner);
        try {
          if (/^https?:$/.test(location.protocol)) {
            try { connection = await (await fetch('/api/status', { signal: AbortSignal.timeout(3000) })).json(); } catch (_) { connection = null; }
          }
          if (connection?.app === 'zhishu-math') {
            const result = await post('start', { aiEnabled: previous?.view?.aiEnabled ?? true, previousSessionId: previous?.mode === 'server' ? previous.sessionId : undefined });
            owner.aiUnit = { mode: 'server', sessionId: result.id, view: result, draft: {} };
          } else {
            const state = C.create({ aiEnabled: false });
            if (previous?.mode === 'offline') { state.attempts = previous.state.attempts.slice(-150); state.exposed = previous.state.exposed.slice(-300); state.roundStart = state.attempts.length; state.limit += state.roundStart; }
            C.next(state); owner.aiUnit = { mode: 'offline', state, view: C.view(state), draft: {} };
            notice = '当前使用本地教学。运行带后端的版本并连接 AI，可启用模型决策。';
          }
          merge(owner, owner.aiUnit.view);
        } catch (e) { notice = e.message; }
        finally { busy = false; redraw(owner); }
      }
      async function operate(action, extra = {}) {
        if (busy) return;
        const owner = currentOwner(), unit = owner.aiUnit; if (!unit) return;
        capture(); busy = true; notice = ''; accrue(); redraw(owner);
        try {
          const qid = unit.view.question?.id;
          const input = { sessionId: unit.sessionId, revision: unit.view.revision, questionId: qid, answer: unit.draft?.answer || '', steps: unit.draft?.steps || '', activeMs: Math.min(1800000, clock.ms), ...extra };
          let result;
          if (unit.mode === 'server') result = await post(action, input);
          else {
            const state = unit.state;
            if (action === 'answer') { C.record(state, input.answer, input.steps, input.activeMs, input.outcome); C.applyPlan(state, C.localPlan(state)); }
            else if (action === 'hint') C.hint(state);
            else if (action === 'reveal') C.reveal(state);
            else if (action === 'retry') C.retry(state);
            else if (action === 'next') { C.next(state); state.revision++; }
            else if (action === 'mode') { state.aiEnabled = false; notice = '本地文件使用规则指导，连接后端后可开启 AI。'; }
            else if (action === 'report') state.report = { source: 'rules', summary: '当前按新题独立作答生成单元画像，辅助完成与重复题单独记录。', advice: '继续用不同的新题验证待确认卡点。', at: Date.now() };
            result = C.view(state);
          }
          unit.view = result; if (['next', 'retry'].includes(action)) unit.draft = {};
          merge(owner, result);
        } catch (e) {
          notice = e.message;
          if (unit.mode === 'server') { try { unit.view = await post('resume', { sessionId: unit.sessionId }); merge(owner, unit.view); } catch (_) {} }
        } finally { busy = false; redraw(owner); }
      }
      function sourceLabel(v) {
        const plan = v.nextPlan || v.decisions?.at(-1);
        if (plan?.source === 'ai') return (plan.provider || 'AI') + ' 教学安排';
        if (plan) return '本地教学安排';
        return v.aiEnabled && connection?.configured ? 'AI 指导已开启' : '本地教学指导';
      }
      function controls(owner, v) {
        return '<div class="ai-mode"><label><input id="ai-enabled" type="checkbox"' + (v.aiEnabled ? ' checked' : '') + (busy ? ' disabled' : '') + '> 使用 AI 教学指导</label><span>' + esc(sourceLabel(v)) + '</span>' + (/^https?:$/.test(location.protocol) ? '<a href="/setup" target="_blank" rel="noopener">AI 连接设置</a>' : '') + '</div><details class="ai-privacy"><summary>关于指导和作答记录</summary><p>开启 AI 后，将向已连接的服务发送本题作答、关键步骤及少量近期记录，不发送昵称。模型负责选择教学动作和组织提示；题目与证据由程序检查。当前为实验原型，尚未经过学生数据校准。</p></details>';
      }
      function render() {
        const owner = currentOwner(), unit = owner.aiUnit, v = view(owner);
        const heading = '<div class="topic-heading"><div><div class="eyebrow">七年级 · 一元一次方程</div><h1 id="page-heading" tabindex="-1">从卡住的一步，继续向前</h1><p class="ai-subtitle">小检查 · 一步提示 · 新题独立验证</p></div><button class="text-button" data-ai="exit">返回知识点练习</button></div>';
        if (!v) return heading + '<section class="question-card ai-intro"><span class="tag">单元学习实验</span><h2>先做一道短题</h2><p>根据你的作答与关键步骤，安排接下来的检查、提示和练习。</p><button class="primary" data-ai="start"' + (busy ? ' disabled' : '') + '>' + (busy ? '正在准备…' : '开始学习') + '</button>' + (notice ? '<p role="alert">' + esc(notice) + '</p>' : '') + '</section>';
        if (v.finished) return heading + '<section class="question-card ai-complete"><span class="tag">本轮已完成</span><h2>每一次独立完成，都是新的线索。</h2><p>' + esc(v.finishReason) + '</p><button class="primary" data-ai="report-nav">查看学习画像</button><button class="text-button" data-ai="start">再开始一轮</button></section>';
        const q = v.question; if (!q) return heading + '<p>正在准备下一道题…</p>';
        if (!v.feedback) time(q.id);
        const draft = unit.draft || {}, disabled = busy ? ' disabled' : '', f = v.feedback;
        const hint = v.hint ? '<div class="ai-hint" role="status"><span>第 ' + v.hintCount + ' 层线索' + (v.hintSource === 'ai' ? ' · AI 提示' : '') + '</span><p>' + esc(v.hint) + '</p></div>' : '';
        const answer = Object.hasOwn(q, 'answer') ? '<details class="ai-solution" open><summary>' + (v.revealed ? '已查看完整解答 · 本题后续作答记为辅助完成' : '本题解题过程') + '</summary><p>' + esc(q.explanation) + '</p></details>' : '';
        const inputs = q.type === 'choice' ? '<div class="choices" role="group" aria-label="答案选项">' + q.choices.map(c => '<button data-ai-choice="' + c.key + '" class="choice ' + (draft.answer === c.key ? 'selected' : '') + '" aria-pressed="' + (draft.answer === c.key) + '"' + disabled + '><span>' + c.key + '</span>' + esc(c.text) + '</button>').join('') + '</div>' : '<label class="question-help" for="ai-answer">' + (q.type === 'expression' ? '填写化简后的式子' : '填写你的答案') + '</label><div class="answer-field"><input id="ai-answer" class="answer-input" autocomplete="off" aria-label="AI学习答案" placeholder="' + (q.type === 'expression' ? '例如 -x + 3' : '填写数值或分数') + '" value="' + esc(draft.answer || '') + '"' + disabled + '></div>';
        const feedback = f ? '<div class="feedback-box ' + (f.record.outcome === 'correct' ? '' : 'wrong') + '" role="status"><b>' + esc(f.label) + '</b><p>' + esc(v.nextPlan?.reason || '正在安排下一步…') + '</p>' + (f.diagnosis ? '<small>待检查的线索：' + esc(f.diagnosis.label) + '</small>' : '') + '</div>' : '';
        const bottom = f ? '<div class="question-bottom"><div class="question-secondary">' + (f.record.outcome === 'wrong' ? '<button class="text-button" data-ai="retry"' + disabled + '>按线索再试一次</button>' : '') + '<button class="text-button" data-ai="report-nav">查看报告</button></div><button class="primary" data-ai="next"' + disabled + '>' + (busy ? '正在安排…' : esc(C.actionNames[v.nextPlan?.action] || '继续学习')) + '</button></div>' : '<div class="question-bottom"><div class="question-secondary"><button class="text-button" data-ai="hint"' + disabled + '>一点提示</button><button class="text-button" data-ai="skip"' + disabled + '>暂时不会</button><button class="text-button" data-ai="unlearned"' + disabled + '>还没学过</button></div><button class="primary" data-ai="submit"' + disabled + '>' + (busy ? '正在分析…' : '提交答案') + '</button></div>';
        return heading + '<section class="question-card ai-card"><div class="question-top"><div class="question-meta"><span class="tag">' + esc(stageNames[v.phase] || '继续学习') + '</span><span>' + esc(C.skills[q.skillId].name) + '</span></div><span class="question-number">' + String(v.attempts.length + (f ? 0 : 1)).padStart(2, '0') + '</span></div><div class="question-prompt">' + esc(q.prompt) + '</div>' + (f ? feedback : inputs + '<details class="working-details"' + (draft.steps ? ' open' : '') + '><summary>添加关键一步</summary><textarea id="ai-steps" maxlength="1000" aria-label="AI学习关键步骤" placeholder="写下你最关键的一步，能帮助检查卡点"' + disabled + '>' + esc(draft.steps || '') + '</textarea></details>') + hint + answer + (notice ? '<p class="notice-inline" role="alert">' + esc(notice) + '</p>' : '') + bottom + '</section><div class="ai-secondary-line"><span>' + esc(C.levelNames[q.level]) + (q.origin === 'ai-parameters' ? ' · AI 定向变式，已校验' : ' · 校验题') + '</span><div>' + (f && f.record.outcome === 'wrong' ? '<button class="text-button" data-ai="hint"' + disabled + '>再给一点线索</button>' : '') + (!Object.hasOwn(q, 'answer') ? '<button class="text-button" data-ai="reveal"' + disabled + '>查看完整解答</button>' : '') + '</div></div>' + controls(owner, v);
      }
      function radar(dims) {
        const point = (i, radius) => { const angle = -Math.PI / 2 + i * Math.PI * 2 / 5; return [180 + Math.cos(angle) * radius, 136 + Math.sin(angle) * radius]; };
        let svg = '<svg class="ai-radar" viewBox="0 0 360 290" role="img" aria-label="五维单元学习画像，证据不足的维度留空">';
        for (let level = 1; level <= 4; level++) svg += '<polygon points="' + dims.map((d, i) => point(i, level * 22).join(',')).join(' ') + '" fill="none" stroke="#e5ebf7"/>';
        dims.forEach((d, i) => { const p = point(i, 88), label = point(i, 119); svg += '<line x1="180" y1="136" x2="' + p[0] + '" y2="' + p[1] + '" stroke="#e5ebf7"/><text x="' + label[0] + '" y="' + label[1] + '" text-anchor="middle" fill="#66758e" font-size="12">' + esc(d.name) + '</text>'; });
        if (dims.every(d => d.value !== null)) svg += '<polygon points="' + dims.map((d, i) => point(i, d.value / 100 * 88).join(',')).join(' ') + '" fill="#3167e825" stroke="#3167e8" stroke-width="2"/>';
        dims.forEach((d, i) => { if (d.value !== null) { const p = point(i, d.value / 100 * 88); svg += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4" fill="#3167e8"/>'; } });
        return svg + '</svg>';
      }
      function report(owner = currentOwner()) {
        const v = view(owner); if (!v?.attempts?.length) return '';
        const dims = v.dimensions, independent = C.independent(v.attempts), assisted = v.attempts.filter(r => r.assisted).length;
        return '<section class="ai-unit-report"><div class="ai-report-heading"><div><div class="eyebrow">一元一次方程 · 单元画像</div><h2>从作答证据看见下一步</h2></div><span class="tag">实验性表现指标</span></div><div class="ai-report-grid"><div>' + radar(dims) + '<p class="ai-report-note">每一维至少有 3 道不同新题的独立作答才显示估计点。证据不足保持留空，不计为零分。</p></div><div class="ai-dimension-list">' + dims.map(d => '<div class="ai-dimension"><div><b>' + esc(d.name) + '</b><small>' + d.correct + ' / ' + d.n + ' 道新题独立通过</small></div><span>' + (d.value === null ? esc(d.status) : d.value + ' / 100') + '</span></div>').join('') + '<p class="ai-report-note">这些值是带平滑的单元答题表现，不是标准化能力分数；题目难度尚未校准。</p></div></div><div class="ai-evidence-counts"><span>' + independent.length + ' 次独立作答</span><span>' + assisted + ' 次辅助作答</span><span>' + v.attempts.filter(r => r.repeated).length + ' 次重复作答</span></div>' + (v.hypotheses.length ? '<div class="ai-roots"><h3>需要继续确认的卡点</h3>' + v.hypotheses.map(h => '<p><b>' + esc(h.label) + '</b><span>' + esc(h.status) + ' · ' + h.evidenceIds.length + ' 条作答引用</span></p>').join('') + '</div>' : '') + (v.report ? '<div class="report-analysis"><span class="tag">' + (v.report.source === 'ai' ? esc(v.report.provider || 'AI') + ' 分析' : '本地分析') + '</span><p>' + esc(v.report.summary) + '</p><p>' + esc(v.report.advice) + '</p></div>' : '') + '<div class="ai-report-actions"><button class="secondary" data-ai="report"' + (busy ? ' disabled' : '') + '>' + (busy ? '正在更新…' : '更新单元分析') + '</button><button class="text-button" data-ai="continue">继续本单元学习</button></div><details class="ai-decision-log"><summary>查看教学安排与估计依据</summary><p>能力估计 θ = ' + v.estimate.theta + '，估计不确定性（后验标准差）' + v.estimate.sd + '。使用人工预设难度的简化 IRT，未经学生数据校准；65%～75%仅为选题试验目标，不代表已测得心流。</p>' + v.decisions.slice(-6).reverse().map(p => '<div><span class="tag">' + (p.source === 'ai' ? 'AI 决策' : '本地决策') + '</span><b>' + esc(C.actionNames[p.action]) + ' · ' + esc(C.skills[p.targetSkill].name) + '</b><p>' + esc(p.reason) + '</p><small>引用 ' + p.evidenceIds.length + ' 条作答记录</small></div>').join('') + '</details></section>';
      }
      function bind() {
        document.querySelectorAll('[data-ai-choice]').forEach(el => el.onclick = () => { if (busy) return; capture(); currentOwner().aiUnit.draft.answer = el.dataset.aiChoice; redraw(currentOwner()); });
        document.querySelectorAll('[data-ai]').forEach(el => el.onclick = () => {
          const action = el.dataset.ai;
          if (action === 'start') start();
          else if (action === 'exit') { capture(); options.exit(); }
          else if (action === 'continue') options.continue();
          else if (action === 'report-nav') { capture(); options.goReport(); }
          else if (action === 'submit') operate('answer');
          else if (action === 'skip' || action === 'unlearned') operate('answer', { outcome: action === 'skip' ? 'skip' : 'not_learned' });
          else operate(action);
        });
        for (const id of ['#ai-answer', '#ai-steps']) { const input = document.querySelector(id); if (input) { input.oninput = capture; if (id === '#ai-answer') input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); operate('answer'); } }; } }
        const enable = document.querySelector('#ai-enabled'); if (enable) enable.onchange = e => operate('mode', { aiEnabled: e.target.checked });
      }
      return { render, report, bind, start, capture, operate };
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
