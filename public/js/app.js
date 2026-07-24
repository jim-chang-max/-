function setActiveNav() {
  const current = location.pathname.endsWith('/') ? '/index.html' : location.pathname;

  document.querySelectorAll('.nav a').forEach((link) => {
    const href = link.getAttribute('href');
    const isHome = current === '/index.html' && href === 'index.html';
    const isActive = current.endsWith(`/${href}`) || isHome;
    link.classList.toggle('active', isActive);
  });
}

async function renderUserStatus() {
  const holder = document.querySelector('[data-user-status]');
  if (!holder) return;

  const user = await apiRequest('/api/auth/me');
  document.querySelectorAll('[data-admin-only]').forEach((element) => {
    element.classList.toggle('hidden', user?.role !== 'admin');
  });

  if (!user) {
    holder.textContent = '未登录';
    return;
  }

  const accountLink = document.querySelector('.nav a[href="login.html"]');
  if (accountLink) {
    accountLink.href = 'account.html';
    accountLink.textContent = '账户';
    accountLink.classList.toggle('active', location.pathname.endsWith('/account.html'));
  }

  holder.textContent = `${user.role === 'admin' ? '管理员' : '已登录'}：${user.username} · 退出`;
  holder.classList.add('user-action');
  holder.setAttribute('role', 'button');
  holder.setAttribute('tabindex', '0');
  holder.setAttribute('title', '退出当前账号');

  const logout = async () => {
    await postJson('/api/auth/logout', {});
    location.href = 'login.html';
  };
  holder.addEventListener('click', logout);
  holder.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      logout();
    }
  });
}

function renderEmpty(container, text) {
  const safeText = window.ui ? window.ui.escapeHtml(text) : String(text || '');
  container.innerHTML = `<div class="empty">${safeText}</div>`;
}

function renderApiError(container, error) {
  if (error.status === 401) {
    container.innerHTML = `
      <div class="empty">
        <p>${window.ui.escapeHtml(error.message)}</p>
        <a class="button primary" href="login.html">登录或注册</a>
      </div>
    `;
    return;
  }

  if (error.status === 403) {
    container.innerHTML = `
      <div class="empty">
        <p>${window.ui.escapeHtml(error.message)}</p>
        <a class="button" href="index.html">返回首页</a>
      </div>
    `;
    return;
  }

  renderEmpty(container, error.message);
}

function optionText(question, index) {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  return `${letters[index]}. ${question.options[index]}`;
}

setActiveNav();
renderUserStatus().catch(() => {});
