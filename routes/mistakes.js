const express = require('express');
const {
  addMistake,
  readUserMistakes,
  removeMistake,
  updateMistake
} = require('../services/mistakeStore');

const router = express.Router();

function currentUserId(req) {
  return req.session.userId || 'guest';
}

router.get('/', (req, res) => {
  const userId = currentUserId(req);
  res.json(readUserMistakes(userId));
});

router.post('/', (req, res) => {
  const userId = currentUserId(req);
  const { questionId, reason = '手动加入' } = req.body;

  if (!questionId || typeof questionId !== 'string') {
    return res.status(400).json({ message: '题目 ID 不能为空' });
  }

  res.json(addMistake(userId, questionId, reason));
});

router.put('/:questionId', (req, res) => {
  const userId = currentUserId(req);
  const item = updateMistake(userId, req.params.questionId, req.body);

  if (!item) {
    return res.status(404).json({ message: '错题不存在' });
  }

  res.json(item);
});

router.delete('/:questionId', (req, res) => {
  const userId = currentUserId(req);
  removeMistake(userId, req.params.questionId);
  res.json({ ok: true });
});

module.exports = router;
