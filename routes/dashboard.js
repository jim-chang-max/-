const express = require('express');
const { readJson } = require('../services/jsonStore');
const { readQuestions } = require('../services/questionStore');
const { readUserMistakes } = require('../services/mistakeStore');
const { getPlan } = require('../services/planStore');
const { getUserProgress } = require('../services/progressStore');
const { todayText } = require('../utils/date');
const asyncRoute = require('../utils/asyncRoute');

const router = express.Router();

function buildWeakChapters(mistakes) {
  const chapterMap = new Map();

  mistakes.forEach((item) => {
    const chapter = item.question?.chapter || item.question?.chapterId || '未标注章节';
    const current = chapterMap.get(chapter) || {
      chapter,
      questionCount: 0,
      wrongCount: 0
    };
    current.questionCount += 1;
    current.wrongCount += Number(item.wrongCount || 0);
    chapterMap.set(chapter, current);
  });

  return [...chapterMap.values()]
    .sort((a, b) => b.wrongCount - a.wrongCount)
    .slice(0, 3);
}

router.get('/', asyncRoute(async (req, res) => {
  const [chapters, knowledge, questions] = await Promise.all([
    readJson('chapters.json'),
    readJson('knowledge.json'),
    readQuestions()
  ]);

  const userId = req.session.userId;
  if (!userId) {
    return res.json({
      loggedIn: false,
      counts: {
        chapters: chapters.length,
        topics: knowledge.length,
        questions: questions.length,
        mistakes: 0
      },
      progress: {
        mastered: 0,
        total: knowledge.length,
        percent: 0
      },
      todayTasks: [],
      weakChapters: [],
      weakQuestions: []
    });
  }

  const [progressItems, mistakes, plan] = await Promise.all([
    getUserProgress(userId),
    readUserMistakes(userId),
    getPlan(userId)
  ]);
  const mastered = progressItems.filter((item) => item.status === '已掌握').length;
  const todayPlan = plan?.days.find((day) => day.date === todayText()) || null;

  res.json({
    loggedIn: true,
    counts: {
      chapters: chapters.length,
      topics: knowledge.length,
      questions: questions.length,
      mistakes: mistakes.length
    },
    progress: {
      mastered,
      total: knowledge.length,
      percent: knowledge.length ? Math.round((mastered / knowledge.length) * 100) : 0
    },
    todayTasks: todayPlan?.tasks || [],
    weakChapters: buildWeakChapters(mistakes),
    weakQuestions: mistakes.slice(0, 3)
  });
}));

module.exports = router;
