let currentQuiz = null;
let timer = null;
let remainSeconds = 0;
const { escapeHtml } = window.ui;

const quizTypeLabels = {
  choice: '选择题',
  judge: '判断题',
  blank: '填空题',
  calculation: '计算题',
  proof: '证明题',
  shortAnswer: '简答题'
};

async function initQuizPage() {
  const questions = await apiRequest('/api/questions');
  const chapters = [...new Set(questions.map((question) => question.chapter).filter(Boolean))];
  const select = document.querySelector('#quizChapter');
  select.innerHTML = `<option value="">综合测验</option>` + chapters.map((chapter) => `<option value="${escapeHtml(chapter)}">${escapeHtml(chapter)}</option>`).join('');

  document.querySelector('#quizForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    await generateQuiz();
  });

  document.querySelector('#submitQuiz').addEventListener('click', submitQuiz);
}

async function generateQuiz() {
  const body = {
    chapterId: document.querySelector('#quizChapter').value,
    difficulty: document.querySelector('#quizDifficulty').value,
    count: document.querySelector('#quizCount').value,
    limitMinutes: document.querySelector('#limitMinutes').value
  };

  currentQuiz = await postJson('/api/quiz/generate', body);
  renderQuizQuestions(currentQuiz.questions);
  startTimer(currentQuiz.limitMinutes);
}

function renderQuizQuestions(questions) {
  const container = document.querySelector('#quizQuestions');

  if (!questions.length) {
    renderEmpty(container, '没有可用于组卷的题目，请调整筛选条件。');
    document.querySelector('#submitQuiz').classList.add('hidden');
    return;
  }

  container.innerHTML = questions
    .map((question, qIndex) => `
      <article class="card quiz-question" data-question-id="${question.id}">
        <div class="button-row">
          <span class="tag primary">${quizTypeLabels[question.type] || question.type}</span>
          <span class="tag">${question.difficulty}</span>
          <span class="tag violet">${escapeHtml(question.chapter || '综合')}</span>
        </div>
        <h2 class="card-title">${qIndex + 1}. ${escapeHtml(question.title || question.stem)}</h2>
        ${
          question.options && question.options.length
            ? `<div class="option-list">${question.options
                .map((option, index) => {
                  const value = option.match(/^([A-Z])[\.\、]/) ? option.match(/^([A-Z])[\.\、]/)[1] : String.fromCharCode(65 + index);
                  return `
                    <label>
                      <input type="radio" name="quiz-${question.id}" value="${value}">
                      <span>${escapeHtml(option)}</span>
                    </label>
                  `;
                })
                .join('')}</div>`
            : `<div class="field"><textarea name="quiz-${question.id}" rows="3" placeholder="请输入你的答案"></textarea></div>`
        }
      </article>
    `)
    .join('');

  document.querySelector('#submitQuiz').classList.remove('hidden');
  document.querySelector('#quizResult').innerHTML = '';
}

function startTimer(minutes) {
  clearInterval(timer);
  remainSeconds = Number(minutes) * 60;
  updateTimerText();

  timer = setInterval(() => {
    remainSeconds -= 1;
    updateTimerText();

    if (remainSeconds <= 0) {
      clearInterval(timer);
      submitQuiz();
    }
  }, 1000);
}

function updateTimerText() {
  const minute = Math.floor(remainSeconds / 60);
  const second = String(remainSeconds % 60).padStart(2, '0');
  document.querySelector('#timerText').textContent = `剩余时间：${minute}:${second}`;
}

async function submitQuiz() {
  if (!currentQuiz || !currentQuiz.questions.length) return;

  clearInterval(timer);
  const answers = {};

  currentQuiz.questions.forEach((question) => {
    const checked = document.querySelector(`input[name="quiz-${question.id}"]:checked`);
    const textInput = document.querySelector(`[name="quiz-${question.id}"]:not([type="radio"])`);
    answers[question.id] = checked ? checked.value : textInput ? textInput.value : '';
  });

  const result = await postJson('/api/quiz/submit', {
    questionIds: currentQuiz.questions.map((question) => question.id),
    answers
  });

  renderQuizResult(result);
}

function renderQuizResult(result) {
  const correctCount = result.details.filter((item) => item.correct).length;
  const wrongCount = result.details.length - correctCount;

  document.querySelector('#quizResult').innerHTML = `
    <section class="card quiz-result-card">
      <div class="button-row">
        <span class="tag primary">测验结果</span>
        <span class="tag ${result.accuracy >= 80 ? 'success' : 'warning'}">正确率 ${result.accuracy}%</span>
      </div>

      <div class="quiz-stat-grid">
        <article class="card quiz-stat-card">
          <strong>总分</strong>
          <span class="stat-value">${result.totalScore} / ${result.fullScore}</span>
        </article>
        <article class="card quiz-stat-card">
          <strong>答对题数</strong>
          <span class="stat-value">${correctCount}</span>
        </article>
        <article class="card quiz-stat-card">
          <strong>待复盘题数</strong>
          <span class="stat-value">${wrongCount}</span>
        </article>
      </div>

      <div class="list quiz-review-list">
        ${result.details
          .map((item) => `
            <div class="list-item ${item.correct ? 'correct' : 'wrong'}">
              <div class="button-row">
                <span class="tag ${item.correct ? 'success' : 'danger'}">${item.correct ? '正确' : '错误'}</span>
                <strong>${escapeHtml(item.stem)}</strong>
              </div>
              <p>你的答案：${escapeHtml(item.userAnswer || '未作答')}；标准答案：${escapeHtml(item.correctAnswer)}</p>
              <p class="muted">${escapeHtml(item.analysis)}</p>
            </div>
          `)
          .join('')}
      </div>
    </section>
  `;
}

initQuizPage().catch((error) => {
  renderEmpty(document.querySelector('#quizQuestions'), error.message);
});
