const { readJson, writeJson } = require('./jsonStore');
const { getPool, isMysqlEnabled } = require('./mysqlClient');

function isoText(value) {
  if (value instanceof Date) return value.toISOString();
  return value;
}

async function addQuizHistory(history) {
  if (!isMysqlEnabled()) {
    const items = await readJson('quizHistory.json');
    items.push(history);
    await writeJson('quizHistory.json', items);
    return history;
  }

  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO quiz_history
         (id, user_id, submitted_at, total_score, full_score, accuracy)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        history.id,
        history.userId,
        new Date(history.submittedAt),
        Number(history.totalScore || 0),
        Number(history.fullScore || 0),
        Number(history.accuracy || 0)
      ]
    );

    for (const detail of history.details || []) {
      await connection.execute(
        `INSERT INTO quiz_answers
           (history_id, question_id, stem, user_answer, correct_answer,
            correct, score, full_score, analysis)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          history.id,
          detail.questionId,
          detail.stem || '',
          detail.userAnswer || '',
          detail.correctAnswer || '',
          detail.correct === true,
          Number(detail.score || 0),
          Number(detail.fullScore || 0),
          detail.analysis || ''
        ]
      );
    }

    await connection.commit();
    return history;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getQuizHistory(userId) {
  if (!isMysqlEnabled()) {
    const items = await readJson('quizHistory.json');
    return items.filter((item) => item.userId === userId);
  }

  const [histories] = await getPool().execute(
    `SELECT id, user_id, submitted_at, total_score, full_score, accuracy
     FROM quiz_history
     WHERE user_id = ?
     ORDER BY submitted_at DESC`,
    [userId]
  );

  if (!histories.length) {
    return [];
  }

  const ids = histories.map((item) => item.id);
  const placeholders = ids.map(() => '?').join(',');
  const [answers] = await getPool().execute(
    `SELECT history_id, question_id, stem, user_answer, correct_answer,
            correct, score, full_score, analysis
     FROM quiz_answers
     WHERE history_id IN (${placeholders})
     ORDER BY id`,
    ids
  );

  return histories.map((history) => ({
    id: history.id,
    userId: history.user_id,
    submittedAt: isoText(history.submitted_at),
    totalScore: Number(history.total_score),
    fullScore: Number(history.full_score),
    accuracy: Number(history.accuracy),
    details: answers
      .filter((answer) => answer.history_id === history.id)
      .map((answer) => ({
        questionId: answer.question_id,
        stem: answer.stem,
        userAnswer: answer.user_answer,
        correctAnswer: answer.correct_answer,
        correct: Boolean(answer.correct),
        score: Number(answer.score),
        fullScore: Number(answer.full_score),
        analysis: answer.analysis
      }))
  }));
}

async function importQuizHistory(items) {
  for (const item of items) {
    const existing = await getQuizHistory(item.userId);
    if (!existing.some((history) => history.id === item.id)) {
      await addQuizHistory(item);
    }
  }
}

module.exports = {
  addQuizHistory,
  getQuizHistory,
  importQuizHistory
};
