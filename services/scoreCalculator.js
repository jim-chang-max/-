const { isSubjectiveQuestion } = require('./questionTypes');

function normalizeAnswer(answer) {
  return String(answer || '').trim().toLowerCase();
}

function isCorrect(question, userAnswer) {
  return normalizeAnswer(question.answer) === normalizeAnswer(userAnswer);
}

function calculateScore(questions, answers, selfAssessments = {}) {
  const details = questions.map((question) => {
    const userAnswer = answers[question.id] || '';
    const subjective = isSubjectiveQuestion(question);
    const hasSelfAssessment = typeof selfAssessments[question.id] === 'boolean';
    const correct = subjective
      ? hasSelfAssessment
        ? selfAssessments[question.id]
        : null
      : isCorrect(question, userAnswer);

    return {
      questionId: question.id,
      stem: question.title || question.stem,
      userAnswer,
      correctAnswer: question.answer,
      correct,
      subjective,
      score: correct === true ? Number(question.score || 1) : 0,
      fullScore: Number(question.score || 1),
      analysis: question.analysis
    };
  });

  const totalScore = details.reduce((sum, item) => sum + item.score, 0);
  const fullScore = details.reduce((sum, item) => sum + item.fullScore, 0);
  const pendingSubjectiveIds = details
    .filter((item) => item.subjective && item.correct === null)
    .map((item) => item.questionId);

  return {
    totalScore,
    fullScore,
    accuracy: fullScore === 0 ? 0 : Math.round((totalScore / fullScore) * 100),
    requiresSelfAssessment: pendingSubjectiveIds.length > 0,
    pendingSubjectiveIds,
    details
  };
}

module.exports = {
  calculateScore,
  isCorrect
};
