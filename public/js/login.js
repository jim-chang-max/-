async function handleAuth(event) {
  event.preventDefault();

  const action = event.submitter.dataset.action;
  const username = document.querySelector('#username').value.trim();
  const password = document.querySelector('#password').value;
  const message = document.querySelector('#loginMessage');

  try {
    await postJson(`/api/auth/${action}`, { username, password });
    message.textContent = action === 'login' ? '登录成功，正在进入首页。' : '注册成功，正在进入首页。';
    setTimeout(() => {
      location.href = 'index.html';
    }, 500);
  } catch (error) {
    message.textContent = error.message;
  }
}

document.querySelector('#loginForm').addEventListener('submit', handleAuth);
