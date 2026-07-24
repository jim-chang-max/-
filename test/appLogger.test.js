const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const {
  cleanupOldLogs,
  getRecentLogs,
  logEvent
} = require('../services/appLogger');

test('结构化日志支持按级别读取并清理过期文件', async () => {
  const originalDirectory = process.env.LOG_DIR;
  const originalRetention = process.env.LOG_RETENTION_DAYS;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lisan-logs-'));

  try {
    process.env.LOG_DIR = directory;
    process.env.LOG_RETENTION_DAYS = '1';
    await logEvent('info', 'test_info', { requestId: 'request-1' });
    await logEvent('error', 'test_error', { requestId: 'request-2' });

    const errors = await getRecentLogs({ level: 'error', limit: 10 });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].event, 'test_error');

    const oldFile = path.join(directory, 'app-2020-01-01.log');
    await fs.writeFile(oldFile, '{}\n', 'utf8');
    const oldDate = new Date(Date.now() - 3 * 86400000);
    await fs.utimes(oldFile, oldDate, oldDate);
    assert.equal(await cleanupOldLogs(), 1);
  } finally {
    if (originalDirectory === undefined) delete process.env.LOG_DIR;
    else process.env.LOG_DIR = originalDirectory;
    if (originalRetention === undefined) delete process.env.LOG_RETENTION_DAYS;
    else process.env.LOG_RETENTION_DAYS = originalRetention;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
