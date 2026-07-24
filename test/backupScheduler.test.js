const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { cleanupOldBackups } = require('../services/databaseBackup');
const {
  backupIsStale,
  nextBackupAt,
  runScheduledBackup
} = require('../services/backupScheduler');

test('每日备份时间计算到下一次指定小时', () => {
  const beforeHour = new Date(2026, 6, 24, 2, 30, 0);
  const afterHour = new Date(2026, 6, 24, 4, 0, 0);

  assert.equal(
    nextBackupAt(beforeHour, 3).getTime(),
    new Date(2026, 6, 24, 3, 0, 0).getTime()
  );
  assert.equal(
    nextBackupAt(afterHour, 3).getTime(),
    new Date(2026, 6, 25, 3, 0, 0).getTime()
  );
});

test('超过 24 小时或没有备份时需要补做备份', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');
  assert.equal(backupIsStale(null, now), true);
  assert.equal(
    backupIsStale({ modifiedAt: '2026-07-24T00:00:01.000Z' }, now),
    false
  );
  assert.equal(
    backupIsStale({ modifiedAt: '2026-07-23T11:59:59.000Z' }, now),
    true
  );
});

test('过期清理只删除普通定时备份并保留最新一份', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dm-backup-cleanup-'));
  const now = new Date('2026-07-24T12:00:00.000Z');
  const oldDate = new Date('2026-06-01T12:00:00.000Z');
  const files = [
    'discrete-math-review-20260724-120000.json',
    'discrete-math-review-20260601-120000.json',
    'pre-restore-20260601-120000.json',
    'notes.json'
  ];

  try {
    for (const file of files) {
      const filePath = path.join(directory, file);
      await fs.writeFile(filePath, '{}', 'utf8');
      await fs.utimes(
        filePath,
        file.includes('20260724') ? now : oldDate,
        file.includes('20260724') ? now : oldDate
      );
    }

    const removed = await cleanupOldBackups({
      directory,
      retentionDays: 30,
      now
    });
    const remaining = await fs.readdir(directory);

    assert.deepEqual(removed, ['discrete-math-review-20260601-120000.json']);
    assert.ok(remaining.includes('discrete-math-review-20260724-120000.json'));
    assert.ok(remaining.includes('pre-restore-20260601-120000.json'));
    assert.ok(remaining.includes('notes.json'));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('调度备份会创建备份并执行保留清理', async () => {
  let createCalled = 0;
  let cleanupOptions = null;
  const result = await runScheduledBackup({
    retentionDays: 21,
    async logger() {},
    async createBackup() {
      createCalled += 1;
      return {
        fileName: 'discrete-math-review-test.json',
        filePath: 'test',
        createdAt: new Date().toISOString(),
        counts: {}
      };
    },
    async cleanupBackups(options) {
      cleanupOptions = options;
      return ['old.json'];
    }
  });

  assert.equal(createCalled, 1);
  assert.equal(cleanupOptions.retentionDays, 21);
  assert.deepEqual(result.removedFiles, ['old.json']);
});
