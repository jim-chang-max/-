const assert = require('assert/strict');
const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const port = 33500 + (process.pid % 500);
const logDirectory = path.join(projectRoot, 'runtime', `test-http-${process.pid}`);
let output = '';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForReady(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health/ready`);
      const body = await response.json();
      if (response.ok && body.ok) return;
    } catch (error) {
      // 服务仍在启动，继续等待就绪探针。
    }
    await delay(120);
  }
  throw new Error(`等待安全测试服务超时。\n${output}`);
}

async function waitForExit(child, timeoutMs = 15000) {
  if (child.exitCode !== null) return child.exitCode;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('等待测试服务优雅退出超时'));
    }, timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
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
  await fs.rm(logDirectory, { recursive: true, force: true });
  const server = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      STORAGE_DRIVER: 'json',
      HOST: '127.0.0.1',
      PORT: String(port),
      LOG_DIR: path.relative(projectRoot, logDirectory),
      AUTO_BACKUP_ENABLED: 'false',
      AUTH_RATE_LIMIT_MAX: '2',
      WRITE_RATE_LIMIT_MAX: '100'
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true
  });
  server.stdout.on('data', (chunk) => { output += chunk; });
  server.stderr.on('data', (chunk) => { output += chunk; });

  try {
    await waitForReady();

    const home = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(home.status, 200);
    assert.equal(home.headers.get('x-frame-options'), 'DENY');
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
    assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);

    const malformed = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad'
    });
    assert.equal(malformed.status, 400);
    assert.deepEqual(await malformed.json(), { message: 'JSON 请求格式不正确' });

    const statuses = [];
    for (let index = 0; index < 3; index += 1) {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'security_test_missing_user',
          password: 'SecurityTest!2026'
        })
      });
      statuses.push(response.status);
      if (index === 2) {
        assert.equal(response.headers.get('ratelimit-limit'), '2');
        assert.ok(Number(response.headers.get('retry-after')) > 0);
      }
    }
    assert.deepEqual(statuses, [401, 401, 429]);

    server.send({ type: 'shutdown' });
    const exitCode = await waitForExit(server);
    assert.equal(exitCode, 0);
    const events = await readLogEvents();
    assert.ok(events.some((event) => (
      event.event === 'server_stopped' &&
      event.reason === 'supervisor_shutdown'
    )));
    assert.ok(events.some((event) => (
      event.event === 'request_parse_error' &&
      event.level === 'warn'
    )));
    assert.equal(events.some((event) => event.event === 'request_error'), false);

    console.log('HTTP 安全集成测试通过：安全头、错误 JSON、限流和优雅退出均正常。');
  } finally {
    if (server.exitCode === null) {
      if (server.connected) server.send({ type: 'shutdown' });
      await waitForExit(server).catch(() => server.kill('SIGKILL'));
    }
    await fs.rm(logDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  if (output) console.error(output);
  process.exitCode = 1;
});
