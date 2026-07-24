const { readJson, writeJson } = require('./jsonStore');
const { getPool, isMysqlEnabled } = require('./mysqlClient');

function dateText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);

  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function rowsToPlan(planRow, taskRows) {
  if (!planRow) return null;

  const dayMap = new Map();
  taskRows.forEach((row) => {
    const date = dateText(row.task_date);
    if (!dayMap.has(date)) {
      dayMap.set(date, { date, tasks: [] });
    }

    dayMap.get(date).tasks.push({
      id: row.id,
      type: row.type,
      title: row.title,
      chapterId: row.chapter_id,
      completed: Boolean(row.completed)
    });
  });

  return {
    userId: planRow.user_id,
    examDate: dateText(planRow.exam_date),
    days: [...dayMap.values()]
  };
}

async function getPlan(userId) {
  if (!isMysqlEnabled()) {
    const plans = await readJson('plans.json');
    return plans.find((plan) => plan.userId === userId) || null;
  }

  const [[planRow], [taskRows]] = await Promise.all([
    getPool().execute(
      'SELECT user_id, exam_date FROM review_plans WHERE user_id = ? LIMIT 1',
      [userId]
    ),
    getPool().execute(
      `SELECT id, task_date, type, title, chapter_id, completed
       FROM review_tasks
       WHERE user_id = ?
       ORDER BY task_date, id`,
      [userId]
    )
  ]);

  return rowsToPlan(planRow[0], taskRows);
}

async function savePlan(plan) {
  if (!isMysqlEnabled()) {
    const plans = await readJson('plans.json');
    const others = plans.filter((item) => item.userId !== plan.userId);
    others.push(plan);
    await writeJson('plans.json', others);
    return plan;
  }

  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO review_plans (user_id, exam_date)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE exam_date = VALUES(exam_date)`,
      [plan.userId, plan.examDate]
    );
    await connection.execute('DELETE FROM review_tasks WHERE user_id = ?', [plan.userId]);

    for (const day of plan.days || []) {
      for (const task of day.tasks || []) {
        await connection.execute(
          `INSERT INTO review_tasks
             (id, user_id, task_date, type, title, chapter_id, completed)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            task.id,
            plan.userId,
            day.date,
            task.type || '',
            task.title || '',
            task.chapterId || null,
            task.completed === true
          ]
        );
      }
    }

    await connection.commit();
    return plan;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function updateTask(userId, date, taskId, completed) {
  if (!isMysqlEnabled()) {
    const plan = await getPlan(userId);
    if (!plan) return null;

    const day = plan.days.find((item) => item.date === date);
    const task = day && day.tasks.find((item) => item.id === taskId);
    if (!task) return null;

    task.completed = completed === true;
    await savePlan(plan);
    return task;
  }

  const [result] = await getPool().execute(
    `UPDATE review_tasks
     SET completed = ?
     WHERE user_id = ? AND task_date = ? AND id = ?`,
    [completed === true, userId, date, taskId]
  );

  if (!result.affectedRows) {
    return null;
  }

  const [rows] = await getPool().execute(
    `SELECT id, type, title, chapter_id, completed
     FROM review_tasks
     WHERE user_id = ? AND id = ?
     LIMIT 1`,
    [userId, taskId]
  );

  const row = rows[0];
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    chapterId: row.chapter_id,
    completed: Boolean(row.completed)
  };
}

async function importPlans(plans) {
  for (const plan of plans) {
    await savePlan(plan);
  }
}

module.exports = {
  getPlan,
  importPlans,
  savePlan,
  updateTask
};
