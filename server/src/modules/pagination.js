function hasPagination(query = {}) {
  return query.limit != null || query.offset != null;
}

function parsePagination(query = {}, defaults = {}) {
  const max = Number(defaults.maxLimit || 200);
  const fallback = Number(defaults.defaultLimit || 50);
  const rawLimit = Number.parseInt(query.limit ?? fallback, 10);
  const rawOffset = Number.parseInt(query.offset ?? 0, 10);
  const limit = Math.max(1, Math.min(Number.isFinite(rawLimit) ? rawLimit : fallback, max));
  const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);
  return { limit, offset };
}

function paginationSql(enabled) {
  return enabled ? " LIMIT @limit OFFSET @offset" : "";
}

function setPaginationHeaders(res, { total, limit, offset }) {
  res.setHeader("X-Total-Count", String(total));
  res.setHeader("X-Limit", String(limit));
  res.setHeader("X-Offset", String(offset));
}

module.exports = { hasPagination, parsePagination, paginationSql, setPaginationHeaders };
