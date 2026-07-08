const typeLabels = {
  choice: '选择题',
  judge: '判断题',
  blank: '填空题',
  calculation: '计算题',
  proof: '证明题',
  shortAnswer: '简答题'
};

const { debounce, escapeHtml, formatSource } = window.ui;

const difficultyLabels = {
  easy: '基础',
  medium: '中等',
  hard: '困难'
};

async function initQuestionPage() {
  await renderChapterOptions();

  document.querySelector('#filterForm').addEventListener('change', renderQuestions);
  document.querySelector('#keywordInput').addEventListener('input', debounce(renderQuestions, 250));
  await renderQuestions();
}

async function renderChapterOptions() {
  const questions = await apiRequest('/api/questions');
  const chapters = [...new Set(questions.map((question) => question.chapter).filter(Boolean))];
  const chapterSelect = document.querySelector('#chapterFilter');

  chapterSelect.innerHTML =
    '<option value="">全部章节</option>' +
    chapters.map((chapter) => `<option value="${escapeHtml(chapter)}">${chapter}</option>`).join('');
}

async function renderQuestions() {
  const query = new URLSearchParams();
  const chapter = document.querySelector('#chapterFilter').value;
  const type = document.querySelector('#typeFilter').value;
  const difficulty = document.querySelector('#difficultyFilter').value;
  const needsReview = document.querySelector('#needsReviewFilter').value;
  const keyword = document.querySelector('#keywordInput').value.trim();

  if (chapter) query.set('chapter', chapter);
  if (type) query.set('type', type);
  if (difficulty) query.set('difficulty', difficulty);
  if (needsReview) query.set('needsReview', needsReview);
  if (keyword) query.set('keyword', keyword);

  const questions = await apiRequest(`/api/questions?${query.toString()}`);
  const container = document.querySelector('#questionList');
  document.querySelector('#questionCountText').textContent = `共 ${questions.length} 道题`;

  if (!questions.length) {
    renderEmpty(container, '当前筛选条件下没有题目。');
    return;
  }

  container.innerHTML = questions.map(renderQuestionCard).join('');
  container.querySelectorAll('[data-submit-answer]').forEach((button) => {
    button.addEventListener('click', submitAnswer);
  });
  container.querySelectorAll('[data-show-answer]').forEach((button) => {
    button.addEventListener('click', showAnswer);
  });
}

function renderQuestionCard(question) {
  const optionsHtml = question.type === 'choice'
    ? renderChoiceOptions(question)
    : renderWrittenAnswer(question);

  return `
    <article class="card question-card" data-question-id="${question.id}">
      <div class="question-card-head">
        <div class="button-row">
          <span class="tag primary">${escapeHtml(question.chapter)}</span>
          <span class="tag">${typeLabels[question.type] || question.type}</span>
          <span class="tag">${difficultyLabels[question.difficulty] || question.difficulty}</span>
          ${question.needsReview ? '<span class="tag warning">待人工审核</span>' : ''}
          <span class="tag ${question.reviewStatus === '易错' ? 'danger' : ''}">${escapeHtml(question.reviewStatus)}</span>
        </div>
        <span class="muted">#${question.id}</span>
      </div>

      <h2 class="question-title">${escapeHtml(question.title)}</h2>
      <p class="muted">知识点：${escapeHtml((question.knowledgePoints || []).join('、') || '未标注')}</p>
      <p class="muted">来源：${formatSource(question.source)}</p>

      ${optionsHtml}

      <div class="question-stats">
        <span>做对：${question.correctCount || 0}</span>
        <span>做错：${question.wrongCount || 0}</span>
        <span>标签：${escapeHtml((question.tags || []).join('、') || '无')}</span>
      </div>
      <div class="answer-panel hidden" data-answer-panel></div>
    </article>
  `;
}

function renderChoiceOptions(question) {
  return `
    <div class="option-list">
      ${(question.options || [])
        .map((option, index) => {
          const value = option.match(/^([A-Z])[\.\、]/) ? option.match(/^([A-Z])[\.\、]/)[1] : String.fromCharCode(65 + index);
          return `
            <label>
              <input type="radio" name="answer-${question.id}" value="${value}">
              <span>${escapeHtml(option)}</span>
            </label>
          `;
        })
        .join('')}
    </div>
    <button class="button primary" type="button" data-submit-answer="${question.id}">提交答案</button>
  `;
}

function renderWrittenAnswer(question) {
  return `
    <div class="field">
      <label for="answer-${question.id}">作答区</label>
      <textarea id="answer-${question.id}" name="answer-${question.id}" rows="3" placeholder="可输入你的答案，也可以先查看答案和解析"></textarea>
    </div>
    <div class="button-row">
      <button class="button primary" type="button" data-submit-answer="${question.id}">提交答案</button>
      <button class="button" type="button" data-show-answer="${question.id}">查看答案和解析</button>
    </div>
  `;
}

async function submitAnswer(event) {
  const questionId = event.target.dataset.submitAnswer;
  const card = event.target.closest('[data-question-id]');
  const checked = card.querySelector(`input[name="answer-${questionId}"]:checked`);
  const textInput = card.querySelector(`[name="answer-${questionId}"]:not([type="radio"])`);
  const answer = checked ? checked.value : textInput ? textInput.value : '';
  const panel = card.querySelector('[data-answer-panel]');

  const result = await postJson('/api/questions/answer', { questionId, answer });
  panel.classList.remove('hidden');
  panel.innerHTML = `
    <strong>${result.correct ? '回答正确' : '回答错误'}</strong>
    <p>标准答案：${escapeHtml(result.answer)}</p>
    <p>详细解析：${escapeHtml(result.analysis)}</p>
    <p class="muted">当前状态：${result.reviewStatus}，做对 ${result.correctCount || 0} 次，做错 ${result.wrongCount || 0} 次。</p>
  `;
}

async function showAnswer(event) {
  const questionId = event.target.dataset.showAnswer;
  const card = event.target.closest('[data-question-id]');
  const panel = card.querySelector('[data-answer-panel]');
  const question = await apiRequest(`/api/questions/${questionId}`);

  panel.classList.remove('hidden');
  panel.innerHTML = `
    <strong>标准答案</strong>
    <p>${escapeHtml(question.answer)}</p>
    <strong>详细解析</strong>
    <p>${escapeHtml(question.analysis)}</p>
  `;
}

initQuestionPage().catch((error) => {
  renderEmpty(document.querySelector('#questionList'), error.message);
});
