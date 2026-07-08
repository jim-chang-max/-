const express = require('express');
const { readJson, writeJson } = require('../services/jsonStore');
const { generateQuiz } = require('../services/quizGenerator');
const { calculateScore } = require('../services/scoreCalculator');
const { createId } = require('../utils/id');
const { readQuestions, writeQuestions } = require('../services/questionStore');
const { recordMistake } = require('../services/mistakeStore');

const router = express.Router();

function currentUserId(req) {
  return req.session.userId || 'guest';
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(number), min), max);
}

router.post('/generate', (req, res) => {
  const questions = readQuestions();
  const options = {
    chapterId: typeof req.body.chapterId === 'string' ? req.body.chapterId : '',
    difficulty: typeof req.body.difficulty === 'string' ? req.body.difficulty : '',
    count: clampNumber(req.body.count, 5, 1, 50)
  };
  const quizQuestions = generateQuiz(questions, options);

  res.json({
    id: createId('quiz'),
    questions: quizQuestions,
    limitMinutes: clampNumber(req.body.limitMinutes, 20, 1, 180)
  });
});

router.post('/submit', (req, res) => {
  const userId = currentUserId(req);
  const questionIds = Array.isArray(req.body.questionIds) ? req.body.questionIds.filter((id) => typeof id === 'string') : [];
  const answers = req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
  const allQuestions = readQuestions();
  const questions = allQuestions.filter((question) => questionIds.includes(question.id));
  const result = calculateScore(questions, answers);
  const history = readJson('quizHistory.json');

  result.details.forEach((detail) => {
    const question = allQuestions.find((item) => item.id === detail.questionId);
    if (!question) return;

    if (detail.correct) {
      question.correctCount = Number(question.correctCount || 0) + 1;
      question.reviewStatus = question.wrongCount > 0 ? '待复习' : '已掌握';
    } else {
      question.wrongCount = Number(question.wrongCount || 0) + 1;
      question.reviewStatus = '易错';
    }
  });

  writeQuestions(allQuestions);
  result.details
    .filter((item) => !item.correct)
    .forEach((item) => recordMistake(userId, item.questionId, '测验错题'));

  history.push({
    id: createId('history'),
    userId,
    submittedAt: new Date().toISOString(),
    ...result
  });

  writeJson('quizHistory.json', history);
  res.json(result);
});

router.get('/history', (req, res) => {
  const userId = currentUserId(req);
  const history = readJson('quizHistory.json').filter((item) => item.userId === userId);
  res.json(history);
});

module.exports = router;
