const express = require("express");
const { db } = require("../db/database");
const { id, uploadUrl } = require("./utils");
const { upload, removeUpload } = require("./uploads");
const { record } = require("./audit");
const { validateBody, validateForm, z } = require("./validate");

const router = express.Router();

const taskSchema = z.object({
  project_id: z.string().min(1),
  room_id: z.string().optional(),
  title: z.string().optional(),
  status: z.string().optional(),
  due_date: z.string().optional(),
  linked_proposal_status: z.string().optional(),
  sort_order: z.coerce.number().int().optional()
});

const milestoneSchema = z.object({
  project_id: z.string().min(1),
  title: z.string().optional(),
  target_date: z.string().optional(),
  done: z.any().optional(),
  sort_order: z.coerce.number().int().optional()
});

const documentSchema = z.object({
  project_id: z.string().min(1),
  kind: z.string().optional(),
  title: z.string().optional()
});

/* ── Tasks ─────────────────────────────────────────────────────────────── */

router.get("/tasks/project/:pid", (req, res) => {
  res.json(db.prepare(`
    SELECT * FROM project_tasks
    WHERE project_id = ?
    ORDER BY sort_order, created_at
  `).all(req.params.pid));
});

router.post("/tasks", validateBody(taskSchema), (req, res) => {
  const taskId = id("task");
  db.prepare(`
    INSERT INTO project_tasks (id, project_id, room_id, title, status, due_date, linked_proposal_status, sort_order)
    VALUES (@id, @project_id, @room_id, @title, @status, @due_date, @linked_proposal_status, @sort_order)
  `).run({
    id: taskId,
    project_id: req.body.project_id,
    room_id: req.body.room_id || null,
    title: req.body.title || "Nieuwe taak",
    status: req.body.status || "todo",
    due_date: req.body.due_date || null,
    linked_proposal_status: req.body.linked_proposal_status || null,
    sort_order: Number(req.body.sort_order || 0)
  });
  record("project_task", taskId, "create", req.body.title || "");
  res.status(201).json(db.prepare("SELECT * FROM project_tasks WHERE id = ?").get(taskId));
});

router.put("/tasks/:id", validateBody(taskSchema, { partial: true }), (req, res) => {
  const current = db.prepare("SELECT * FROM project_tasks WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Taak niet gevonden" });
  db.prepare(`
    UPDATE project_tasks SET
      room_id = @room_id,
      title = @title,
      status = @status,
      due_date = @due_date,
      linked_proposal_status = @linked_proposal_status,
      sort_order = @sort_order
    WHERE id = @id
  `).run({
    id: req.params.id,
    room_id: ("room_id" in req.body ? (req.body.room_id || null) : current.room_id),
    title: req.body.title || current.title,
    status: req.body.status || current.status,
    due_date: ("due_date" in req.body ? (req.body.due_date || null) : current.due_date),
    linked_proposal_status: ("linked_proposal_status" in req.body ? (req.body.linked_proposal_status || null) : current.linked_proposal_status),
    sort_order: Number(req.body.sort_order ?? current.sort_order)
  });
  record("project_task", req.params.id, "update");
  res.json(db.prepare("SELECT * FROM project_tasks WHERE id = ?").get(req.params.id));
});

router.delete("/tasks/:id", (req, res) => {
  db.prepare("DELETE FROM project_tasks WHERE id = ?").run(req.params.id);
  record("project_task", req.params.id, "delete");
  res.status(204).end();
});

/* ── Milestones ────────────────────────────────────────────────────────── */

router.get("/milestones/project/:pid", (req, res) => {
  res.json(db.prepare(`
    SELECT * FROM project_milestones
    WHERE project_id = ?
    ORDER BY sort_order, target_date
  `).all(req.params.pid));
});

