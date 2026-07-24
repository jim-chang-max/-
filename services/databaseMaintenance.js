const fs = require('fs/promises');
const path = require('path');
const { logEvent } = require('./appLogger');
const { getPool, isMysqlEnabled } = require('./mysqlClient');

const DAY_MS = 24 * 60 * 60 * 1000;

function envEnabled(value, fallback = true) {
  if (value === undefined || value === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(String(value).toLowerCase());
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), minimum), maximum);
}

function maintenanceConfig(environment = process.env) {
  return {
    enabled: envEnabled(environment.AUTO_DATABASE_MAINTENANCE_ENABLED, true),
    hour: boundedInteger(environment.DATABASE_MAINTENANCE_HOUR, 4, 0, 23),
    quizSessionRetentionDays: boundedInteger(
      environment.QUIZ_SESSION_RETENTION_DAYS,
      7,
      1,
      365
    ),
    // 0 表示永久保留用户可见的日常答题记录。
    answerRecordRetentionDays: boundedInteger(
      environment.ANSWER_RECORD_RETENTION_DAYS,
      0,
      0,
      3650
    )
  };
}

function maintenanceCutoffs(now = new Date(), config = maintenanceConfig()) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowMs = nowDate.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new Error('数据库维护时间无效');
  }

  return {
    now: nowDate,
    expiredSessionTimestamp: nowMs,
    staleQuizSessionBefore: new Date(
      nowMs - config.quizSessionRetentionDays * DAY_MS
    ),
    staleAnswerRecordBefore: config.answerRecordRetentionDays > 0
      ? new Date(nowMs - config.answerRecordRetentionDays * DAY_MS)
      : null
  };
}

function maintenanceStatePath(customPath) {
  return customPath
    ? path.resolve(customPath)
    : path.resolve(
        process.cwd(),
        process.env.DATABASE_MAINTENANCE_STATE_FILE ||
          'runtime/database-maintenance.json'
      );
}

async function readMaintenanceState(options = {}) {
  try {
    return JSON.parse(
      await fs.readFile(maintenanceStatePath(options.statePath), 'utf8')
    );
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    return {
      status: 'error',
      completedAt: null,
      message: '维护状态文件无法读取'
    };
  }
}

