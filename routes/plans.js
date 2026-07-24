const express = require('express');
const { readJson } = require('../services/jsonStore');
const { generatePlan } = require('../services/planGenerator');
const { getPlan, savePlan, updateTask } = require('../services/planStore');
const { todayText } = require('../utils/date');
const asyncRoute = require('../utils/asyncRoute');
const { requireAuthenticated } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuthenticated);

function parseCompleted(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

router.post('/generate', asyncRoute(async (req, res) => {
  const { examDate } = req.body;

  if (!examDate) {
    return res.status(400).json({ message: '考试日期不能为空' });
  }

  const userId = req.currentUser.id;
  const chapters = await readJson('chapters.json');
  const plan = {
    userId,
    examDate,
    days: generatePlan(examDate, chapters)
  };

  await savePlan(plan);

  res.json(plan);
}));

router.get('/', asyncRoute(async (req, res) => {
  const userId = req.currentUser.id;
  res.json(await getPlan(userId));
}));

router.get('/today', asyncRoute(async (req, res) => {
  const userId = req.currentUser.id;
  const plan = await getPlan(userId);
  const today = todayText();

  res.json(plan ? plan.days.find((day) => day.date === today) || null : null);
}));

router.put('/task', asyncRoute(async (req, res) => {
  const userId = req.currentUser.id;
  const { date, taskId, completed } = req.body;
  const task = await updateTask(userId, date, taskId, parseCompleted(completed));

  if (!task) {
    return res.status(404).json({ message: '任务不存在' });
  }

  res.json(task);
}));

module.exports = router;
