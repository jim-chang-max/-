require('dotenv').config({ quiet: true });

const assert = require('node:assert/strict');
const { closePool, getPool } = require('../services/mysqlClient');
const {
  deleteUserAndData,
  updateUserRole
} = require('../services/userStore');

const baseUrl = `http://localhost:${process.env.PORT || 3000}`;

function apiClient() {
  let cookie = '';

  return async (path, options = {}) => {
    const response = await fetch(baseUrl + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => null);
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      cookie = setCookie.split(';')[0];
    }
    return { status: response.status, data };
  };
}

async function insertRelatedTestData(userId, questionId, stamp) {
  const pool = getPool();
  const historyId = `account-history-${stamp}`;

  await pool.execute(
    `INSERT INTO answer_records
       (user_id, question_id, mode, user_answer, correct, answered_at)
     VALUES (?, ?, 'practice', 'test', TRUE, NOW())`,
    [userId, questionId]
  );
  await pool.execute(
    `INSERT INTO quiz_history
       (id, user_id, submitted_at, total_score, full_score, accuracy)
     VALUES (?, ?, NOW(), 10, 10, 100)`,
    [historyId, userId]
  );
  await pool.execute(
    `INSERT INTO quiz_answers
       (history_id, question_id, stem, user_answer, correct_answer, correct, score, full_score, analysis)
     VALUES (?, ?, 'test', 'test', 'test', TRUE, 10, 10, 'test')`,
    [historyId, questionId]
  );
  await pool.execute(
    `INSERT INTO quiz_sessions
       (id, user_id, question_ids, limit_minutes, created_at, expires_at, submitted_at)
     VALUES (?, ?, JSON_ARRAY(?), 20, NOW(), DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL)`,
    [`account-quiz-${stamp}`, userId, questionId]
  );

  return historyId;
}

async function assertUserDataRemoved(userId, historyId) {
  const pool = getPool();
  const counts = {};
  const tables = [
    'users',
    'user_sessions',
    'mistakes',
    'review_plans',
    'review_tasks',
    'quiz_sessions',
    'quiz_history',
    'answer_records',
    'topic_progress'
  ];

  for (const table of tables) {
    let sql;
    if (table === 'users') {
      sql = 'SELECT COUNT(*) AS count FROM users WHERE id = ?';
    } else if (table === 'user_sessions') {
      sql = `SELECT COUNT(*) AS count
             FROM user_sessions
             WHERE JSON_UNQUOTE(JSON_EXTRACT(session_data, '$.userId')) = ?`;
    } else {
      sql = `SELECT COUNT(*) AS count FROM ${table} WHERE user_id = ?`;
    }

    const [rows] = await pool.execute(sql, [userId]);
    counts[table] = Number(rows[0].count);
    assert.equal(counts[table], 0, `${table} 未清理干净`);
  }

  const [answerRows] = await pool.execute(
    'SELECT COUNT(*) AS count FROM quiz_answers WHERE history_id = ?',
    [historyId]
  );
  counts.quiz_answers = Number(answerRows[0].count);
  assert.equal(counts.quiz_answers, 0, 'quiz_answers 未清理干净');
  return counts;
}

