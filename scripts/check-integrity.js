require('dotenv').config({ quiet: true });

process.env.STORAGE_DRIVER = 'mysql';

const { checkRelationalIntegrity } = require('../services/dataIntegrity');
const { closePool } = require('../services/mysqlClient');

async function main() {
  const result = await checkRelationalIntegrity();
  for (const relationship of result.relationships) {
    const status = relationship.orphanCount === 0 ? '通过' : '失败';
    console.log(
      `[${status}] ${relationship.id}：${relationship.orphanCount} 条孤立记录`
    );
  }
  console.log(
    result.ok
      ? `数据库关系完整：${result.relationships.length} 项检查全部通过。`
      : `数据库存在 ${result.orphanCount} 条孤立记录。`
  );
  if (!result.ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(`数据库完整性检查失败：${error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
