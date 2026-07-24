const { escapeHtml } = window.ui;

async function loadDashboard() {
  const data = await apiRequest('/api/dashboard');

  document.querySelector('#chapterCount').textContent = data.counts.chapters;
  document.querySelector('#topicCount').textContent = data.counts.topics;
  document.querySelector('#questionCount').textContent = data.counts.questions;
  document.querySelector('#mistakeCount').textContent = data.counts.mistakes;

  document.querySelector('#progressText').textContent = `${data.progress.percent}%`;
  document.querySelector('#progressBar').style.width = `${data.progress.percent}%`;
  document.querySelector('#progressCaption').textContent = data.loggedIn
    ? `已掌握 ${data.progress.mastered} / ${data.progress.total} 个知识点。`
    : '登录后可在多台设备间保存知识点掌握进度。';

  const taskList = document.querySelector('#todayTasks');
  if (!data.loggedIn) {
    taskList.innerHTML = `
      <div class="empty">
        <p>登录后查看今日复习任务。</p>
        <a class="button primary" href="login.html">前往登录</a>
      </div>
    `;
  } else if (!data.todayTasks.length) {
    renderEmpty(taskList, '今天还没有计划，去复习计划页面生成一份吧。');
  } else {
    taskList.innerHTML = data.todayTasks
      .map((task) => `
        <div class="list-item task">
          <span>${escapeHtml(task.title)}</span>
          <span class="tag ${task.completed ? 'success' : 'warning'}">${task.completed ? '已完成' : '待完成'}</span>
        </div>
      `)
      .join('');
  }

  const weakList = document.querySelector('#weakTopics');
  if (!data.loggedIn) {
    renderEmpty(weakList, '登录并完成练习后，这里会显示你的薄弱章节。');
    return;
  }

  const chapterRows = data.weakChapters
    .map((item) => `
      <div class="mistake-chapter-row">
        <strong>${escapeHtml(item.chapter)}</strong>
        <span class="tag danger">${item.questionCount} 题 / 累计错 ${item.wrongCount} 次</span>
      </div>
    `)
    .join('');

  const questionRows = data.weakQuestions
    .map((item) => `
      <div class="list-item mistake-card ${Number(item.wrongCount || 0) >= 2 ? 'high-frequency' : ''}">
        <div class="button-row">
          <span class="tag danger">错 ${item.wrongCount} 次</span>
          <span class="tag">${escapeHtml(item.reason || '题库练习错误')}</span>
        </div>
        <h3>${escapeHtml(item.question ? item.question.title || item.question.stem : '题目已删除')}</h3>
      </div>
    `)
    .join('');

  weakList.innerHTML = `
    ${chapterRows ? `<div class="mistake-chapter-list">${chapterRows}</div>` : ''}
    ${questionRows}
  `;

  if (!data.weakQuestions.length) {
    renderEmpty(weakList, '暂时没有错题，保持这个势头。');
  }
}

loadDashboard().catch((error) => {
  renderEmpty(document.querySelector('#dashboardRoot'), error.message);
});
