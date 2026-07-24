const fs = require('fs');
const path = require('path');
const { getPool, isMysqlEnabled } = require('./mysqlClient');

const defaultDataDir = path.join(__dirname, '..', 'data');
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : defaultDataDir;

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 部署到持久化磁盘时，首次启动会把仓库内置示例数据复制过去。
  if (dataDir !== defaultDataDir) {
    const hasJsonFiles = fs.readdirSync(dataDir).some((fileName) => fileName.endsWith('.json'));

    if (!hasJsonFiles && fs.existsSync(defaultDataDir)) {
      fs.readdirSync(defaultDataDir)
        .filter((fileName) => fileName.endsWith('.json'))
        .forEach((fileName) => {
          fs.copyFileSync(path.join(defaultDataDir, fileName), path.join(dataDir, fileName));
        });
    }
  }
}

function resolveDataPath(fileName) {
  ensureDataDir();
  return path.join(dataDir, fileName);
}

function readJsonFile(fileName, fallback = []) {
  const filePath = resolveDataPath(fileName);

  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  if (!raw.trim()) {
    return fallback;
  }

  return JSON.parse(raw);
}

function writeJsonFile(fileName, data) {
  const filePath = resolveDataPath(fileName);

  // 保持 JSON 缩进，方便后续手动添加题目或调整数据。
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function parseMysqlJson(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'string') {
    return JSON.parse(value);
  }

  return value;
}

async function readJson(fileName, fallback = []) {
  if (!isMysqlEnabled()) {
    return readJsonFile(fileName, fallback);
  }

  const [rows] = await getPool().execute(
    'SELECT content FROM app_documents WHERE file_name = ? LIMIT 1',
    [fileName]
  );

  if (!rows.length) {
    return readJsonFile(fileName, fallback);
  }

  return parseMysqlJson(rows[0].content, fallback);
}

async function writeJson(fileName, data) {
  if (!isMysqlEnabled()) {
    writeJsonFile(fileName, data);
    return;
  }

  await getPool().execute(
    `INSERT INTO app_documents (file_name, content)
     VALUES (?, CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE content = VALUES(content)`,
    [fileName, JSON.stringify(data)]
  );
}

module.exports = {
  dataDir,
  ensureDataDir,
  readJson,
  readJsonFile,
  resolveDataPath,
  writeJson,
  writeJsonFile
};