async function main() {
  const stamp = Date.now();
  const usernames = {
    admin: `account_admin_${stamp}`,
    student: `account_student_${stamp}`
  };
  const userIds = { admin: '', student: '' };
  const admin = apiClient();
  const student = apiClient();
  const oldPasswordLogin = apiClient();
  const newPasswordLogin = apiClient();

  try {
    let result = await admin('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: usernames.admin, password: 'AdminPass123!' })
    });
    assert.equal(result.status, 200);
    userIds.admin = result.data.id;
    await updateUserRole(userIds.admin, 'admin');

    result = await student('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username: usernames.student, password: 'StudentPass123!' })
    });
    assert.equal(result.status, 200);
    userIds.student = result.data.id;

    assert.equal((await student('/api/admin/users')).status, 403);
    assert.equal((await admin(`/api/admin/users/${userIds.admin}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role: 'student' })
    })).status, 400);
    assert.equal((await admin(`/api/admin/users/${userIds.admin}`, {
      method: 'DELETE'
    })).status, 400);

    const topics = (await student('/api/knowledge')).data;
    const questions = (await student('/api/questions')).data;
    await student(`/api/progress/${topics[0].id}`, {
      method: 'PUT',
      body: JSON.stringify({ mastered: true })
    });
    await student('/api/mistakes', {
      method: 'POST',
      body: JSON.stringify({ questionId: questions[0].id, reason: '账户删除测试' })
    });
    const examDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    await student('/api/plans/generate', {
      method: 'POST',
      body: JSON.stringify({ examDate })
    });
    const historyId = await insertRelatedTestData(
      userIds.student,
      questions[0].id,
      stamp
    );

    const summary = await student('/api/account');
    assert.equal(summary.status, 200);
    assert.equal(summary.data.stats.answered, 1);
    assert.equal(summary.data.stats.mistakes, 1);
    assert.equal(summary.data.stats.quizzes, 1);
    assert.equal(summary.data.stats.masteredTopics, 1);
    assert.equal(summary.data.examDate, examDate);

    assert.equal((await student('/api/account/password', {
      method: 'PUT',
      body: JSON.stringify({
        currentPassword: 'wrong-password',
        newPassword: 'NewStudentPass123!'
      })
    })).status, 400);
    assert.equal((await student('/api/account/password', {
      method: 'PUT',
      body: JSON.stringify({
        currentPassword: 'StudentPass123!',
        newPassword: 'NewStudentPass123!'
      })
    })).status, 200);
    assert.equal((await oldPasswordLogin('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: usernames.student,
        password: 'StudentPass123!'
      })
    })).status, 401);
    assert.equal((await newPasswordLogin('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: usernames.student,
        password: 'NewStudentPass123!'
      })
    })).status, 200);

    const adminUsers = await admin('/api/admin/users');
    assert.equal(adminUsers.status, 200);
    assert.ok(adminUsers.data.some((user) => user.id === userIds.student));
    const systemStatus = await admin('/api/admin/system');
    assert.equal(systemStatus.status, 200);
    assert.equal(systemStatus.data.migration.currentVersion, '002');
    assert.equal(systemStatus.data.migration.valid, true);
    assert.equal(systemStatus.data.supervisor.running, true);
    assert.equal(systemStatus.data.autoMaintenance.enabled, true);
    assert.equal(systemStatus.data.autoMaintenance.hour, 4);
    assert.equal(
      systemStatus.data.autoMaintenance.quizSessionRetentionDays,
      7
    );
    assert.equal(systemStatus.data.latestMaintenance.status, 'success');
    assert.equal((await admin(`/api/admin/users/${userIds.student}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role: 'admin' })
    })).status, 200);
    assert.equal((await admin(`/api/admin/users/${userIds.student}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role: 'student' })
    })).status, 200);
    assert.equal((await admin(`/api/admin/users/${userIds.student}`, {
      method: 'DELETE'
    })).status, 200);

    const deletedDataCounts = await assertUserDataRemoved(
      userIds.student,
      historyId
    );
    assert.equal((await newPasswordLogin('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: usernames.student,
        password: 'NewStudentPass123!'
      })
    })).status, 401);

    console.log(`账户端到端测试通过：${JSON.stringify({
      accountStats: summary.data.stats,
      passwordChanged: true,
      roleRoundTrip: true,
      deletedDataCounts
    })}`);
  } finally {
    if (userIds.student) {
      await deleteUserAndData(userIds.student).catch(() => {});
    }
    if (userIds.admin) {
      await deleteUserAndData(userIds.admin).catch(() => {});
    }
  }
}

main()
  .catch((error) => {
    console.error(`账户端到端测试失败：${error.stack || error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
