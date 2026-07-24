const { getPool, isMysqlEnabled } = require('./mysqlClient');

async function deleteUserSessions(userId, connection = null) {
  if (!isMysqlEnabled()) {
    return 0;
  }

  const executor = connection || getPool();
  const [result] = await executor.execute(
    `DELETE FROM user_sessions
     WHERE JSON_UNQUOTE(JSON_EXTRACT(session_data, '$.userId')) = ?`,
    [userId]
  );
  return result.affectedRows;
}

module.exports = {
  deleteUserSessions
};
