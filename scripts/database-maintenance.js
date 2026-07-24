require('dotenv').config({ quiet: true });

const {
  maintenanceConfig,
  previewDatabaseMaintenance,
  runDatabaseMaintenance
} = require('../services/databaseMaintenance');
const { closePool } = require('../services/mysqlClient');

function printResult(result) {
  const counts = result.candidates || result.removed || {};
  console.log(`过期登录会话：${counts.expiredUserSessions || 0}`);
  console.log(`过期测验会话：${counts.staleQuizSessions || 0}`);
  console.log(`过期答题记录：${counts.staleAnswerRecords || 0}`);
}

async function main() {
  const confirmed = process.argv.includes('--confirm');
  const config = maintenanceConfig();

  if (!confirmed) {
    const preview = await previewDatabaseMaintenance({ config });
    console.log('数据库维护预览（未删除任何数据）');
    printResult(preview);
    console.log('确认清理请运行：npm run db:maintenance -- --confirm');
    return;
  }

  const result = await runDatabaseMaintenance({ config });
  console.log('数据库维护已完成');
  printResult(result);
}

main()
  .catch((error) => {
    console.error(`数据库维护失败：${error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
