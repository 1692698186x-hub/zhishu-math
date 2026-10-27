'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const base = 'http://127.0.0.1:8877';
  const post = async (action, input) => { const res = await fetch(base + '/api/unit/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); const body = await res.json(); assert.equal(res.status, 200, body.error); return body; };
  let state = await post('start', { aiEnabled: true });
  const send = async (action, extra = {}) => state = await post(action, { sessionId: state.id, revision: state.revision, ...extra });
  await send('answer', { questionId: state.question.id, answer: '-x-2', steps: '-(x-2) = -x-2', activeMs: 9000 });
  assert.equal(state.nextPlan.source, 'ai', 'Real decision did not pass validation');
  assert.equal(Object.hasOwn(state.question, 'answer'), false);
  const decision = { action: state.nextPlan.action, targetSkill: state.nextPlan.targetSkill, reason: state.nextPlan.reason, provider: state.nextPlan.provider, evidenceCount: state.nextPlan.evidenceIds.length };
  await send('hint'); assert.equal(state.hintSource, 'ai', 'Real hint did not pass validation');
  const hint = state.hint;
  await send('next'); assert.equal(state.question.origin, 'ai-parameters', 'Real variation parameters were not accepted');
  await send('report'); assert.equal(state.report.source, 'ai', 'Real report did not pass validation');
  const result = { connected: true, provider: decision.provider, realOperationsPassed: ['diagnosis-and-instructional-decision', 'validated-directed-variant', 'socratic-hint', 'evidence-report'], decision, hint, independentValidation: 'not yet tested with real students', at: new Date().toISOString() };
  fs.mkdirSync(path.join(__dirname, '.local'), { recursive: true }); fs.writeFileSync(path.join(__dirname, '.local', 'real-model-verification.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
