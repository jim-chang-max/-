let currentQuiz = null;
let timer = null;
let remainSeconds = 0;
let currentAnswers = {};
let pendingQuizResult = null;
let quizFinalized = false;
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
    try {
      await generateQuiz();
    } catch (error) {
      renderApiError(document.querySelector('#quizQuestions'), error);
    }
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
  currentAnswers = {};
  pendingQuizResult = null;
  quizFinalized = false;
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
  if (!currentQuiz || !currentQuiz.questions.length || quizFinalized) return;

  clearInterval(timer);
  const submitButton = document.querySelector('#submitQuiz');
  submitButton.disabled = true;
  currentAnswers = {};

  currentQuiz.questions.forEach((question) => {
    const checked = document.querySelector(`input[name="quiz-${question.id}"]:checked`);
    const textInput = document.querySelector(`[name="quiz-${question.id}"]:not([type="radio"])`);
    currentAnswers[question.id] = checked ? checked.value : textInput ? textInput.value : '';
  });

  try {
    const result = await postJson('/api/quiz/submit', {
      quizId: currentQuiz.id,
      answers: currentAnswers,
      selfAssessments: {}
    });

    if (result.requiresSelfAssessment) {
      pendingQuizResult = result;
      renderQuizSelfAssessment(result);
      return;
    }

    finishQuiz(result);
  } catch (error) {
    submitButton.disabled = false;
    renderEmpty(document.querySelector('#quizResult'), error.message);
  }
}

function renderQuizSelfAssessment(result) {
  const pendingDetails = result.details.filter((item) => item.correct === null);

  document.querySelector('#submitQuiz').classList.add('hidden');
  document.querySelector('#quizResult').innerHTML = `
    <section class="card quiz-result-card">
      <div class="button-row">
        <span class="tag violet">主观题自评</span>
        <span class="tag warning">还有 ${pendingDetails.length} 题待确认</span>
      </div>
      <p class="muted">请对照参考答案，按实际作答情况选择自评结果。完成全部自评后才会正式计分。</p>
      <div class="list quiz-review-list">
        ${pendingDetails.map((item, index) => `
          <article class="list-item self-assessment-item">
            <strong>${index + 1}. ${escapeHtml(item.stem)}</strong>
            <p>你的答案：${escapeHtml(item.userAnswer || '未作答')}</p>
            <p>参考答案：${escapeHtml(item.correctAnswer)}</p>
            <p class="muted">${escapeHtml(item.analysis)}</p>
            <div class="self-assessment-choice">
              <label>
                <input type="radio" name="self-assess-${item.questionId}" value="true">
                <span>我答对了</span>
              </label>
              <label>
                <input type="radio" name="self-assess-${item.questionId}" value="false">
                <span>需要复习</span>
              </label>
            </div>
          </article>
        `).join('')}
      </div>
      <div class="button-row">
        <button class="button primary" type="button" id="finalizeSelfAssessment">完成自评并计分</button>
        <span class="muted" id="selfAssessmentMessage"></span>
      </div>
    </section>
  `;

  document.querySelector('#finalizeSelfAssessment').addEventListener('click', finalizeSelfAssessment);
}

async function finalizeSelfAssessment() {
  if (!pendingQuizResult) return;

  const finalizeButton = document.querySelector('#finalizeSelfAssessment');
  const selfAssessments = {};
  for (const questionId of pendingQuizResult.pendingSubjectiveIds) {
    const checked = document.querySelector(`input[name="self-assess-${questionId}"]:checked`);
    if (!checked) {
      document.querySelector('#selfAssessmentMessage').textContent = '请完成全部主观题自评。';
      return;
    }
    selfAssessments[questionId] = checked.value === 'true';
  }

  finalizeButton.disabled = true;
  try {
    const result = await postJson('/api/quiz/submit', {
      quizId: currentQuiz.id,
      answers: currentAnswers,
      selfAssessments
    });

    finishQuiz(result);
  } catch (error) {
    finalizeButton.disabled = false;
    document.querySelector('#selfAssessmentMessage').textContent = error.message;
  }
}

function finishQuiz(result) {
  quizFinalized = true;
  pendingQuizResult = null;
  document.querySelector('#submitQuiz').classList.add('hidden');
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
  renderApiError(document.querySelector('#quizQuestions'), error);
});
