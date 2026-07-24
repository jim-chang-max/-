const express = require('express');
const { readinessStatus } = require('../services/systemStatus');
const asyncRoute = require('../utils/asyncRoute');

const router = express.Router();

router.get('/live', (req, res) => {
  res.json({
    ok: true,
    message: 'Node 服务存活',
    uptimeSeconds: Math.floor(process.uptime())
  });
});

router.get(['/ready', '/'], asyncRoute(async (req, res) => {
  const status = await readinessStatus();
  res.status(status.ok ? 200 : 503).json(status);
}));

module.exports = router;
