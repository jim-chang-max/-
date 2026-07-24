const { escapeHtml } = window.ui;

let accountData = null;

function formatDate(value) {
  if (!value) return '未设置';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleDateString('zh-CN');
}

function roleText(role) {
  return role === 'admin' ? '管理员' : '学生';
}

async function initAccountPage() {
  accountData = await apiRequest('/api/account');
  renderAccount();

  document.querySelector('#passwordForm').addEventListener('submit', updatePassword);

  if (accountData.user.role === 'admin') {
    document.querySelector('#adminSystemSection').classList.remove('hidden');
    document.querySelector('#adminUserSection').classList.remove('hidden');
    document.querySelector('#adminUserRows').addEventListener('click', handleAdminAction);
    document.querySelector('#createBackupButton').addEventListener('click', createBackup);
    await Promise.all([
      loadAdminUsers(),
      loadSystemStatus(),
      loadSystemLogs()
    ]);
  }
}

function renderAccount() {
  const { user, stats, examDate } = accountData;
  document.querySelector('#accountRole').textContent = roleText(user.role);
  document.querySelector('#accountRole').className = `tag ${user.role === 'admin' ? 'violet' : 'primary'}`;
  document.querySelector('#accountUsername').textContent = user.username;
  document.querySelector('#accountRoleText').textContent = roleText(user.role);
  document.querySelector('#accountCreatedAt').textContent = formatDate(user.createdAt);
  document.querySelector('#accountExamDate').textContent = examDate || '未设置';
  document.querySelector('#masteredStat').textContent = `${stats.masteredTopics} / ${stats.totalTopics}`;
  document.querySelector('#mistakeStat').textContent = stats.mistakes;
  document.querySelector('#answerStat').textContent = stats.answered;
  document.querySelector('#accuracyStat').textContent = `正确率 ${stats.accuracy}%`;
  document.querySelector('#quizStat').textContent = stats.quizzes;
}

