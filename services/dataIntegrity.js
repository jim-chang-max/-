const { getPool } = require('./mysqlClient');

const RELATIONSHIPS = [
  {
    id: 'mistakes.user',
    childTable: 'mistakes',
    childColumn: 'user_id',
    parentTable: 'users',
    parentColumn: 'id'
  },
  {
    id: 'mistakes.question',
    childTable: 'mistakes',
    childColumn: 'question_id',
    parentTable: 'questions',
    parentColumn: 'id'
  },
  {
    id: 'review_plans.user',
    childTable: 'review_plans',
    childColumn: 'user_id',
    parentTable: 'users',
    parentColumn: 'id'
  },
  {
    id: 'review_tasks.plan',
    childTable: 'review_tasks',
    childColumn: 'user_id',
    parentTable: 'review_plans',
    parentColumn: 'user_id'
  },
  {
    id: 'quiz_history.user',
    childTable: 'quiz_history',
    childColumn: 'user_id',
    parentTable: 'users',
    parentColumn: 'id'
  },
  {
    id: 'quiz_sessions.user',
    childTable: 'quiz_sessions',
    childColumn: 'user_id',
    parentTable: 'users',
    parentColumn: 'id'
  },
  {
    id: 'quiz_answers.history',
    childTable: 'quiz_answers',
    childColumn: 'history_id',
    parentTable: 'quiz_history',
    parentColumn: 'id'
  },
  {
    id: 'quiz_answers.question',
    childTable: 'quiz_answers',
    childColumn: 'question_id',
    parentTable: 'questions',
    parentColumn: 'id'
  },
  {
    id: 'answer_records.user',
    childTable: 'answer_records',
    childColumn: 'user_id',
    parentTable: 'users',
    parentColumn: 'id'
  },
  {
    id: 'answer_records.question',
    childTable: 'answer_records',
    childColumn: 'question_id',
    parentTable: 'questions',
    parentColumn: 'id'
  },
  {
    id: 'topic_progress.user',
    childTable: 'topic_progress',
    childColumn: 'user_id',
    parentTable: 'users',
    parentColumn: 'id'
  }
];

function assertIdentifier(value) {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    throw new Error(`非法数据库标识符：${value}`);
  }
  return `\`${value}\``;
}

async function checkRelationalIntegrity(options = {}) {
  const connection = options.connection || getPool();
  const relationships = options.relationships || RELATIONSHIPS;
  const results = [];

  for (const relationship of relationships) {
    const childTable = assertIdentifier(relationship.childTable);
    const childColumn = assertIdentifier(relationship.childColumn);
    const parentTable = assertIdentifier(relationship.parentTable);
    const parentColumn = assertIdentifier(relationship.parentColumn);
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS orphan_count
       FROM ${childTable} child
       LEFT JOIN ${parentTable} parent
         ON parent.${parentColumn} = child.${childColumn}
       WHERE child.${childColumn} IS NOT NULL
         AND parent.${parentColumn} IS NULL`
    );
    results.push({
      ...relationship,
      orphanCount: Number(rows[0].orphan_count || 0)
    });
  }

  const orphanCount = results.reduce(
    (sum, relationship) => sum + relationship.orphanCount,
    0
  );
  return {
    ok: orphanCount === 0,
    orphanCount,
    relationships: results
  };
}

module.exports = {
  RELATIONSHIPS,
  checkRelationalIntegrity
};
