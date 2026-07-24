require('dotenv').config({ quiet: true });

process.env.STORAGE_DRIVER = 'mysql';

const { migrateDatabase } = require('../services/databaseMigration');
const { closePool } = require('../services/mysqlClient');

async function main() {
  const result = await migrateDatabase();
  if (!result.pendingCount) {
    console.log(`数据库已是最新版本：${result.latestVersion}`);
    return;
  }

  const versions = result.appliedNow.map((item) => item.version).join(', ');
  console.log(`数据库迁移完成：${versions}`);
  if (result.safetyBackup) {
    console.log(`迁移前备份：${result.safetyBackup.fileName}`);
  }
}

main()
  .catch((error) => {
    console.error(`数据库迁移失败：${error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