async function updatePassword(event) {
  event.preventDefault();
  const submitButton = event.submitter;
  const message = document.querySelector('#passwordMessage');
  const currentPassword = document.querySelector('#currentPassword').value;
  const newPassword = document.querySelector('#newPassword').value;
  const confirmPassword = document.querySelector('#confirmPassword').value;

  if (newPassword !== confirmPassword) {
    message.textContent = '两次输入的新密码不一致。';
    return;
  }

  submitButton.disabled = true;
  message.textContent = '正在更新...';
  try {
    const result = await putJson('/api/account/password', {
      currentPassword,
      newPassword
    });
    message.textContent = result.message;
    event.target.reset();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
}

async function loadAdminUsers() {
  const users = await apiRequest('/api/admin/users');
  const rows = document.querySelector('#adminUserRows');
  document.querySelector('#userCountText').textContent = `${users.length} 个用户`;

  rows.innerHTML = users.map((user) => `
    <tr data-user-id="${escapeHtml(user.id)}">
      <td>
        <strong>${escapeHtml(user.username)}</strong>
        ${user.isCurrentUser ? '<span class="tag primary">当前账号</span>' : ''}
      </td>
      <td>${escapeHtml(formatDate(user.createdAt))}</td>
      <td>
        <select aria-label="${escapeHtml(user.username)}的角色" data-user-role ${user.isCurrentUser ? 'disabled' : ''}>
          <option value="student" ${user.role === 'student' ? 'selected' : ''}>学生</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>管理员</option>
        </select>
      </td>
      <td>
        <div class="button-row">
          <button class="button" type="button" data-save-role ${user.isCurrentUser ? 'disabled' : ''}>保存角色</button>
          <button class="button danger" type="button" data-delete-user ${user.isCurrentUser ? 'disabled' : ''}>删除</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function durationText(seconds) {
  const value = Math.max(Number(seconds) || 0, 0);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (hours) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分钟`;
}

async function loadSystemStatus() {
  const status = await apiRequest('/api/admin/system');
  document.querySelector('#systemDatabase').textContent = status.database.connected
    ? '连接正常'
    : '连接异常';
  document.querySelector('#systemDatabase').className = status.database.connected
    ? 'status-success'
    : 'status-danger';
  document.querySelector('#systemDatabaseVersion').textContent = status.migration?.valid
    ? `结构版本 ${status.migration.currentVersion}`
    : '数据库结构需要检查';
  document.querySelector('#systemLatency').textContent = status.database.latencyMs === null
    ? '-'
    : `${status.database.latencyMs} ms`;
  document.querySelector('#systemUptime').textContent = durationText(status.uptimeSeconds);
  document.querySelector('#systemBackup').textContent = status.latestBackup
    ? `${status.latestBackup.fileName} · ${formatDate(status.latestBackup.modifiedAt)}`
    : '暂无';

  const accessUrls = document.querySelector('#systemAccessUrls');
  accessUrls.replaceChildren();
  (status.accessUrls || []).forEach((url) => {
    const link = document.createElement('a');
    link.href = url;
    link.textContent = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    accessUrls.append(link);
  });

  document.querySelector('#systemAutoBackup').textContent = status.autoBackup?.enabled
    ? `每天 ${String(status.autoBackup.hour).padStart(2, '0')}:00，保留 ${status.autoBackup.retentionDays} 天`
    : '未启用';

  const maintenance = status.latestMaintenance;
  document.querySelector('#systemMaintenance').textContent =
    status.autoMaintenance?.enabled
      ? `每天 ${String(status.autoMaintenance.hour).padStart(2, '0')}:00`
      : '未启用';
  document.querySelector('#systemMaintenanceDetail').textContent =
    maintenance?.status === 'success'
      ? `最近完成：${new Date(maintenance.completedAt).toLocaleString('zh-CN')}，清理 ${
          Object.values(maintenance.removed || {}).reduce(
            (sum, value) => sum + Number(value || 0),
            0
          )
        } 条`
      : maintenance?.status === 'error'
        ? '最近一次维护失败，请查看日志'
        : `测验会话保留 ${status.autoMaintenance?.quizSessionRetentionDays || 7} 天`;

  const supervisorText = document.querySelector('#systemSupervisor');
  supervisorText.textContent = status.supervisor?.running
    ? '受监督运行'
    : status.supervisor?.managed
      ? '状态异常'
      : '直接启动';
  supervisorText.className = status.supervisor?.running
    ? 'status-success'
    : status.supervisor?.managed
      ? 'status-danger'
      : '';
  document.querySelector('#systemRestartCount').textContent = status.supervisor?.managed
    ? `本次已自动重启 ${status.supervisor.restartCount || 0} 次`
    : '建议使用 service:start 启动';
}

async function loadSystemLogs() {
  const logs = await apiRequest('/api/admin/logs?limit=20');
  const rows = document.querySelector('#systemLogRows');

  if (!logs.length) {
    rows.innerHTML = '<tr><td colspan="5" class="muted">暂无请求日志</td></tr>';
    return;
  }

  rows.innerHTML = logs.map((item) => `
    <tr>
      <td>${escapeHtml(new Date(item.timestamp).toLocaleString('zh-CN'))}</td>
      <td><span class="tag ${logLevelClass(item.level)}">${escapeHtml(item.level)}</span></td>
      <td>${escapeHtml(logEventText(item))}</td>
      <td>${item.status ?? '-'}</td>
      <td>${item.durationMs === undefined ? '-' : `${item.durationMs} ms`}</td>
    </tr>
  `).join('');
}

function logLevelClass(level) {
  if (level === 'error') return 'danger';
  if (level === 'warn') return 'warning';
  return 'success';
}

function logEventText(item) {
  if (item.method) return `${item.method} ${item.path || ''}`;
  const labels = {
    server_started: '网站服务启动',
    server_stopped: '网站服务停止',
    supervisor_started: '监督进程启动',
    supervisor_child_started: '网站进程启动',
    supervisor_child_exited: '网站进程异常退出',
    supervisor_stopping: '监督进程正在停止',
    supervisor_stopped: '监督进程已停止',
    scheduled_backup_completed: '自动备份完成',
    scheduled_backup_failed: '自动备份失败',
    database_maintenance_completed: '数据库维护完成',
    database_maintenance_failed: '数据库维护失败',
    scheduled_database_maintenance_failed: '自动数据库维护失败'
  };
  return labels[item.event] || item.event;
}

async function createBackup() {
  const button = document.querySelector('#createBackupButton');
  const message = document.querySelector('#backupMessage');
  button.disabled = true;
  message.textContent = '正在备份...';

  try {
    const result = await postJson('/api/admin/backups', {});
    message.textContent = `已生成 ${result.fileName}`;
    await Promise.all([loadSystemStatus(), loadSystemLogs()]);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function handleAdminAction(event) {
  const row = event.target.closest('[data-user-id]');
  if (!row) return;

  const message = document.querySelector('#adminMessage');
  const userId = row.dataset.userId;

  if (event.target.matches('[data-save-role]')) {
    event.target.disabled = true;
    try {
      const role = row.querySelector('[data-user-role]').value;
      await putJson(`/api/admin/users/${encodeURIComponent(userId)}/role`, { role });
      message.textContent = '用户角色已更新。';
      await loadAdminUsers();
    } catch (error) {
      message.textContent = error.message;
      event.target.disabled = false;
    }
    return;
  }

  if (event.target.matches('[data-delete-user]')) {
    const username = row.querySelector('strong').textContent;
    if (!window.confirm(`确认删除用户“${username}”及其全部学习数据吗？`)) {
      return;
    }

    event.target.disabled = true;
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
      message.textContent = `用户“${username}”已删除。`;
      await loadAdminUsers();
    } catch (error) {
      message.textContent = error.message;
      event.target.disabled = false;
    }
  }
}

initAccountPage().catch((error) => {
  renderApiError(document.querySelector('#accountRoot'), error);
});
