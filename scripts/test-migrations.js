require('dotenv').config({ quiet: true });

const assert = require('assert/strict');
const fs = require('fs/promises');
const mysql = require('mysql2/promise');
const os = require('os');
const path = require('path');
const { databaseConfig, closePool, getPool } = require('../services/mysqlClient');
const { migrationStatus } = require('../services/databaseMigration');
const { checkRelationalIntegrity } = require('../services/dataIntegrity');
const {
  createDatabaseBackup,
  restoreDatabaseBackup
} = require('../services/databaseBackup');

const temporaryDatabase = `dm_migration_test_${process.pid}_${Date.now()}`;
process.env.DB_NAME = temporaryDatabase;
process.env.STORAGE_DRIVER = 'mysql';

const { initializeDatabase } = require('./init-mysql');

async function dropTemporaryDatabase() {
  if (!/^dm_migration_test_\d+_\d+$/.test(temporaryDatabase)) {
    throw new Error('拒绝删除名称不符合测试规则的数据库');
  }
  await closePool();
  const connection = await mysql.createConnection(databaseConfig(false));
  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${temporaryDatabase}\``);
  } finally {
    await connection.end();
  }
}

async function main() {
  const temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'dm-migration-restore-')
  );
  try {
    const first = await initializeDatabase({ createSafetyBackup: false });
    assert.equal(first.seeded, true);
    assert.deepEqual(
      first.migration.appliedNow.map((item) => item.version),
      ['001', '002']
    );

    const [questionRows] = await getPool().query(
      'SELECT id FROM questions ORDER BY id LIMIT 1'
    );
    assert.equal(questionRows.length, 1);
    const questionId = questionRows[0].id;
    await getPool().execute(
      `UPDATE questions
       SET wrong_count = 77, review_status = '易错'
       WHERE id = ?`,
      [questionId]
    );
    await closePool();

    const second = await initializeDatabase({ createSafetyBackup: false });
    assert.equal(second.seeded, false);
    assert.equal(second.migration.pendingCount, 0);

    const [preservedRows] = await getPool().execute(
      'SELECT wrong_count, review_status FROM questions WHERE id = ?',
      [questionId]
    );
    assert.equal(Number(preservedRows[0].wrong_count), 77);
    assert.equal(preservedRows[0].review_status, '易错');

    const [countRows] = await getPool().query(
      `SELECT
         (SELECT COUNT(*) FROM questions) AS questions,
         (SELECT COUNT(*) FROM users) AS users,
         (SELECT COUNT(*) FROM schema_migrations) AS migrations`
    );
    assert.equal(Number(countRows[0].questions), 109);
    assert.equal(Number(countRows[0].users), 1);
    assert.equal(Number(countRows[0].migrations), 2);

    const status = await migrationStatus();
    assert.equal(status.valid, true);
    assert.equal(status.currentVersion, '002');
    assert.deepEqual(status.pendingVersions, []);

    const cascadeUserId = 'migration-cascade-user';
    const historyId = 'migration-cascade-history';
    const sessionId = 'migration-cascade-session';
    await getPool().execute(
      `INSERT INTO users (id, username, password_hash, role)
       VALUES (?, ?, ?, 'student')`,
      [cascadeUserId, 'migration_cascade_user', 'test-password-hash']
    );
    await getPool().execute(
      `INSERT INTO mistakes
         (user_id, question_id, wrong_count, last_wrong_at, resolved, reason)
       VALUES (?, ?, 1, NOW(), FALSE, 'migration test')`,
      [cascadeUserId, questionId]
    );
    await getPool().execute(
      `INSERT INTO review_plans (user_id, exam_date)
       VALUES (?, '2026-12-31')`,
      [cascadeUserId]
    );
    await getPool().execute(
      `INSERT INTO review_tasks
         (id, user_id, task_date, type, title, completed)
       VALUES ('migration-cascade-task', ?, '2026-12-01', 'topic', 'test', FALSE)`,
      [cascadeUserId]
    );
    await getPool().execute(
      `INSERT INTO quiz_history
         (id, user_id, submitted_at, total_score, full_score, accuracy)
       VALUES (?, ?, NOW(), 1, 1, 100)`,
      [historyId, cascadeUserId]
    );
    await getPool().execute(
      `INSERT INTO quiz_sessions
         (id, user_id, question_ids, limit_minutes, created_at, expires_at)
       VALUES (?, ?, CAST(? AS JSON), 30, NOW(), DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
      [sessionId, cascadeUserId, JSON.stringify([questionId])]
    );
    await getPool().execute(
      `INSERT INTO quiz_answers
         (history_id, question_id, stem, user_answer, correct_answer,
          correct, score, full_score, analysis)
       VALUES (?, ?, 'test', 'test', 'test', TRUE, 1, 1, 'test')`,
      [historyId, questionId]
    );
    await getPool().execute(
      `INSERT INTO answer_records
         (user_id, question_id, mode, user_answer, correct, answered_at)
       VALUES (?, ?, 'practice', 'test', TRUE, NOW())`,
      [cascadeUserId, questionId]
    );
    await getPool().execute(
      `INSERT INTO topic_progress
         (user_id, knowledge_id, status, review_count, last_reviewed_at)
       VALUES (?, 'migration-cascade-topic', '已掌握', 1, CURDATE())`,
      [cascadeUserId]
    );

    await getPool().execute('DELETE FROM users WHERE id = ?', [cascadeUserId]);
    const [cascadeRows] = await getPool().query(
      `SELECT
         (SELECT COUNT(*) FROM mistakes WHERE user_id = 'migration-cascade-user') AS mistakes,
         (SELECT COUNT(*) FROM review_plans WHERE user_id = 'migration-cascade-user') AS plans,
         (SELECT COUNT(*) FROM review_tasks WHERE user_id = 'migration-cascade-user') AS tasks,
         (SELECT COUNT(*) FROM quiz_history WHERE user_id = 'migration-cascade-user') AS histories,
         (SELECT COUNT(*) FROM quiz_sessions WHERE user_id = 'migration-cascade-user') AS sessions,
         (SELECT COUNT(*) FROM quiz_answers WHERE history_id = 'migration-cascade-history') AS answers,
         (SELECT COUNT(*) FROM answer_records WHERE user_id = 'migration-cascade-user') AS records,
         (SELECT COUNT(*) FROM topic_progress WHERE user_id = 'migration-cascade-user') AS progress`
    );
    for (const count of Object.values(cascadeRows[0])) {
      assert.equal(Number(count), 0);
    }
    assert.equal((await checkRelationalIntegrity()).ok, true);

    const sourcePath = path.join(temporaryDirectory, 'source.json');
    const legacyPath = path.join(temporaryDirectory, 'legacy.json');
    const invalidPath = path.join(temporaryDirectory, 'invalid.json');
    await createDatabaseBackup({ filePath: sourcePath });
    const backup = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
    backup.metadata.schemaVersion = null;
    for (const table of [
      'mistakes',
      'review_plans',
      'review_tasks',
      'quiz_history',
      'quiz_sessions',
      'answer_records',
      'topic_progress'
    ]) {
      for (const row of backup.tables[table]) {
        if (row.user_id === 'user-demo') row.user_id = 'guest';
      }
    }
    await fs.writeFile(legacyPath, JSON.stringify(backup), 'utf8');

    const restored = await restoreDatabaseBackup(legacyPath, {
      createSafetyBackup: false
    });
    assert.equal(restored.integrity.ok, true);
    assert.ok(restored.legacyRepair.affectedRows > 0);
    const [legacyRows] = await getPool().query(
      `SELECT
         (SELECT COUNT(*) FROM review_plans WHERE user_id = 'guest') AS plans,
         (SELECT COUNT(*) FROM review_tasks WHERE user_id = 'guest') AS tasks,
         (SELECT COUNT(*) FROM topic_progress WHERE user_id = 'guest') AS progress`
    );
    assert.ok(Object.values(legacyRows[0]).every((count) => Number(count) === 0));

    const invalidBackup = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
    invalidBackup.tables.topic_progress[0].user_id = 'unknown-legacy-user';
    await fs.writeFile(invalidPath, JSON.stringify(invalidBackup), 'utf8');
    await assert.rejects(
      restoreDatabaseBackup(invalidPath, { createSafetyBackup: false }),
      /备份包含孤立关系/
    );
    assert.equal((await checkRelationalIntegrity()).ok, true);

    console.log(
      '数据库迁移测试通过：安全播种、级联删除、旧备份修复和异常回滚均正常。'
    );
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
    await dropTemporaryDatabase();
  }
}

main().catch((error) => {
  console.error(`数据库迁移测试失败：${error.stack || error.message}`);
  process.exitCode = 1;
});
