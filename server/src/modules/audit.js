const express = require("express");
const { db } = require("../db/database");
const { id } = require("./utils");

// Lightweight, dependency-free audit/change-history helper.
// Any module can call record(entity, entityId, action, detail) after a mutation.
function record(entity, entityId, action, detail = "", userId = "") {
  try {
    db.prepare(
      "INSERT INTO audit_log (id, user_id, entity, entity_id, action, detail) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id("audit"), userId, entity, entityId || "", action, typeof detail === "string" ? detail : JSON.stringify(detail));
  } catch {
    // Auditing must never break the primary write.
  }
}

const router = express.Router();

// Global feed or filtered by entity / entity_id (change history per project etc.).
router.get("/", (req, res) => {
  const { entity = "", entity_id = "", limit = "200" } = req.query;
  const rows = db.prepare(`
    SELECT * FROM audit_log
    WHERE (@entity = '' OR entity = @entity)
      AND (@entity_id = '' OR entity_id = @entity_id)
    ORDER BY created_at DESC, rowid DESC
    LIMIT @limit
  `).all({ entity, entity_id, limit: Math.min(Number(limit) || 200, 1000) });
  res.json(rows);
});

module.exports = { router, record };
