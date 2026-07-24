const express = require('express');
const { readJson } = require('../services/jsonStore');
const {
  getUserProgress,
  setKnowledgeMastered
} = require('../services/progressStore');
const asyncRoute = require('../utils/asyncRoute');
const { requireAuthenticated } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuthenticated);

router.get('/', asyncRoute(async (req, res) => {
  res.json(await getUserProgress(req.currentUser.id));
}));

router.put('/:knowledgeId', asyncRoute(async (req, res) => {
  if (typeof req.body.mastered !== 'boolean') {
    return res.status(400).json({ message: '掌握状态格式不正确' });
  }

  const knowledge = await readJson('knowledge.json');
  if (!knowledge.some((item) => item.id === req.params.knowledgeId)) {
    return res.status(404).json({ message: '知识点不存在' });
  }

  res.json(
    await setKnowledgeMastered(req.currentUser.id, req.params.knowledgeId, req.body.mastered)
  );
}));

module.exports = router;
