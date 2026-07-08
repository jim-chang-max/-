function normalizeAnswer(answer) {
  return String(answer || '').trim().toLowerCase();
}

function isCorrect(question, userAnswer) {
  return normalizeAnswer(question.answer) === normalizeAnswer(userAnswer);
}

function calculateScore(questions, answers) {
  const details = questions.map((question) => {
    const userAnswer = answers[question.id] || '';
    const correct = isCorrect(question, userAnswer);

    return {
      questionId: question.id,
      stem: question.title || question.stem,
      userAnswer,
      correctAnswer: question.answer,
      correct,
      score: correct ? Number(question.score || 1) : 0,
      fullScore: Number(question.score || 1),
      analysis: question.analysis
    };
  });

  const totalScore = details.reduce((sum, item) => sum + item.score, 0);
  const fullScore = details.reduce((sum, item) => sum + item.fullScore, 0);

  return {
    totalScore,
    fullScore,
    accuracy: fullScore === 0 ? 0 : Math.round((totalScore / fullScore) * 100),
    details
  };
}

module.exports = {
  calculateScore,
  isCorrect
};
