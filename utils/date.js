function toDate(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  return date;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayText() {
  return formatDate(new Date());
}

function addDays(dateText, amount) {
  const date = toDate(dateText);
  date.setDate(date.getDate() + amount);
  return formatDate(date);
}

function daysBetween(startText, endText) {
  const start = toDate(startText);
  const end = toDate(endText);
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.ceil((end - start) / oneDay);
}

module.exports = {
  todayText,
  addDays,
  daysBetween
};
