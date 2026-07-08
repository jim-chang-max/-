function pickRandom(items, count) {
  return [...items].sort(() => Math.random() - 0.5).slice(0, count);
}

function generateQuiz(questions, options = {}) {
  const { chapterId, difficulty, count = 5 } = options;

  const filtered = questions.filter((question) => {
    const questionChapter = question.chapter || question.chapterId;
    const matchChapter = !chapterId || questionChapter === chapterId;
    const matchDifficulty = !difficulty || question.difficulty === difficulty;
    return matchChapter && matchDifficulty;
  });

  return pickRandom(filtered, Number(count) || 5);
}

module.exports = {
  generateQuiz
};
