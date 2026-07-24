const { readJson } = require('./jsonStore');
const { getPool, isMysqlEnabled } = require('./mysqlClient');

function dateText(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

async function getAccountSummary(user) {
  const knowledge = await readJson('knowledge.json');

  if (!isMysqlEnabled()) {
    const [mistakes, plans, progress, quizHistory] = await Promise.all([
      readJson('mistakes.json'),
      readJson('plans.json'),
      readJson('progress.json'),
      readJson('quizHistory.json')
    ]);
    const userMistakes = mistakes.filter((item) => item.userId === user.id && !item.resolved);
    const userProgress = progress.filter((item) => item.userId === user.id);
    const userQuizzes = quizHistory.filter((item) => item.userId === user.id);
    const plan = plans.find((item) => item.userId === user.id);

    return {
      user: publicUser(user),
      stats: {
        answered: 0,
        accuracy: 0,
        mistakes: userMistakes.length,
        quizzes: userQuizzes.length,
        masteredTopics: userProgress.filter((item) => item.status === '已掌握').length,
        totalTopics: knowledge.length
      },
      examDate: plan?.examDate || null
    };
  }

  const [rows] = await getPool().execute(
    `SELECT
       (SELECT COUNT(*) FROM answer_records WHERE user_id = ?) AS answered,
       (SELECT COUNT(*) FROM answer_records WHERE user_id = ? AND correct = TRUE) AS correct_answers,
       (SELECT COUNT(*) FROM mistakes WHERE user_id = ? AND resolved = FALSE) AS mistakes,
       (SELECT COUNT(*) FROM quiz_history WHERE user_id = ?) AS quizzes,
       (SELECT COUNT(*) FROM topic_progress WHERE user_id = ? AND status = '已掌握') AS mastered_topics,
       (SELECT DATE_FORMAT(exam_date, '%Y-%m-%d') FROM review_plans WHERE user_id = ? LIMIT 1) AS exam_date`,
    [user.id, user.id, user.id, user.id, user.id, user.id]
  );
  const stats = rows[0];
  const answered = Number(stats.answered || 0);
  const correctAnswers = Number(stats.correct_answers || 0);

  return {
    user: publicUser(user),
    stats: {
      answered,
      accuracy: answered ? Math.round((correctAnswers / answered) * 100) : 0,
      mistakes: Number(stats.mistakes || 0),
      quizzes: Number(stats.quizzes || 0),
      masteredTopics: Number(stats.mastered_topics || 0),
      totalTopics: knowledge.length
    },
    examDate: dateText(stats.exam_date)
  };
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role || 'student',
    createdAt: user.createdAt
  };
}

module.exports = {
  getAccountSummary,
  publicUser
};
