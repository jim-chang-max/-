const express = require('express');
const { readJson } = require('../services/jsonStore');
const asyncRoute = require('../utils/asyncRoute');

const router = express.Router();

router.get('/', asyncRoute(async (req, res) => {
  const chapters = await readJson('chapters.json');
  res.json(chapters);
}));

module.exports = router;
