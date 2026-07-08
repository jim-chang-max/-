const { todayText, addDays, daysBetween } = require('../utils/date');

function generatePlan(examDate, chapters) {
  const start = todayText();
  const totalDays = Math.max(daysBetween(start, examDate) + 1, 1);

  return Array.from({ length: totalDays }, (_, index) => {
    const chapter = chapters[index % chapters.length];
    const date = addDays(start, index);
    const isLastThreeDays = index >= totalDays - 3;

    return {
      date,
      tasks: [
        {
          id: `task-${date}-review`,
          type: '知识点',
          title: isLastThreeDays ? '考前公式与定理速览' : `复习${chapter.name}`,
          chapterId: chapter.id,
          completed: false
        },
        {
          id: `task-${date}-practice`,
          type: '刷题',
          title: isLastThreeDays ? '完成一组综合测验' : `完成${chapter.name}基础题`,
          chapterId: chapter.id,
          completed: false
        },
        {
          id: `task-${date}-mistakes`,
          type: '错题',
          title: '复盘错题本中的薄弱题',
          chapterId: null,
          completed: false
        }
      ]
    };
  });
}

module.exports = {
  generatePlan
};
