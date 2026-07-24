const subjectiveTypes = new Set(['calculation', 'proof', 'shortAnswer']);

function isSubjectiveQuestion(question) {
  return subjectiveTypes.has(question.type);
}

module.exports = {
  isSubjectiveQuestion,
  subjectiveTypes
};