async function writeMaintenanceState(state, options = {}) {
  const filePath = maintenanceStatePath(options.statePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return state;
}

async function countMaintenanceCandidates(executor, cutoffs) {
  const [sessionRows] = await executor.execute(
    'SELECT COUNT(*) AS count FROM user_sessions WHERE expires_at <= ?',
    [cutoffs.expiredSessionTimestamp]
  );
  const [quizRows] = await executor.execute(
    'SELECT COUNT(*) AS count FROM quiz_sessions WHERE expires_at < ?',
    [cutoffs.staleQuizSessionBefore]
  );

  let answerRecords = 0;
  if (cutoffs.staleAnswerRecordBefore) {
    const [answerRows] = await executor.execute(
      'SELECT COUNT(*) AS count FROM answer_records WHERE answered_at < ?',
      [cutoffs.staleAnswerRecordBefore]
    );
    answerRecords = Number(answerRows[0]?.count || 0);
  }

  return {
    expiredUserSessions: Number(sessionRows[0]?.count || 0),
    staleQuizSessions: Number(quizRows[0]?.count || 0),
    staleAnswerRecords: answerRecords
  };
}

async function previewDatabaseMaintenance(options = {}) {
  if (!isMysqlEnabled() && !options.connection) {
    return {
      enabled: false,
      dryRun: true,
      candidates: {
        expiredUserSessions: 0,
        staleQuizSessions: 0,
        staleAnswerRecords: 0
      }
    };
  }

  const config = options.config || maintenanceConfig();
  const cutoffs = maintenanceCutoffs(options.now || new Date(), config);
  const executor = options.connection || getPool();
  const candidates = await countMaintenanceCandidates(executor, cutoffs);

  return {
    enabled: true,
    dryRun: true,
    checkedAt: cutoffs.now.toISOString(),
    config,
    cutoffs: {
      staleQuizSessionBefore: cutoffs.staleQuizSessionBefore.toISOString(),
      staleAnswerRecordBefore:
        cutoffs.staleAnswerRecordBefore?.toISOString() || null
    },
    candidates
  };
}

let maintenanceRunning = false;

async function runDatabaseMaintenance(options = {}) {
  if (!isMysqlEnabled() && !options.connection) {
    return {
      enabled: false,
      dryRun: Boolean(options.dryRun),
      removed: {
        expiredUserSessions: 0,
        staleQuizSessions: 0,
        staleAnswerRecords: 0
      }
    };
  }

  if (options.dryRun) {
    return previewDatabaseMaintenance(options);
  }
  if (maintenanceRunning && !options.connection) {
    return {
      enabled: true,
      skipped: true,
      reason: 'maintenance_already_running'
    };
  }

  const config = options.config || maintenanceConfig();
  const cutoffs = maintenanceCutoffs(options.now || new Date(), config);
  const connection = options.connection || await getPool().getConnection();
  const ownsConnection = !options.connection;
  const manageTransaction = options.manageTransaction !== false;
  const startedAt = new Date();

  if (ownsConnection) maintenanceRunning = true;

  try {
    if (manageTransaction) await connection.beginTransaction();

    const candidates = await countMaintenanceCandidates(connection, cutoffs);
    const [sessionResult] = await connection.execute(
      'DELETE FROM user_sessions WHERE expires_at <= ?',
      [cutoffs.expiredSessionTimestamp]
    );
    const [quizResult] = await connection.execute(
      'DELETE FROM quiz_sessions WHERE expires_at < ?',
      [cutoffs.staleQuizSessionBefore]
    );

    let removedAnswerRecords = 0;
    if (cutoffs.staleAnswerRecordBefore) {
      const [answerResult] = await connection.execute(
        'DELETE FROM answer_records WHERE answered_at < ?',
        [cutoffs.staleAnswerRecordBefore]
      );
      removedAnswerRecords = Number(answerResult.affectedRows || 0);
    }

    if (manageTransaction) await connection.commit();

    const result = {
      enabled: true,
      dryRun: false,
      status: 'success',
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      config,
      candidates,
      removed: {
        expiredUserSessions: Number(sessionResult.affectedRows || 0),
        staleQuizSessions: Number(quizResult.affectedRows || 0),
        staleAnswerRecords: removedAnswerRecords
      }
    };

    if (options.recordState !== false) {
      await writeMaintenanceState(result, options);
    }
    await (options.logger || logEvent)(
      'info',
      'database_maintenance_completed',
      {
        durationMs: result.durationMs,
        removed: result.removed,
        quizSessionRetentionDays: config.quizSessionRetentionDays,
        answerRecordRetentionDays: config.answerRecordRetentionDays
      }
    ).catch(() => {});
    return result;
  } catch (error) {
    if (manageTransaction) {
      await connection.rollback().catch(() => {});
    }
    const failure = {
      enabled: true,
      dryRun: false,
      status: 'error',
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
      message: String(error.message || error).slice(0, 1000)
    };
    if (options.recordState !== false) {
      await writeMaintenanceState(failure, options).catch(() => {});
    }
    await (options.logger || logEvent)(
      'error',
      'database_maintenance_failed',
      { message: failure.message }
    ).catch(() => {});
    throw error;
  } finally {
    if (ownsConnection) {
      connection.release();
      maintenanceRunning = false;
    }
  }
}

module.exports = {
  DAY_MS,
  maintenanceConfig,
  maintenanceCutoffs,
  maintenanceStatePath,
  previewDatabaseMaintenance,
  readMaintenanceState,
  runDatabaseMaintenance,
  writeMaintenanceState
};
