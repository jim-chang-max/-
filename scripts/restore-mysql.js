require('dotenv').config({ quiet: true });

const path = require('path');
const { restoreDatabaseBackup } = require('../services/databaseBackup');
const { closePool, isMysqlEnabled } = require('../services/mysqlClient');

async function main() {
  if (!isMysqlEnabled()) {
    throw new Error('请先在 .env 中把 STORAGE_DRIVER 设置为 mysql');
  }

  const args = process.argv.slice(2);
  const fileArgument = args.find((arg) => arg !== '--confirm');
  if (!fileArgument) {
    throw new Error('请提供备份文件路径');
  }
  if (!args.includes('--confirm')) {
    throw new Error('恢复会覆盖当前数据库，请在命令末尾添加 --confirm');
  }

  const result = await restoreDatabaseBackup(path.resolve(fileArgument));
  console.log(`数据库恢复完成：${result.restoredFrom}`);
  console.log(`恢复前安全备份：${result.safetyBackup.filePath}`);
}

main()
  .catch((error) => {
    console.error(`数据库恢复失败：${error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
