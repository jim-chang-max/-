const express = require('express');
const { readJson, writeJson } = require('../services/jsonStore');
const { generatePlan } = require('../services/planGenerator');
const { todayText } = require('../utils/date');

const router = express.Router();

function currentUserId(req) {
  return req.session.userId || 'guest';
}

function parseCompleted(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

router.post('/generate', (req, res) => {
  const { examDate } = req.body;

  if (!examDate) {
    return res.status(400).json({ message: '考试日期不能为空' });
  }

  const userId = currentUserId(req);
  const chapters = readJson('chapters.json');
  const plans = readJson('plans.json');
  const plan = {
    userId,
    examDate,
    days: generatePlan(examDate, chapters)
  };

  const otherPlans = plans.filter((item) => item.userId !== userId);
  otherPlans.push(plan);
  writeJson('plans.json', otherPlans);

  res.json(plan);
});

router.get('/', (req, res) => {
  const userId = currentUserId(req);
  const plans = readJson('plans.json');
  res.json(plans.find((item) => item.userId === userId) || null);
});

router.get('/today', (req, res) => {
  const userId = currentUserId(req);
  const plans = readJson('plans.json');
  const plan = plans.find((item) => item.userId === userId);
  const today = todayText();

  res.json(plan ? plan.days.find((day) => day.date === today) || null : null);
});

router.put('/task', (req, res) => {
  const userId = currentUserId(req);
  const { date, taskId, completed } = req.body;
  const plans = readJson('plans.json');
  const plan = plans.find((item) => item.userId === userId);

  if (!plan) {
    return res.status(404).json({ message: '复习计划不存在' });
  }

  const day = plan.days.find((item) => item.date === date);
  const task = day && day.tasks.find((item) => item.id === taskId);

  if (!task) {
    return res.status(404).json({ message: '任务不存在' });
  }

  task.completed = parseCompleted(completed);
  writeJson('plans.json', plans);
  res.json(task);
});

module.exports = router;
