const { escapeHtml, formatSource } = window.ui;

async function loadReviewQuestions() {
  const questions = await apiRequest('/api/questions/review');
  const container = document.querySelector('#reviewList');
  document.querySelector('#reviewCountText').textContent = `待审核 ${questions.length} 道`;

  if (!questions.length) {
    renderEmpty(container, '当前没有待人工审核的题目。');
    return;
  }

  container.innerHTML = questions.map(renderReviewCard).join('');
  container.querySelectorAll('[data-save-review]').forEach((button) => {
    button.addEventListener('click', saveReview);
  });
}

function renderReviewCard(question) {
  return `
    <article class="card review-card" data-question-id="${question.id}">
      <div class="button-row">
        <span class="tag warning">待人工审核</span>
        <span class="tag">${question.type}</span>
        <span class="tag">${question.difficulty}</span>
        <span class="muted">#${question.id}</span>
      </div>

      <div class="field">
        <label>章节</label>
        <input name="chapter" value="${escapeHtml(question.chapter || '')}">
      </div>
      <div class="field">
        <label>题干</label>
        <textarea name="title" rows="3">${escapeHtml(question.title || '')}</textarea>
      </div>
      <div class="field">
        <label>标准答案</label>
        <textarea name="answer" rows="2">${escapeHtml(question.answer || '')}</textarea>
      </div>
      <div class="field">
        <label>详细解析</label>
        <textarea name="analysis" rows="4">${escapeHtml(question.analysis || '')}</textarea>
      </div>
      <p class="muted">来源：${formatSource(question.source)}</p>
      <p class="muted">导入备注：${escapeHtml(question.extractionNote || '无')}</p>

      <div class="button-row">
        <button class="button primary" type="button" data-save-review="${question.id}">保存并通过审核</button>
        <span class="muted" data-save-message></span>
      </div>
    </article>
  `;
}

async function saveReview(event) {
  const questionId = event.target.dataset.saveReview;
  const card = event.target.closest('[data-question-id]');
  const message = card.querySelector('[data-save-message]');
  const payload = {
    chapter: card.querySelector('[name="chapter"]').value.trim(),
    title: card.querySelector('[name="title"]').value.trim(),
    answer: card.querySelector('[name="answer"]').value.trim(),
    analysis: card.querySelector('[name="analysis"]').value.trim(),
    needsReview: false,
    reviewStatus: '待复习'
  };

  await putJson(`/api/questions/${questionId}`, payload);
  message.textContent = '已保存';
  setTimeout(loadReviewQuestions, 400);
}

loadReviewQuestions().catch((error) => {
  renderApiError(document.querySelector('#reviewList'), error);
});
