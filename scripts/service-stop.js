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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function main() {
  const lock = await readLock();
  if (!lock || !processIsRunning(lock.supervisorPid)) {
    await fs.rm(lockPath, { force: true });
    await fs.rm(stopRequestPath, { force: true });
    console.log('网站监督进程当前未运行。');
    return;
  }

  await fs.mkdir(path.dirname(stopRequestPath), { recursive: true });
  await fs.writeFile(stopRequestPath, JSON.stringify({
    requestedAt: new Date().toISOString(),
    requestedByPid: process.pid
  }), 'utf8');

  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (!processIsRunning(lock.supervisorPid)) {
      console.log('网站监督进程和网站服务已停止。');
      return;
    }
    await delay(200);
  }

  throw new Error('网站监督进程未在 15 秒内停止，请检查 runtime/service.json 和日志。');
}

main().catch((error) => {
  console.error(`停止网站服务失败：${error.message}`);
  process.exitCode = 1;
});
