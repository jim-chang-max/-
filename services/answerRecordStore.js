const { getPool, isMysqlEnabled } = require('./mysqlClient');

async function recordAnswer({
  userId,
  questionId,
  mode = 'practice',
  userAnswer = '',
  correct = false,
  answeredAt = new Date()
}) {
  if (!isMysqlEnabled()) {
    return;
  }

  await getPool().execute(
    `INSERT INTO answer_records
       (user_id, question_id, mode, user_answer, correct, answered_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, questionId, mode, String(userAnswer || ''), correct === true, answeredAt]
  );
}

module.exports = {
  recordAnswer
};
