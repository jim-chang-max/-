const fs = require('fs');
const path = require('path');

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

function readJson(fileName, fallback = []) {
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

function writeJson(fileName, data) {
  const filePath = resolveDataPath(fileName);

  // 保持 JSON 缩进，方便后续手动添加题目或调整数据。
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = {
  dataDir,
  ensureDataDir,
  readJson,
  resolveDataPath,
  writeJson
};
