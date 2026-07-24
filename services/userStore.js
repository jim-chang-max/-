const { readJson, writeJson } = require('./jsonStore');
const { getPool, isMysqlEnabled } = require('./mysqlClient');

function rowToUser(row) {
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role || 'student',
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

async function findUserByUsername(username) {
  if (!isMysqlEnabled()) {
    const users = await readJson('users.json');
    return users.find((user) => user.username === username) || null;
  }

  const [rows] = await getPool().execute(
    `SELECT id, username, password_hash, role, created_at
     FROM users
     WHERE username = ?
     LIMIT 1`,
    [username]
  );

  return rows.length ? rowToUser(rows[0]) : null;
}

async function findUserById(id) {
  if (!isMysqlEnabled()) {
    const users = await readJson('users.json');
    return users.find((user) => user.id === id) || null;
  }

  const [rows] = await getPool().execute(
    `SELECT id, username, password_hash, role, created_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [id]
  );

  return rows.length ? rowToUser(rows[0]) : null;
}

async function createUser(user) {
  if (!isMysqlEnabled()) {
    const users = await readJson('users.json');
    users.push(user);
    await writeJson('users.json', users);
    return user;
  }

  await getPool().execute(
    `INSERT INTO users (id, username, password_hash, role, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      user.id,
      user.username,
      user.passwordHash,
      user.role || 'student',
      user.createdAt ? new Date(user.createdAt) : new Date()
    ]
  );

  return user;
}

async function updatePasswordHash(userId, passwordHash) {
  if (!isMysqlEnabled()) {
    const users = await readJson('users.json');
    const user = users.find((item) => item.id === userId);
    if (!user) return false;
    user.passwordHash = passwordHash;
    await writeJson('users.json', users);
    return true;
  }

  const [result] = await getPool().execute(
    'UPDATE users SET password_hash = ? WHERE id = ?',
    [passwordHash, userId]
  );
  return result.affectedRows > 0;
}

async function updateUserRole(userId, role) {
  const normalizedRole = role === 'admin' ? 'admin' : 'student';

  if (!isMysqlEnabled()) {
    const users = await readJson('users.json');
    const user = users.find((item) => item.id === userId);
    if (!user) return false;
    user.role = normalizedRole;
    await writeJson('users.json', users);
    return true;
  }

  const [result] = await getPool().execute(
    'UPDATE users SET role = ? WHERE id = ?',
    [normalizedRole, userId]
  );
  return result.affectedRows > 0;
}

async function listUsers() {
  if (!isMysqlEnabled()) {
    const users = await readJson('users.json');
    return [...users].sort((a, b) => String(a.username).localeCompare(String(b.username)));
  }

  const [rows] = await getPool().query(
    `SELECT id, username, password_hash, role, created_at
     FROM users
     ORDER BY created_at ASC, username ASC`
  );
  return rows.map(rowToUser);
}

async function countAdmins() {
  if (!isMysqlEnabled()) {
    const users = await readJson('users.json');
    return users.filter((user) => user.role === 'admin').length;
  }

  const [rows] = await getPool().query(
    `SELECT COUNT(*) AS count
     FROM users
     WHERE role = 'admin'`
  );
  return Number(rows[0].count || 0);
}

async function deleteUserAndData(userId) {
  if (!isMysqlEnabled()) {
    const fileNames = [
      'mistakes.json',
      'plans.json',
      'progress.json',
      'quizHistory.json',
      'users.json'
    ];

    for (const fileName of fileNames) {
      const items = await readJson(fileName);
      await writeJson(
        fileName,
        items.filter((item) => {
          if (fileName === 'users.json') return item.id !== userId;
          return item.userId !== userId;
        })
      );
    }
    return true;
  }

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      `DELETE FROM user_sessions
       WHERE JSON_UNQUOTE(JSON_EXTRACT(session_data, '$.userId')) = ?`,
      [userId]
    );
    await connection.execute('DELETE FROM quiz_history WHERE user_id = ?', [userId]);
    await connection.execute('DELETE FROM quiz_sessions WHERE user_id = ?', [userId]);
    await connection.execute('DELETE FROM answer_records WHERE user_id = ?', [userId]);
    await connection.execute('DELETE FROM mistakes WHERE user_id = ?', [userId]);
    await connection.execute('DELETE FROM review_tasks WHERE user_id = ?', [userId]);
    await connection.execute('DELETE FROM review_plans WHERE user_id = ?', [userId]);
    await connection.execute('DELETE FROM topic_progress WHERE user_id = ?', [userId]);
    const [result] = await connection.execute('DELETE FROM users WHERE id = ?', [userId]);
    await connection.commit();
    return result.affectedRows > 0;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function importUsers(users) {
  for (const user of users) {
    await getPool().execute(
      `INSERT INTO users (id, username, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         username = VALUES(username),
         role = VALUES(role)`,
      [
        user.id,
        user.username,
        user.passwordHash,
        user.role || 'student',
        user.createdAt ? new Date(user.createdAt) : new Date()
      ]
    );
  }
}

module.exports = {
  countAdmins,
  createUser,
  deleteUserAndData,
  findUserById,
  findUserByUsername,
  importUsers,
  listUsers,
  updatePasswordHash,
  updateUserRole
};
