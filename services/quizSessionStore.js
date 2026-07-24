const { getPool, isMysqlEnabled } = require('./mysqlClient');

const memorySessions = new Map();

function parseJson(value, fallback = []) {
  if (value === null || value === undefined) return fallback;
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function rowToSession(row) {
  return {
    id: row.id,
    userId: row.user_id,
    questionIds: parseJson(row.question_ids, []),
    limitMinutes: Number(row.limit_minutes),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at,
    submittedAt: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : row.submitted_at
  };
}

async function createQuizSession(session) {
  if (!isMysqlEnabled()) {
    memorySessions.set(session.id, session);
    return session;
  }

  await getPool().execute(
    `INSERT INTO quiz_sessions
       (id, user_id, question_ids, limit_minutes, created_at, expires_at)
     VALUES (?, ?, CAST(? AS JSON), ?, ?, ?)`,
    [
      session.id,
      session.userId,
      JSON.stringify(session.questionIds),
      session.limitMinutes,
      new Date(session.createdAt),
      new Date(session.expiresAt)
    ]
  );
  return session;
}

async function getQuizSession(id) {
  if (!isMysqlEnabled()) {
    return memorySessions.get(id) || null;
  }

  const [rows] = await getPool().execute(
    `SELECT id, user_id, question_ids, limit_minutes, created_at, expires_at, submitted_at
     FROM quiz_sessions
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  return rows.length ? rowToSession(rows[0]) : null;
}

async function markQuizSubmitted(id, submittedAt = new Date()) {
  if (!isMysqlEnabled()) {
    const session = memorySessions.get(id);
    if (!session || session.submittedAt) return false;
    session.submittedAt = submittedAt.toISOString();
    return true;
  }

  const [result] = await getPool().execute(
    `UPDATE quiz_sessions
     SET submitted_at = ?
     WHERE id = ? AND submitted_at IS NULL`,
    [submittedAt, id]
  );
  return result.affectedRows === 1;
}

async function resetQuizSubmission(id) {
  if (!isMysqlEnabled()) {
    const session = memorySessions.get(id);
    if (session) session.submittedAt = null;
    return;
  }

  await getPool().execute(
    'UPDATE quiz_sessions SET submitted_at = NULL WHERE id = ?',
    [id]
  );
}

module.exports = {
  createQuizSession,
  getQuizSession,
  markQuizSubmitted,
  resetQuizSubmission
};
