(function (root) {
  'use strict';
  const C = root.AILearning;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stageNames = { diagnose: '了解起点', probe: '错因小检查', prerequisite: '基础小检查', hint: '分步练习', practice: '定向巩固', challenge: '进阶挑战', retest: '独立复测' };
  root.AITutorUI = {
    create(options) {
      let busy = false, notice = '', clock = { id: null, at: 0, ms: 0 }, connection = null;
      const currentOwner = () => options.getProfile();
      const currentGrade = () => options.getGrade?.() || 7;
      const unitFor = (owner, grade = currentGrade()) => grade === 7 ? owner.aiUnit : owner.aiUnits?.[grade];
      function setUnit(owner, unit, grade) {
        const previous = unitFor(owner, grade);
        if (previous && !previous.view.finished && previous.view.task?.status !== 'verified' && previous.view.id !== unit.view.id && previous.view.goal) {
          owner.aiPausedUnits ||= {}; owner.aiPausedUnits[grade + ':' + previous.view.goal.skillId] = previous;
        }
        if (grade === 7) owner.aiUnit = unit; else { owner.aiUnits ||= {}; owner.aiUnits[grade] = unit; }
      }
      const redraw = owner => { options.save(); if (currentOwner() === owner) options.render(); };
      const view = owner => unitFor(owner)?.view;
      function applyView(unit, result) {
        if (result.question && unit.view?.question?.id === result.question.id && (unit.view.question.contentRevision || 0) !== (result.question.contentRevision || 0)) {
          unit.draft = {}; notice = '本题内容已更新，请按当前题意重新作答。';
        }
        unit.view = result;
      }
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
        owner.records ||= []; const records = new Map(owner.records.filter(r => r.id).map(r => [r.id, r]));
        for (const r of result.attempts) { if (records.has(r.id)) Object.assign(records.get(r.id), r); else { owner.records.push({ ...r }); records.set(r.id, owner.records.at(-1)); } }
        owner.records = C.auditAttempts(owner.records);
        root.ReviewPlans.update(owner, result, C);
        if (currentOwner() === owner && result.question) options.onQuestion?.(result.question.topicId);
      }
      function capture() {
        const owner = currentOwner(), unit = unitFor(owner);
        if (!unit) return;
        unit.draft ||= {};
        const answer = document.querySelector('#ai-answer'), steps = document.querySelector('#ai-steps');
        if (answer) unit.draft.answer = answer.value;
        if (steps) unit.draft.steps = steps.value;
        options.save();
      }
      async function start(requestedSkill) {
        const owner = currentOwner(), grade = currentGrade(), previous = unitFor(owner, grade);
        const exposedQuestionIds = (owner.records || []).filter(r => r.questionId).map(r => r.questionId + (r.questionRevision ? '@' + r.questionRevision : '')).slice(-150);
        const skill = requestedSkill || document.querySelector('#ai-goal')?.value || previous?.view?.goal?.skillId || options.getTopicId?.() || 'distribute';
        options.onStartGoal?.(skill);
        busy = true; notice = ''; redraw(owner);
        try {
          if (/^https?:$/.test(location.protocol)) {
            try { connection = await (await fetch('/api/status', { signal: AbortSignal.timeout(3000) })).json(); } catch (_) { connection = null; }
          }
          if (connection?.app === 'zhishu-math') {
            const result = await post('start', { skill, grade, exposedQuestionIds, aiEnabled: previous?.view?.aiEnabled ?? true, previousSessionId: previous?.mode === 'server' ? previous.sessionId : undefined });
            setUnit(owner, { mode: 'server', sessionId: result.id, view: result, draft: {} }, grade);
          } else {
            const state = C.create({ skill, aiEnabled: false });
            if (previous?.mode === 'offline') { state.attempts = previous.state.attempts.slice(-150); state.hypotheses = JSON.parse(JSON.stringify(previous.state.hypotheses || [])); state.exposed = previous.state.exposed.slice(-300); state.roundStart = state.attempts.length; state.limit += state.roundStart; }
            C.rememberExposure(state, exposedQuestionIds); C.next(state); setUnit(owner, { mode: 'offline', state, view: C.view(state), draft: {} }, grade);
            notice = '当前使用本地教学。运行带后端的版本并连接 AI，可启用模型决策。';
          }
          merge(owner, unitFor(owner, grade).view);
        } catch (e) { notice = e.message; }
        finally { busy = false; redraw(owner); }
      }
      async function operate(action, extra = {}) {
        if (busy) return;
        const owner = currentOwner(), unit = unitFor(owner); if (!unit) return;
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
            else if (action === 'report') { const facts = C.reportFacts(state); state.report = { source: 'rules', summary: facts.summary, advice: facts.advice, evidenceKey: facts.evidenceKey, at: Date.now() }; }
            result = C.view(state);
          }
          applyView(unit, result); if (['next', 'retry'].includes(action)) unit.draft = {};
          merge(owner, result);
        } catch (e) {
          notice = e.message;
          if (unit.mode === 'server') { try { applyView(unit, await post('resume', { sessionId: unit.sessionId })); merge(owner, unit.view); } catch (_) {} }
        } finally { busy = false; redraw(owner); }
      }
      function sourceLabel(v) {
        const plan = v.nextPlan || v.decisions?.at(-1);
        if (plan?.source === 'ai') return (plan.provider || 'AI') + ' 教学安排';
        if (plan) return '本地教学安排';
        return v.aiEnabled && connection?.configured ? 'AI 指导已开启' : v.aiEnabled && unitIsServer(currentOwner()) ? 'AI 指导待连接确认' : '本地教学指导';
      }
      function controls(owner, v) {
        const q = v.question, itemDetails = q ? '<p>本题：' + esc(C.levelNames[q.level]) + (q.origin === 'ai-parameters' ? ' · AI 定向变式，已校验' : q.origin === 'validated-variant' ? ' · 程序变式，已校验' : ' · 规范题库') + '</p>' : '';

        return '<details class="ai-settings"><summary>学习设置</summary><div class="ai-mode"><label><input id="ai-enabled" type="checkbox"' + (v.aiEnabled ? ' checked' : '') + (busy ? ' disabled' : '') + '> 使用 AI 教学指导</label><span>' + esc(sourceLabel(v)) + '</span>' + (/^https?:$/.test(location.protocol) && unitIsServer(owner) ? '<a href="/setup" target="_blank" rel="noopener">AI 连接设置</a>' : '') + '</div><p class="ai-privacy">开启 AI 后，将向已连接的服务发送本题作答、关键步骤及少量近期记录，不发送昵称。模型负责选择教学动作和组织提示；题目与证据由程序检查。当前为实验原型，尚未经过学生数据校准。</p>' + itemDetails + '</details>';
      }
      function unitIsServer(owner) { return unitFor(owner)?.mode === 'server'; }
      function goalPicker(skill = options.getTopicId?.() || 'distribute') {
        const ids = C.topicsForGrade(currentGrade()).map(t => t.id);
        if (currentGrade() === 7) ids.push(...C.targetSkills);
        return '<label class="ai-goal-picker" for="ai-goal">本次练习目标<select id="ai-goal">' + ids.map(id => '<option value="' + id + '"' + (id === skill ? ' selected' : '') + '>' + esc(C.skills[id].name + (C.targetSkills.includes(id) ? ' · 受控变式实验' : '')) + '</option>').join('') + '</select></label>';
      }
      function taskStrip(v) {
        const task = v.task;
        if (!task) return '';
        const phase = v.phase === 'diagnose' ? 0 : v.phase === 'retest' ? 2 : 1;
        return '<div class="ai-task-strip"><div><span>这次只练一个目标</span><strong>' + esc(task.name) + '</strong></div><div class="ai-task-progress" aria-label="本次独立验证进度">' + task.passed + ' / ' + task.requiredPasses + ' 道新题独立通过<small>已作答 ' + task.used + ' / ' + task.maxAttempts + ' 次</small></div></div><ol class="ai-task-steps" aria-label="本次学习路径">' + ['了解起点', '需要时补一步', '新题独立验证'].map((text, i) => '<li' + (i === phase ? ' aria-current="step"' : '') + '><span>' + (i + 1) + '</span>' + text + '</li>').join('') + '</ol>';
      }
      function render() {
        const owner = currentOwner(), unit = unitFor(owner), v = view(owner);
        const selected = options.getTopicId?.(), switchGoal = v && selected && selected !== v.goal?.skillId && C.skills[v.goal?.skillId]?.curriculum;
        const heading = '<div class="topic-heading"><div><h1 id="page-heading" tabindex="-1">从卡住的一步，继续向前</h1></div><button class="text-button" data-ai="exit">返回知识点练习</button></div>' + (switchGoal ? '<div class="ai-switch-goal">正在继续“' + esc(v.task?.name) + '”。<button class="text-button" data-ai="start-current"' + (busy ? ' disabled' : '') + '>改练所选的“' + esc(C.skills[selected]?.name) + '”</button></div>' : '');
        if (!v) return heading + '<section class="question-card ai-intro"><h2>今天，先弄懂一个卡点</h2><p>先做一道题，卡住时检查或补一步，再换新题独立试。两道新题独立通过就收尾，最多记录 8 次作答。</p>' + goalPicker() + '<button class="primary" data-ai="start"' + (busy ? ' disabled' : '') + '>' + (busy ? '正在准备…' : '开始这个目标') + '</button>' + (notice ? '<p role="alert">' + esc(notice) + '</p>' : '') + '</section>';
        if (v.finished) return heading + '<section class="question-card ai-complete"><span class="tag">' + (v.task?.status === 'verified' ? '本次目标已验证' : '本次练习先到这里') + '</span><h2>' + esc(v.task?.name || '本轮学习记录') + '</h2><p>' + esc(v.finishReason) + '</p><button class="primary" data-ai="report-nav">查看本次小结</button><details class="ai-next-goal"><summary>下次练什么</summary>' + goalPicker(v.task?.skillId) + '<button class="secondary" data-ai="start"' + (busy ? ' disabled' : '') + '>开始一次新练习</button></details></section>';
        const q = v.question; if (!q) return heading + '<p>正在准备下一道题…</p>';
        if (!v.feedback) time(q.id);
        const draft = unit.draft || {}, disabled = busy ? ' disabled' : '', f = v.feedback;
        const hint = v.hint ? '<div class="ai-hint" role="status"><span>第 ' + v.hintCount + ' 层线索' + (v.hintSource === 'ai' ? ' · AI 提示' : '') + '</span><p>' + esc(v.hint) + '</p></div>' : '';
        const answer = Object.hasOwn(q, 'answer') ? '<details class="ai-solution"' + (v.revealed ? ' open' : '') + '><summary>' + (v.revealed ? '已查看完整解答 · 本题后续作答记为辅助完成' : '展开本题解题过程') + '</summary><p>' + esc(q.explanation) + '</p></details>' : '';
        const inputs = q.type === 'choice' ? '<div class="choices" role="group" aria-label="答案选项">' + q.choices.map(c => '<button data-ai-choice="' + c.key + '" class="choice ' + (draft.answer === c.key ? 'selected' : '') + '" aria-pressed="' + (draft.answer === c.key) + '"' + disabled + '><span>' + c.key + '</span>' + esc(c.text) + '</button>').join('') + '</div>' : '<label class="question-help" for="ai-answer">' + (q.type === 'expression' ? '填写化简后的式子' : '填写你的答案') + '</label><div class="answer-field"><input id="ai-answer" class="answer-input" autocomplete="off" aria-label="AI学习答案" placeholder="' + (q.type === 'expression' ? '例如 -x + 3' : currentGrade() <= 2 ? '填一个数，例如 3' : '按题意填写，可用分数或逗号分隔多个数') + '" value="' + esc(draft.answer || '') + '"' + disabled + '></div>';
        const response = f ? '<div class="ai-your-response"><span>你的作答</span><b>' + esc(['skip', 'not_learned'].includes(f.record.outcome) ? f.record.outcome === 'skip' ? '暂时不会' : '还没学过' : f.record.userAnswer) + '</b>' + (f.record.steps ? '<p>关键一步：' + esc(f.record.steps) + '</p>' : '') + '</div>' : '';
        const feedback = f ? response + '<div class="feedback-box ' + (f.record.outcome === 'correct' ? '' : 'wrong') + '" role="status"><b>' + esc(f.label) + '</b><p>' + esc(v.nextPlan?.reason || '正在安排下一步…') + '</p>' + (f.diagnosis ? '<small>待检查的线索：' + esc(f.diagnosis.label) + '</small>' : '') + '</div>' : '';
        const bottom = f ? '<div class="question-bottom"><div class="question-secondary">' + (f.record.outcome === 'wrong' && v.nextPlan?.action !== 'finish' ? '<button class="text-button" data-ai="retry"' + disabled + '>按线索再试一次</button>' : '') + '<button class="text-button" data-ai="report-nav">查看报告</button></div><button class="primary" data-ai="next"' + disabled + '>' + (busy ? '正在安排…' : esc(v.nextPlan?.action === 'finish' ? '查看本次小结' : C.actionNames[v.nextPlan?.action] || '继续学习')) + '</button></div>' : '<div class="question-bottom"><div class="question-secondary"><button class="text-button" data-ai="hint"' + disabled + '>一点提示</button><details class="ai-more-actions"><summary>暂时做不出</summary><button class="text-button" data-ai="skip"' + disabled + '>暂时不会</button><button class="text-button" data-ai="unlearned"' + disabled + '>还没学过</button></details></div><button class="primary" data-ai="submit"' + disabled + '>' + (busy ? '正在分析…' : '提交答案') + '</button></div>';
        return heading + taskStrip(v) + '<section class="question-card ai-card"><div class="question-top"><div class="question-meta"><span class="tag">' + esc(stageNames[v.phase] || '继续学习') + '</span><span>' + esc(C.skills[q.skillId].name) + '</span></div><span class="question-number">' + String((v.task?.used ?? v.attempts.length) + (f ? 0 : 1)).padStart(2, '0') + '</span></div><p class="ai-question-purpose">' + esc(q.purpose || (v.phase === 'diagnose' ? '先独立试一题，看看这一步是否顺手。' : v.phase === 'retest' ? '这道是没见过的新题。先不看提示，试试能否独立完成。' : v.phase === 'prerequisite' || q.skillId !== v.task?.skillId && v.task ? '先检查这个基础，再回到“' + (v.task?.name || '本次目标') + '”。' : v.phase === 'probe' ? C.skills[q.skillId].curriculum ? '先检查“' + C.skills[q.skillId].name + '”这一步。可以写下你是怎么想的。' : '只看答案还不能确定错因。换个数，写出你处理负号或等式的关键一步。' : '需要时用一点提示，再换新题独立验证。')) + '</p><div class="question-prompt">' + esc(q.prompt) + '</div>' + (f ? feedback : inputs + '<details class="working-details"' + (draft.steps ? ' open' : '') + '><summary>添加关键一步</summary><textarea id="ai-steps" maxlength="1000" aria-label="AI学习关键步骤" placeholder="写下你最关键的一步，能帮助检查卡点"' + disabled + '>' + esc(draft.steps || '') + '</textarea></details>') + hint + answer + (notice ? '<p class="notice-inline" role="alert">' + esc(notice) + '</p>' : '') + bottom + '</section><div class="ai-secondary-line"><div>' + (f && f.record.outcome === 'wrong' ? '<button class="text-button" data-ai="hint"' + disabled + '>再给一点线索</button>' : '') + (!Object.hasOwn(q, 'answer') ? '<button class="text-button" data-ai="reveal"' + disabled + '>查看完整解答</button>' : '') + '</div></div>' + controls(owner, v);
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
        const facts = C.reportFacts(v), dims = v.dimensions, counts = facts.counts;
        const summary = '<div class="ai-facts">' + (facts.task ? '<strong>本次目标：' + esc(facts.task.name) + '</strong><p>本次记录 ' + facts.task.used + ' 次作答 · ' + facts.task.passed + ' / ' + facts.task.requiredPasses + ' 道新题独立通过' + (facts.task.status === 'verified' ? ' · 本次已验证，待复习' : v.finished ? ' · 尚需验证' : ' · 进行中') + '</p>' : '') + '<p>' + esc(facts.summary) + '</p><strong>' + esc(facts.advice) + '</strong></div>';
        const categories = [['independent', '道新题独立作答'], ['assisted', '次提示后作答'], ['repeated', '次重复作答'], ['skipped', '次暂时不会'], ['notLearned', '次尚未学习'], ['needsReview', '条旧记录待复核']];
        const evidence = '<div class="ai-evidence-counts">' + categories.filter(([key]) => counts[key] || key === 'independent').map(([key, label]) => '<span>' + counts[key] + ' ' + label + '</span>').join('') + '</div><p class="ai-report-note">以上分类互不重复。单元画像使用累计不同新题；年级概览使用各知识点最近最多六道独立新题。</p>';
        const hypotheses = v.hypotheses.length ? '<div class="ai-roots"><h3>卡点检查记录</h3>' + v.hypotheses.map(h => {
          const closed = ['improved', 'not_supported'].includes(h.statusCode);
          const rows = (h.evidenceIds || []).map(id => v.attempts.find(r => r.id === id)).filter(Boolean);
          return '<article class="ai-root ' + (closed ? 'reviewed' : '') + '"><div><b>' + esc(C.skills[h.rootId]?.name || h.label) + '</b><span class="tag">' + esc(h.status) + '</span></div><p>' + esc(h.explanation) + '</p><small>' + (h.supportIds || []).length + ' 道新题独立未通过 · ' + (h.passingEvidenceIds || []).length + ' 道同等及以上难度新题独立通过</small><details><summary>查看作答依据</summary>' + rows.map(r => {
            let prompt = r.questionId; try { prompt = C.fromId(r.questionId).prompt; } catch (_) {}
            const label = r.evidenceEligible === false ? '旧记录待复核' : r.repeated ? '重复作答' : r.assisted ? '提示后作答' : r.outcome === 'correct' ? '独立通过' : r.outcome === 'wrong' ? '独立未通过' : '未计入判断';
            return '<p><b>' + esc(prompt) + '</b><span>你的作答：' + esc(r.userAnswer) + ' · ' + label + '</span></p>';
          }).join('') + '<p class="ai-report-note">阶段变化：' + (h.history || []).map(e => esc(e.status)).join(' → ') + '</p></details></article>';
        }).join('') + '</div>' : '';
        const foundationChecks = facts.diagnosticChecks.filter(c => c.relation === 'prerequisite');
        const checkList = foundationChecks.length ? '<details class="ai-foundation-checks"><summary>相关基础检查（' + foundationChecks.length + '）</summary><p class="ai-report-note">只统计该基础的新题独立作答；检查结果用于安排下一步，不能据此确定原题错因。</p>' + foundationChecks.map(c => '<article><b>' + esc(c.name) + '</b><span>' + esc(c.label) + '</span><small>' + c.independent + ' 道近期新题独立检查 · ' + c.passingIds.length + ' 道达到本次检查要求</small></article>').join('') + '</details>' : '';
        const roundRows = v.attempts.slice(v.roundStart || 0);
        const responses = '<details class="ai-attempt-log"><summary>查看本次作答（' + roundRows.length + '）</summary>' + roundRows.map(r => {
          let prompt = r.questionId; try { prompt = C.fromId(r.questionId).prompt; } catch (_) {}
          const label = r.evidenceEligible === false ? '旧记录待复核' : r.repeated ? '重复作答' : r.assisted ? '提示后作答' : r.outcome === 'correct' ? '独立通过' : r.outcome === 'wrong' ? '独立未通过' : r.outcome === 'skip' ? '暂时不会' : '还没学过';
          return '<article><b>' + esc(prompt) + '</b><p>你的作答：' + esc(r.userAnswer || label) + ' · ' + label + '</p>' + (r.steps ? '<p>关键一步：' + esc(r.steps) + '</p>' : '') + '</article>';
        }).join('') + '</details>';
        const analysis = v.report ? '<div class="report-analysis"><span class="tag">' + (v.report.source === 'ai' ? esc(v.report.provider || 'AI') + ' 补充建议' : '本地分析') + '</span><p>' + esc(v.report.summary) + '</p><p>' + esc(v.report.advice) + '</p></div>' : v.reportStale ? '<p class="ai-report-note">作答记录已更新，旧的补充分析已收起。可以按最新证据更新单元建议。</p>' : '';
        return '<section class="ai-unit-report"><div class="ai-report-heading"><div><div class="eyebrow">' + '一二三四五六七八九'[(v.grade || currentGrade()) - 1] + '年级 · AI 学习记录</div><h2>本轮进展与下一步</h2></div><span class="tag">实验性表现指标</span></div>' + summary + evidence + responses + hypotheses + checkList + (C.skills[v.goal?.skillId]?.curriculum ? '<p class="ai-report-note">本次按知识点显示实际作答，不将题库标签直接换算为通用五维能力分数。生成本年级报告后，可查看各知识点的进展。</p>' : '<details class="ai-profile-details"><summary>查看五维单元表现</summary><div class="ai-report-grid"><div>' + radar(dims) + '<p class="ai-report-note">每一维至少有 3 道不同新题的独立作答才显示估计点。证据不足保持留空。</p></div><div class="ai-dimension-list">' + dims.map(d => '<div class="ai-dimension"><div><b>' + esc(d.name) + '</b><small>' + d.correct + ' / ' + d.n + ' 道新题独立通过</small></div><span>' + (d.value === null ? esc(d.status) : d.value + ' / 100') + '</span></div>').join('') + '<p class="ai-report-note">单元答题表现经过平滑处理；题目难度尚未校准。</p></div></div></details>') + analysis + '<div class="ai-report-actions"><button class="secondary" data-ai="report"' + (busy ? ' disabled' : '') + '>' + (busy ? '正在更新…' : '更新单元建议') + '</button><button class="text-button" data-ai="continue">' + (v.finished ? '返回本次小结' : '继续本次目标') + '</button></div><details class="ai-decision-log"><summary>查看教学安排与估计依据</summary><p>实验性能力估计 θ = ' + v.estimate.theta + '，估计不确定性（后验标准差）' + v.estimate.sd + '。使用人工预设难度的简化 IRT，未经学生数据校准；65%～75%为练习选题试验目标。</p>' + v.decisions.slice(-6).reverse().map(p => '<div><span class="tag">' + (p.source === 'ai' ? 'AI 决策' : '本地决策') + '</span><b>' + esc(C.actionNames[p.action]) + ' · ' + esc(C.skills[p.targetSkill].name) + '</b><p>' + esc(p.reason) + '</p><small>引用 ' + p.evidenceIds.length + ' 条作答记录</small></div>').join('') + '</details></section>';
      }
      function reviews(owner = currentOwner()) {
        const queue = root.ReviewPlans.queue(owner, currentGrade(), C);
        const paused = Object.entries(owner.aiPausedUnits || {}).filter(([key]) => key.startsWith(currentGrade() + ':'));
        const pausedList = paused.length ? '<details class="ai-paused-list"><summary>继续未完成的练习（' + paused.length + '）</summary>' + paused.map(([key, unit]) => '<button class="text-button" data-ai="resume-task" data-ai-key="' + esc(key) + '">继续“' + esc(unit.view.task?.name || C.skills[unit.view.goal?.skillId]?.name) + '”</button>').join('') + '</details>' : '';
        if (!queue.length) return pausedList;
        const row = p => '<article class="ai-review-row"><div><b>' + esc(p.name) + '</b><small>' + esc(p.label) + ' · ' + (p.due ? '现在可开始' : new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric' }).format(p.dueAt)) + '</small></div><button class="secondary" data-ai="review" data-ai-skill="' + esc(p.skillId) + '"' + (busy ? ' disabled' : '') + '>' + (p.due ? '用新题复习' : '提前练一练') + '</button></article>';
        return '<section class="ai-review-panel"><div class="eyebrow">' + '一二三四五六七八九'[currentGrade() - 1] + '年级 · 复习安排</div><h2>把这次会的，留到下次也会</h2><p>已验证的目标会留在这里。之后换新题试一试，看看能否保持独立完成。</p>' + queue.slice(0, 3).map(row).join('') + (queue.length > 3 ? '<details><summary>还有 ' + (queue.length - 3) + ' 个目标</summary>' + queue.slice(3).map(row).join('') + '</details>' : '') + '<details class="ai-review-policy"><summary>复习安排依据</summary><p>依据两道实际新题独立通过记录，试行按1、3、7天安排复习；提前练习不会不断推迟原定时间。再次独立出错或原证据需复核时，会重新检查。该安排尚未经过真实学生效果验证。</p></details>' + pausedList + '</section>';
      }
      function bind() {
        document.querySelectorAll('[data-ai-choice]').forEach(el => el.onclick = () => { if (busy) return; capture(); unitFor(currentOwner()).draft.answer = el.dataset.aiChoice; redraw(currentOwner()); });
        document.querySelectorAll('[data-ai]').forEach(el => el.onclick = () => {
          const action = el.dataset.ai;
          if (action === 'start') { if (!busy) start(); }
          else if (action === 'start-current') { if (!busy) start(options.getTopicId()); }
          else if (action === 'review') { if (!busy) start(el.dataset.aiSkill).then(() => options.continue()); }
          else if (action === 'resume-task') {
            const owner = currentOwner(), key = el.dataset.aiKey, unit = owner.aiPausedUnits?.[key];
            if (busy || !unit || !key.startsWith(currentGrade() + ':')) return;
            delete owner.aiPausedUnits[key]; setUnit(owner, unit, currentGrade()); options.onStartGoal?.(unit.view.goal.skillId); options.save(); options.continue();
          }
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
      return { render, report, reviews, bind, start, capture, operate };
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
