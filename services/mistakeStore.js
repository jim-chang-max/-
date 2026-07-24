const { readJson, writeJson } = require('./jsonStore');
const { readQuestions } = require('./questionStore');
const { getPool, isMysqlEnabled } = require('./mysqlClient');

function normalizeReason(reason, fallback = '题库练习错误') {
  const text = String(reason || fallback).trim();
  return text.slice(0, 80) || fallback;
}

async function recordMistake(userId, questionId, reason = '题库练习错误') {
  if (isMysqlEnabled()) {
    const normalizedReason = normalizeReason(reason);
    await getPool().execute(
      `INSERT INTO mistakes
         (user_id, question_id, wrong_count, last_wrong_at, resolved, reason)
       VALUES (?, ?, 1, ?, FALSE, ?)
       ON DUPLICATE KEY UPDATE
         wrong_count = wrong_count + 1,
         last_wrong_at = VALUES(last_wrong_at),
         resolved = FALSE,
         reason = IF(reason = '', VALUES(reason), reason)`,
      [userId, questionId, new Date(), normalizedReason]
    );

    const [rows] = await getPool().execute(
      `SELECT user_id, question_id, wrong_count, last_wrong_at, resolved, reason
       FROM mistakes
       WHERE user_id = ? AND question_id = ?
       LIMIT 1`,
      [userId, questionId]
    );
    return rowToMistake(rows[0]);
  }

  const mistakes = await readJson('mistakes.json');
  const existing = mistakes.find((item) => item.userId === userId && item.questionId === questionId);

  if (existing) {
    existing.wrongCount = Number(existing.wrongCount || 0) + 1;
    existing.lastWrongAt = new Date().toISOString();
    existing.resolved = false;
    existing.reason = existing.reason || normalizeReason(reason);
  } else {
    mistakes.push({
      userId,
      questionId,
      wrongCount: 1,
      lastWrongAt: new Date().toISOString(),
      resolved: false,
      reason: normalizeReason(reason)
    });
  }

  await writeJson('mistakes.json', mistakes);
  return existing || mistakes[mistakes.length - 1];
}

async function readUserMistakes(userId) {
  const questions = await readQuestions();
  let mistakes;

  if (isMysqlEnabled()) {
    const [rows] = await getPool().execute(
      `SELECT user_id, question_id, wrong_count, last_wrong_at, resolved, reason
       FROM mistakes
       WHERE user_id = ? AND resolved = FALSE
       ORDER BY wrong_count DESC, last_wrong_at DESC`,
      [userId]
    );
    mistakes = rows.map(rowToMistake);
  } else {
    const allMistakes = await readJson('mistakes.json');
    mistakes = allMistakes.filter((item) => item.userId === userId && !item.resolved);
  }

  return mistakes.map((mistake) => ({
    ...mistake,
    question: questions.find((question) => question.id === mistake.questionId)
  }));
}

async function addMistake(userId, questionId, reason) {
  if (isMysqlEnabled()) {
    const normalizedReason = normalizeReason(reason, '手动加入');
    await getPool().execute(
      `INSERT INTO mistakes
         (user_id, question_id, wrong_count, last_wrong_at, resolved, reason)
       VALUES (?, ?, 1, ?, FALSE, ?)
       ON DUPLICATE KEY UPDATE reason = VALUES(reason), resolved = FALSE`,
      [userId, questionId, new Date(), normalizedReason]
    );

    const [rows] = await getPool().execute(
      `SELECT user_id, question_id, wrong_count, last_wrong_at, resolved, reason
       FROM mistakes
       WHERE user_id = ? AND question_id = ?
       LIMIT 1`,
      [userId, questionId]
    );
    return rowToMistake(rows[0]);
  }

  const mistakes = await readJson('mistakes.json');
  const existing = mistakes.find((item) => item.userId === userId && item.questionId === questionId);

  if (existing) {
    existing.reason = normalizeReason(reason, existing.reason);
    existing.resolved = false;
    await writeJson('mistakes.json', mistakes);
    return existing;
  }

  const item = {
    userId,
    questionId,
    wrongCount: 1,
    lastWrongAt: new Date().toISOString(),
    resolved: false,
    reason: normalizeReason(reason, '手动加入')
  };

  mistakes.push(item);
  await writeJson('mistakes.json', mistakes);
  return item;
}

async function updateMistake(userId, questionId, patch) {
  if (isMysqlEnabled()) {
    const fields = [];
    const values = [];

    if (Object.prototype.hasOwnProperty.call(patch, 'resolved')) {
      fields.push('resolved = ?');
      values.push(patch.resolved === true);
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'reason')) {
      fields.push('reason = ?');
      values.push(normalizeReason(patch.reason));
    }

    if (!fields.length) {
      return null;
    }

    values.push(userId, questionId);
    const [result] = await getPool().execute(
      `UPDATE mistakes SET ${fields.join(', ')}
       WHERE user_id = ? AND question_id = ?`,
      values
    );

    if (!result.affectedRows) return null;
    const [rows] = await getPool().execute(
      `SELECT user_id, question_id, wrong_count, last_wrong_at, resolved, reason
       FROM mistakes
       WHERE user_id = ? AND question_id = ?
       LIMIT 1`,
      [userId, questionId]
    );
    return rowToMistake(rows[0]);
  }

  const mistakes = await readJson('mistakes.json');
  const item = mistakes.find((mistake) => mistake.userId === userId && mistake.questionId === questionId);

  if (!item) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'resolved')) {
    item.resolved = patch.resolved === true;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'reason')) {
    item.reason = normalizeReason(patch.reason, item.reason);
  }

  await writeJson('mistakes.json', mistakes);
  return item;
}

async function removeMistake(userId, questionId) {
  if (isMysqlEnabled()) {
    await getPool().execute(
      'DELETE FROM mistakes WHERE user_id = ? AND question_id = ?',
      [userId, questionId]
    );
    return;
  }

  const mistakes = await readJson('mistakes.json');
  const next = mistakes.filter((mistake) => !(mistake.userId === userId && mistake.questionId === questionId));
  await writeJson('mistakes.json', next);
}

function rowToMistake(row) {
  return {
    userId: row.user_id,
    questionId: row.question_id,
    wrongCount: Number(row.wrong_count || 0),
    lastWrongAt: row.last_wrong_at instanceof Date
      ? row.last_wrong_at.toISOString()
      : row.last_wrong_at,
    resolved: Boolean(row.resolved),
    reason: row.reason
  };
}

async function importMistakes(items) {
  if (!isMysqlEnabled()) return;

  const [questionRows] = await getPool().query('SELECT id FROM questions');
  const questionIds = new Set(questionRows.map((row) => row.id));

  for (const item of items.filter((entry) => questionIds.has(entry.questionId))) {
    await getPool().execute(
      `INSERT INTO mistakes
         (user_id, question_id, wrong_count, last_wrong_at, resolved, reason)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         wrong_count = VALUES(wrong_count),
         last_wrong_at = VALUES(last_wrong_at),
         resolved = VALUES(resolved),
         reason = VALUES(reason)`,
      [
        item.userId,
        item.questionId,
        Number(item.wrongCount || 1),
        item.lastWrongAt ? new Date(item.lastWrongAt) : new Date(),
        item.resolved === true,
        normalizeReason(item.reason)
      ]
    );
  }
}

module.exports = {
  recordMistake,
  readUserMistakes,
  addMistake,
  updateMistake,
  removeMistake,
  importMistakes
};
