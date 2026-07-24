const express = require('express');
const { createId } = require('../utils/id');
const asyncRoute = require('../utils/asyncRoute');
const { hashPassword, verifyPassword } = require('../services/passwordService');
const {
  destroySession,
  regenerateSession,
  saveSession
} = require('../utils/session');
const {
  createUser,
  findUserById,
  findUserByUsername
} = require('../services/userStore');

const router = express.Router();

function cleanUsername(value) {
  return String(value || '').trim().slice(0, 32);
}

function validateCredentials(username, password) {
  if (username.length < 2) {
    return '用户名至少需要 2 个字符';
  }

  if (String(password || '').length < 8) {
    return '密码至少需要 8 个字符';
  }

  if (String(password).length > 128) {
    return '密码不能超过 128 个字符';
  }

  return '';
}

router.post('/register', asyncRoute(async (req, res) => {
  const username = cleanUsername(req.body.username);
  const password = String(req.body.password || '');
  const validationMessage = validateCredentials(username, password);

  if (validationMessage) {
    return res.status(400).json({ message: validationMessage });
  }

  if (await findUserByUsername(username)) {
    return res.status(409).json({ message: '用户名已存在' });
  }

  const user = {
    id: createId('user'),
    username,
    passwordHash: await hashPassword(password),
    role: 'student',
    createdAt: new Date().toISOString()
  };

  await createUser(user);

  await regenerateSession(req);
  req.session.userId = user.id;
  await saveSession(req);
  res.json({ id: user.id, username: user.username, role: user.role });
}));

router.post('/login', asyncRoute(async (req, res) => {
  const username = cleanUsername(req.body.username);
  const password = String(req.body.password || '');
  const user = await findUserByUsername(username);

  if (!user || !(await verifyPassword(user, password))) {
    return res.status(401).json({ message: '用户名或密码错误' });
  }

  await regenerateSession(req);
  req.session.userId = user.id;
  await saveSession(req);
  res.json({ id: user.id, username: user.username, role: user.role || 'student' });
}));

router.post('/logout', asyncRoute(async (req, res) => {
  await destroySession(req);
  res.clearCookie('dmreview.sid');
  res.json({ ok: true });
}));

router.get('/me', asyncRoute(async (req, res) => {
  if (!req.session.userId) {
    return res.json(null);
  }

  const user = await findUserById(req.session.userId);

  if (!user) {
    return res.json(null);
  }

  res.json({ id: user.id, username: user.username, role: user.role || 'student' });
}));

module.exports = router;
