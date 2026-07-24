const fs = require('fs/promises');
const path = require('path');
const { checkRelationalIntegrity } = require('./dataIntegrity');
const { repairLegacyGuestUser } = require('./legacyDataRepair');
const { getPool } = require('./mysqlClient');

const FORMAT_VERSION = 1;
const DATA_TABLES = [
  'app_documents',
  'questions',
  'users',
  'review_plans',
  'review_tasks',
  'mistakes',
  'quiz_history',
  'quiz_sessions',
  'quiz_answers',
  'answer_records',
  'topic_progress'
];

function backupDirectory() {
  return path.resolve(process.cwd(), process.env.BACKUP_DIR || 'backups');
}

function timestampText(date = new Date()) {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0')
  ];
  return `${parts.slice(0, 3).join('')}-${parts.slice(3).join('')}`;
}

function localDateText(value) {
  if (!(value instanceof Date)) return String(value).slice(0, 10);
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0')
  ].join('-');
}

function normalizeValue(value, dataType) {
  if (value !== null && dataType === 'date') return localDateText(value);
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return { __type: 'buffer', base64: value.toString('base64') };
  return value;
}

function normalizeRows(rows, types) {
  return rows
    .map((row) => Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        normalizeValue(value, types.get(key))
      ])
    ))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

async function collectBackup() {
  const tables = {};
  const counts = {};
  let schemaVersion = null;
  const connection = await getPool().getConnection();

  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.beginTransaction();

    try {
      const [versionRows] = await connection.query(
        `SELECT version
         FROM schema_migrations
         ORDER BY CAST(version AS UNSIGNED) DESC
         LIMIT 1`
      );
      schemaVersion = versionRows[0]?.version || null;
    } catch (error) {
      if (error.code !== 'ER_NO_SUCH_TABLE') throw error;
    }

    for (const table of DATA_TABLES) {
      const [rows] = await connection.query(`SELECT * FROM \`${table}\``);
      const types = await columnTypes(connection, table);
      tables[table] = normalizeRows(rows, types);
      counts[table] = rows.length;
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return {
    metadata: {
      app: 'discrete-math-review',
      formatVersion: FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      database: process.env.DB_NAME || 'discrete_math_review',
      schemaVersion,
      excludes: ['user_sessions'],
      counts
    },
    tables
  };
}

async function createDatabaseBackup(options = {}) {
  const directory = backupDirectory();
  const prefix = String(options.prefix || 'discrete-math-review')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 50);
  const filePath = options.filePath
    ? path.resolve(options.filePath)
    : path.join(directory, `${prefix}-${timestampText()}.json`);
  const temporaryPath = `${filePath}.tmp`;
  const backup = await collectBackup();

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(temporaryPath, JSON.stringify(backup, null, 2), 'utf8');
  await fs.rename(temporaryPath, filePath);

  return {
    filePath,
    fileName: path.basename(filePath),
    createdAt: backup.metadata.createdAt,
    counts: backup.metadata.counts
  };
}

function validateBackup(backup) {
  if (!backup || backup.metadata?.app !== 'discrete-math-review') {
    throw new Error('备份文件不属于当前项目');
  }

  if (backup.metadata.formatVersion !== FORMAT_VERSION) {
    throw new Error(`不支持的备份格式版本：${backup.metadata.formatVersion}`);
  }

  for (const table of DATA_TABLES) {
    if (!Array.isArray(backup.tables?.[table])) {
      throw new Error(`备份文件缺少数据表：${table}`);
    }
  }
}

async function columnTypes(connection, table) {
  const [rows] = await connection.query(`SHOW COLUMNS FROM \`${table}\``);
  return new Map(rows.map((row) => [
    row.Field,
    String(row.Type).split('(')[0].toLowerCase()
  ]));
}

function restoreValue(value, dataType) {
  if (value && typeof value === 'object' && value.__type === 'buffer') {
    return Buffer.from(value.base64, 'base64');
  }
  if (value !== null && dataType === 'json') {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }
  if (value && dataType === 'date') {
    return String(value).slice(0, 10);
  }
  if (value && ['datetime', 'timestamp'].includes(dataType)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed;
  }
  return value;
}

