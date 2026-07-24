const { execFile } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { promisify } = require('util');
const { getRecentLogs } = require('./appLogger');
const {
  backupDirectory,
  getLatestBackupInfo,
  readBackup
} = require('./databaseBackup');
const { migrationStatus } = require('./databaseMigration');
const { checkRelationalIntegrity } = require('./dataIntegrity');
const {
  maintenanceConfig,
  readMaintenanceState
} = require('./databaseMaintenance');
const { getPool, isMysqlEnabled } = require('./mysqlClient');
const { accessUrls } = require('./networkInfo');
const { supervisorStatus } = require('./systemStatus');

const execFileAsync = promisify(execFile);
const HOUR_MS = 60 * 60 * 1000;

function check(id, label, status, message, details = undefined) {
  return { id, label, status, message, ...(details === undefined ? {} : { details }) };
}

function safeSessionSecret(env = process.env) {
  const secret = String(env.SESSION_SECRET || '');
  const rejected = [
    'change-this-session-secret',
    'discrete-math-review-local-secret'
  ];
  return secret.length >= 32 && !rejected.includes(secret);
}

function configurationChecks(env = process.env) {
  const checks = [];
  const mysqlEnabled = String(env.STORAGE_DRIVER || 'json').toLowerCase() === 'mysql';
  checks.push(check(
    'storage_driver',
    '数据存储',
    mysqlEnabled ? 'pass' : 'fail',
    mysqlEnabled ? '正在使用 MySQL' : '当前没有使用 MySQL'
  ));

  const dbHost = String(env.DB_HOST || '127.0.0.1').toLowerCase();
  const dbIsLocal = ['127.0.0.1', 'localhost', '::1'].includes(dbHost);
  checks.push(check(
    'database_binding',
    '数据库暴露范围',
    dbIsLocal ? 'pass' : 'warn',
    dbIsLocal ? 'MySQL 仅通过本机地址连接' : 'MySQL 地址不是本机回环地址'
  ));

  const host = String(env.HOST || '0.0.0.0');
  const lanEnabled = ['0.0.0.0', '::'].includes(host);
  checks.push(check(
    'website_binding',
    '网站监听地址',
    lanEnabled ? 'pass' : 'warn',
    lanEnabled ? `网站允许局域网访问（${host}）` : `网站仅监听 ${host}`
  ));

  checks.push(check(
    'session_secret',
    '会话密钥',
    safeSessionSecret(env) ? 'pass' : 'fail',
    safeSessionSecret(env)
      ? '已配置长度足够的独立会话密钥'
      : 'SESSION_SECRET 未配置或强度不足'
  ));

  checks.push(check(
    'database_password',
    '数据库凭据',
    String(env.DB_PASSWORD || '').length > 0 ? 'pass' : 'warn',
    String(env.DB_PASSWORD || '').length > 0
      ? 'MySQL 密码已配置'
      : 'MySQL 密码为空'
  ));
  return checks;
}

function diskCheck(freeBytes) {
  const gib = freeBytes / (1024 ** 3);
  if (freeBytes < 500 * 1024 ** 2) {
    return check('disk_space', '磁盘空间', 'fail', `仅剩 ${gib.toFixed(2)} GiB`);
  }
  if (freeBytes < 2 * 1024 ** 3) {
    return check('disk_space', '磁盘空间', 'warn', `剩余 ${gib.toFixed(2)} GiB`);
  }
  return check('disk_space', '磁盘空间', 'pass', `剩余 ${gib.toFixed(2)} GiB`);
}

function backupCheck(latest, valid, now = new Date()) {
  if (!latest) {
    return check('backup', '数据库备份', 'fail', '尚未找到数据库备份');
  }
  if (!valid) {
    return check('backup', '数据库备份', 'fail', '最新备份无法通过格式校验');
  }
  const ageHours = (
    now.getTime() - new Date(latest.modifiedAt).getTime()
  ) / HOUR_MS;
  const status = ageHours <= 30 ? 'pass' : ageHours <= 72 ? 'warn' : 'fail';
  return check(
    'backup',
    '数据库备份',
    status,
    `最新备份距今 ${Math.max(ageHours, 0).toFixed(1)} 小时`,
    { fileName: latest.fileName, modifiedAt: latest.modifiedAt }
  );
}

