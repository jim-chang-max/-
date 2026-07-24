const express = require('express');
const { requireAuthenticated } = require('../middleware/auth');
const { getAccountSummary } = require('../services/accountStore');
const { hashPassword, verifyPassword } = require('../services/passwordService');
const { deleteUserSessions } = require('../services/sessionService');
const { updatePasswordHash } = require('../services/userStore');
const {
  regenerateSession,
  saveSession
} = require('../utils/session');
const asyncRoute = require('../utils/asyncRoute');

const router = express.Router();
router.use(requireAuthenticated);

router.get('/', asyncRoute(async (req, res) => {
  res.json(await getAccountSummary(req.currentUser));
}));

router.put('/password', asyncRoute(async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');

  if (!(await verifyPassword(req.currentUser, currentPassword))) {
    return res.status(400).json({ message: '当前密码不正确' });
  }

  if (newPassword.length < 8 || newPassword.length > 128) {
    return res.status(400).json({ message: '新密码长度需要在 8 到 128 个字符之间' });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({ message: '新密码不能与当前密码相同' });
  }

  await updatePasswordHash(req.currentUser.id, await hashPassword(newPassword));
  await deleteUserSessions(req.currentUser.id);
  await regenerateSession(req);
  req.session.userId = req.currentUser.id;
  await saveSession(req);

  res.json({ ok: true, message: '密码已更新，其他设备已退出登录' });
}));

module.exports = router;
