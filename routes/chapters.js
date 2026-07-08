const express = require('express');
const { readJson } = require('../services/jsonStore');

const router = express.Router();

router.get('/', (req, res) => {
  const chapters = readJson('chapters.json');
  res.json(chapters);
});

module.exports = router;