function maintenanceCheck(state, enabled, now = new Date()) {
  if (!enabled) {
    return check(
      'database_maintenance',
      '数据库维护',
      'warn',
      '数据库自动维护未启用'
    );
  }
  if (!state) {
    return check(
      'database_maintenance',
      '数据库维护',
      'fail',
      '尚未找到数据库维护记录'
    );
  }
  if (state.status !== 'success') {
    return check(
      'database_maintenance',
      '数据库维护',
      'fail',
      '最近一次数据库维护失败'
    );
  }

  const completedAt = new Date(state.completedAt).getTime();
  if (Number.isNaN(completedAt)) {
    return check(
      'database_maintenance',
      '数据库维护',
      'fail',
      '数据库维护完成时间无效'
    );
  }

  const ageHours = (now.getTime() - completedAt) / HOUR_MS;
  const status = ageHours <= 30 ? 'pass' : ageHours <= 72 ? 'warn' : 'fail';
  const removed = Object.values(state.removed || {}).reduce(
    (sum, value) => sum + Number(value || 0),
    0
  );
  return check(
    'database_maintenance',
    '数据库维护',
    status,
    `最近维护距今 ${Math.max(ageHours, 0).toFixed(1)} 小时，清理 ${removed} 条`,
    {
      completedAt: state.completedAt,
      removed: state.removed || {}
    }
  );
}

function summarizeChecks(checks) {
  const summary = { pass: 0, warn: 0, fail: 0, overall: 'pass' };
  for (const item of checks) {
    summary[item.status] += 1;
  }
  if (summary.fail) summary.overall = 'fail';
  else if (summary.warn) summary.overall = 'warn';
  return summary;
}

async function httpCheck(url, id, label) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const body = await response.json();
    return check(
      id,
      label,
      response.ok && body.ok === true ? 'pass' : 'fail',
      response.ok && body.ok === true
        ? `就绪探针正常（HTTP ${response.status}）`
        : `就绪探针异常（HTTP ${response.status}）`
    );
  } catch (error) {
    return check(id, label, 'fail', `无法访问：${error.message}`);
  }
}

async function windowsHostState() {
  if (process.platform !== 'win32') {
    return { supported: false };
  }
  const scriptPath = path.resolve(
    __dirname,
    '..',
    'scripts',
    'windows',
    'read-host-state.ps1'
  );
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      {
        cwd: path.resolve(__dirname, '..'),
        encoding: 'utf8',
        timeout: 30000,
        windowsHide: true
      }
    );
    return { supported: true, ...JSON.parse(stdout.trim()) };
  } catch (error) {
    return {
      supported: true,
      error: 'Windows 主机状态读取失败'
    };
  }
}

function windowsChecks(state) {
  if (!state.supported) {
    return [check('windows_hosting', 'Windows 托管', 'warn', '当前不是 Windows 主机')];
  }
  if (state.error) {
    return [check('windows_hosting', 'Windows 托管', 'warn', state.error)];
  }

  const checks = [];
  const task = state.startupTask || {};
  checks.push(check(
    'startup_task',
    '开机启动',
    task.installed && task.enabled !== false ? 'pass' : 'warn',
    task.installed
      ? `计划任务已安装（${task.state || '状态未知'}）`
      : task.accessible === false
        ? '无权限读取计划任务状态'
        : '尚未安装开机启动任务'
  ));

  const firewall = state.firewall || {};
  const firewallReady = (
    firewall.installed &&
    String(firewall.enabled).toLowerCase() === 'true' &&
    String(firewall.action).toLowerCase() === 'allow' &&
    String(firewall.localPort) === String(process.env.PORT || 3000)
  );
  checks.push(check(
    'firewall',
    '防火墙规则',
    firewallReady ? 'pass' : 'warn',
    firewallReady
      ? '专用网络入站规则已启用'
      : firewall.accessible === false
        ? '无权限读取防火墙状态'
        : '尚未启用网站防火墙规则'
  ));

  const profiles = state.networkProfiles || {};
  const items = Array.isArray(profiles.items)
    ? profiles.items
    : profiles.items
      ? [profiles.items]
      : [];
  const privateProfile = items.some(
    (item) => String(item.NetworkCategory).toLowerCase() === 'private'
  );
  checks.push(check(
    'network_profile',
    '网络类型',
    privateProfile ? 'pass' : 'warn',
    privateProfile
      ? '当前存在专用网络连接'
      : profiles.accessible === false
        ? '无权限读取网络类型'
        : '当前连接不是专用网络，防火墙规则可能不会生效'
  ));
  return checks;
}

