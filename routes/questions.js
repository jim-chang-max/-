const express = require('express');
const { isCorrect } = require('../services/scoreCalculator');
const { recordMistake } = require('../services/mistakeStore');
const {
  readQuestions,
  writeQuestions,
  getQuestionTitle,
  getQuestionChapter
} = require('../services/questionStore');

const router = express.Router();
const validTypes = new Set(['choice', 'judge', 'blank', 'calculation', 'proof', 'shortAnswer']);
const validDifficulties = new Set(['easy', 'medium', 'hard']);
const validReviewStatuses = new Set(['待复习', '已掌握', '易错']);

function currentUserId(req) {
  return req.session.userId || 'guest';
}

function searchableText(question) {
  return [
    question.id,
    getQuestionChapter(question),
    getQuestionTitle(question),
    question.answer,
    question.analysis,
    question.reviewStatus,
    ...(question.knowledgePoints || []),
    ...(question.tags || []),
    ...(question.options || [])
  ]
    .filter(Boolean)
    .join(' ');
}

function matchNeedsReview(question, value) {
  if (value === undefined || value === '' || value === 'all') {
    return true;
  }

  return String(Boolean(question.needsReview)) === value;
}

function cleanText(value, maxLength = 2000) {
  return String(value || '').trim().slice(0, maxLength);
}

function cleanStringArray(value, maxItems = 12, maxLength = 120) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeQuestionPatch(body) {
  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body, 'chapter')) {
    patch.chapter = cleanText(body.chapter, 80);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'knowledgePoints')) {
    patch.knowledgePoints = cleanStringArray(body.knowledgePoints);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'type') && validTypes.has(body.type)) {
    patch.type = body.type;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'difficulty') && validDifficulties.has(body.difficulty)) {
    patch.difficulty = body.difficulty;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'title')) {
    patch.title = cleanText(body.title, 2000);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'options')) {
    patch.options = cleanStringArray(body.options, 8, 500);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'answer')) {
    patch.answer = cleanText(body.answer, 4000);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'analysis')) {
    patch.analysis = cleanText(body.analysis, 6000);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'tags')) {
    patch.tags = cleanStringArray(body.tags, 16, 80);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'source')) {
    const source = body.source;
    if (source && typeof source === 'object' && !Array.isArray(source)) {
      patch.source = {
        name: cleanText(source.name, 200),
        page: Number.isFinite(Number(source.page)) ? Number(source.page) : null,
        index: cleanText(source.index, 80)
      };
    } else {
      patch.source = cleanText(source, 200);
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'reviewStatus') && validReviewStatuses.has(body.reviewStatus)) {
    patch.reviewStatus = body.reviewStatus;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'needsReview')) {
    patch.needsReview = body.needsReview === true;
  }

  return patch;
}

router.get('/', (req, res) => {
  const { chapter, chapterId, type, difficulty, needsReview, keyword } = req.query;
  const chapterValue = chapter || chapterId;
  const questions = readQuestions();

  const filtered = questions.filter((question) => {
    const matchChapter = !chapterValue || getQuestionChapter(question) === chapterValue;
    const matchType = !type || question.type === type;
    const matchDifficulty = !difficulty || question.difficulty === difficulty;
    const matchReview = matchNeedsReview(question, needsReview);
    const matchKeyword = !keyword || searchableText(question).includes(keyword);

    return matchChapter && matchType && matchDifficulty && matchReview && matchKeyword;
  });

  res.json(filtered);
});

router.get('/review', (req, res) => {
  const questions = readQuestions().filter((question) => question.needsReview === true);
  res.json(questions);
});

router.get('/:id', (req, res) => {
  const questions = readQuestions();
  const question = questions.find((item) => item.id === req.params.id);

  if (!question) {
    return res.status(404).json({ message: '题目不存在' });
  }

  res.json(question);
});

router.put('/:id', (req, res) => {
  const questions = readQuestions();
  const question = questions.find((item) => item.id === req.params.id);

  if (!question) {
    return res.status(404).json({ message: '题目不存在' });
  }

  Object.assign(question, normalizeQuestionPatch(req.body));

  writeQuestions(questions);
  res.json(question);
});

router.post('/answer', (req, res) => {
  const { questionId, answer } = req.body;

  if (!questionId || typeof questionId !== 'string') {
    return res.status(400).json({ message: '题目 ID 不能为空' });
  }

  const questions = readQuestions();
  const question = questions.find((item) => item.id === questionId);

  if (!question) {
    return res.status(404).json({ message: '题目不存在' });
  }

  const correct = isCorrect(question, cleanText(answer, 4000));

  if (correct) {
    question.correctCount = Number(question.correctCount || 0) + 1;
    question.reviewStatus = question.wrongCount > 0 ? '待复习' : '已掌握';
  } else {
    question.wrongCount = Number(question.wrongCount || 0) + 1;
    question.reviewStatus = '易错';
    recordMistake(currentUserId(req), questionId, '题库练习错误');
  }

  writeQuestions(questions);

  res.json({
    correct,
    answer: question.answer,
    analysis: question.analysis,
    wrongCount: question.wrongCount,
    correctCount: question.correctCount,
    reviewStatus: question.reviewStatus
  });
});

module.exports = router;
