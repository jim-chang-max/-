const fs = require('fs/promises');
const path = require('path');
const { getLatestBackupInfo } = require('./databaseBackup');
const { migrationStatus } = require('./databaseMigration');
const { getPool, isMysqlEnabled } = require('./mysqlClient');
const { accessUrls } = require('./networkInfo');
const { nextBackupAt } = require('./backupScheduler');
const {
  maintenanceConfig,
  readMaintenanceState
} = require('./databaseMaintenance');
const {
  nextMaintenanceAt
} = require('./databaseMaintenanceScheduler');

const startedAt = Date.now();

function processIsRunning(pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function supervisorStatus(options = {}) {
  const lockPath = options.lockPath
    ? path.resolve(options.lockPath)
    : path.resolve(
        process.cwd(),
        process.env.SERVICE_LOCK_FILE || 'runtime/service.json'
      );

  try {
    const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'));
    const supervisorRunning = processIsRunning(lock.supervisorPid);
    const childRunning = processIsRunning(lock.childPid);
    return {
      managed: true,
      running: supervisorRunning && childRunning,
      supervisorRunning,
      childRunning,
      startedAt: lock.startedAt || null,
      childStartedAt: lock.childStartedAt || null,
      restartCount: Math.max(Number(lock.restartCount) || 0, 0)
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        managed: false,
        running: false,
        supervisorRunning: false,
        childRunning: true,
        startedAt: null,
        childStartedAt: new Date(startedAt).toISOString(),
        restartCount: 0
      };
    }
    return {
      managed: true,
      running: false,
      supervisorRunning: false,
      childRunning: true,
      startedAt: null,
      childStartedAt: new Date(startedAt).toISOString(),
      restartCount: 0,
      error: '监督状态暂不可读'
    };
  }
}

async function databaseStatus(includeCounts = false) {
  if (!isMysqlEnabled()) {
    return {
      enabled: false,
      connected: null,
      latencyMs: null,
      counts: null
    };
  }

  const start = process.hrtime.bigint();
  try {
    await getPool().query('SELECT 1');
    const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;
    let counts = null;

    if (includeCounts) {
      const [rows] = await getPool().query(
        `SELECT
           (SELECT COUNT(*) FROM users) AS users,
           (SELECT COUNT(*) FROM questions) AS questions,
           (SELECT COUNT(*) FROM mistakes WHERE resolved = FALSE) AS unresolved_mistakes`
      );
      counts = {
        users: Number(rows[0].users || 0),
        questions: Number(rows[0].questions || 0),
        unresolvedMistakes: Number(rows[0].unresolved_mistakes || 0)
      };
    }

    return {
      enabled: true,
      connected: true,
      latencyMs: Number(latencyMs.toFixed(2)),
      counts
    };
  } catch (error) {
    return {
      enabled: true,
      connected: false,
      latencyMs: null,
      counts: null,
      error: 'MySQL 连接失败'
    };
  }
}

async function readinessStatus() {
  const database = await databaseStatus(false);
  const ok = database.enabled ? database.connected : true;

  return {
    ok,
    message: ok ? '离散数学复习网站服务已就绪' : '数据库暂不可用',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    database
  };
}

async function detailedSystemStatus() {
  const [
    database,
    latestBackup,
    supervisor,
    migration,
    latestMaintenance
  ] = await Promise.all([
    databaseStatus(true),
    getLatestBackupInfo(),
    supervisorStatus(),
    isMysqlEnabled()
      ? migrationStatus()
      : Promise.resolve({
          databaseExists: false,
          currentVersion: null,
          latestVersion: null,
          pendingVersions: [],
          valid: null
        }),
    readMaintenanceState()
  ]);

  const autoBackupHour = Math.min(
    Math.max(Number(process.env.AUTO_BACKUP_HOUR) || 3, 0),
    23
  );
  const autoBackupEnabled = !['0', 'false', 'off', 'no'].includes(
    String(process.env.AUTO_BACKUP_ENABLED ?? 'true').toLowerCase()
  );
  const databaseMaintenance = maintenanceConfig();

  return {
    ok: database.enabled ? database.connected : true,
    startedAt: new Date(startedAt).toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    nodeVersion: process.version,
    storageDriver: isMysqlEnabled() ? 'mysql' : 'json',
    host: process.env.HOST || '0.0.0.0',
    port: Number(process.env.PORT || 3000),
    accessUrls: accessUrls(
      Number(process.env.PORT || 3000),
      process.env.HOST || '0.0.0.0'
    ),
    autoBackup: {
      enabled: isMysqlEnabled() && autoBackupEnabled,
      hour: autoBackupHour,
      retentionDays: Math.min(
        Math.max(Number(process.env.BACKUP_RETENTION_DAYS) || 30, 1),
        3650
      ),
      nextRunAt: isMysqlEnabled() && autoBackupEnabled
        ? nextBackupAt(new Date(), autoBackupHour).toISOString()
        : null
    },
    autoMaintenance: {
      enabled: isMysqlEnabled() && databaseMaintenance.enabled,
      hour: databaseMaintenance.hour,
      quizSessionRetentionDays:
        databaseMaintenance.quizSessionRetentionDays,
      answerRecordRetentionDays:
        databaseMaintenance.answerRecordRetentionDays,
      nextRunAt: isMysqlEnabled() && databaseMaintenance.enabled
        ? nextMaintenanceAt(
            new Date(),
            databaseMaintenance.hour
          ).toISOString()
        : null
    },
    supervisor,
    logRetentionDays: Math.min(
      Math.max(Number(process.env.LOG_RETENTION_DAYS) || 14, 1),
      365
    ),
    database,
    migration,
    latestBackup,
    latestMaintenance
  };
}

module.exports = {
  detailedSystemStatus,
  readinessStatus,
  supervisorStatus
};
