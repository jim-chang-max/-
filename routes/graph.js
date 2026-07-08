const express = require('express');
const { readJson } = require('../services/jsonStore');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(readJson('graph.json', { nodes: [], edges: [] }));
});

module.exports = router;
