const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const {
  countAdmins,
  deleteUserAndData,
  findUserById,
  listUsers,
  updateUserRole
} = require('../services/userStore');
const asyncRoute = require('../utils/asyncRoute');
const { createDatabaseBackup } = require('../services/databaseBackup');
const { getRecentLogs } = require('../services/appLogger');
const { detailedSystemStatus } = require('../services/systemStatus');

const router = express.Router();
router.use(requireAdmin);

router.get('/users', asyncRoute(async (req, res) => {
  const users = await listUsers();
  res.json(users.map((user) => ({
    id: user.id,
    username: user.username,
    role: user.role || 'student',
    createdAt: user.createdAt,
    isCurrentUser: user.id === req.currentUser.id
  })));
}));

router.get('/system', asyncRoute(async (req, res) => {
  res.json(await detailedSystemStatus());
}));

router.get('/logs', asyncRoute(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const level = ['info', 'warn', 'error'].includes(req.query.level)
    ? req.query.level
    : '';
  res.json(await getRecentLogs({ limit, level }));
}));

router.post('/backups', asyncRoute(async (req, res) => {
  const backup = await createDatabaseBackup();
  res.status(201).json({
    fileName: backup.fileName,
    createdAt: backup.createdAt,
    counts: backup.counts
  });
}));

router.put('/users/:userId/role', asyncRoute(async (req, res) => {
  const role = req.body.role;
  if (!['student', 'admin'].includes(role)) {
    return res.status(400).json({ message: '用户角色不正确' });
  }

  if (req.params.userId === req.currentUser.id) {
    return res.status(400).json({ message: '不能修改自己的管理员角色' });
  }

  const target = await findUserById(req.params.userId);
  if (!target) {
    return res.status(404).json({ message: '用户不存在' });
  }

  if (target.role === 'admin' && role === 'student' && await countAdmins() <= 1) {
    return res.status(409).json({ message: '系统至少需要保留一个管理员' });
  }

  await updateUserRole(target.id, role);
  res.json({ id: target.id, username: target.username, role });
}));

router.delete('/users/:userId', asyncRoute(async (req, res) => {
  if (req.params.userId === req.currentUser.id) {
    return res.status(400).json({ message: '不能删除当前登录的管理员账号' });
  }

  const target = await findUserById(req.params.userId);
  if (!target) {
    return res.status(404).json({ message: '用户不存在' });
  }

  if (target.role === 'admin' && await countAdmins() <= 1) {
    return res.status(409).json({ message: '系统至少需要保留一个管理员' });
  }

  await deleteUserAndData(target.id);
  res.json({ ok: true });
}));

module.exports = router;
