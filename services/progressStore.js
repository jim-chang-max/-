const { readJson, writeJson } = require('./jsonStore');
const { getPool, isMysqlEnabled } = require('./mysqlClient');

function rowToProgress(row) {
  return {
    userId: row.user_id,
    knowledgeId: row.knowledge_id,
    status: row.status,
    reviewCount: Number(row.review_count || 0),
    lastReviewedAt: row.last_reviewed_at instanceof Date
      ? row.last_reviewed_at.toISOString().slice(0, 10)
      : row.last_reviewed_at
  };
}

async function getUserProgress(userId) {
  if (!isMysqlEnabled()) {
    const items = await readJson('progress.json');
    return items.filter((item) => item.userId === userId);
  }

  const [rows] = await getPool().execute(
    `SELECT user_id, knowledge_id, status, review_count, last_reviewed_at
     FROM topic_progress
     WHERE user_id = ?
     ORDER BY knowledge_id`,
    [userId]
  );
  return rows.map(rowToProgress);
}

async function setKnowledgeMastered(userId, knowledgeId, mastered) {
  const today = new Date().toISOString().slice(0, 10);
  const status = mastered ? '已掌握' : '待复习';

  if (!isMysqlEnabled()) {
    const items = await readJson('progress.json');
    let item = items.find(
      (entry) => entry.userId === userId && entry.knowledgeId === knowledgeId
    );

    if (!item) {
      item = {
        userId,
        knowledgeId,
        status,
        reviewCount: mastered ? 1 : 0,
        lastReviewedAt: today
      };
      items.push(item);
    } else {
      item.status = status;
      item.reviewCount = Number(item.reviewCount || 0) + (mastered ? 1 : 0);
      item.lastReviewedAt = today;
    }

    await writeJson('progress.json', items);
    return item;
  }

  await getPool().execute(
    `INSERT INTO topic_progress
       (user_id, knowledge_id, status, review_count, last_reviewed_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       review_count = review_count + ?,
       last_reviewed_at = VALUES(last_reviewed_at)`,
    [userId, knowledgeId, status, mastered ? 1 : 0, today, mastered ? 1 : 0]
  );

  const [rows] = await getPool().execute(
    `SELECT user_id, knowledge_id, status, review_count, last_reviewed_at
     FROM topic_progress
     WHERE user_id = ? AND knowledge_id = ?
     LIMIT 1`,
    [userId, knowledgeId]
  );
  return rowToProgress(rows[0]);
}

async function importProgress(items) {
  if (!isMysqlEnabled()) {
    return;
  }

  for (const item of items) {
    await getPool().execute(
      `INSERT INTO topic_progress
         (user_id, knowledge_id, status, review_count, last_reviewed_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         status = VALUES(status),
         review_count = VALUES(review_count),
         last_reviewed_at = VALUES(last_reviewed_at)`,
      [
        item.userId,
        item.knowledgeId,
        item.status || '待复习',
        Number(item.reviewCount || 0),
        item.lastReviewedAt || null
      ]
    );
  }
}

module.exports = {
  getUserProgress,
  importProgress,
  setKnowledgeMastered
};
