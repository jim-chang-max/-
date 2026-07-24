require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { DATA_TABLES } = require('../services/databaseBackup');
const { migrateDatabase } = require('../services/databaseMigration');
const { closePool, getPool } = require('../services/mysqlClient');

async function createDatabaseAndTables() {
  process.env.STORAGE_DRIVER = 'mysql';
  return migrateDatabase();
}

async function importJsonData() {
  process.env.STORAGE_DRIVER = 'mysql';

  const { writeJson } = require('../services/jsonStore');
  const { writeQuestions } = require('../services/questionStore');
  const { importUsers } = require('../services/userStore');
  const { importMistakes } = require('../services/mistakeStore');
  const { importPlans } = require('../services/planStore');
  const { importProgress } = require('../services/progressStore');
  const { importQuizHistory } = require('../services/quizHistoryStore');
  const dataDir = path.join(__dirname, '..', 'data');
  const documentFiles = [
    'chapters.json',
    'knowledge.json',
    'graph.json',
    'mistakes.json',
    'plans.json',
    'progress.json',
    'quizHistory.json',
    'users.json'
  ];

  for (const fileName of documentFiles) {
    const value = JSON.parse(fs.readFileSync(path.join(dataDir, fileName), 'utf8'));
    await writeJson(fileName, value);
  }

  const bank = JSON.parse(fs.readFileSync(path.join(dataDir, 'question_bank.json'), 'utf8'));
  const questions = bank.metadata?.questions || bank.questions || [];
  await writeQuestions(questions);

  const users = JSON.parse(fs.readFileSync(path.join(dataDir, 'users.json'), 'utf8'));
  const mistakes = JSON.parse(fs.readFileSync(path.join(dataDir, 'mistakes.json'), 'utf8'));
  const plans = JSON.parse(fs.readFileSync(path.join(dataDir, 'plans.json'), 'utf8'));
  const progress = JSON.parse(fs.readFileSync(path.join(dataDir, 'progress.json'), 'utf8'));
  const quizHistory = JSON.parse(fs.readFileSync(path.join(dataDir, 'quizHistory.json'), 'utf8'));

  await importUsers(users);
  await importMistakes(mistakes);
  await importPlans(plans);
  await importProgress(progress);
  await importQuizHistory(quizHistory);

  return {
    documentCount: documentFiles.length,
    questionCount: questions.length,
    userCount: users.length,
    planCount: plans.length,
    progressCount: progress.length
  };
}

async function databaseContentCounts() {
  process.env.STORAGE_DRIVER = 'mysql';
  const counts = {};
  for (const table of DATA_TABLES) {
    const [rows] = await getPool().query(`SELECT COUNT(*) AS count FROM \`${table}\``);
    counts[table] = Number(rows[0].count || 0);
  }
  return counts;
}

async function initializeDatabase(options = {}) {
  process.env.STORAGE_DRIVER = 'mysql';
  const migration = await migrateDatabase({
    createSafetyBackup: options.createSafetyBackup !== false
  });
  const beforeCounts = await databaseContentCounts();
  const totalRows = Object.values(beforeCounts).reduce((sum, count) => sum + count, 0);

  if (totalRows > 0) {
    return {
      migration,
      seeded: false,
      beforeCounts,
      seedResult: null
    };
  }

  const seedResult = await importJsonData();
  return {
    migration,
    seeded: true,
    beforeCounts,
    seedResult
  };
}

async function main() {
  const result = await initializeDatabase();
  if (!result.seeded) {
    console.log(
      `MySQL 结构已更新，检测到现有数据，已安全跳过 JSON 播种。` +
      `当前版本：${result.migration.latestVersion}`
    );
    if (result.migration.safetyBackup) {
      console.log(`迁移前备份：${result.migration.safetyBackup.fileName}`);
    }
    return;
  }

  const seed = result.seedResult;
  console.log(
    `MySQL 初始化完成：${seed.questionCount} 道题、${seed.userCount} 个用户、` +
    `${seed.planCount} 个计划、${seed.progressCount} 条知识点进度。`
  );
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`MySQL 初始化失败：${error.message}`);
      process.exitCode = 1;
    })
    .finally(closePool);
}

module.exports = {
  createDatabaseAndTables,
  databaseContentCounts,
  importJsonData,
  initializeDatabase
};
