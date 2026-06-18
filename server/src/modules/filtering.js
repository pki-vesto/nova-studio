function textFilter(value) {
  return String(value ?? "").trim();
}

function likeFilter(value) {
  return `%${textFilter(value)}%`;
}

function flagFilter(value) {
  return value === true || value === "1" || value === "true";
}

module.exports = { textFilter, likeFilter, flagFilter };
