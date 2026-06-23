const express = require("express");
const { db } = require("../db/database");
const { id, parseJson } = require("./utils");
const { record } = require("./audit");
const { validateBody, z } = require("./validate");
const { safePromote } = require("./knowledgeSync");

const router = express.Router();

const CATEGORIES = ["proces", "leverancier", "materiaal", "product", "budget", "klant", "overig"];
const SENTIMENTS = ["positief", "negatief", "neutraal"];

const lessonSchema = z.object({
  project_id: z.string().min(1),
  category: z.enum(CATEGORIES).optional(),
  title: z.string().min(1),
  body: z.string().optional(),
  sentiment: z.enum(SENTIMENTS).optional(),
  tags: z.array(z.string()).optional()
});

const lessonUpdateSchema = lessonSchema.extend({
  project_id: z.string().min(1).optional(),
  title: z.string().min(1).optional()
});

function cleanTags(tags) {
  return Array.from(new Set((Array.isArray(tags) ? tags : [])
    .map((tag) => String(tag || "").trim())
    .filter(Boolean)));
}

function hydrate(row) {
  if (!row) return null;
  return {
    ...row,
    tags: parseJson(row.tags_json, [])
  };
}

function likeTerm(value) {
  return `%${String(value || "").trim()}%`;
}

function getLesson(idValue) {
  return hydrate(db.prepare(`
    SELECT l.*, p.title AS project_label
    FROM project_lessons l
    JOIN projects p ON p.id = l.project_id
    WHERE l.id = ?
  `).get(idValue));
}

function promoteLesson(lesson) {
  if (!lesson) return;
  safePromote("lesson", lesson.id, lesson.title, {
    project_id: lesson.project_id,
    project_label: lesson.project_label,
    category: lesson.category,
    sentiment: lesson.sentiment,
    tags: lesson.tags
  });
}

router.get("/", (req, res) => {
  const where = [];
  const params = {};

  if (req.query.project_id) {
    where.push("l.project_id = @project_id");
    params.project_id = String(req.query.project_id);
  }
  if (req.query.category) {
    where.push("l.category = @category");
    params.category = String(req.query.category);
  }
  if (req.query.q) {
    where.push("(l.title LIKE @q OR l.body LIKE @q OR l.tags_json LIKE @q)");
    params.q = likeTerm(req.query.q);
  }
  if (req.query.tag) {
    where.push("EXISTS (SELECT 1 FROM json_each(l.tags_json) WHERE json_each.value = @tag)");
    params.tag = String(req.query.tag).trim();
  }

  const sql = `
    SELECT l.*, p.title AS project_label
    FROM project_lessons l
    JOIN projects p ON p.id = l.project_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY l.created_at DESC, l.title COLLATE NOCASE
  `;
  res.json(db.prepare(sql).all(params).map(hydrate));
});

router.get("/:id", (req, res) => {
  const lesson = getLesson(req.params.id);
  if (!lesson) return res.status(404).json({ error: "Les niet gevonden" });
  res.json(lesson);
});

router.post("/", validateBody(lessonSchema), (req, res) => {
  const lessonId = id("lesson");
  const tags = cleanTags(req.body.tags);
  db.prepare(`
    INSERT INTO project_lessons (id, project_id, category, title, body, sentiment, tags_json)
    VALUES (@id, @project_id, @category, @title, @body, @sentiment, @tags_json)
  `).run({
    id: lessonId,
    project_id: req.body.project_id,
    category: req.body.category || "overig",
    title: req.body.title.trim(),
    body: req.body.body || "",
    sentiment: req.body.sentiment || "neutraal",
    tags_json: JSON.stringify(tags)
  });
  record("project_lesson", lessonId, "create", req.body.title.trim());
  const lesson = getLesson(lessonId);
  promoteLesson(lesson);
  res.status(201).json(lesson);
});

router.put("/:id", validateBody(lessonUpdateSchema, { partial: true }), (req, res) => {
  const current = db.prepare("SELECT * FROM project_lessons WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Les niet gevonden" });
  db.prepare(`
    UPDATE project_lessons SET
      project_id = @project_id,
      category = @category,
      title = @title,
      body = @body,
      sentiment = @sentiment,
      tags_json = @tags_json
    WHERE id = @id
  `).run({
    id: req.params.id,
    project_id: req.body.project_id || current.project_id,
    category: req.body.category || current.category,
    title: ("title" in req.body ? req.body.title.trim() : current.title),
    body: ("body" in req.body ? (req.body.body || "") : current.body),
    sentiment: req.body.sentiment || current.sentiment,
    tags_json: ("tags" in req.body ? JSON.stringify(cleanTags(req.body.tags)) : current.tags_json)
  });
  record("project_lesson", req.params.id, "update");
  const lesson = getLesson(req.params.id);
  promoteLesson(lesson);
  res.json(lesson);
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM project_lessons WHERE id = ?").run(req.params.id);
  record("project_lesson", req.params.id, "delete");
  res.status(204).end();
});

module.exports = router;
