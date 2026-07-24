const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { updatePasswordHash } = require('./userStore');

function legacyHashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(user, password) {
  if (String(user.passwordHash).startsWith('$2')) {
    return bcrypt.compare(password, user.passwordHash);
  }

  const correct = user.passwordHash === legacyHashPassword(password);
  if (correct) {
    await updatePasswordHash(user.id, await hashPassword(password));
  }
  return correct;
}

module.exports = {
  hashPassword,
  verifyPassword
};