router.post("/milestones", validateBody(milestoneSchema), (req, res) => {
  const milestoneId = id("milestone");
  db.prepare(`
    INSERT INTO project_milestones (id, project_id, title, target_date, done, sort_order)
    VALUES (@id, @project_id, @title, @target_date, @done, @sort_order)
  `).run({
    id: milestoneId,
    project_id: req.body.project_id,
    title: req.body.title || "Nieuwe mijlpaal",
    target_date: req.body.target_date || null,
    done: req.body.done ? 1 : 0,
    sort_order: Number(req.body.sort_order || 0)
  });
  record("project_milestone", milestoneId, "create", req.body.title || "");
  res.status(201).json(db.prepare("SELECT * FROM project_milestones WHERE id = ?").get(milestoneId));
});

router.put("/milestones/:id", validateBody(milestoneSchema, { partial: true }), (req, res) => {
  const current = db.prepare("SELECT * FROM project_milestones WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Mijlpaal niet gevonden" });
  db.prepare(`
    UPDATE project_milestones SET
      title = @title,
      target_date = @target_date,
      done = @done,
      sort_order = @sort_order
    WHERE id = @id
  `).run({
    id: req.params.id,
    title: req.body.title || current.title,
    target_date: ("target_date" in req.body ? (req.body.target_date || null) : current.target_date),
    done: ("done" in req.body ? (req.body.done ? 1 : 0) : current.done),
    sort_order: Number(req.body.sort_order ?? current.sort_order)
  });
  record("project_milestone", req.params.id, "update");
  res.json(db.prepare("SELECT * FROM project_milestones WHERE id = ?").get(req.params.id));
});

router.delete("/milestones/:id", (req, res) => {
  db.prepare("DELETE FROM project_milestones WHERE id = ?").run(req.params.id);
  record("project_milestone", req.params.id, "delete");
  res.status(204).end();
});

/* ── Documents ─────────────────────────────────────────────────────────── */

router.get("/documents/project/:pid", (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM project_documents
    WHERE project_id = ?
    ORDER BY created_at DESC
  `).all(req.params.pid).map((row) => ({ ...row, url: uploadUrl(row.file_path) }));
  res.json(rows);
});

router.post("/documents", upload.single("file"), validateForm(documentSchema), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Geen bestand ontvangen" });
  const documentId = id("document");
  db.prepare(`
    INSERT INTO project_documents (id, project_id, kind, title, file_path, file_name)
    VALUES (@id, @project_id, @kind, @title, @file_path, @file_name)
  `).run({
    id: documentId,
    project_id: req.body.project_id,
    kind: req.body.kind || "contract",
    title: req.body.title || req.file.originalname,
    file_path: req.file.path,
    file_name: req.file.originalname
  });
  record("project_document", documentId, "create", req.body.title || req.file.originalname);
  const row = db.prepare("SELECT * FROM project_documents WHERE id = ?").get(documentId);
  res.status(201).json({ ...row, url: uploadUrl(row.file_path) });
});

router.delete("/documents/:id", (req, res) => {
  const current = db.prepare("SELECT file_path FROM project_documents WHERE id = ?").get(req.params.id);
  db.prepare("DELETE FROM project_documents WHERE id = ?").run(req.params.id);
  if (current) removeUpload(current.file_path);
  record("project_document", req.params.id, "delete");
  res.status(204).end();
});

/* ── Timeline (merged tasks + milestones) ──────────────────────────────── */

router.get("/timeline/project/:pid", (req, res) => {
  const tasks = db.prepare(`
    SELECT id, title, due_date, status FROM project_tasks WHERE project_id = ?
  `).all(req.params.pid).map((t) => ({
    type: "task",
    id: t.id,
    title: t.title,
    date: t.due_date || null,
    status: t.status
  }));
  const milestones = db.prepare(`
    SELECT id, title, target_date, done FROM project_milestones WHERE project_id = ?
  `).all(req.params.pid).map((m) => ({
    type: "milestone",
    id: m.id,
    title: m.title,
    date: m.target_date || null,
    done: m.done
  }));
  const merged = [...tasks, ...milestones].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  });
  res.json(merged);
});

module.exports = router;
