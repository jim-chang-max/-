const { logEvent } = require('./appLogger');
const {
  maintenanceConfig,
  readMaintenanceState,
  runDatabaseMaintenance
} = require('./databaseMaintenance');
const { isMysqlEnabled } = require('./mysqlClient');

const DAY_MS = 24 * 60 * 60 * 1000;

function nextMaintenanceAt(now = new Date(), hour = maintenanceConfig().hour) {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

function maintenanceIsStale(state, now = new Date()) {
  if (!state?.completedAt || state.status !== 'success') return true;
  const completedAt = new Date(state.completedAt).getTime();
  return Number.isNaN(completedAt) || now.getTime() - completedAt >= DAY_MS;
}

function startDatabaseMaintenanceScheduler(options = {}) {
  const config = options.config || maintenanceConfig();
  const enabled = options.enabled ?? (isMysqlEnabled() && config.enabled);

  if (!enabled) {
    return {
      enabled: false,
      nextRunAt: null,
      stop() {}
    };
  }

  const initialDelayMs = Math.max(Number(options.initialDelayMs) || 8000, 0);
  let stopped = false;
  let running = false;
  let initialTimer = null;
  let dailyTimer = null;
  let nextRun = null;

  async function execute(reason) {
    if (stopped || running) return;
    running = true;
    try {
      await runDatabaseMaintenance({
        config,
        logger: options.logger,
        statePath: options.statePath
      });
    } catch (error) {
      await (options.logger || logEvent)(
        'error',
        'scheduled_database_maintenance_failed',
        {
          reason,
          message: String(error.message || error).slice(0, 1000)
        }
      ).catch(() => {});
    } finally {
      running = false;
    }
  }

  function scheduleNext() {
    if (stopped) return;
    nextRun = nextMaintenanceAt(new Date(), config.hour);
    const delay = Math.max(nextRun.getTime() - Date.now(), 1000);
    dailyTimer = setTimeout(async () => {
      await execute('daily');
      scheduleNext();
    }, delay);
    dailyTimer.unref?.();
  }

  initialTimer = setTimeout(async () => {
    try {
      const latest = await readMaintenanceState({
        statePath: options.statePath
      });
      if (maintenanceIsStale(latest)) {
        await execute('startup_catchup');
      }
    } catch (error) {
      await (options.logger || logEvent)(
        'error',
        'scheduled_database_maintenance_check_failed',
        { message: String(error.message || error).slice(0, 1000) }
      ).catch(() => {});
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
  maintenanceIsStale,
  nextMaintenanceAt,
  startDatabaseMaintenanceScheduler
};
