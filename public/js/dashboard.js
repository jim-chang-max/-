const { escapeHtml } = window.ui;

async function loadDashboard() {
  const [chapters, knowledge, questions, mistakes, todayPlan] = await Promise.all([
    apiRequest('/api/chapters'),
    apiRequest('/api/knowledge'),
    apiRequest('/api/questions'),
    apiRequest('/api/mistakes'),
    apiRequest('/api/plans/today')
  ]);

  document.querySelector('#chapterCount').textContent = chapters.length;
  document.querySelector('#topicCount').textContent = knowledge.length;
  document.querySelector('#questionCount').textContent = questions.length;
  document.querySelector('#mistakeCount').textContent = mistakes.length;

  const progress = knowledge.length ? Math.round((2 / knowledge.length) * 100) : 0;
  document.querySelector('#progressText').textContent = `${progress}%`;
  document.querySelector('#progressBar').style.width = `${progress}%`;

  const taskList = document.querySelector('#todayTasks');
  if (!todayPlan || !todayPlan.tasks.length) {
    renderEmpty(taskList, '今天还没有计划，去复习计划页面生成一份吧。');
  } else {
    taskList.innerHTML = todayPlan.tasks
      .map((task) => `
        <div class="list-item task">
          <span>${escapeHtml(task.title)}</span>
          <span class="tag ${task.completed ? 'success' : 'warning'}">${task.completed ? '已完成' : '待完成'}</span>
        </div>
      `)
      .join('');
  }

  const weakList = document.querySelector('#weakTopics');
  weakList.innerHTML = mistakes
    .slice(0, 3)
    .map((item) => `
      <div class="list-item mistake-card ${Number(item.wrongCount || 0) >= 2 ? 'high-frequency' : ''}">
        <div class="button-row">
          <span class="tag danger">错 ${item.wrongCount} 次</span>
          <span class="tag">${escapeHtml(item.reason)}</span>
        </div>
        <h3>${escapeHtml(item.question ? item.question.title || item.question.stem : '题目已删除')}</h3>
      </div>
    `)
    .join('');

  if (!mistakes.length) {
    renderEmpty(weakList, '暂时没有错题，保持这个势头。');
  }
}

loadDashboard().catch((error) => {
  renderEmpty(document.querySelector('#dashboardRoot'), error.message);
});
