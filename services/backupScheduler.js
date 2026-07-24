const {
  cleanupOldBackups,
  createDatabaseBackup,
  getLatestBackupInfo
} = require('./databaseBackup');
const { logEvent } = require('./appLogger');
const { isMysqlEnabled } = require('./mysqlClient');

const DAY_MS = 24 * 60 * 60 * 1000;

function envEnabled(value, fallback = true) {
  if (value === undefined || value === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(value).toLowerCase());
}

function backupHour() {
  return Math.min(Math.max(Number(process.env.AUTO_BACKUP_HOUR) || 3, 0), 23);
}

function nextBackupAt(now = new Date(), hour = backupHour()) {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function backupIsStale(latestBackup, now = new Date()) {
  if (!latestBackup?.modifiedAt) return true;
  const modifiedAt = new Date(latestBackup.modifiedAt).getTime();
  return Number.isNaN(modifiedAt) || now.getTime() - modifiedAt >= DAY_MS;
}

async function runScheduledBackup(options = {}) {
  const createBackup = options.createBackup || createDatabaseBackup;
  const cleanupBackups = options.cleanupBackups || cleanupOldBackups;
  const logger = options.logger || logEvent;
  const retentionDays = Math.min(
    Math.max(Number(options.retentionDays || process.env.BACKUP_RETENTION_DAYS) || 30, 1),
    3650
  );
  const result = await createBackup();
  const removed = await cleanupBackups({ retentionDays });

  await logger('info', 'scheduled_backup_completed', {
    fileName: result.fileName,
    removedFiles: removed,
    retentionDays
  }).catch(() => {});

  return { ...result, removedFiles: removed, retentionDays };
}

function startBackupScheduler(options = {}) {
  const enabled = options.enabled ?? (
    isMysqlEnabled() && envEnabled(process.env.AUTO_BACKUP_ENABLED, true)
  );

  if (!enabled) {
    return {
      enabled: false,
      nextRunAt: null,
      stop() {}
    };
  }

  const scheduleHour = options.hour ?? backupHour();
  const initialDelayMs = Math.max(Number(options.initialDelayMs) || 5000, 0);
  let stopped = false;
  let running = false;
  let initialTimer = null;
  let dailyTimer = null;
  let nextRun = null;

  async function execute(reason) {
    if (stopped || running) return;
    running = true;
    try {
      await runScheduledBackup(options);
    } catch (error) {
      await logEvent('error', 'scheduled_backup_failed', {
        reason,
        message: String(error.message || error).slice(0, 1000)
      }).catch(() => {});
    } finally {
      running = false;
    }
  }

  function scheduleNext() {
    if (stopped) return;
    nextRun = nextBackupAt(new Date(), scheduleHour);
    const delay = Math.max(nextRun.getTime() - Date.now(), 1000);
    dailyTimer = setTimeout(async () => {
      await execute('daily');
      scheduleNext();
    }, delay);
    dailyTimer.unref?.();
  }

  initialTimer = setTimeout(async () => {
    try {
      const latest = await getLatestBackupInfo();
      if (backupIsStale(latest)) {
        await execute('startup_catchup');
      }
    } catch (error) {
      await logEvent('error', 'scheduled_backup_check_failed', {
        message: String(error.message || error).slice(0, 1000)
      }).catch(() => {});
    }
  }, initialDelayMs);
  initialTimer.unref?.();
  scheduleNext();

  return {
    enabled: true,
    get nextRunAt() {
      return nextRun?.toISOString() || null;
    },
    stop() {
      stopped = true;
      clearTimeout(initialTimer);
      clearTimeout(dailyTimer);
    }
  };
}

module.exports = {
  backupIsStale,
  nextBackupAt,
  runScheduledBackup,
  startBackupScheduler
};
