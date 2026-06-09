const express = require("express");
const { db } = require("../db/database");
const { parseJson } = require("./utils");

const router = express.Router();
const fields = [
  "household",
  "wishes",
  "room_use",
  "style_preferences",
  "color_preferences",
  "budget_indication",
  "existing_furniture",
  "constraints",
  "free_notes",
  "ai_summary"
];

function hydrate(row) {
  if (!row) return null;
  return {
    ...row,
    risks: parseJson(row.risks_json, []),
    followups: parseJson(row.followups_json, [])
  };
}

router.get("/:projectId", (req, res) => {
  const row = db.prepare("SELECT * FROM intake WHERE project_id = ?").get(req.params.projectId);
  if (!row) return res.status(404).json({ error: "Intake niet gevonden" });
  res.json(hydrate(row));
});

router.put("/:projectId", (req, res) => {
  db.prepare("INSERT OR IGNORE INTO intake (project_id) VALUES (?)").run(req.params.projectId);
  const payload = fields.reduce((acc, field) => ({ ...acc, [field]: req.body[field] ?? "" }), {});
  db.prepare(`
    UPDATE intake SET
      household = @household,
      wishes = @wishes,
      room_use = @room_use,
      style_preferences = @style_preferences,
      color_preferences = @color_preferences,
      budget_indication = @budget_indication,
      existing_furniture = @existing_furniture,
      constraints = @constraints,
      free_notes = @free_notes,
      ai_summary = @ai_summary,
      scope_estimate = @scope_estimate,
      risks_json = @risks_json,
      followups_json = @followups_json,
      updated_at = CURRENT_TIMESTAMP
    WHERE project_id = @project_id
  `).run({
    ...payload,
    project_id: req.params.projectId,
    scope_estimate: req.body.scope_estimate ?? "",
    risks_json: JSON.stringify(Array.isArray(req.body.risks) ? req.body.risks : []),
    followups_json: JSON.stringify(Array.isArray(req.body.followups) ? req.body.followups : [])
  });
  res.json(hydrate(db.prepare("SELECT * FROM intake WHERE project_id = ?").get(req.params.projectId)));
});

module.exports = router;
