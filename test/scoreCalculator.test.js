const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateScore, isCorrect } = require('../services/scoreCalculator');
const { isSubjectiveQuestion } = require('../services/questionTypes');

const choiceQuestion = {
  id: 'choice-1',
  type: 'choice',
  title: '选择正确选项',
  answer: 'B',
  analysis: '答案为 B。'
};

const proofQuestion = {
  id: 'proof-1',
  type: 'proof',
  title: '证明命题',
  answer: '参考证明',
  analysis: '证明解析。'
};

test('客观题使用标准答案自动判分', () => {
  assert.equal(isCorrect(choiceQuestion, ' b '), true);
  assert.equal(isCorrect(choiceQuestion, 'A'), false);

  const result = calculateScore([choiceQuestion], { 'choice-1': 'B' });
  assert.equal(result.requiresSelfAssessment, false);
  assert.equal(result.totalScore, 1);
  assert.equal(result.accuracy, 100);
});

test('主观题未自评时保持待确认状态', () => {
  const result = calculateScore([proofQuestion], { 'proof-1': '我的证明' });

  assert.equal(isSubjectiveQuestion(proofQuestion), true);
  assert.equal(result.requiresSelfAssessment, true);
  assert.deepEqual(result.pendingSubjectiveIds, ['proof-1']);
  assert.equal(result.details[0].correct, null);
});

test('主观题自评后参与最终计分', () => {
  const result = calculateScore(
    [choiceQuestion, proofQuestion],
    { 'choice-1': 'B', 'proof-1': '我的证明' },
    { 'proof-1': false }
  );

  assert.equal(result.requiresSelfAssessment, false);
  assert.equal(result.totalScore, 1);
  assert.equal(result.fullScore, 2);
  assert.equal(result.accuracy, 50);
  assert.equal(result.details[1].correct, false);
});
