const test = require('node:test');
const assert = require('node:assert/strict');
const {
  maintenanceConfig,
  maintenanceCutoffs
} = require('../services/databaseMaintenance');
const {
  maintenanceIsStale,
  nextMaintenanceAt
} = require('../services/databaseMaintenanceScheduler');

test('数据库维护配置会限制在安全范围内', () => {
  const config = maintenanceConfig({
    AUTO_DATABASE_MAINTENANCE_ENABLED: 'true',
    DATABASE_MAINTENANCE_HOUR: '27',
    QUIZ_SESSION_RETENTION_DAYS: '0',
    ANSWER_RECORD_RETENTION_DAYS: '-2'
  });

  assert.equal(config.enabled, true);
  assert.equal(config.hour, 23);
  assert.equal(config.quizSessionRetentionDays, 1);
  assert.equal(config.answerRecordRetentionDays, 0);
});

test('默认只清理技术性会话并永久保留答题记录', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');
  const config = maintenanceConfig({});
  const cutoffs = maintenanceCutoffs(now, config);

  assert.equal(config.quizSessionRetentionDays, 7);
  assert.equal(config.answerRecordRetentionDays, 0);
  assert.equal(
    cutoffs.staleQuizSessionBefore.toISOString(),
    '2026-07-17T12:00:00.000Z'
  );
  assert.equal(cutoffs.staleAnswerRecordBefore, null);
});

test('维护调度每天执行并能识别过期状态', () => {
  const now = new Date(2026, 6, 24, 12, 0, 0);
  const next = nextMaintenanceAt(now, 4);
  assert.equal(next.getFullYear(), 2026);
  assert.equal(next.getMonth(), 6);
  assert.equal(next.getDate(), 25);
  assert.equal(next.getHours(), 4);
  assert.equal(next.getMinutes(), 0);
  const staleNow = new Date('2026-07-24T12:00:00.000Z');
  assert.equal(maintenanceIsStale(null, staleNow), true);
  assert.equal(maintenanceIsStale({
    status: 'success',
    completedAt: '2026-07-24T10:00:00.000Z'
  }, staleNow), false);
  assert.equal(maintenanceIsStale({
    status: 'success',
    completedAt: '2026-07-23T10:00:00.000Z'
  }, staleNow), true);
});
