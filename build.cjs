const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const version = require('./package.json').version;
const source = name => fs.readFileSync(path.join(root, 'source', name), 'utf8');
const data = { topics: JSON.parse(source('topics.json')), dependencies: JSON.parse(source('dependencies.json')), questions: JSON.parse(source('questions.json')) };
const slots = {
  STYLE: source('workspace.css') + '\n' + source('navigation.css') + '\n' + source('knowledge-graph.css') + '\n' + source('ai-learning.css'),
  DATA: 'const APP_VERSION = ' + JSON.stringify(version) + ';\nconst MATH_DATA = ' + JSON.stringify(data).replace(/</g, '\\u003c') + ';',
  JUDGE: source('judge.js'), ABILITY: source('ability.js'), APP: source('workspace-ui.js'), CURRICULUM_VARIANTS: source('curriculum-variants.js'),
  KNOWLEDGE_GRAPH: source('knowledge-graph.js'),
  LINEAR_MATH: source('linear-math.js'), AI_LEARNING: source('ai-learning.js'), AI_UI: source('ai-ui.js'),
  LEARNING_UNIT: source('learning-unit.js'), LEARNING: source('learning.js'), LEARNING_UI: source('trainer.js')
};
let html = source('template.html');
for (const [name, value] of Object.entries(slots)) html = html.replace('/*__' + name + '__*/', () => value);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html, 'utf8');
if (process.argv.includes('--pages')) {
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'index.html'), html, 'utf8');
  fs.writeFileSync(path.join(root, 'docs', '.nojekyll'), '', 'utf8');
}
console.log(JSON.stringify({ built: true, bytes: Buffer.byteLength(html), grade7Topics: data.topics.filter(t => t.grade === 7).length, allTopics: data.topics.length, questions: data.questions.length }));
