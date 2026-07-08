const express = require('express');
const crypto = require('crypto');
const { readJson, writeJson } = require('../services/jsonStore');
const { createId } = require('../utils/id');

const router = express.Router();

function hashPassword(password) {
  // 演示项目使用 SHA-256，正式项目建议使用 bcrypt 或 argon2。
  return crypto.createHash('sha256').update(password).digest('hex');
}

router.post('/register', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: '用户名和密码不能为空' });
  }

  const users = readJson('users.json');
  const exists = users.some((user) => user.username === username);

  if (exists) {
    return res.status(409).json({ message: '用户名已存在' });
  }

  const user = {
    id: createId('user'),
    username,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };

  users.push(user);
  writeJson('users.json', users);

  req.session.userId = user.id;
  res.json({ id: user.id, username: user.username });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = readJson('users.json');
  const user = users.find((item) => item.username === username);

  if (!user || user.passwordHash !== hashPassword(password || '')) {
    return res.status(401).json({ message: '用户名或密码错误' });
  }

  req.session.userId = user.id;
  res.json({ id: user.id, username: user.username });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.json(null);
  }

  const users = readJson('users.json');
  const user = users.find((item) => item.id === req.session.userId);

  if (!user) {
    return res.json(null);
  }

  res.json({ id: user.id, username: user.username });
});

module.exports = router;
