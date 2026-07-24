require('dotenv').config({ quiet: true });

const assert = require('assert/strict');
const { checkRelationalIntegrity } = require('../services/dataIntegrity');
const { closePool, getPool } = require('../services/mysqlClient');

const EXPECTED_USER_CONSTRAINTS = [
  'fk_answer_records_user',
  'fk_mistakes_user',
  'fk_quiz_history_user',
  'fk_quiz_sessions_user',
  'fk_review_plans_user',
  'fk_topic_progress_user'
];

async function main() {
  const integrity = await checkRelationalIntegrity();
  assert.equal(integrity.ok, true);
  assert.equal(integrity.orphanCount, 0);

  const [constraintRows] = await getPool().query(
    `SELECT CONSTRAINT_NAME
     FROM information_schema.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = ?
       AND CONSTRAINT_NAME IN (?, ?, ?, ?, ?, ?)
     ORDER BY CONSTRAINT_NAME`,
    [process.env.DB_NAME, ...EXPECTED_USER_CONSTRAINTS]
  );
  assert.deepEqual(
    constraintRows.map((row) => row.CONSTRAINT_NAME),
    [...EXPECTED_USER_CONSTRAINTS].sort()
  );

  const connection = await getPool().getConnection();
  const userId = `integrity-test-${process.pid}`;
  const historyId = `integrity-history-${process.pid}`;
  const sessionId = `integrity-session-${process.pid}`;

  try {
    await connection.beginTransaction();
    const [questionRows] = await connection.query(
      'SELECT id FROM questions ORDER BY id LIMIT 1'
    );
    const questionId = questionRows[0].id;
    await connection.execute(
      `INSERT INTO users (id, username, password_hash, role)
       VALUES (?, ?, 'test-password-hash', 'student')`,
      [userId, `integrity_test_${process.pid}`]
    );
    await connection.execute(
      `INSERT INTO mistakes
         (user_id, question_id, wrong_count, last_wrong_at, resolved, reason)
       VALUES (?, ?, 1, NOW(), FALSE, 'integrity test')`,
      [userId, questionId]
    );
    await connection.execute(
      `INSERT INTO review_plans (user_id, exam_date)
       VALUES (?, '2026-12-31')`,
      [userId]
    );
    await connection.execute(
      `INSERT INTO review_tasks
         (id, user_id, task_date, type, title, completed)
       VALUES (?, ?, '2026-12-01', 'topic', 'test', FALSE)`,
      [`integrity-task-${process.pid}`, userId]
    );
    await connection.execute(
      `INSERT INTO quiz_history
         (id, user_id, submitted_at, total_score, full_score, accuracy)
       VALUES (?, ?, NOW(), 1, 1, 100)`,
      [historyId, userId]
    );
    await connection.execute(
      `INSERT INTO quiz_sessions
         (id, user_id, question_ids, limit_minutes, created_at, expires_at)
       VALUES (?, ?, CAST(? AS JSON), 30, NOW(), DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
      [sessionId, userId, JSON.stringify([questionId])]
    );
    await connection.execute(
      `INSERT INTO quiz_answers
         (history_id, question_id, stem, user_answer, correct_answer,
          correct, score, full_score, analysis)
       VALUES (?, ?, 'test', 'test', 'test', TRUE, 1, 1, 'test')`,
      [historyId, questionId]
    );
    await connection.execute(
      `INSERT INTO answer_records
         (user_id, question_id, mode, user_answer, correct, answered_at)
       VALUES (?, ?, 'practice', 'test', TRUE, NOW())`,
      [userId, questionId]
    );
    await connection.execute(
      `INSERT INTO topic_progress
         (user_id, knowledge_id, status, review_count, last_reviewed_at)
       VALUES (?, 'integrity-test-topic', '已掌握', 1, CURDATE())`,
      [userId]
    );

    await connection.execute('DELETE FROM users WHERE id = ?', [userId]);
    const [rows] = await connection.query(
      `SELECT
         (SELECT COUNT(*) FROM mistakes WHERE user_id = ?) AS mistakes,
         (SELECT COUNT(*) FROM review_plans WHERE user_id = ?) AS plans,
         (SELECT COUNT(*) FROM review_tasks WHERE user_id = ?) AS tasks,
         (SELECT COUNT(*) FROM quiz_history WHERE user_id = ?) AS histories,
         (SELECT COUNT(*) FROM quiz_sessions WHERE user_id = ?) AS sessions,
         (SELECT COUNT(*) FROM quiz_answers WHERE history_id = ?) AS answers,
         (SELECT COUNT(*) FROM answer_records WHERE user_id = ?) AS records,
         (SELECT COUNT(*) FROM topic_progress WHERE user_id = ?) AS progress`,
      [userId, userId, userId, userId, userId, historyId, userId, userId]
    );
    for (const count of Object.values(rows[0])) {
      assert.equal(Number(count), 0);
    }
    await connection.rollback();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  console.log(
    '数据库完整性测试通过：11 项关系、6 个用户外键和事务内级联删除均正常。'
  );
}

main()
  .catch((error) => {
    console.error(`数据库完整性测试失败：${error.stack || error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
