const { escapeHtml } = window.ui;

async function initPlanPage() {
  document.querySelector('#planForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const examDate = document.querySelector('#examDate').value;
    try {
      await postJson('/api/plans/generate', { examDate });
      await renderPlan();
    } catch (error) {
      renderApiError(document.querySelector('#planList'), error);
    }
  });

  await renderPlan();
}

async function renderPlan() {
  const plan = await apiRequest('/api/plans');
  const container = document.querySelector('#planList');

  if (!plan) {
    renderEmpty(container, '还没有复习计划，请选择考试日期生成计划。');
    return;
  }

  document.querySelector('#planSummary').textContent = `考试日期：${plan.examDate}，共 ${plan.days.length} 天`;
  container.innerHTML = plan.days
    .map((day) => `
      <section class="card plan-day">
        <h2 class="card-title">${day.date}</h2>
        ${day.tasks
          .map((task) => `
            <label class="task">
              <span>${escapeHtml(task.title)}</span>
              <input type="checkbox" data-date="${day.date}" data-task-id="${task.id}" ${task.completed ? 'checked' : ''}>
            </label>
          `)
          .join('')}
      </section>
    `)
    .join('');

  container.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      await putJson('/api/plans/task', {
        date: checkbox.dataset.date,
        taskId: checkbox.dataset.taskId,
        completed: checkbox.checked
      });
    });
  });
}

initPlanPage().catch((error) => {
  renderApiError(document.querySelector('#planList'), error);
});
