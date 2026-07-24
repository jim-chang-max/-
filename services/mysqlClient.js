const mysql = require('mysql2/promise');

function isMysqlEnabled() {
  return String(process.env.STORAGE_DRIVER || 'json').toLowerCase() === 'mysql';
}

function databaseConfig(includeDatabase = true) {
  const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0
  };

  if (includeDatabase) {
    config.database = process.env.DB_NAME || 'discrete_math_review';
  }

  return config;
}

let pool = null;

function getPool() {
  if (!isMysqlEnabled()) {
    throw new Error('当前未启用 MySQL，请将 STORAGE_DRIVER 设置为 mysql。');
  }

  if (!pool) {
    pool = mysql.createPool(databaseConfig(true));
  }

  return pool;
}

async function testConnection() {
  const connection = await getPool().getConnection();

  try {
    await connection.query('SELECT 1');
  } finally {
    connection.release();
  }
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  closePool,
  databaseConfig,
  getPool,
  isMysqlEnabled,
  testConnection
};
