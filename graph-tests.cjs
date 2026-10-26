'use strict';
const assert = require('node:assert/strict');
const G = require('./source/knowledge-graph.js');
const data = { topics: require('./source/topics.json'), dependencies: require('./source/dependencies.json') };
let passed = 0;
function test(name, action) { action(); passed++; console.log('PASS ' + name); }
test('Every graph node belongs to the selected grade and every edge exists in the source', () => {
  for (let grade = 1; grade <= 9; grade++) {
    const model = G.createModel(data, { grade });
    assert.equal(model.nodes.length, data.topics.filter(t => t.grade === grade).length);
    for (const node of model.nodes) assert.equal(node.topic.grade, grade);
    for (const edge of model.edges) {
      assert.ok(model.byId[edge.source]); assert.ok(model.byId[edge.target]);
      assert.ok(data.dependencies.some(e => e.prerequisiteId === edge.source && e.topicId === edge.target));
    }
  }
});
test('Prerequisites point toward later knowledge; neighborhood uses that direction', () => {
  const model = G.createModel(data, { grade: 7 });
  const edge = model.edges[0];
  assert.ok(G.neighborhood(model, edge.target).incoming.includes(edge.source));
  assert.ok(G.neighborhood(model, edge.source).outgoing.includes(edge.target));
  assert.equal(G.neighborhood(model, 'missing').all.length, 0);
});
test('Semester and chapter filters never leave dangling links or unrelated nodes', () => {
  const first = data.topics.find(t => t.grade === 7 && t.semester === '下');
  const model = G.createModel(data, { grade: 7, semester: '下' });
  assert.ok(model.nodes.length); assert.ok(model.nodes.every(n => n.topic.semester === '下'));
  assert.ok(model.nodes.some(n => n.id === first.id));
  const chapter = first.chapter.replace(/\s+\d+[\d./]*\s*$/, '').replace(/\s+综合与实践$/, '');
  const chapterModel = G.createModel(data, { grade: 7, chapter });
  assert.ok(chapterModel.nodes.length); assert.ok(chapterModel.edges.every(e => chapterModel.byId[e.source] && chapterModel.byId[e.target]));
});
test('Duplicate links and self loops are not fabricated into the display', () => {
  const topics = [{ id: 'a', grade: 1, chapter: 'A' }, { id: 'b', grade: 1, chapter: 'B' }];
  const dependencies = [{ prerequisiteId: 'a', topicId: 'b', strength: 'soft' }, { prerequisiteId: 'a', topicId: 'b', strength: 'hard' }, { prerequisiteId: 'b', topicId: 'b' }];
  const model = G.createModel({ topics, dependencies }, { grade: 1 });
  assert.equal(model.edges.length, 1); assert.equal(model.edges[0].strength, 'hard');
  assert.equal(model.byId.a.degree, 1); assert.equal(model.byId.b.degree, 1);
});
test('Network layouts are finite, bounded, deterministic, and do not mutate source topics', () => {
  for (const grade of [1, 7, 9]) {
    const model = G.createModel(data, { grade }), one = G.layout(model, 620, 440), two = G.layout(model, 620, 440);
    for (let i = 0; i < one.nodes.length; i++) {
      const n = one.nodes[i]; assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
      assert.ok(n.x >= 0 && n.x <= 620 && n.y >= 0 && n.y <= 440);
      assert.equal(n.x, two.nodes[i].x); assert.equal(n.y, two.nodes[i].y);
      assert.equal(model.nodes[i].x, undefined); assert.equal(n.topic.x, undefined);
    }
  }
});
test('Empty scopes and cyclic dependency fixtures still produce a usable layout', () => {
  assert.equal(G.layout(G.createModel(data, { grade: 99 })).nodes.length, 0);
  const topics = ['a', 'b', 'c'].map(id => ({ id, grade: 1, chapter: 'A' }));
  const dependencies = topics.map((t, i) => ({ prerequisiteId: t.id, topicId: topics[(i + 1) % 3].id }));
  const result = G.layout(G.createModel({ topics, dependencies }, { grade: 1 }), 320, 320);
  assert.equal(result.nodes.length, 3); assert.ok(result.nodes.every(n => Number.isFinite(n.x)));
});
console.log(JSON.stringify({ graphPassed: passed, sourceNodes: data.topics.length, sourceRelations: data.dependencies.length }));
