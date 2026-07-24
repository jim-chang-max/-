const session = require('express-session');
const { getPool } = require('./mysqlClient');

const DEFAULT_MAX_AGE = 1000 * 60 * 60 * 24 * 7;

function expiresAt(sessionData) {
  const expires = sessionData.cookie?.expires;
  const parsed = expires ? new Date(expires).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now() + DEFAULT_MAX_AGE;
}

class MysqlSessionStore extends session.Store {
  get(sessionId, callback) {
    getPool().execute(
      `SELECT session_data
       FROM user_sessions
       WHERE session_id = ? AND expires_at > ?
       LIMIT 1`,
      [sessionId, Date.now()]
    )
      .then(([rows]) => {
        if (!rows.length) {
          callback(null, null);
          return;
        }

        const data = typeof rows[0].session_data === 'string'
          ? JSON.parse(rows[0].session_data)
          : rows[0].session_data;
        callback(null, data);
      })
      .catch(callback);
  }

  set(sessionId, sessionData, callback = () => {}) {
    const serialized = JSON.stringify(sessionData);

    getPool().execute(
      `INSERT INTO user_sessions (session_id, expires_at, session_data)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         expires_at = VALUES(expires_at),
         session_data = VALUES(session_data)`,
      [sessionId, expiresAt(sessionData), serialized]
    )
      .then(() => callback())
      .catch(callback);
  }

  destroy(sessionId, callback = () => {}) {
    getPool().execute(
      'DELETE FROM user_sessions WHERE session_id = ?',
      [sessionId]
    )
      .then(() => callback())
      .catch(callback);
  }

  touch(sessionId, sessionData, callback = () => {}) {
    getPool().execute(
      `UPDATE user_sessions
       SET expires_at = ?
       WHERE session_id = ?`,
      [expiresAt(sessionData), sessionId]
    )
      .then(() => callback())
      .catch(callback);
  }
}

module.exports = MysqlSessionStore;
