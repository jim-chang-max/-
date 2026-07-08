const { readJson, writeJson } = require('./jsonStore');
const { readQuestions } = require('./questionStore');

function normalizeReason(reason, fallback = '题库练习错误') {
  const text = String(reason || fallback).trim();
  return text.slice(0, 80) || fallback;
}

function recordMistake(userId, questionId, reason = '题库练习错误') {
  const mistakes = readJson('mistakes.json');
  const existing = mistakes.find((item) => item.userId === userId && item.questionId === questionId);

  if (existing) {
    existing.wrongCount = Number(existing.wrongCount || 0) + 1;
    existing.lastWrongAt = new Date().toISOString();
    existing.resolved = false;
    existing.reason = existing.reason || normalizeReason(reason);
  } else {
    mistakes.push({
      userId,
      questionId,
      wrongCount: 1,
      lastWrongAt: new Date().toISOString(),
      resolved: false,
      reason: normalizeReason(reason)
    });
  }

  writeJson('mistakes.json', mistakes);
  return existing || mistakes[mistakes.length - 1];
}

function readUserMistakes(userId) {
  const questions = readQuestions();
  const mistakes = readJson('mistakes.json').filter((item) => item.userId === userId && !item.resolved);

  return mistakes.map((mistake) => ({
    ...mistake,
    question: questions.find((question) => question.id === mistake.questionId)
  }));
}

function addMistake(userId, questionId, reason) {
  const mistakes = readJson('mistakes.json');
  const existing = mistakes.find((item) => item.userId === userId && item.questionId === questionId);

  if (existing) {
    existing.reason = normalizeReason(reason, existing.reason);
    existing.resolved = false;
    writeJson('mistakes.json', mistakes);
    return existing;
  }

  const item = {
    userId,
    questionId,
    wrongCount: 1,
    lastWrongAt: new Date().toISOString(),
    resolved: false,
    reason: normalizeReason(reason, '手动加入')
  };

  mistakes.push(item);
  writeJson('mistakes.json', mistakes);
  return item;
}

function updateMistake(userId, questionId, patch) {
  const mistakes = readJson('mistakes.json');
  const item = mistakes.find((mistake) => mistake.userId === userId && mistake.questionId === questionId);

  if (!item) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'resolved')) {
    item.resolved = patch.resolved === true;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'reason')) {
    item.reason = normalizeReason(patch.reason, item.reason);
  }

  writeJson('mistakes.json', mistakes);
  return item;
}

function removeMistake(userId, questionId) {
  const mistakes = readJson('mistakes.json');
  const next = mistakes.filter((mistake) => !(mistake.userId === userId && mistake.questionId === questionId));
  writeJson('mistakes.json', next);
}

module.exports = {
  recordMistake,
  readUserMistakes,
  addMistake,
  updateMistake,
  removeMistake
};
