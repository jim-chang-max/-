require('dotenv').config({ quiet: true });

const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { logEvent } = require('../services/appLogger');

const projectRoot = path.resolve(__dirname, '..');
const lockPath = path.resolve(
  projectRoot,
  process.env.SERVICE_LOCK_FILE || 'runtime/service.json'
);
const stopRequestPath = path.resolve(
  projectRoot,
  process.env.SERVICE_STOP_FILE || `${lockPath}.stop`
);
const restartBaseMs = Math.max(
  Number(process.env.SUPERVISOR_RESTART_BASE_MS) || 1000,
  100
);
const restartMaxMs = Math.max(
  Number(process.env.SUPERVISOR_RESTART_MAX_MS) || 30000,
  restartBaseMs
);

let child = null;
let childStartedAt = 0;
let restartCount = 0;
let restartTimer = null;
let stopPollTimer = null;
let shuttingDown = false;

async function recordEvent(level, event, details = {}) {
  try {
    await logEvent(level, event, {
      supervisorPid: process.pid,
      ...details
    });
  } catch (error) {
    console.error(`写入监督日志失败：${error.message}`);
  }
}

function processIsRunning(pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

async function readLock() {
  try {
    return JSON.parse(await fs.readFile(lockPath, 'utf8'));
  } catch (error) {
    if (['ENOENT', 'SyntaxError'].includes(error.code) || error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

async function writeLock(details = {}) {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  await fs.writeFile(lockPath, JSON.stringify({
    supervisorPid: process.pid,
    childPid: child?.pid || null,
    startedAt: details.startedAt,
    childStartedAt: childStartedAt ? new Date(childStartedAt).toISOString() : null,
    restartCount,
    host: process.env.HOST || '0.0.0.0',
    port: Number(process.env.PORT || 3000),
    updatedAt: new Date().toISOString()
  }, null, 2), 'utf8');
}

async function acquireLock() {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await fs.open(lockPath, 'wx');
      try {
        await handle.writeFile(JSON.stringify({
          supervisorPid: process.pid,
          childPid: null,
          startedAt: supervisorStartedAt,
          childStartedAt: null,
          restartCount: 0,
          host: process.env.HOST || '0.0.0.0',
          port: Number(process.env.PORT || 3000),
          updatedAt: new Date().toISOString()
        }, null, 2), 'utf8');
      } finally {
        await handle.close();
      }
      await fs.rm(stopRequestPath, { force: true });
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = await readLock();
      if (existing && processIsRunning(existing.supervisorPid)) {
        throw new Error(`网站监督进程已在运行（PID ${existing.supervisorPid}）`);
      }
      await fs.rm(lockPath, { force: true });
    }
  }

  throw new Error('无法取得网站监督进程锁');
}

function restartDelay() {
  const exponent = Math.min(Math.max(restartCount - 1, 0), 5);
  return Math.min(restartBaseMs * (2 ** exponent), restartMaxMs);
}

async function scheduleRestart(exitCode, signal) {
  if (shuttingDown || restartTimer) return;

  const uptime = Date.now() - childStartedAt;
  if (uptime >= 60000) restartCount = 0;
  restartCount += 1;
  child = null;
  await writeLock({ startedAt: supervisorStartedAt }).catch(() => {});

  const delay = restartDelay();
  console.error(
    `网站进程已退出（code=${exitCode ?? '-'}, signal=${signal ?? '-'}），${delay}ms 后重启`
  );
  await recordEvent('warn', 'supervisor_child_exited', {
    exitCode,
    signal,
    uptimeMs: uptime,
    restartCount,
    restartDelayMs: delay
  });
  restartTimer = setTimeout(() => {
    restartTimer = null;
    startChild();
  }, delay);
}

function startChild() {
  if (shuttingDown) return;

  childStartedAt = Date.now();
  child = spawn(process.execPath, [path.join(projectRoot, 'server.js')], {
    cwd: projectRoot,
    env: {
      ...process.env,
      SERVICE_MANAGED: '1'
    },
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    windowsHide: true
  });
  writeLock({ startedAt: supervisorStartedAt }).catch((error) => {
    console.error(`更新服务状态失败：${error.message}`);
    recordEvent('error', 'supervisor_lock_update_failed', {
      message: error.message
    });
  });

  child.once('spawn', () => {
    recordEvent('info', 'supervisor_child_started', {
      childPid: child?.pid || null,
      restartCount
    });
  });
  child.once('error', (error) => {
    console.error(`启动网站进程失败：${error.message}`);
    recordEvent('error', 'supervisor_child_start_failed', {
      message: error.message
    });
  });
  child.once('exit', (code, signal) => {
    if (shuttingDown) return;
    scheduleRestart(code, signal).catch((error) => {
      console.error(`安排网站重启失败：${error.message}`);
      recordEvent('error', 'supervisor_restart_failed', {
        message: error.message
      }).finally(() => process.exit(1));
    });
  });
}

async function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(restartTimer);
  clearInterval(stopPollTimer);
  console.log(`正在停止网站监督进程：${reason}`);
  await recordEvent('info', 'supervisor_stopping', {
    reason,
    childPid: child?.pid || null
  });

  const activeChild = child;
  let forced = false;
  if (activeChild && processIsRunning(activeChild.pid)) {
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        forced = true;
        activeChild.kill('SIGKILL');
        resolve();
      }, 12000);
      activeChild.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
      if (activeChild.connected) {
        activeChild.send({ type: 'shutdown' });
      } else {
        activeChild.kill('SIGTERM');
      }
    });
  }

  await fs.rm(stopRequestPath, { force: true });
  await fs.rm(lockPath, { force: true });
  await recordEvent('info', 'supervisor_stopped', { reason, forced });
  process.exit(0);
}

function watchForStopRequest() {
  stopPollTimer = setInterval(async () => {
    if (shuttingDown) return;
    try {
      await fs.access(stopRequestPath);
      await shutdown('stop_request');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`读取停止请求失败：${error.message}`);
        recordEvent('error', 'supervisor_stop_request_failed', {
          message: error.message
        });
      }
    }
  }, 500);
}

const supervisorStartedAt = new Date().toISOString();

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.on('message', (message) => {
  if (message?.type === 'shutdown') shutdown('IPC');
});

acquireLock()
  .then(async () => {
    console.log(`网站监督进程已启动（PID ${process.pid}）`);
    await recordEvent('info', 'supervisor_started', {
      startedAt: supervisorStartedAt,
      host: process.env.HOST || '0.0.0.0',
      port: Number(process.env.PORT || 3000)
    });
    watchForStopRequest();
    startChild();
  })
  .catch(async (error) => {
    console.error(error.message);
    await recordEvent('error', 'supervisor_start_failed', {
      message: error.message
    });
    process.exit(1);
  });
