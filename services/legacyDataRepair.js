async function repairLegacyGuestUser(connection) {
  const results = [];
  const execute = async (sql) => {
    const [result] = await connection.query(sql);
    results.push(Number(result.affectedRows || 0));
  };

  await execute(
    `INSERT INTO review_plans (user_id, exam_date, created_at, updated_at)
     SELECT 'user-demo', legacy.exam_date, legacy.created_at, legacy.updated_at
     FROM review_plans legacy
     JOIN users target ON target.id = 'user-demo'
     WHERE legacy.user_id = 'guest'
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`
  );
  await execute(
    `UPDATE review_tasks tasks
     JOIN users target ON target.id = 'user-demo'
     SET tasks.user_id = 'user-demo'
     WHERE tasks.user_id = 'guest'`
  );
  await execute("DELETE FROM review_plans WHERE user_id = 'guest'");

  await execute(
    `INSERT INTO mistakes
       (user_id, question_id, wrong_count, last_wrong_at, resolved, reason)
     SELECT
       'user-demo', legacy.question_id, legacy.wrong_count,
       legacy.last_wrong_at, legacy.resolved, legacy.reason
     FROM mistakes legacy
     JOIN users target ON target.id = 'user-demo'
     WHERE legacy.user_id = 'guest'
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`
  );
  await execute("DELETE FROM mistakes WHERE user_id = 'guest'");

  for (const table of ['quiz_history', 'quiz_sessions', 'answer_records']) {
    await execute(
      `UPDATE \`${table}\` records
       JOIN users target ON target.id = 'user-demo'
       SET records.user_id = 'user-demo'
       WHERE records.user_id = 'guest'`
    );
  }

  await execute(
    `INSERT INTO topic_progress
       (user_id, knowledge_id, status, review_count, last_reviewed_at)
     SELECT
       'user-demo', legacy.knowledge_id, legacy.status,
       legacy.review_count, legacy.last_reviewed_at
     FROM topic_progress legacy
     JOIN users target ON target.id = 'user-demo'
     WHERE legacy.user_id = 'guest'
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`
  );
  await execute("DELETE FROM topic_progress WHERE user_id = 'guest'");

  return {
    legacyId: 'guest',
    targetId: 'user-demo',
    affectedRows: results.reduce((sum, count) => sum + count, 0)
  };
}

module.exports = {
  repairLegacyGuestUser
};
