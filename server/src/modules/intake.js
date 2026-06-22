const express = require("express");
const { db } = require("../db/database");
const { parseJson } = require("./utils");
const { validateBody, z } = require("./validate");

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
const questionnaireKeys = [
  "household",
  "room_use",
  "wishes",
  "style_preferences",
  "color_preferences",
  "budget_indication",
  "existing_furniture",
  "constraints",
  "free_notes",
  "scope_estimate",
  "risks",
  "followups"
];

const intakeSchema = z.object({
  household: z.string().optional(),
  wishes: z.string().optional(),
  room_use: z.string().optional(),
  style_preferences: z.string().optional(),
  color_preferences: z.string().optional(),
  budget_indication: z.string().optional(),
  existing_furniture: z.string().optional(),
  constraints: z.string().optional(),
  free_notes: z.string().optional(),
  ai_summary: z.string().optional(),
  scope_estimate: z.string().optional(),
  risks: z.array(z.any()).optional(),
  followups: z.array(z.any()).optional()
});
const questionSchema = z.object({
  key: z.enum(questionnaireKeys),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  input_type: z.enum(["input", "textarea", "list"]).optional(),
  sort_order: z.coerce.number().int().optional(),
  is_enabled: z.coerce.boolean().optional()
});
const questionnaireSchema = z.object({
  questions: z.array(questionSchema)
});

function hydrate(row) {
  if (!row) return null;
  return {
    ...row,
    risks: parseJson(row.risks_json, []),
    followups: parseJson(row.followups_json, [])
  };
}

function questionnaireRows() {
  return db.prepare(`
    SELECT key, label, placeholder, input_type, sort_order, is_enabled
    FROM intake_questionnaire
    ORDER BY sort_order, key
  `).all().map((row) => ({ ...row, is_enabled: !!row.is_enabled }));
}

router.get("/questionnaire", (_req, res) => {
  res.json(questionnaireRows());
});

router.put("/questionnaire", validateBody(questionnaireSchema), (req, res) => {
  const update = db.prepare(`
    UPDATE intake_questionnaire SET
      label = @label,
      placeholder = @placeholder,
      input_type = @input_type,
      sort_order = @sort_order,
      is_enabled = @is_enabled,
      updated_at = CURRENT_TIMESTAMP
    WHERE key = @key
  `);
  const save = db.transaction((rows) => {
    rows.forEach((row, index) => {
      update.run({
        key: row.key,
        label: row.label || row.key,
        placeholder: row.placeholder || "",
        input_type: row.input_type || "textarea",
        sort_order: row.sort_order ?? index * 10,
        is_enabled: row.is_enabled === false ? 0 : 1
      });
    });
  });
  save(req.body.questions);
  res.json(questionnaireRows());
});

router.get("/:projectId", (req, res) => {
  const row = db.prepare("SELECT * FROM intake WHERE project_id = ?").get(req.params.projectId);
  if (!row) return res.status(404).json({ error: "Intake niet gevonden" });
  res.json(hydrate(row));
});

router.put("/:projectId", validateBody(intakeSchema, { partial: true }), (req, res) => {
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
