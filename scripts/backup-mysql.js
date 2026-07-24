require('dotenv').config({ quiet: true });

const { createDatabaseBackup } = require('../services/databaseBackup');
const { closePool, isMysqlEnabled } = require('../services/mysqlClient');

async function main() {
  if (!isMysqlEnabled()) {
    throw new Error('请先在 .env 中把 STORAGE_DRIVER 设置为 mysql');
  }

  const result = await createDatabaseBackup();
  console.log(`数据库备份完成：${result.filePath}`);
  console.log(`备份数量：${JSON.stringify(result.counts)}`);
}

main()
  .catch((error) => {
    console.error(`数据库备份失败：${error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
