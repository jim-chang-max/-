const assert = require('assert/strict');
const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const port = 32000 + (process.pid % 1000);
const lockFile = path.join('runtime', `test-service-${process.pid}.json`);
const lockPath = path.join(projectRoot, lockFile);
const stopPath = `${lockPath}.stop`;
const logDirectory = path.join(projectRoot, 'runtime', `test-service-logs-${process.pid}`);
let output = '';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check().catch(() => null);
    if (value) return value;
    await delay(150);
  }
  throw new Error(`等待服务状态超时。\n${output}`);
}

async function readLock() {
  return JSON.parse(await fs.readFile(lockPath, 'utf8'));
}

async function ready() {
  const response = await fetch(`http://127.0.0.1:${port}/api/health/ready`);
  const body = await response.json();
  return response.ok && body.ok;
}

async function readLogEvents() {
  const files = await fs.readdir(logDirectory);
  const events = [];
  for (const file of files.filter((name) => name.endsWith('.log'))) {
    const content = await fs.readFile(path.join(logDirectory, file), 'utf8');
    for (const line of content.split(/\r?\n/).filter(Boolean)) {
      events.push(JSON.parse(line));
    }
  }
  return events;
}

async function main() {
  await fs.rm(lockPath, { force: true });
  await fs.rm(stopPath, { force: true });
  await fs.rm(logDirectory, { recursive: true, force: true });
  const supervisorEnv = {
    ...process.env,
    STORAGE_DRIVER: 'json',
    HOST: '127.0.0.1',
    PORT: String(port),
    SERVICE_LOCK_FILE: lockFile,
    LOG_DIR: path.relative(projectRoot, logDirectory),
    SUPERVISOR_RESTART_BASE_MS: '150',
    SUPERVISOR_RESTART_MAX_MS: '500'
  };
  const supervisor = spawn(process.execPath, ['scripts/service-supervisor.js'], {
    cwd: projectRoot,
    env: supervisorEnv,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true
  });
  supervisor.stdout.on('data', (chunk) => { output += chunk; });
  supervisor.stderr.on('data', (chunk) => { output += chunk; });

  let scenarioError = null;
  try {
    const firstLock = await waitFor(async () => {
      const lock = await readLock();
      return lock.childPid && await ready() ? lock : null;
    });
    const firstChildPid = firstLock.childPid;

    let duplicateOutput = '';
    const duplicate = spawn(process.execPath, ['scripts/service-supervisor.js'], {
      cwd: projectRoot,
      env: supervisorEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    duplicate.stdout.on('data', (chunk) => { duplicateOutput += chunk; });
    duplicate.stderr.on('data', (chunk) => { duplicateOutput += chunk; });
    const duplicateExit = await new Promise((resolve) => duplicate.once('exit', resolve));
    assert.equal(duplicateExit, 1);
    assert.match(duplicateOutput, /监督进程已在运行/);

    process.kill(firstChildPid, 'SIGTERM');
    const restartedLock = await waitFor(async () => {
      const lock = await readLock();
      return (
        lock.childPid &&
        lock.childPid !== firstChildPid &&
        lock.restartCount >= 1 &&
        await ready()
      ) ? lock : null;
    });

    assert.notEqual(restartedLock.childPid, firstChildPid);
    assert.ok(restartedLock.restartCount >= 1);
  } catch (error) {
    scenarioError = error;
  } finally {
    if (supervisor.exitCode === null) {
      await fs.writeFile(stopPath, JSON.stringify({ requestedBy: 'test' }), 'utf8');
    }
    await waitFor(async () => supervisor.exitCode !== null, 15000).catch(() => {
      supervisor.kill('SIGKILL');
    });
    await fs.rm(lockPath, { force: true });
    await fs.rm(stopPath, { force: true });
  }

  try {
    if (scenarioError) throw scenarioError;
    const events = await readLogEvents();
    const eventNames = events.map((event) => event.event);
    assert.ok(eventNames.includes('supervisor_started'));
    assert.ok(eventNames.includes('supervisor_start_failed'));
    assert.ok(eventNames.includes('supervisor_child_exited'));
    assert.ok(eventNames.includes('supervisor_stopping'));
    assert.ok(eventNames.includes('supervisor_stopped'));
    assert.ok(
      events.filter((event) => event.event === 'supervisor_child_started').length >= 2
    );
    assert.ok(events.some((event) => (
      event.event === 'supervisor_child_exited' &&
      event.restartCount >= 1 &&
      event.restartDelayMs >= 100
    )));
    console.log('服务监督测试通过：重复启动、异常重启、日志和优雅停止均正常。');
  } finally {
    await fs.rm(logDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