async function runHostDiagnostics(options = {}) {
  const now = options.now || new Date();
  const checks = configurationChecks(options.env || process.env);
  const urls = accessUrls(
    Number(process.env.PORT || 3000),
    process.env.HOST || '0.0.0.0'
  );

  try {
    const [rows] = await getPool().query(
      `SELECT
         (SELECT COUNT(*) FROM questions) AS questions,
         (SELECT COUNT(*) FROM users) AS users`
    );
    checks.push(check(
      'database_connection',
      'MySQL 连接',
      'pass',
      `连接正常，${Number(rows[0].questions)} 道题、${Number(rows[0].users)} 个用户`
    ));
  } catch (error) {
    checks.push(check('database_connection', 'MySQL 连接', 'fail', 'MySQL 连接失败'));
  }

  try {
    const migration = await migrationStatus();
    const ready = migration.valid && migration.pendingVersions.length === 0;
    checks.push(check(
      'database_migration',
      '数据库版本',
      ready ? 'pass' : 'fail',
      ready
        ? `版本 ${migration.currentVersion}，已是最新`
        : `当前 ${migration.currentVersion || '未登记'}，待迁移 ${migration.pendingVersions.join(', ') || '无'}`,
      migration
    ));
  } catch (error) {
    checks.push(check('database_migration', '数据库版本', 'fail', '无法读取迁移状态'));
  }

  try {
    const integrity = await checkRelationalIntegrity();
    checks.push(check(
      'database_integrity',
      '关系完整性',
      integrity.ok ? 'pass' : 'fail',
      integrity.ok
        ? `${integrity.relationships.length} 项关系没有孤立记录`
        : `发现 ${integrity.orphanCount} 条孤立记录`
    ));
  } catch (error) {
    checks.push(check('database_integrity', '关系完整性', 'fail', '无法执行关系检查'));
  }

  const supervisor = await supervisorStatus();
  checks.push(check(
    'supervisor',
    '服务监督',
    supervisor.running ? 'pass' : supervisor.managed ? 'fail' : 'warn',
    supervisor.running
      ? `监督运行正常，本次重启 ${supervisor.restartCount} 次`
      : supervisor.managed
        ? '监督进程或网站子进程异常'
        : '网站未通过监督进程启动'
  ));

  checks.push(await httpCheck(
    `http://127.0.0.1:${Number(process.env.PORT || 3000)}/api/health/ready`,
    'local_http',
    '本机访问'
  ));
  const lanUrl = urls.find((url) => !url.includes('localhost'));
  if (lanUrl) {
    checks.push(await httpCheck(`${lanUrl}/api/health/ready`, 'lan_http', '局域网地址'));
  } else {
    checks.push(check('lan_http', '局域网地址', 'warn', '没有检测到局域网访问地址'));
  }

  try {
    const stat = await fs.statfs(path.resolve(__dirname, '..'));
    checks.push(diskCheck(Number(stat.bavail) * Number(stat.bsize)));
  } catch (error) {
    checks.push(check('disk_space', '磁盘空间', 'warn', '无法读取磁盘剩余空间'));
  }

  try {
    const latest = await getLatestBackupInfo();
    let valid = false;
    if (latest) {
      await readBackup(path.join(backupDirectory(), latest.fileName));
      valid = true;
    }
    checks.push(backupCheck(latest, valid, now));
  } catch (error) {
    checks.push(check('backup', '数据库备份', 'fail', '最新备份读取失败'));
  }

  try {
    const maintenance = maintenanceConfig(options.env || process.env);
    checks.push(maintenanceCheck(
      await readMaintenanceState(),
      isMysqlEnabled() && maintenance.enabled,
      now
    ));
  } catch (error) {
    checks.push(check(
      'database_maintenance',
      '数据库维护',
      'fail',
      '数据库维护状态读取失败'
    ));
  }

  try {
    const errors = await getRecentLogs({ level: 'error', limit: 200 });
    const cutoff = now.getTime() - 24 * HOUR_MS;
    const recentErrors = errors.filter(
      (item) => new Date(item.timestamp).getTime() >= cutoff
    );
    checks.push(check(
      'recent_errors',
      '近期错误',
      recentErrors.length ? 'warn' : 'pass',
      recentErrors.length
        ? `最近 24 小时有 ${recentErrors.length} 条错误日志`
        : '最近 24 小时没有错误日志'
    ));
  } catch (error) {
    checks.push(check('recent_errors', '近期错误', 'warn', '无法读取错误日志'));
  }

  checks.push(...windowsChecks(await windowsHostState()));
  return {
    generatedAt: now.toISOString(),
    summary: summarizeChecks(checks),
    accessUrls: urls,
    checks
  };
}

module.exports = {
  backupCheck,
  configurationChecks,
  diskCheck,
  maintenanceCheck,
  runHostDiagnostics,
  safeSessionSecret,
  summarizeChecks,
  windowsChecks
};
