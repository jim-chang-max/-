const STORAGE_KEY = 'discreteMathMasteredTopicIds';
const { escapeHtml } = window.ui;

let chapters = [];
let topics = [];
let selectedChapterId = '';

function getMasteredIds() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (error) {
    return [];
  }
}

function setMasteredIds(ids) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

function isMastered(topicId) {
  return getMasteredIds().includes(topicId);
}

function toggleMastered(topicId) {
  const ids = getMasteredIds();
  const next = ids.includes(topicId) ? ids.filter((id) => id !== topicId) : [...ids, topicId];
  setMasteredIds(next);
  renderAll();
}

async function loadTopics() {
  [chapters, topics] = await Promise.all([
    apiRequest('/api/chapters'),
    apiRequest('/api/knowledge')
  ]);

  selectedChapterId = chapters[0] ? chapters[0].id : '';

  document.querySelector('#topicSearch').addEventListener('input', renderAll);
  document.querySelector('#chapterList').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-id]');
    if (!button) return;
    selectedChapterId = button.dataset.id;
    renderAll();
  });
  document.querySelector('#topicCards').addEventListener('click', (event) => {
    const button = event.target.closest('[data-master-topic]');
    if (!button) return;
    toggleMastered(button.dataset.masterTopic);
  });

  renderAll();
}

function renderAll() {
  renderChapterList();
  renderChapterSummary();
  renderTopics();
}

function renderChapterList() {
  const masteredIds = getMasteredIds();
  const list = document.querySelector('#chapterList');
  const totalMastered = topics.filter((topic) => masteredIds.includes(topic.id)).length;

  document.querySelector('#masteredSummary').textContent = `${totalMastered} / ${topics.length}`;

  list.innerHTML = chapters
    .map((chapter) => {
      const chapterTopics = topics.filter((topic) => topic.chapterId === chapter.id);
      const masteredCount = chapterTopics.filter((topic) => masteredIds.includes(topic.id)).length;
      const active = chapter.id === selectedChapterId ? 'active' : '';

      return `
        <button class="${active}" data-id="${chapter.id}" type="button">
          <span class="chapter-name">${chapter.order}. ${escapeHtml(chapter.name)}</span>
          <span class="chapter-meta">${masteredCount}/${chapterTopics.length} 已掌握</span>
        </button>
      `;
    })
    .join('');
}

function currentChapter() {
  return chapters.find((chapter) => chapter.id === selectedChapterId) || chapters[0] || null;
}

function currentTopics() {
  const keyword = document.querySelector('#topicSearch').value.trim();
  const base = topics.filter((topic) => topic.chapterId === selectedChapterId);

  if (!keyword) {
    return base;
  }

  return base.filter((topic) => topicToSearchText(topic).includes(keyword));
}

function topicToSearchText(topic) {
  return [
    topic.title,
    topic.level,
    topic.coreDefinition,
    topic.content,
    topic.mnemonic,
    ...(topic.formulas || []),
    ...(topic.questionTypes || []),
    ...(topic.commonMistakes || []),
    ...(topic.keyPoints || [])
  ]
    .filter(Boolean)
    .join(' ');
}

function renderChapterSummary() {
  const chapter = currentChapter();
  const chapterTopics = topics.filter((topic) => topic.chapterId === selectedChapterId);
  const masteredCount = chapterTopics.filter((topic) => isMastered(topic.id)).length;
  const percent = chapterTopics.length ? Math.round((masteredCount / chapterTopics.length) * 100) : 0;

  document.querySelector('#chapterKicker').textContent = chapter ? `第 ${chapter.order} 章` : '当前章节';
  document.querySelector('#chapterTitle').textContent = chapter ? chapter.name : '暂无章节';
  document.querySelector('#chapterDesc').textContent = chapter ? chapter.description : '请先添加章节数据。';
  document.querySelector('#chapterProgressText').textContent = `${masteredCount} / ${chapterTopics.length} 已掌握`;
  document.querySelector('#chapterProgressBar').style.width = `${percent}%`;
}

function renderTopics() {
  const container = document.querySelector('#topicCards');
  const visibleTopics = currentTopics();

  if (!visibleTopics.length) {
    renderEmpty(container, '当前章节没有匹配的知识点。');
    return;
  }

  container.innerHTML = visibleTopics.map(renderTopicCard).join('');
}

function renderTopicCard(topic) {
  const mastered = isMastered(topic.id);

  return `
    <article class="card topic-card ${mastered ? 'mastered' : ''}">
      <div class="topic-card-head">
        <div>
          <div class="button-row">
            <span class="tag primary">${escapeHtml(topic.level)}</span>
            ${mastered ? '<span class="tag">已掌握</span>' : '<span class="tag warning">待掌握</span>'}
          </div>
          <h3 class="topic-title">${escapeHtml(topic.title)}</h3>
        </div>
        <button class="button ${mastered ? '' : 'primary'}" type="button" data-master-topic="${topic.id}">
          ${mastered ? '取消掌握' : '标记为已掌握'}
        </button>
      </div>

      <div class="topic-section">
        <h4>核心定义</h4>
        <p>${escapeHtml(topic.coreDefinition || topic.content)}</p>
      </div>

      <div class="topic-detail-grid">
        ${renderInfoBlock('常见公式', topic.formulas)}
        ${renderInfoBlock('典型题型', topic.questionTypes)}
        ${renderInfoBlock('易错点', topic.commonMistakes)}
      </div>

      <div class="memory-note">
        <strong>记忆口诀</strong>
        <p>${escapeHtml(topic.mnemonic || '暂无口诀，可后续在 JSON 中补充。')}</p>
      </div>
    </article>
  `;
}

function renderInfoBlock(title, items = []) {
  const content = items.length
    ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
    : '<li>暂无内容，可在 JSON 中补充。</li>';

  return `
    <section class="topic-info-block">
      <h4>${title}</h4>
      <ul>${content}</ul>
    </section>
  `;
}

loadTopics().catch((error) => {
  renderEmpty(document.querySelector('#topicCards'), error.message);
});
