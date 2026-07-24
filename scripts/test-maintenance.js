require('dotenv').config({ quiet: true });

const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');
const {
  previewDatabaseMaintenance,
  runDatabaseMaintenance
} = require('../services/databaseMaintenance');
const { migrateDatabase } = require('../services/databaseMigration');
const {
  closePool,
  databaseConfig,
  getPool
} = require('../services/mysqlClient');

const originalDatabaseName = process.env.DB_NAME;
const testDatabaseName = `discrete_math_maintenance_test_${process.pid}`;
const statePath = path.resolve(
  process.cwd(),
  'runtime',
  `database-maintenance-test-${process.pid}.json`
);

async function dropTestDatabase() {
  const connection = await mysql.createConnection(databaseConfig(false));
  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${testDatabaseName}\``);
  } finally {
    await connection.end();
  }
}

async function main() {
  process.env.DB_NAME = testDatabaseName;
  await migrateDatabase({ createSafetyBackup: false });

  const pool = getPool();
  const userId = `maintenance-user-${process.pid}`;
  const now = new Date('2026-07-24T12:00:00.000Z');
  const config = {
    enabled: true,
    hour: 4,
    quizSessionRetentionDays: 7,
    answerRecordRetentionDays: 0
  };

  await pool.execute(
    `INSERT INTO users (id, username, password_hash, role)
     VALUES (?, ?, 'test-password-hash', 'student')`,
    [userId, `maintenance_test_${process.pid}`]
  );
  await pool.execute(
    `INSERT INTO user_sessions (session_id, expires_at, session_data)
     VALUES
       ('expired-session', ?, CAST(? AS JSON)),
       ('active-session', ?, CAST(? AS JSON))`,
    [
      now.getTime() - 1000,
      JSON.stringify({ userId }),
      now.getTime() + 60000,
      JSON.stringify({ userId })
    ]
  );
  await pool.execute(
    `INSERT INTO quiz_sessions
       (id, user_id, question_ids, limit_minutes, created_at, expires_at)
     VALUES
       ('old-expired-quiz', ?, CAST('[]' AS JSON), 30, ?, ?),
       ('recent-expired-quiz', ?, CAST('[]' AS JSON), 30, ?, ?),
       ('active-quiz', ?, CAST('[]' AS JSON), 30, ?, ?)`,
    [
      userId,
      new Date(now.getTime() - 10 * 86400000),
      new Date(now.getTime() - 8 * 86400000),
      userId,
      new Date(now.getTime() - 3 * 86400000),
      new Date(now.getTime() - 2 * 86400000),
      userId,
      now,
      new Date(now.getTime() + 60000)
    ]
  );

  const preview = await previewDatabaseMaintenance({ config, now });
  assert.deepEqual(preview.candidates, {
    expiredUserSessions: 1,
    staleQuizSessions: 1,
    staleAnswerRecords: 0
  });

  const beforePreview = await pool.query(
    'SELECT COUNT(*) AS count FROM quiz_sessions'
  );
  assert.equal(Number(beforePreview[0][0].count), 3);

  const result = await runDatabaseMaintenance({
    config,
    now,
    statePath,
    logger: async () => {}
  });
  assert.deepEqual(result.removed, {
    expiredUserSessions: 1,
    staleQuizSessions: 1,
    staleAnswerRecords: 0
  });

  const [sessionRows] = await pool.query(
    'SELECT session_id FROM user_sessions ORDER BY session_id'
  );
  assert.deepEqual(
    sessionRows.map((row) => row.session_id),
    ['active-session']
  );
  const [quizRows] = await pool.query(
    'SELECT id FROM quiz_sessions ORDER BY id'
  );
  assert.deepEqual(
    quizRows.map((row) => row.id),
    ['active-quiz', 'recent-expired-quiz']
  );

  console.log('数据库维护测试通过：预览不删除数据，确认后仅清理超过保留期的技术性会话。');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
    await dropTestDatabase().catch(() => {});
    await fs.unlink(statePath).catch(() => {});
    if (originalDatabaseName === undefined) {
      delete process.env.DB_NAME;
    } else {
      process.env.DB_NAME = originalDatabaseName;
    }
  });
