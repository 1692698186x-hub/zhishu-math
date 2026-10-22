const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const source = name => fs.readFileSync(path.join(root, 'source', name), 'utf8');
const data = { topics: JSON.parse(source('topics.json')), dependencies: JSON.parse(source('dependencies.json')), questions: JSON.parse(source('questions.json')) };
const slots = {
  STYLE: source('style.css') + '\n' + source('adaptive.css'),
  DATA: 'const MATH_DATA = ' + JSON.stringify(data).replace(/</g, '\\u003c') + ';',
  JUDGE: source('judge.js'), ABILITY: source('ability.js'), APP: source('app.js')
};
let html = source('template.html');
for (const [name, value] of Object.entries(slots)) html = html.replace('/*__' + name + '__*/', () => value);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html, 'utf8');
console.log(JSON.stringify({ built: true, bytes: Buffer.byteLength(html), grade7Topics: data.topics.filter(t => t.grade === 7).length, allTopics: data.topics.length, questions: data.questions.length }));
