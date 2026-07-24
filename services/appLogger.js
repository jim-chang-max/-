const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

function logDirectory() {
  return path.resolve(process.cwd(), process.env.LOG_DIR || 'logs');
}

function localDateText(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function logFilePath(date = new Date()) {
  return path.join(logDirectory(), `app-${localDateText(date)}.log`);
}

async function logEvent(level, event, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...details
  };

  await fs.mkdir(logDirectory(), { recursive: true });
  await fs.appendFile(logFilePath(), `${JSON.stringify(entry)}\n`, 'utf8');
  return entry;
}

function requestLogger(req, res, next) {
  const requestId = crypto.randomUUID();
  const startedAt = process.hrtime.bigint();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  const isStaticAsset =
    /^\/(css|js)\//.test(req.path) ||
    /\.(?:css|js|map|ico|png|jpe?g|webp|svg|woff2?)$/i.test(req.path);

  if (req.path === '/api/health/live' || isStaticAsset) {
    next();
    return;
  }

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logEvent(level, 'http_request', {
      requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      userId: req.session?.userId || null
    }).catch((error) => {
      console.error(`写入请求日志失败：${error.message}`);
    });
  });

  next();
}

async function getRecentLogs(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const level = options.level || '';
  let entries;
  try {
    entries = await fs.readdir(logDirectory(), { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const files = entries
    .filter((entry) => entry.isFile() && /^app-\d{4}-\d{2}-\d{2}\.log$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  const result = [];

  for (const fileName of files) {
    const content = await fs.readFile(path.join(logDirectory(), fileName), 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean).reverse();

    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        if (level && item.level !== level) continue;
        result.push(item);
        if (result.length >= limit) return result;
      } catch (error) {
        // 忽略单行损坏，保留其余可用日志。
      }
    }
  }

  return result;
}

async function cleanupOldLogs() {
  const retentionDays = Math.min(
    Math.max(Number(process.env.LOG_RETENTION_DAYS) || 14, 1),
    365
  );
  const cutoff = Date.now() - retentionDays * 86400000;
  let entries;
  try {
    entries = await fs.readdir(logDirectory(), { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }

  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !/^app-\d{4}-\d{2}-\d{2}\.log$/.test(entry.name)) continue;
    const filePath = path.join(logDirectory(), entry.name);
    const stat = await fs.stat(filePath);
    if (stat.mtimeMs < cutoff) {
      await fs.unlink(filePath);
      removed += 1;
    }
  }
  return removed;
}

module.exports = {
  cleanupOldLogs,
  getRecentLogs,
  logDirectory,
  logEvent,
  requestLogger
};
