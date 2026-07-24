const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const mysql = require('mysql2/promise');
const { DATA_TABLES, createDatabaseBackup } = require('./databaseBackup');
const { databaseConfig } = require('./mysqlClient');

function validateDatabaseName(name) {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error('DB_NAME 只能包含字母、数字和下划线。');
  }
}

function migrationChecksum(sql) {
  return crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
}

async function migrationDefinitions() {
  const databaseDirectory = path.resolve(__dirname, '..', 'database');
  const definitions = [{
    version: '001',
    name: 'initial_schema',
    filePath: path.join(databaseDirectory, 'schema.sql')
  }];
  const migrationDirectory = path.join(databaseDirectory, 'migrations');
  let entries = [];

  try {
    entries = await fs.readdir(migrationDirectory, { withFileTypes: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  for (const entry of entries) {
    const match = entry.isFile() && entry.name.match(/^(\d{3,})_([a-zA-Z0-9_-]+)\.sql$/);
    if (!match) continue;
    definitions.push({
      version: match[1],
      name: match[2],
      filePath: path.join(migrationDirectory, entry.name)
    });
  }

  definitions.sort((a, b) => a.version.localeCompare(b.version));
  const versions = new Set();
  for (const definition of definitions) {
    if (versions.has(definition.version)) {
      throw new Error(`数据库迁移版本重复：${definition.version}`);
    }
    versions.add(definition.version);
    definition.sql = await fs.readFile(definition.filePath, 'utf8');
    definition.checksum = migrationChecksum(definition.sql);
  }
  return definitions;
}

async function appTableCount(connection, databaseName) {
  const placeholders = DATA_TABLES.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.tables
     WHERE table_schema = ? AND table_name IN (${placeholders})`,
    [databaseName, ...DATA_TABLES]
  );
  return Number(rows[0].count || 0);
}

async function migrateDatabase(options = {}) {
  const databaseName = process.env.DB_NAME || 'discrete_math_review';
  validateDatabaseName(databaseName);
  const definitions = await migrationDefinitions();
  const connection = await mysql.createConnection({
    ...databaseConfig(false),
    multipleStatements: true
  });
  let safetyBackup = null;

  try {
    const [databaseRows] = await connection.query(
      'SELECT SCHEMA_NAME FROM information_schema.schemata WHERE schema_name = ?',
      [databaseName]
    );
    const databaseExisted = databaseRows.length > 0;
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
    );
    await connection.query(`USE \`${databaseName}\``);
    await connection.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version VARCHAR(32) NOT NULL PRIMARY KEY,
         name VARCHAR(120) NOT NULL,
         checksum CHAR(64) NOT NULL,
         applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
    );

    const [appliedRows] = await connection.query(
      'SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version'
    );
    const definitionByVersion = new Map(
      definitions.map((definition) => [definition.version, definition])
    );
    for (const applied of appliedRows) {
      const definition = definitionByVersion.get(applied.version);
      if (!definition) {
        throw new Error(
          `数据库版本 ${applied.version} 高于当前代码，请先更新网站代码。`
        );
      }
      if (applied.checksum !== definition.checksum) {
        throw new Error(
          `迁移 ${applied.version}_${applied.name} 的校验和不一致，禁止修改已执行迁移。`
        );
      }
    }

    const appliedVersions = new Set(appliedRows.map((row) => row.version));
    const pending = definitions.filter(
      (definition) => !appliedVersions.has(definition.version)
    );
    const existingAppTables = await appTableCount(connection, databaseName);

    if (
      pending.length &&
      options.createSafetyBackup !== false &&
      databaseExisted &&
      existingAppTables === DATA_TABLES.length
    ) {
      process.env.STORAGE_DRIVER = 'mysql';
      safetyBackup = await createDatabaseBackup({ prefix: 'pre-migration' });
    } else if (
      pending.length &&
      databaseExisted &&
      existingAppTables > 0 &&
      existingAppTables < DATA_TABLES.length
    ) {
      throw new Error(
        `数据库表不完整（${existingAppTables}/${DATA_TABLES.length}），请先检查或恢复备份。`
      );
    }

    const appliedNow = [];
    for (const migration of pending) {
      await connection.query(migration.sql);
      await connection.execute(
        `INSERT INTO schema_migrations (version, name, checksum)
         VALUES (?, ?, ?)`,
        [migration.version, migration.name, migration.checksum]
      );
      appliedNow.push({
        version: migration.version,
        name: migration.name
      });
    }

    return {
      databaseName,
      latestVersion: definitions.at(-1)?.version || null,
      pendingCount: pending.length,
      appliedNow,
      safetyBackup
    };
  } finally {
    await connection.end();
  }
}

async function migrationStatus() {
  const databaseName = process.env.DB_NAME || 'discrete_math_review';
  validateDatabaseName(databaseName);
  const definitions = await migrationDefinitions();
  const connection = await mysql.createConnection(databaseConfig(false));

  try {
    const [databaseRows] = await connection.query(
      'SELECT SCHEMA_NAME FROM information_schema.schemata WHERE schema_name = ?',
      [databaseName]
    );
    if (!databaseRows.length) {
      return {
        databaseExists: false,
        currentVersion: null,
        latestVersion: definitions.at(-1)?.version || null,
        pendingVersions: definitions.map((item) => item.version),
        valid: false
      };
    }

    const [tableRows] = await connection.query(
      `SELECT TABLE_NAME
       FROM information_schema.tables
       WHERE table_schema = ? AND table_name = 'schema_migrations'`,
      [databaseName]
    );
    if (!tableRows.length) {
      return {
        databaseExists: true,
        currentVersion: null,
        latestVersion: definitions.at(-1)?.version || null,
        pendingVersions: definitions.map((item) => item.version),
        valid: false
      };
    }

    await connection.query(`USE \`${databaseName}\``);
    const [appliedRows] = await connection.query(
      'SELECT version, name, checksum FROM schema_migrations ORDER BY version'
    );
    const applied = new Map(appliedRows.map((row) => [row.version, row]));
    let valid = true;
    for (const migration of definitions) {
      const row = applied.get(migration.version);
      if (row && row.checksum !== migration.checksum) valid = false;
    }
    if (appliedRows.some((row) => !definitions.some(
      (migration) => migration.version === row.version
    ))) {
      valid = false;
    }

    return {
      databaseExists: true,
      currentVersion: appliedRows.at(-1)?.version || null,
      latestVersion: definitions.at(-1)?.version || null,
      pendingVersions: definitions
        .filter((item) => !applied.has(item.version))
        .map((item) => item.version),
      valid
    };
  } finally {
    await connection.end();
  }
}

module.exports = {
  migrateDatabase,
  migrationChecksum,
  migrationDefinitions,
  migrationStatus,
  validateDatabaseName
};
