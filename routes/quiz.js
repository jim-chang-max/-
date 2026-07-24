const express = require('express');
const { generateQuiz } = require('../services/quizGenerator');
const { calculateScore } = require('../services/scoreCalculator');
const { createId } = require('../utils/id');
const { readQuestions, writeQuestions } = require('../services/questionStore');
const { recordMistake } = require('../services/mistakeStore');
const { recordAnswer } = require('../services/answerRecordStore');
const { addQuizHistory, getQuizHistory } = require('../services/quizHistoryStore');
const {
  createQuizSession,
  getQuizSession,
  markQuizSubmitted,
  resetQuizSubmission
} = require('../services/quizSessionStore');
const asyncRoute = require('../utils/asyncRoute');
const { requireAuthenticated } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuthenticated);

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(number), min), max);
}

function quizQuestionForClient(question) {
  return {
    id: question.id,
    chapter: question.chapter,
    knowledgePoints: question.knowledgePoints,
    type: question.type,
    difficulty: question.difficulty,
    title: question.title,
    options: question.options,
    tags: question.tags
  };
}

router.post('/generate', asyncRoute(async (req, res) => {
  const questions = await readQuestions();
  const limitMinutes = clampNumber(req.body.limitMinutes, 20, 1, 180);
  const options = {
    chapterId: typeof req.body.chapterId === 'string' ? req.body.chapterId : '',
    difficulty: typeof req.body.difficulty === 'string' ? req.body.difficulty : '',
    count: clampNumber(req.body.count, 5, 1, 50)
  };
  const quizQuestions = generateQuiz(questions, options);
  const id = createId('quiz');
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + (limitMinutes + 30) * 60 * 1000);

  await createQuizSession({
    id,
    userId: req.currentUser.id,
    questionIds: quizQuestions.map((question) => question.id),
    limitMinutes,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    submittedAt: null
  });

  res.json({
    id,
    questions: quizQuestions.map(quizQuestionForClient),
    limitMinutes
  });
}));

router.post('/submit', asyncRoute(async (req, res) => {
  const userId = req.currentUser.id;
  const quizId = typeof req.body.quizId === 'string' ? req.body.quizId : '';
  const answers = req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
  const selfAssessments = Object.fromEntries(
    Object.entries(
      req.body.selfAssessments && typeof req.body.selfAssessments === 'object'
        ? req.body.selfAssessments
        : {}
    ).filter(([, value]) => typeof value === 'boolean')
  );

  if (!quizId) {
    return res.status(400).json({ message: '测验 ID 不能为空' });
  }

  const session = await getQuizSession(quizId);
  if (!session || session.userId !== userId) {
    return res.status(404).json({ message: '测验不存在' });
  }

  if (session.submittedAt) {
    return res.status(409).json({ message: '该测验已经提交，请勿重复交卷' });
  }

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    return res.status(410).json({ message: '该测验已过期，请重新生成试卷' });
  }

  const allQuestions = await readQuestions();
  const questionMap = new Map(allQuestions.map((question) => [question.id, question]));
  const questions = session.questionIds
    .map((questionId) => questionMap.get(questionId))
    .filter(Boolean);
  const result = calculateScore(questions, answers, selfAssessments);

  if (result.requiresSelfAssessment) {
    return res.json({
      quizId,
      ...result
    });
  }

  if (!(await markQuizSubmitted(quizId))) {
    return res.status(409).json({ message: '该测验已经提交，请勿重复交卷' });
  }

  try {
    result.details.forEach((detail) => {
      const question = questionMap.get(detail.questionId);
      if (!question) return;

      if (detail.correct) {
        question.correctCount = Number(question.correctCount || 0) + 1;
        question.reviewStatus = question.wrongCount > 0 ? '待复习' : '已掌握';
      } else {
        question.wrongCount = Number(question.wrongCount || 0) + 1;
        question.reviewStatus = '易错';
      }
    });

    await writeQuestions(allQuestions);
    for (const item of result.details.filter((detail) => !detail.correct)) {
      await recordMistake(userId, item.questionId, '测验错题');
    }

    const submittedAt = new Date().toISOString();
    for (const item of result.details) {
      await recordAnswer({
        userId,
        questionId: item.questionId,
        mode: 'quiz',
        userAnswer: item.userAnswer,
        correct: item.correct,
        answeredAt: new Date(submittedAt)
      });
    }

    await addQuizHistory({
      id: createId('history'),
      userId,
      submittedAt,
      ...result
    });

    res.json({
      quizId,
      ...result
    });
  } catch (error) {
    await resetQuizSubmission(quizId);
    throw error;
  }
}));

router.get('/history', asyncRoute(async (req, res) => {
  const userId = req.currentUser.id;
  res.json(await getQuizHistory(userId));
}));

module.exports = router;
