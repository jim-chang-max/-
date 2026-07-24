const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { supervisorStatus } = require('../services/systemStatus');

test('监督状态能区分直接启动和受监督运行', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dm-supervisor-status-'));
  const lockPath = path.join(directory, 'service.json');

  try {
    const direct = await supervisorStatus({ lockPath });
    assert.equal(direct.managed, false);
    assert.equal(direct.running, false);
    assert.equal(direct.childRunning, true);

    await fs.writeFile(lockPath, JSON.stringify({
      supervisorPid: process.pid,
      childPid: process.pid,
      startedAt: '2026-07-24T00:00:00.000Z',
      childStartedAt: '2026-07-24T00:00:01.000Z',
      restartCount: 2
    }), 'utf8');
    const managed = await supervisorStatus({ lockPath });

    assert.equal(managed.managed, true);
    assert.equal(managed.running, true);
    assert.equal(managed.supervisorRunning, true);
    assert.equal(managed.childRunning, true);
    assert.equal(managed.restartCount, 2);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