async function insertRows(connection, table, rows) {
  if (!rows.length) return;

  const types = await columnTypes(connection, table);
  for (const row of rows) {
    const columns = Object.keys(row);
    if (!columns.every((column) => /^[a-zA-Z0-9_]+$/.test(column))) {
      throw new Error(`数据表 ${table} 含有非法列名`);
    }

    const placeholders = columns.map(() => '?').join(', ');
    const names = columns.map((column) => `\`${column}\``).join(', ');
    const values = columns.map((column) => restoreValue(row[column], types.get(column)));
    await connection.execute(
      `INSERT INTO \`${table}\` (${names}) VALUES (${placeholders})`,
      values
    );
  }
}

async function restoreDatabaseBackup(filePath, options = {}) {
  const resolvedPath = path.resolve(filePath);
  const backup = JSON.parse(await fs.readFile(resolvedPath, 'utf8'));
  validateBackup(backup);

  const safetyBackup = options.createSafetyBackup === false
    ? null
    : await createDatabaseBackup({ prefix: 'pre-restore' });
  const connection = await getPool().getConnection();
  let legacyRepair = null;
  let integrity = null;

  try {
    const [versionRows] = await connection.query(
      `SELECT version
       FROM schema_migrations
       ORDER BY CAST(version AS UNSIGNED) DESC
       LIMIT 1`
    );
    const currentSchemaVersion = versionRows[0]?.version || null;
    const backupSchemaVersion = backup.metadata.schemaVersion || null;
    if (
      backupSchemaVersion &&
      currentSchemaVersion &&
      Number(backupSchemaVersion) > Number(currentSchemaVersion)
    ) {
      throw new Error(
        `备份结构版本 ${backupSchemaVersion} 高于当前数据库版本 ${currentSchemaVersion}`
      );
    }

    await connection.beginTransaction();
    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query('DELETE FROM user_sessions');

    for (const table of [...DATA_TABLES].reverse()) {
      await connection.query(`DELETE FROM \`${table}\``);
    }

    for (const table of DATA_TABLES) {
      await insertRows(connection, table, backup.tables[table]);
    }

    legacyRepair = await repairLegacyGuestUser(connection);
    integrity = await checkRelationalIntegrity({ connection });
    if (!integrity.ok) {
      const summary = integrity.relationships
        .filter((item) => item.orphanCount > 0)
        .map((item) => `${item.id}=${item.orphanCount}`)
        .join(', ');
      throw new Error(`备份包含孤立关系，已取消恢复：${summary}`);
    }

    await connection.query('SET FOREIGN_KEY_CHECKS = 1');
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    connection.release();
  }

  return {
    restoredFrom: resolvedPath,
    safetyBackup,
    counts: backup.metadata.counts,
    legacyRepair,
    integrity
  };
}

async function readBackup(filePath) {
  const backup = JSON.parse(await fs.readFile(filePath, 'utf8'));
  validateBackup(backup);
  return backup;
}

async function getLatestBackupInfo() {
  const directory = backupDirectory();
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const filePath = path.join(directory, entry.name);
    const stat = await fs.stat(filePath);
    files.push({ fileName: entry.name, filePath, size: stat.size, modifiedAt: stat.mtime });
  }

  files.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  const latest = files[0];
  return latest
    ? {
        fileName: latest.fileName,
        size: latest.size,
        modifiedAt: latest.modifiedAt.toISOString()
      }
    : null;
}

async function cleanupOldBackups(options = {}) {
  const directory = path.resolve(options.directory || backupDirectory());
  const retentionDays = Math.min(
    Math.max(Number(options.retentionDays) || 30, 1),
    3650
  );
  const now = options.now instanceof Date ? options.now.getTime() : Date.now();
  const cutoff = now - retentionDays * 86400000;
  let entries;

  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !/^discrete-math-review-\d{8}-\d{6}\.json$/.test(entry.name)
    ) {
      continue;
    }
    const filePath = path.join(directory, entry.name);
    const stat = await fs.stat(filePath);
    files.push({ filePath, fileName: entry.name, modifiedAt: stat.mtimeMs });
  }

  files.sort((a, b) => b.modifiedAt - a.modifiedAt);
  const removed = [];
  for (const file of files.slice(1)) {
    if (file.modifiedAt >= cutoff) continue;
    await fs.unlink(file.filePath);
    removed.push(file.fileName);
  }
  return removed;
}

module.exports = {
  DATA_TABLES,
  backupDirectory,
  cleanupOldBackups,
  createDatabaseBackup,
  getLatestBackupInfo,
  readBackup,
  restoreDatabaseBackup
};
