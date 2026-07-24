const express = require('express');
const {
  addMistake,
  readUserMistakes,
  removeMistake,
  updateMistake
} = require('../services/mistakeStore');
const asyncRoute = require('../utils/asyncRoute');
const { requireAuthenticated } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuthenticated);

router.get('/', asyncRoute(async (req, res) => {
  const userId = req.currentUser.id;
  res.json(await readUserMistakes(userId));
}));

router.post('/', asyncRoute(async (req, res) => {
  const userId = req.currentUser.id;
  const { questionId, reason = '手动加入' } = req.body;

  if (!questionId || typeof questionId !== 'string') {
    return res.status(400).json({ message: '题目 ID 不能为空' });
  }

  res.json(await addMistake(userId, questionId, reason));
}));

router.put('/:questionId', asyncRoute(async (req, res) => {
  const userId = req.currentUser.id;
  const item = await updateMistake(userId, req.params.questionId, req.body);

  if (!item) {
    return res.status(404).json({ message: '错题不存在' });
  }

  res.json(item);
}));

router.delete('/:questionId', asyncRoute(async (req, res) => {
  const userId = req.currentUser.id;
  await removeMistake(userId, req.params.questionId);
  res.json({ ok: true });
}));

module.exports = router;
