const { findUserById } = require('../services/userStore');

async function resolveCurrentUser(req) {
  if (!req.session?.userId) {
    return null;
  }

  return findUserById(req.session.userId);
}

async function requireAuthenticated(req, res, next) {
  try {
    const user = await resolveCurrentUser(req);

    if (!user) {
      return res.status(401).json({ message: '请先登录后再使用此功能' });
    }

    req.currentUser = user;
    next();
  } catch (error) {
    next(error);
  }
}

async function requireAdmin(req, res, next) {
  try {
    const user = req.currentUser || await resolveCurrentUser(req);

    if (!user) {
      return res.status(401).json({ message: '请先登录管理员账号' });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ message: '只有管理员可以审核或修改题库' });
    }

    req.currentUser = user;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  requireAdmin,
  requireAuthenticated,
  resolveCurrentUser
};
