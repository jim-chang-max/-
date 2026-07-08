const fs = require('fs');
const { readJson, resolveDataPath, writeJson } = require('./jsonStore');

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
    return readJson(questionBankFile, {});
  }

  return readJson(questionsFile, []);
}

function readQuestions() {
  const payload = readQuestionPayload();
  return extractQuestions(payload);
}

function writeQuestions(questions) {
  const payload = readQuestionPayload();

  if (Array.isArray(payload)) {
    writeJson(questionsFile, questions);
    return;
  }

  const nextPayload = payload && typeof payload === 'object' ? payload : {};

  if (Array.isArray(nextPayload.metadata && nextPayload.metadata.questions)) {
    nextPayload.metadata.questions = questions;
  } else {
    nextPayload.questions = questions;
  }

  writeJson(questionBankFile, nextPayload);
  writeJson(questionsFile, questions);
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
