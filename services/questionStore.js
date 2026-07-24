const fs = require('fs');
const {
  readJsonFile,
  resolveDataPath,
  writeJsonFile
} = require('./jsonStore');
const { getPool, isMysqlEnabled } = require('./mysqlClient');

const questionBankFile = 'question_bank.json';
const questionsFile = 'questions.json';

function fileExists(fileName) {
  return fs.existsSync(resolveDataPath(fileName));
}

function extractQuestions(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && Array.isArray(payload.metadata && payload.metadata.questions)) {
    return payload.metadata.questions;
  }

  if (payload && Array.isArray(payload.questions)) {
    return payload.questions;
  }

  return [];
}

function readQuestionPayload() {
  if (fileExists(questionBankFile)) {
    return readJsonFile(questionBankFile, {});
  }

  return readJsonFile(questionsFile, []);
}

function parseJsonColumn(value, fallback) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'string') {
    return JSON.parse(value);
  }

  return value;
}

function rowToQuestion(row) {
  return {
    id: row.id,
    chapter: row.chapter,
    knowledgePoints: parseJsonColumn(row.knowledge_points, []),
    type: row.type,
    difficulty: row.difficulty,
    title: row.title,
    options: parseJsonColumn(row.options, []),
    answer: row.answer,
    analysis: row.analysis,
    tags: parseJsonColumn(row.tags, []),
    source: parseJsonColumn(row.source, null),
    reviewStatus: row.review_status,
    wrongCount: Number(row.wrong_count || 0),
    correctCount: Number(row.correct_count || 0),
    needsReview: Boolean(row.needs_review),
    extractionNote: row.extraction_note || ''
  };
}

async function readQuestions() {
  if (isMysqlEnabled()) {
    const [rows] = await getPool().query(
      `SELECT id, chapter, knowledge_points, type, difficulty, title, options,
              answer, analysis, tags, source, review_status, wrong_count,
              correct_count, needs_review, extraction_note
       FROM questions
       ORDER BY id`
    );
    return rows.map(rowToQuestion);
  }

  const payload = readQuestionPayload();
  return extractQuestions(payload);
}

async function writeMysqlQuestions(questions) {
  if (!questions.length) {
    return;
  }

  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();

    const sql = `
      INSERT INTO questions (
        id, chapter, knowledge_points, type, difficulty, title, options,
        answer, analysis, tags, source, review_status, wrong_count,
        correct_count, needs_review, extraction_note
      )
      VALUES (?, ?, CAST(? AS JSON), ?, ?, ?, CAST(? AS JSON), ?, ?, CAST(? AS JSON),
              CAST(? AS JSON), ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        chapter = VALUES(chapter),
        knowledge_points = VALUES(knowledge_points),
        type = VALUES(type),
        difficulty = VALUES(difficulty),
        title = VALUES(title),
        options = VALUES(options),
        answer = VALUES(answer),
        analysis = VALUES(analysis),
        tags = VALUES(tags),
        source = VALUES(source),
        review_status = VALUES(review_status),
        wrong_count = VALUES(wrong_count),
        correct_count = VALUES(correct_count),
        needs_review = VALUES(needs_review),
        extraction_note = VALUES(extraction_note)
    `;

    for (const question of questions) {
      await connection.execute(sql, [
        question.id,
        question.chapter || question.chapterId || '',
        JSON.stringify(question.knowledgePoints || []),
        question.type || '',
        question.difficulty || '',
        question.title || question.stem || '',
        JSON.stringify(question.options || []),
        question.answer || '',
        question.analysis || '',
        JSON.stringify(question.tags || []),
        JSON.stringify(question.source || null),
        question.reviewStatus || '待复习',
        Number(question.wrongCount || 0),
        Number(question.correctCount || 0),
        question.needsReview === true,
        question.extractionNote || ''
      ]);
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function writeQuestions(questions) {
  if (isMysqlEnabled()) {
    await writeMysqlQuestions(questions);
    return;
  }

  const payload = readQuestionPayload();

  if (Array.isArray(payload)) {
    writeJsonFile(questionsFile, questions);
    return;
  }

  const nextPayload = payload && typeof payload === 'object' ? payload : {};

  if (Array.isArray(nextPayload.metadata && nextPayload.metadata.questions)) {
    nextPayload.metadata.questions = questions;
  } else {
    nextPayload.questions = questions;
  }

  writeJsonFile(questionBankFile, nextPayload);
  writeJsonFile(questionsFile, questions);
}

function getQuestionTitle(question) {
  return question.title || question.stem || '';
}

function getQuestionChapter(question) {
  return question.chapter || question.chapterId || '';
}

function sourceToText(source) {
  if (!source) {
    return '未标注来源';
  }

  if (typeof source === 'string') {
    return source;
  }

  const parts = [
    source.name,
    source.page ? `第 ${source.page} 页` : '',
    source.index ? `题号 ${source.index}` : ''
  ].filter(Boolean);

  return parts.join(' / ') || '未标注来源';
}

module.exports = {
  readQuestions,
  writeQuestions,
  getQuestionTitle,
  getQuestionChapter,
  sourceToText
};
