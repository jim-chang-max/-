const test = require('node:test');
const assert = require('node:assert/strict');
const {
  backupCheck,
  configurationChecks,
  diskCheck,
  maintenanceCheck,
  safeSessionSecret,
  summarizeChecks,
  windowsChecks
} = require('../services/hostDiagnostics');

test('配置检查不会暴露凭据并能识别弱会话密钥', () => {
  const weakEnvironment = {
    STORAGE_DRIVER: 'mysql',
    DB_HOST: '127.0.0.1',
    DB_PASSWORD: 'sensitive-password',
    HOST: '0.0.0.0',
    SESSION_SECRET: 'change-this-session-secret'
  };
  const weakChecks = configurationChecks(weakEnvironment);
  const serialized = JSON.stringify(weakChecks);

  assert.equal(safeSessionSecret(weakEnvironment), false);
  assert.equal(
    weakChecks.find((item) => item.id === 'session_secret').status,
    'fail'
  );
  assert.equal(serialized.includes('sensitive-password'), false);

  const strongEnvironment = {
    ...weakEnvironment,
    SESSION_SECRET: 'a'.repeat(48)
  };
  assert.equal(safeSessionSecret(strongEnvironment), true);
  assert.equal(
    configurationChecks(strongEnvironment)
      .find((item) => item.id === 'session_secret').status,
    'pass'
  );
});

test('磁盘和备份检查使用明确的告警阈值', () => {
  assert.equal(diskCheck(3 * 1024 ** 3).status, 'pass');
  assert.equal(diskCheck(1024 ** 3).status, 'warn');
  assert.equal(diskCheck(100 * 1024 ** 2).status, 'fail');

  const now = new Date('2026-07-24T12:00:00.000Z');
  assert.equal(backupCheck(null, false, now).status, 'fail');
  assert.equal(backupCheck({
    fileName: 'backup.json',
    modifiedAt: '2026-07-24T00:00:00.000Z'
  }, true, now).status, 'pass');
  assert.equal(backupCheck({
    fileName: 'backup.json',
    modifiedAt: '2026-07-22T12:00:00.000Z'
  }, true, now).status, 'warn');
});

test('数据库维护检查会识别禁用、失败和过期状态', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');
  assert.equal(maintenanceCheck(null, false, now).status, 'warn');
  assert.equal(maintenanceCheck(null, true, now).status, 'fail');
  assert.equal(maintenanceCheck({
    status: 'error',
    completedAt: '2026-07-24T10:00:00.000Z'
  }, true, now).status, 'fail');
  assert.equal(maintenanceCheck({
    status: 'success',
    completedAt: '2026-07-24T10:00:00.000Z',
    removed: { expiredUserSessions: 2 }
  }, true, now).status, 'pass');
  assert.equal(maintenanceCheck({
    status: 'success',
    completedAt: '2026-07-21T00:00:00.000Z',
    removed: {}
  }, true, now).status, 'fail');
});

test('Windows 托管状态和汇总结果可重复判定', () => {
  const checks = windowsChecks({
    supported: true,
    startupTask: {
      accessible: true,
      installed: true,
      enabled: true,
      state: 'Ready'
    },
    firewall: {
      accessible: true,
      installed: true,
      enabled: 'True',
      action: 'Allow',
      localPort: '3000'
    },
    networkProfiles: {
      accessible: true,
      items: [{ NetworkCategory: 'Private' }]
    }
  });

  assert.ok(checks.every((item) => item.status === 'pass'));
  assert.deepEqual(summarizeChecks([
    ...checks,
    { status: 'warn' },
    { status: 'fail' }
  ]), {
    pass: 3,
    warn: 1,
    fail: 1,
    overall: 'fail'
  });
});
