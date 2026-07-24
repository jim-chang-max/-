require('dotenv').config({ quiet: true });

process.env.STORAGE_DRIVER = 'mysql';

const { closePool, getPool, testConnection } = require('../services/mysqlClient');
const { migrationStatus } = require('../services/databaseMigration');
const { checkRelationalIntegrity } = require('../services/dataIntegrity');

async function main() {
  await testConnection();
  const migration = await migrationStatus();
  if (!migration.valid || migration.pendingVersions.length) {
    throw new Error(
      `数据库迁移状态异常：当前 ${migration.currentVersion || '未登记'}，` +
      `待执行 ${migration.pendingVersions.join(', ') || '无'}`
    );
  }
  const integrity = await checkRelationalIntegrity();
  if (!integrity.ok) {
    throw new Error(`数据库存在 ${integrity.orphanCount} 条孤立记录`);
  }
  const tables = [
    'questions',
    'users',
    'user_sessions',
    'mistakes',
    'review_plans',
    'review_tasks',
    'quiz_sessions',
    'quiz_history',
    'quiz_answers',
    'answer_records',
    'topic_progress'
  ];
  const counts = {};

  for (const table of tables) {
    const [rows] = await getPool().query(`SELECT COUNT(*) AS count FROM \`${table}\``);
    counts[table] = Number(rows[0].count);
  }

  console.log(
    `MySQL 连接正常（迁移版本 ${migration.currentVersion}，` +
    `${integrity.relationships.length} 项关系完整）：${JSON.stringify(counts)}`
  );
}

main()
  .catch((error) => {
    console.error(`MySQL 检查失败：${error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
