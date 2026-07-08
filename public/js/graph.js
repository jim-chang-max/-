let graphData = { nodes: [], edges: [] };
let questionData = [];
let activeNodeId = '';
const { escapeHtml } = window.ui;

async function initGraphPage() {
  [graphData, questionData] = await Promise.all([
    apiRequest('/api/graph'),
    apiRequest('/api/questions')
  ]);

  activeNodeId = graphData.nodes[0] ? graphData.nodes[0].id : '';
  renderGraph();
  renderDetail();
}

function renderGraph() {
  const stage = document.querySelector('#graphStage');
  const width = 980;
  const height = 560;

  if (!graphData.nodes.length) {
    renderEmpty(stage, '暂无图谱数据。');
    return;
  }

  const nodeById = Object.fromEntries(graphData.nodes.map((node) => [node.id, node]));
  const edges = graphData.edges.map((edge) => {
    const from = nodeById[edge.from];
    const to = nodeById[edge.to];
    return { ...edge, from, to };
  }).filter((edge) => edge.from && edge.to);

  stage.innerHTML = `
    <svg class="knowledge-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="离散数学章节关系图">
      <defs>
        <marker id="arrowHead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L9,3 z" fill="#7b8798"></path>
        </marker>
      </defs>
      ${edges.map(renderEdge).join('')}
      ${graphData.nodes.map(renderNode).join('')}
    </svg>
  `;

  stage.querySelectorAll('[data-node-id]').forEach((nodeElement) => {
    nodeElement.addEventListener('click', () => {
      activeNodeId = nodeElement.dataset.nodeId;
      renderGraph();
      renderDetail();
    });
  });
}

function renderEdge(edge) {
  const start = edgePoint(edge.from, edge.to, 72);
  const end = edgePoint(edge.to, edge.from, 86);
  const labelX = (start.x + end.x) / 2;
  const labelY = (start.y + end.y) / 2 - 8;

  return `
    <g class="graph-edge">
      <line x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" marker-end="url(#arrowHead)"></line>
      <text x="${labelX}" y="${labelY}">${escapeHtml(edge.label || '')}</text>
    </g>
  `;
}

function edgePoint(from, to, radius) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;

  return {
    x: from.x + (dx / length) * radius,
    y: from.y + (dy / length) * radius
  };
}

function renderNode(node) {
  const active = node.id === activeNodeId ? 'active' : '';
  const shortCount = questionData.filter((question) => question.chapter === node.chapter).length;

  return `
    <g class="graph-node ${active}" data-node-id="${node.id}" tabindex="0" role="button" aria-label="${escapeHtml(node.label)}">
      <rect x="${node.x - 72}" y="${node.y - 34}" width="144" height="68" rx="8"></rect>
      <text class="graph-node-title" x="${node.x}" y="${node.y - 4}" text-anchor="middle">${escapeHtml(node.label)}</text>
      <text class="graph-node-meta" x="${node.x}" y="${node.y + 20}" text-anchor="middle">${shortCount} 道题</text>
    </g>
  `;
}

function renderDetail() {
  const node = graphData.nodes.find((item) => item.id === activeNodeId);
  const detail = document.querySelector('#graphDetail');

  if (!node) {
    renderEmpty(detail, '请选择一个章节节点。');
    return;
  }

  const practiceQuestions = questionData
    .filter((question) => question.chapter === node.chapter)
    .slice(0, 4);

  detail.innerHTML = `
    <div class="graph-detail-head">
      <span class="tag primary">${escapeHtml(node.label)}</span>
      <a class="button" href="questions.html">更多题目</a>
    </div>
    ${renderDetailBlock('核心概念', node.coreConcepts)}
    ${renderDetailBlock('常考题型', node.questionTypes)}
    ${renderDetailBlock('易错点', node.commonMistakes)}
    <section class="graph-detail-block">
      <h2 class="card-title">推荐练习题</h2>
      <div class="list">
        ${practiceQuestions.length ? practiceQuestions.map(renderPracticeQuestion).join('') : '<div class="empty">该章节暂无推荐题。</div>'}
      </div>
    </section>
  `;
}

function renderDetailBlock(title, items = []) {
  return `
    <section class="graph-detail-block">
      <h2 class="card-title">${title}</h2>
      <ul class="graph-detail-list">
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    </section>
  `;
}

function renderPracticeQuestion(question) {
  return `
    <article class="list-item">
      <div class="button-row">
        <span class="tag">${escapeHtml(question.type)}</span>
        <span class="tag">${escapeHtml(question.difficulty)}</span>
      </div>
      <h3>${escapeHtml(question.title)}</h3>
      <p class="muted">知识点：${escapeHtml((question.knowledgePoints || []).join('、') || '未标注')}</p>
    </article>
  `;
}

initGraphPage().catch((error) => {
  renderEmpty(document.querySelector('#graphStage'), error.message);
});
