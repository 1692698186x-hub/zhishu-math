'use strict';
const data = { topics: require('./source/topics.json'), questions: require('./source/questions.json'), dependencies: require('./source/dependencies.json') };
const trainer = require('./source/trainer.js').createEngine(data, require('./source/learning-unit.js'));
const grades = Array.from({ length: 9 }, (_, i) => {
  const grade = i + 1, topics = data.topics.filter(t => t.grade === grade);
  return { grade, topics: topics.length, canonicalItems: topics.reduce((n, t) => n + trainer.bank[t.id].length, 0), insufficientIndependentRetests: topics.filter(t => trainer.bank[t.id].filter(q => q.difficulty !== 'basic').length < 2).map(t => ({ topicId: t.id, name: t.name, eligibleItems: trainer.bank[t.id].filter(q => q.difficulty !== 'basic').length })) };
});
const report = { version: require('./package.json').version, grades, totalTopics: data.topics.length, totalCanonicalItems: grades.reduce((n, g) => n + g.canonicalItems, 0), note: 'Counts describe runnable engineering coverage. They do not establish question-topic alignment, teacher review, calibrated difficulty, cognitive dimensions or learning effectiveness.' };
if (require.main === module) console.log(JSON.stringify(report, null, 2));
module.exports = report;
