require('dotenv').config({ quiet: true });

const assert = require('node:assert/strict');
const fs = require('fs/promises');
const {
  createDatabaseBackup,
  readBackup,
  restoreDatabaseBackup
} = require('../services/databaseBackup');
const { closePool } = require('../services/mysqlClient');
const { hashPassword } = require('../services/passwordService');
const {
  createUser,
  deleteUserAndData,
  findUserByUsername
} = require('../services/userStore');
const { createId } = require('../utils/id');

async function removeFile(filePath) {
  if (!filePath) return;
  await fs.unlink(filePath).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

async function main() {
  const stamp = Date.now();
  const username = `backup_test_${stamp}`;
  const files = [];
  let userId = '';

  try {
    const baselineResult = await createDatabaseBackup({ prefix: 'test-baseline' });
    files.push(baselineResult.filePath);
    const baseline = await readBackup(baselineResult.filePath);

    userId = createId('user');
    await createUser({
      id: userId,
      username,
      passwordHash: await hashPassword('BackupTest123!'),
      role: 'student',
      createdAt: new Date().toISOString()
    });

    const scenarioResult = await createDatabaseBackup({ prefix: 'test-scenario' });
    files.push(scenarioResult.filePath);
    await deleteUserAndData(userId);
    assert.equal(await findUserByUsername(username), null);

    await restoreDatabaseBackup(scenarioResult.filePath, { createSafetyBackup: false });
    assert.ok(await findUserByUsername(username), '场景备份未恢复测试用户');

    await restoreDatabaseBackup(baselineResult.filePath, { createSafetyBackup: false });
    assert.equal(await findUserByUsername(username), null, '基线恢复后仍存在测试用户');

    const finalResult = await createDatabaseBackup({ prefix: 'test-final' });
    files.push(finalResult.filePath);
    const finalBackup = await readBackup(finalResult.filePath);
    assert.deepEqual(finalBackup.tables, baseline.tables);

    console.log(`数据库备份恢复测试通过：${JSON.stringify({
      tableCount: Object.keys(baseline.tables).length,
      counts: baseline.metadata.counts,
      exactBaselineRestored: true
    })}`);
  } finally {
    if (userId) {
      await deleteUserAndData(userId).catch(() => {});
    }
    for (const filePath of files) {
      await removeFile(filePath);
    }
  }
}

main()
  .catch((error) => {
    console.error(`数据库备份恢复测试失败：${error.stack || error.message}`);
    process.exitCode = 1;
  })
  .finally(closePool);
