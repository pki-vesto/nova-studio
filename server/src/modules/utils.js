const crypto = require("crypto");
const path = require("path");

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 18)}`;
}

function pick(body, fields) {
  return fields.reduce((acc, field) => {
    if (Object.prototype.hasOwnProperty.call(body, field)) acc[field] = body[field];
    return acc;
  }, {});
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function uploadUrl(filePath) {
  if (!filePath) return "";
  return `/uploads/${path.basename(filePath)}`;
}

module.exports = { id, pick, parseJson, uploadUrl };
