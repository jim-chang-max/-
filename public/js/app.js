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
  holder.textContent = user ? `已登录：${user.username}` : '未登录';
}

function renderEmpty(container, text) {
  const safeText = window.ui ? window.ui.escapeHtml(text) : String(text || '');
  container.innerHTML = `<div class="empty">${safeText}</div>`;
}

function optionText(question, index) {
  const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
  return `${letters[index]}. ${question.options[index]}`;
}

setActiveNav();
renderUserStatus().catch(() => {});
