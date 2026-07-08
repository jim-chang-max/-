const { escapeHtml } = window.ui;

async function loadMistakes() {
  const mistakes = await apiRequest('/api/mistakes');
  const container = document.querySelector('#mistakeList');

  if (!mistakes.length) {
    container.innerHTML = `
      <section class="mistake-summary-grid">
        <article class="card stat mistake-alert-card">
          <span class="muted">待复盘错题</span>
          <span class="stat-value">0</span>
          <span class="tag success">状态很好</span>
        </article>
        <article class="card stat mistake-chapter-card">
          <span class="muted">薄弱章节</span>
          <span class="stat-value">0</span>
          <span class="tag">暂无</span>
        </article>
        <article class="card stat">
          <span class="muted">高频错误</span>
          <span class="stat-value">0</span>
          <span class="tag success">继续保持</span>
        </article>
      </section>
      <div class="empty">错题本为空，刷题后做错的题会自动出现在这里。</div>
    `;
    return;
  }

  const chapterStats = buildChapterStats(mistakes);
  const highFrequency = mistakes.filter((item) => Number(item.wrongCount || 0) >= 2);
  const weakestChapter = chapterStats[0] ? chapterStats[0].chapter : '暂无';

  container.innerHTML = `
    <section class="mistake-summary-grid">
      <article class="card stat mistake-alert-card">
        <span class="muted">待复盘错题</span>
        <span class="stat-value">${mistakes.length}</span>
        <span class="tag danger">需要重练</span>
      </article>
      <article class="card stat mistake-chapter-card">
        <span class="muted">薄弱章节</span>
        <span class="stat-value">${chapterStats.length}</span>
        <span class="tag violet">${weakestChapter}</span>
      </article>
      <article class="card stat">
        <span class="muted">高频错误</span>
        <span class="stat-value">${highFrequency.length}</span>
        <span class="tag warning">错 2 次以上</span>
      </article>
    </section>

    <section class="card mistake-chapter-card">
      <h2 class="card-title">薄弱章节</h2>
      <div class="mistake-chapter-list">
        ${chapterStats.map((item) => `
          <div class="mistake-chapter-row">
            <strong>${escapeHtml(item.chapter)}</strong>
            <span class="tag danger">${item.count} 题 / ${item.wrongCount} 次错误</span>
          </div>
        `).join('')}
      </div>
    </section>

    <section class="grid">
      ${mistakes.map(renderMistakeCard).join('')}
    </section>
  `;

  container.querySelectorAll('[data-remove]').forEach((button) => {
    button.addEventListener('click', async () => {
      await apiRequest(`/api/mistakes/${button.dataset.remove}`, { method: 'DELETE' });
      loadMistakes();
    });
  });
}

function buildChapterStats(mistakes) {
  const map = new Map();

  mistakes.forEach((item) => {
    const chapter = (item.question && (item.question.chapter || item.question.chapterId)) || '未标注章节';
    const current = map.get(chapter) || { chapter, count: 0, wrongCount: 0 };
    current.count += 1;
    current.wrongCount += Number(item.wrongCount || 0);
    map.set(chapter, current);
  });

  return [...map.values()].sort((a, b) => b.wrongCount - a.wrongCount);
}

function renderMistakeCard(item) {
  const question = item.question;
  const highFrequency = Number(item.wrongCount || 0) >= 2;

  return `
    <article class="card mistake-card ${highFrequency ? 'high-frequency' : ''}" data-question-id="${item.questionId}">
      <div class="button-row">
        <span class="tag danger">错误 ${item.wrongCount} 次</span>
        ${highFrequency ? '<span class="tag warning">高频错误</span>' : ''}
        <span class="tag">${escapeHtml(item.reason)}</span>
      </div>
      <h2 class="card-title">${escapeHtml(question ? question.title || question.stem : '题目已删除')}</h2>
      <p class="muted">章节：${escapeHtml(question ? question.chapter || question.chapterId || '未标注' : '-')}</p>
      <p class="muted">正确答案：${escapeHtml(question ? question.answer : '-')}</p>
      <p>解析：${escapeHtml(question ? question.analysis : '-')}</p>
      <button class="button" data-remove="${item.questionId}">移出错题本</button>
    </article>
  `;
}

loadMistakes().catch((error) => {
  renderEmpty(document.querySelector('#mistakeList'), error.message);
});
