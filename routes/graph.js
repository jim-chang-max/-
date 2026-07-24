const express = require('express');
const { readJson } = require('../services/jsonStore');
const asyncRoute = require('../utils/asyncRoute');

const router = express.Router();

router.get('/', asyncRoute(async (req, res) => {
  res.json(await readJson('graph.json', { nodes: [], edges: [] }));
}));

module.exports = router;
