require('dotenv').config({ quiet: true });

const fs = require('fs/promises');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const lockPath = path.resolve(
  projectRoot,
  process.env.SERVICE_LOCK_FILE || 'runtime/service.json'
);
const stopRequestPath = path.resolve(
  projectRoot,
  process.env.SERVICE_STOP_FILE || `${lockPath}.stop`
);

function processIsRunning(pid) {
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
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function checkReadiness(port) {
  const url = process.env.SERVICE_STATUS_URL || `http://127.0.0.1:${port}/api/health/ready`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const body = await response.json();
    return { ok: response.ok && body.ok === true, url, status: response.status };
  } catch (error) {
    return { ok: false, url, error: error.message };
  }
}

async function main() {
  const lock = await readLock();
  const port = Number(lock?.port || process.env.PORT || 3000);
  const readiness = await checkReadiness(port);
  const stopping = await fs.access(stopRequestPath)
    .then(() => true)
    .catch(() => false);
  const result = {
    supervisorRunning: Boolean(lock && processIsRunning(lock.supervisorPid)),
    childRunning: Boolean(lock?.childPid && processIsRunning(lock.childPid)),
    stopping,
    readiness,
    lock
  };

  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.supervisorRunning && result.childRunning && readiness.ok ? 0 : 1;
}

main().catch((error) => {
  console.error(`读取网站服务状态失败：${error.message}`);
  process.exitCode = 1;
});
