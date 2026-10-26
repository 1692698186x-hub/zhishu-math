(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KnowledgeGraph = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const chapterOf = t => t.chapter.replace(/\s+\d+[\d./]*\s*$/, '').replace(/\s+综合与实践$/, '');
  const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  function createModel(data, options = {}) {
    const grade = Number(options.grade), semester = options.semester || 'all', chapter = options.chapter || 'all';
    const topics = data.topics.filter(t => t.grade === grade && (semester === 'all' || t.semester === semester) && (chapter === 'all' || chapterOf(t) === chapter));
    const nodes = topics.map(t => ({ id: t.id, topic: t, degree: 0, incoming: [], outgoing: [] }));
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    const unique = new Map();
    for (const dependency of data.dependencies) {
      const source = dependency.prerequisiteId, target = dependency.topicId;
      if (!byId[source] || !byId[target] || source === target) continue;
      const key = source + '|' + target;
      if (!unique.has(key) || dependency.strength === 'hard') unique.set(key, { source, target, strength: dependency.strength === 'soft' ? 'soft' : 'hard', reason: dependency.reason || '' });
    }
    const edges = [...unique.values()];
    edges.forEach(e => { byId[e.source].degree++; byId[e.target].degree++; byId[e.source].outgoing.push(e.target); byId[e.target].incoming.push(e.source); });
    return { grade, nodes, edges, byId };
  }
  function neighborhood(model, id) {
    const node = model.byId[id];
    return node ? { incoming: [...node.incoming], outgoing: [...node.outgoing], all: [...new Set([id, ...node.incoming, ...node.outgoing])] } : { incoming: [], outgoing: [], all: [] };
  }
  function layout(model, width = 880, height = 570) {
    width = Math.max(260, width); height = Math.max(280, height);
    const chapters = [...new Set(model.nodes.map(n => chapterOf(n.topic)))];
    const nodes = model.nodes.map((node, i) => {
      const group = chapters.indexOf(chapterOf(node.topic)), angle = group / Math.max(1, chapters.length) * Math.PI * 2 - Math.PI / 2;
      const anchorX = width / 2 + Math.cos(angle) * width * .23, anchorY = height / 2 + Math.sin(angle) * height * .22;
      const phase = i * 2.39996 + (hash(node.id) % 100) / 100;
      const radius = 20 + Math.sqrt((i + 1) / Math.max(1, model.nodes.length)) * Math.min(width, height) * .17;
      return { ...node, radius: 6.5 + Math.min(7, Math.sqrt(node.degree) * 1.35), x: anchorX + Math.cos(phase) * radius, y: anchorY + Math.sin(phase) * radius, vx: 0, vy: 0, anchorX, anchorY };
    });
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    const spacing = Math.min(1.2, Math.max(.7, Math.sqrt(width * height / Math.max(1, nodes.length)) / 100));
    for (let iteration = 0; iteration < 190; iteration++) {
      const forces = nodes.map(n => ({ x: (n.anchorX - n.x) * .003 + (width / 2 - n.x) * .0007, y: (n.anchorY - n.y) * .003 + (height / 2 - n.y) * .0007 }));
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
        let dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
        if (Math.abs(dx) + Math.abs(dy) < .01) { dx = .1; dy = .1; }
        const distance = Math.max(1, Math.hypot(dx, dy));
        const collision = Math.max(0, nodes[i].radius + nodes[j].radius + 29 - distance) * .16;
        const force = Math.min(7, 1750 * spacing / (distance * distance) + collision);
        const fx = dx / distance * force, fy = dy / distance * force;
        forces[i].x -= fx; forces[i].y -= fy; forces[j].x += fx; forces[j].y += fy;
      }
      for (const edge of model.edges) {
        const a = byId[edge.source], b = byId[edge.target];
        const dx = b.x - a.x, dy = b.y - a.y, distance = Math.max(1, Math.hypot(dx, dy));
        const force = (distance - (edge.strength === 'soft' ? 100 : 78) * spacing) * .013;
        const fx = dx / distance * force, fy = dy / distance * force;
        const ai = nodes.indexOf(a), bi = nodes.indexOf(b);
        forces[ai].x += fx; forces[ai].y += fy; forces[bi].x -= fx; forces[bi].y -= fy;
      }
      nodes.forEach((n, i) => {
        n.vx = (n.vx + forces[i].x) * .76; n.vy = (n.vy + forces[i].y) * .76;
        n.x = Math.max(n.radius + 28, Math.min(width - n.radius - 28, n.x + n.vx));
        n.y = Math.max(n.radius + 30, Math.min(height - n.radius - 42, n.y + n.vy));
      });
    }
    return { width, height, nodes, byId };
  }
  function create(host) {
    const data = host.data, allById = Object.fromEntries(data.topics.map(t => [t.id, t]));
    const state = { grade: null, semester: 'all', chapter: 'all', selected: null, focused: false, query: '', camera: { x: 0, y: 0, scale: 1 } };
    let model, positions, root, svg, observer, gesture, hovered = null, suppressClickId = null;
    const $ = selector => root?.querySelector(selector);
    const chapterName = host.chapterName || chapterOf;
    const colors = ['#65a9ff', '#47d3d4', '#aaa0ff', '#85bbf9'];
    const domainColor = topic => colors[Math.max(0, [...new Set(data.topics.map(t => t.domain))].indexOf(topic.domain)) % colors.length];
    const lineIcon = name => '<svg viewBox="0 0 24 24" class="icon" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">' + ({ search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>', plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>', fit: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>', arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>', network: '<circle cx="5" cy="6" r="3"/><circle cx="19" cy="5" r="2"/><circle cx="12" cy="19" r="3"/><path d="m8 6 9-1M6 9l4 7m7-9-4 9"/>', back: '<path d="M20 12H4m6-6-6 6 6 6"/>' }[name] || '') + '</svg>';
    function build() {
      if (state.grade !== host.getGrade()) { state.grade = host.getGrade(); state.semester = 'all'; state.chapter = 'all'; state.selected = null; state.focused = false; state.query = ''; }
      model = createModel(data, { grade: state.grade, semester: state.semester, chapter: state.chapter });
      if (!model.byId[state.selected]) { state.selected = model.byId[host.getCurrentTopic?.()]?.id || [...model.nodes].sort((a, b) => b.degree - a.degree)[0]?.id || null; state.focused = false; }
      return model;
    }
    function inspector() {
      const node = model.byId[state.selected];
      if (!node) return '<div class="graph-detail-empty">' + lineIcon('network') + '<h2>探索知识之间的联系</h2><p>选择图中的一个知识点。</p></div>';
      const t = node.topic, ev = host.getEvidence(t.id);
      const dependencies = data.dependencies.filter(e => e.topicId === t.id);
      const incomingIds = [...new Set(dependencies.map(e => e.prerequisiteId))].filter(id => allById[id]);
      const outgoingIds = [...new Set(data.dependencies.filter(e => e.prerequisiteId === t.id).map(e => e.topicId))].filter(id => allById[id]?.grade === state.grade);
      function relationList(ids, kind) {
        if (!ids.length) return '<p class="graph-no-relation">' + (kind === 'before' ? '图谱暂未收录前置联系' : '本年级暂无后续联系') + '</p>';
        return '<div class="graph-relation-list">' + ids.map(id => {
          const topic = allById[id], visible = topic.grade === state.grade;
          return '<button class="graph-relation ' + (!visible ? 'outside' : '') + '" data-graph-related="' + id + '"' + (!visible ? ' disabled' : '') + '><i></i><span>' + esc(topic.name) + '</span>' + (topic.grade !== state.grade ? '<small>' + host.gradeName(topic.grade) + '</small>' : lineIcon('arrow')) + '</button>';
        }).join('') + '</div>';
      }
      return '<div class="graph-detail-heading"><span class="graph-detail-kicker">当前知识点</span><span class="tag">' + (ev.n ? '已练习' : '未练习') + '</span></div><h2>' + esc(t.name) + '</h2><p class="graph-detail-chapter">' + esc(chapterName(t).replace(/^[一二三四五六七八九][上下]\s*/, '')) + '</p><p class="graph-detail-description">' + esc(t.description) + '</p><button class="primary graph-learn" data-graph-learn="' + t.id + '">进入学习 ' + lineIcon('arrow') + '</button><section class="graph-relations"><h3><i class="relation-before"></i>前置知识<span>' + incomingIds.length + '</span></h3>' + relationList(incomingIds, 'before') + '</section><section class="graph-relations"><h3><i class="relation-after"></i>后续知识<span>' + outgoingIds.length + '</span></h3>' + relationList(outgoingIds, 'after') + '</section>';
    }
    function render() {
      build();
      const chapters = [...new Set(data.topics.filter(t => t.grade === state.grade && (state.semester === 'all' || t.semester === state.semester)).map(chapterName))];
      return '<section id="knowledge-graph-root" class="knowledge-graph"><div class="graph-heading"><div><div class="eyebrow"><i class="eyebrow-line"></i>' + host.gradeName(state.grade) + ' · 数学</div><h1 id="page-heading" tabindex="-1">知识图谱</h1><p>看见知识的联系，找到下一步。</p></div><div class="graph-totals"><span><b>' + model.nodes.length + '</b>知识点</span><i></i><span><b>' + model.edges.length + '</b>联系</span></div></div><div class="graph-toolbar"><div class="graph-search-wrap">' + lineIcon('search') + '<input id="graph-search" aria-label="查找图谱中的知识点" placeholder="查找知识点" autocomplete="off" value="' + esc(state.query) + '"><div id="graph-search-results" class="graph-search-results" role="list"></div></div><label class="sr-only" for="graph-semester">图谱册次</label><select id="graph-semester" class="graph-filter">' + [['all', '全部册次'], ['上', '上册'], ['下', '下册']].map(([v, text]) => '<option value="' + v + '"' + (state.semester === v ? ' selected' : '') + '>' + text + '</option>').join('') + '</select><label class="sr-only" for="graph-chapter">图谱章节</label><select id="graph-chapter" class="graph-filter graph-chapter-filter"><option value="all">全部章节</option>' + chapters.map(c => '<option value="' + esc(c) + '"' + (state.chapter === c ? ' selected' : '') + '>' + esc(c.replace(/^[一二三四五六七八九][上下]\s*/, '')) + '</option>').join('') + '</select></div><div class="graph-workbench"><div class="graph-network-panel"><div class="graph-panel-top"><span><i></i> KNOWLEDGE NETWORK</span><button id="graph-overview" aria-label="返回全图">' + lineIcon('back') + '全图</button></div><div class="graph-canvas"><svg id="knowledge-network" role="group" aria-label="可交互知识点关系网络"><defs><radialGradient id="graph-glow"><stop offset="0" stop-color="#3064a6" stop-opacity=".2"/><stop offset="1" stop-color="#102849" stop-opacity="0"/></radialGradient><pattern id="graph-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".55" fill="#8cb1e5" opacity=".15"/></pattern><marker id="graph-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#7ebaff"/></marker></defs><rect width="100%" height="100%" fill="url(#graph-grid)"/><rect width="100%" height="100%" fill="url(#graph-glow)"/><g class="graph-camera"><g class="graph-edges"></g><g class="graph-nodes"></g></g></svg><div class="graph-zoom"><button data-graph-zoom="in" aria-label="放大知识图谱">' + lineIcon('plus') + '</button><span id="graph-scale">100%</span><button data-graph-zoom="out" aria-label="缩小知识图谱">' + lineIcon('minus') + '</button><button data-graph-zoom="fit" aria-label="适应画面">' + lineIcon('fit') + '</button></div><div class="graph-empty-network"' + (model.nodes.length ? ' hidden' : '') + '>当前范围暂无知识点</div></div><div class="graph-panel-bottom"><div class="graph-legend"><span><i class="legend-before"></i>前置</span><span><i class="legend-selected"></i>选中</span><span><i class="legend-after"></i>后续</span></div><span class="graph-interaction-hint">拖动节点 · 滚轮缩放</span></div></div><aside id="graph-inspector" class="graph-inspector" aria-label="知识点及其联系">' + inspector() + '</aside></div><div class="graph-source-note"><span>联系来自原项目知识图谱</span><span>实线：先修联系 <i>·</i> 虚线：辅助联系</span></div></section>';
    }
    function edgePath(edge) {
      const a = positions.byId[edge.source], b = positions.byId[edge.target];
      const dx = b.x - a.x, dy = b.y - a.y, distance = Math.max(1, Math.hypot(dx, dy));
      const bend = (hash(edge.source + edge.target) % 2 ? 1 : -1) * Math.min(11, distance * .07);
      const endX = b.x - dx / distance * (b.radius + 3), endY = b.y - dy / distance * (b.radius + 3);
      return 'M' + a.x.toFixed(2) + ',' + a.y.toFixed(2) + 'Q' + ((a.x + b.x) / 2 - dy / distance * bend).toFixed(2) + ',' + ((a.y + b.y) / 2 + dx / distance * bend).toFixed(2) + ' ' + endX.toFixed(2) + ',' + endY.toFixed(2);
    }
    function draw() {
      if (!svg || !positions) return;
      $('.graph-edges').innerHTML = model.edges.map(e => '<path class="graph-link ' + e.strength + '" data-from="' + e.source + '" data-to="' + e.target + '" d="' + edgePath(e) + '"><title>' + esc(model.byId[e.source].topic.name + ' → ' + model.byId[e.target].topic.name + (e.reason ? '：' + e.reason : '')) + '</title></path>').join('');
      $('.graph-nodes').innerHTML = positions.nodes.map(n => '<g class="graph-node" data-graph-node="' + n.id + '" transform="translate(' + n.x.toFixed(2) + ' ' + n.y.toFixed(2) + ')" role="button" tabindex="0" aria-label="知识点：' + esc(n.topic.name) + '"><title>' + esc(n.topic.name) + '</title><circle class="node-halo" r="' + (n.radius + 7) + '" fill="' + domainColor(n.topic) + '"/><circle class="node-ring" r="' + (n.radius + 3) + '"/><circle class="node-core" r="' + n.radius + '" fill="' + domainColor(n.topic) + '"/><circle class="node-highlight" r="' + n.radius * .26 + '" cy="' + -n.radius * .3 + '" cx="' + -n.radius * .25 + '"/><text class="graph-node-label" text-anchor="middle" y="' + (n.radius + 18) + '">' + esc(n.topic.name.length > 9 ? n.topic.name.slice(0, 8) + '…' : n.topic.name) + '</text></g>').join('');
      bindNodes(); paint();
    }
    function paint() {
      if (!root || !svg) return;
      const focus = state.focused ? neighborhood(model, state.selected) : null;
      const connected = new Set(focus?.all || []), incoming = new Set(focus?.incoming || []), outgoing = new Set(focus?.outgoing || []);
      const ranks = [...model.nodes].sort((a, b) => b.degree - a.degree).slice(0, Math.min(15, Math.ceil(model.nodes.length * .45))).map(n => n.id);
      const priority = new Set(ranks), query = state.query.trim().toLowerCase();
      root.querySelectorAll('[data-graph-node]').forEach(el => {
        const id = el.dataset.graphNode, match = query && model.byId[id].topic.name.toLowerCase().includes(query);
        el.classList.toggle('is-selected', id === state.selected);
        el.classList.toggle('is-before', incoming.has(id)); el.classList.toggle('is-after', outgoing.has(id));
        el.classList.toggle('is-dim', query ? !match && id !== state.selected : !!focus && !connected.has(id));
        el.classList.toggle('is-match', !!match); el.classList.toggle('is-hovered', id === hovered);
        const showLabel = id === state.selected || id === hovered || !!match || (focus ? connected.has(id) : state.camera.scale > 1.45 || priority.has(id));
        el.querySelector('text').style.display = showLabel ? '' : 'none';
        el.setAttribute('aria-pressed', String(id === state.selected));
      });
      root.querySelectorAll('.graph-link').forEach(el => {
        const active = state.focused && (el.dataset.from === state.selected || el.dataset.to === state.selected);
        el.classList.toggle('is-active', active); el.classList.toggle('is-dim', state.focused && !active);
        if (active) el.setAttribute('marker-end', 'url(#graph-arrow)'); else el.removeAttribute('marker-end');
      });
      $('.graph-camera').setAttribute('transform', 'translate(' + state.camera.x + ' ' + state.camera.y + ') scale(' + state.camera.scale + ')');
      $('#graph-scale').textContent = Math.round(state.camera.scale * 100) + '%';
    }
    function select(id, center = false) {
      if (!model.byId[id]) return;
      state.selected = id; state.focused = true; state.query = ''; $('#graph-search').value = ''; $('#graph-search-results').innerHTML = '';
      if (center && positions) { const n = positions.byId[id]; state.camera.scale = Math.max(1, state.camera.scale); state.camera.x = positions.width / 2 - n.x * state.camera.scale; state.camera.y = positions.height / 2 - n.y * state.camera.scale; }
      $('#graph-inspector').innerHTML = inspector(); bindInspector(); paint();
    }
    function bindInspector() {
      root.querySelectorAll('[data-graph-related]').forEach(el => el.onclick = () => { if (el.disabled) return; const id = el.dataset.graphRelated; if (!model.byId[id]) { state.semester = 'all'; state.chapter = 'all'; state.selected = id; state.focused = true; refreshView(); } else select(id, true); });
      const learn = $('[data-graph-learn]'); if (learn) learn.onclick = () => host.onLearn(learn.dataset.graphLearn);
    }
    function point(event) {
      const rect = svg.getBoundingClientRect();
      return { x: (event.clientX - rect.left) * positions.width / Math.max(1, rect.width), y: (event.clientY - rect.top) * positions.height / Math.max(1, rect.height) };
    }
    function bindNodes() {
      root.querySelectorAll('[data-graph-node]').forEach(el => {
        const id = el.dataset.graphNode;
        el.onclick = () => { if (suppressClickId === id) { suppressClickId = null; return; } if (state.selected !== id || !state.focused) select(id); };
        el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(id, true); } };
        el.onpointerenter = () => { hovered = id; paint(); }; el.onpointerleave = () => { hovered = null; paint(); };
        el.onpointerdown = e => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); suppressClickId = null; const p = point(e); gesture = { type: 'node', id, start: p, moved: false, pointerId: e.pointerId }; svg.setPointerCapture?.(e.pointerId); };
      });
    }
    function zoom(factor, pivot) {
      const old = state.camera.scale, next = Math.max(.4, Math.min(3.8, old * factor));
      const p = pivot || { x: positions.width / 2, y: positions.height / 2 };
      state.camera.x = p.x - (p.x - state.camera.x) * next / old; state.camera.y = p.y - (p.y - state.camera.y) * next / old; state.camera.scale = next; paint();
    }
    function fit() { state.camera = { x: 0, y: 0, scale: 1 }; paint(); }
    function measure() {
      const rect = typeof svg.getBoundingClientRect === 'function' ? svg.getBoundingClientRect() : null;
      const width = Math.round(rect?.width || svg.clientWidth || 850), height = Math.round(rect?.height || svg.clientHeight || 540);
      if (positions?.width === width && positions?.height === height) return;
      positions = layout(model, width, height); svg.setAttribute('viewBox', '0 0 ' + positions.width + ' ' + positions.height); state.camera = { x: 0, y: 0, scale: 1 }; draw();
    }
    function refreshView() {
      const container = root.parentElement; if (observer) observer.disconnect(); positions = null;
      root.outerHTML = render(); root = container.querySelector('#knowledge-graph-root'); bind();
    }
    function bind() {
      if (observer) observer.disconnect();
      root = document.querySelector('#knowledge-graph-root'); if (!root) return; svg = $('#knowledge-network'); positions = null; measure(); bindInspector();
      $('#graph-search').oninput = e => {
        state.query = e.target.value; const query = state.query.trim().toLowerCase();
        const matches = query ? model.nodes.filter(n => n.topic.name.toLowerCase().includes(query)).slice(0, 7) : [];
        $('#graph-search-results').innerHTML = !query ? '' : matches.length ? matches.map(n => '<button role="listitem" data-graph-result="' + n.id + '">' + esc(n.topic.name) + '<small>' + esc(n.topic.domain) + '</small></button>').join('') : '<p>没有找到本范围的知识点</p>';
        root.querySelectorAll('[data-graph-result]').forEach(el => el.onclick = () => select(el.dataset.graphResult, true)); paint();
      };
      $('#graph-search').onkeydown = e => { if (e.key === 'Escape') { state.query = ''; e.target.value = ''; $('#graph-search-results').innerHTML = ''; paint(); } else if (e.key === 'Enter') { const match = model.nodes.find(n => n.topic.name.includes(state.query.trim())); if (state.query.trim() && match) select(match.id, true); } };
      $('#graph-semester').onchange = e => { state.semester = e.target.value; state.chapter = 'all'; state.query = ''; refreshView(); };
      $('#graph-chapter').onchange = e => { state.chapter = e.target.value; state.query = ''; refreshView(); };
      $('#graph-overview').onclick = () => { state.focused = false; state.query = ''; $('#graph-search').value = ''; $('#graph-search-results').innerHTML = ''; fit(); };
      root.querySelectorAll('[data-graph-zoom]').forEach(el => el.onclick = () => el.dataset.graphZoom === 'fit' ? fit() : zoom(el.dataset.graphZoom === 'in' ? 1.25 : .8));
      svg.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.13 : 1 / 1.13, point(e)); }, { passive: false });
      svg.onpointerdown = e => { if (e.button !== 0) return; e.preventDefault(); const p = point(e); gesture = { type: 'pan', start: p, camera: { ...state.camera }, pointerId: e.pointerId }; svg.setPointerCapture?.(e.pointerId); };
      svg.onpointermove = e => {
        if (!gesture) return; const p = point(e);
        if (gesture.type === 'pan') { state.camera.x = gesture.camera.x + p.x - gesture.start.x; state.camera.y = gesture.camera.y + p.y - gesture.start.y; paint(); }
        else { const n = positions.byId[gesture.id]; if (Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > 4) gesture.moved = true; if (!gesture.moved) return; n.x = Math.max(n.radius + 20, Math.min(positions.width - n.radius - 20, (p.x - state.camera.x) / state.camera.scale)); n.y = Math.max(n.radius + 25, Math.min(positions.height - n.radius - 30, (p.y - state.camera.y) / state.camera.scale)); const group = $('[data-graph-node="' + gesture.id + '"]'); group.setAttribute('transform', 'translate(' + n.x + ' ' + n.y + ')'); root.querySelectorAll('.graph-link').forEach((el, i) => el.setAttribute('d', edgePath(model.edges[i]))); }
      };
      svg.onpointerup = e => { const ended = gesture; gesture = null; if (svg.hasPointerCapture?.(e.pointerId)) svg.releasePointerCapture(e.pointerId); if (ended?.type === 'node') { if (!ended.moved) select(ended.id); else suppressClickId = ended.id; } };
      svg.onpointercancel = () => { gesture = null; };
      if (typeof ResizeObserver === 'function') { observer = new ResizeObserver(measure); observer.observe(svg); }
    }
    function suspend() { if (observer) observer.disconnect(); observer = null; gesture = null; root = null; svg = null; positions = null; }
    return { render, bind, suspend, model: () => model };
  }
  return { createModel, neighborhood, layout, create };
});
