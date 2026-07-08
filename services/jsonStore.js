const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

function resolveDataPath(fileName) {
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
  readJson,
  writeJson
};
