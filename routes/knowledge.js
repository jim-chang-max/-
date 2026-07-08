const express = require('express');
const { readJson } = require('../services/jsonStore');

const router = express.Router();

router.get('/', (req, res) => {
  const { chapterId, keyword } = req.query;
  const knowledge = readJson('knowledge.json');

  const filtered = knowledge.filter((item) => {
    const matchChapter = !chapterId || item.chapterId === chapterId;
    const searchableText = [
      item.title,
      item.level,
      item.coreDefinition,
      item.content,
      item.mnemonic,
      ...(item.formulas || []),
      ...(item.questionTypes || []),
      ...(item.commonMistakes || []),
      ...(item.keyPoints || []),
      ...(item.examples || [])
    ]
      .filter(Boolean)
      .join(' ');
    const matchKeyword = !keyword || searchableText.includes(keyword);

    return matchChapter && matchKeyword;
  });

  res.json(filtered);
});

router.get('/:id', (req, res) => {
  const knowledge = readJson('knowledge.json');
  const item = knowledge.find((entry) => entry.id === req.params.id);

  if (!item) {
    return res.status(404).json({ message: '知识点不存在' });
  }

  res.json(item);
});

module.exports = router;
