const express = require("express");
const fs = require("fs");
const path = require("path");
const { db } = require("../db/database");
const { id, uploadUrl } = require("./utils");
const { upload, removeUpload, uploadDir } = require("./uploads");
const { record } = require("./audit");
const { validateBody, validateForm, z } = require("./validate");

const router = express.Router();

// ---- Validation schemas ----------------------------------------------------

const mediaSchema = z.object({
  file_path: z.string(),
  file_name: z.string().optional(),
  mime_type: z.string().optional(),
  alt_text: z.string().optional(),
  tags: z.string().optional(),
  domain: z.string().optional(),
  ref_id: z.string().optional()
});

// POST /upload supplies file_path/file_name/mime_type from req.file, so the
// body only carries metadata fields.
const uploadSchema = z.object({
  alt_text: z.string().optional(),
  tags: z.string().optional(),
  domain: z.string().optional(),
  ref_id: z.string().optional()
});

// Attach a public url to a media row for the client.
function withUrl(row) {
  if (!row) return row;
  return { ...row, url: uploadUrl(row.file_path) };
}

// Build the set of file basenames that are still referenced anywhere in the
// app. Each query is guarded so a missing/empty table can never break the scan.
function referencedBasenames() {
  const refs = new Set();
  const sources = [
    ["products", "image_path"],
    ["rooms", "image_path"],
    ["moodboard_assets", "file_path"],
    ["materials", "image_path"],
    ["projects", "hero_image_path"],
    ["material_library", "image_path"],
    ["design_library", "image_path"],
    ["floorplans", "file_path"],
    ["floorplans", "thumb_path"],
    ["project_documents", "file_path"],
    ["media", "file_path"]
  ];
  for (const [table, column] of sources) {
    try {
      const rows = db.prepare(`SELECT ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != ''`).all();
      for (const row of rows) {
        if (row.value) refs.add(path.basename(row.value));
      }
    } catch {
      // Table or column may not exist yet; skip it.
    }
  }
  return refs;
}

// Files present on disk in uploadDir that no table references.
function findOrphans() {
  const refs = referencedBasenames();
  let files = [];
  try {
    files = fs.readdirSync(uploadDir);
  } catch {
    files = [];
  }
  return files
    .filter((file) => !refs.has(file))
    .map((file) => ({ file, path: path.join(uploadDir, file) }));
}

// GET / - list media, optional ?domain= and ?tag= (tags LIKE).
router.get("/", (req, res) => {
  const { domain = "", tag = "" } = req.query;
  const rows = db.prepare(`
    SELECT * FROM media
    WHERE (@domain = '' OR domain = @domain)
      AND (@tag = '' OR tags LIKE @tagLike)
    ORDER BY created_at DESC, rowid DESC
  `).all({ domain, tag, tagLike: `%${tag}%` });
  res.json(rows.map(withUrl));
});

// GET /orphans - files in uploadDir not referenced by any table.
router.get("/orphans", (_req, res) => {
  res.json(findOrphans());
});

// POST /upload - upload a file and register its metadata in one step.
router.post("/upload", upload.single("file"), validateForm(uploadSchema), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Geen bestand ontvangen" });
  const mediaId = id("media");
  db.prepare(`
    INSERT INTO media (id, file_path, file_name, mime_type, alt_text, tags, domain, ref_id)
    VALUES (@id, @file_path, @file_name, @mime_type, @alt_text, @tags, @domain, @ref_id)
  `).run({
    id: mediaId,
    file_path: req.file.path,
    file_name: req.file.originalname || "",
    mime_type: req.file.mimetype || "",
    alt_text: req.body.alt_text || "",
    tags: req.body.tags || "",
    domain: req.body.domain || "",
    ref_id: req.body.ref_id || ""
  });
  res.status(201).json(withUrl(db.prepare("SELECT * FROM media WHERE id = ?").get(mediaId)));
});

// POST / - register metadata for an already-uploaded file.
router.post("/", validateBody(mediaSchema), (req, res) => {
  if (!req.body.file_path) return res.status(400).json({ error: "file_path is verplicht" });
  const mediaId = id("media");
  db.prepare(`
    INSERT INTO media (id, file_path, file_name, mime_type, alt_text, tags, domain, ref_id)
    VALUES (@id, @file_path, @file_name, @mime_type, @alt_text, @tags, @domain, @ref_id)
  `).run({
    id: mediaId,
    file_path: req.body.file_path,
    file_name: req.body.file_name || "",
    mime_type: req.body.mime_type || "",
    alt_text: req.body.alt_text || "",
    tags: req.body.tags || "",
    domain: req.body.domain || "",
    ref_id: req.body.ref_id || ""
  });
  res.status(201).json(withUrl(db.prepare("SELECT * FROM media WHERE id = ?").get(mediaId)));
});

// PUT /:id - update editable metadata fields.
router.put("/:id", validateBody(mediaSchema, { partial: true }), (req, res) => {
  const current = db.prepare("SELECT * FROM media WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Media niet gevonden" });
  db.prepare(`
    UPDATE media SET
      alt_text = @alt_text,
      tags = @tags,
      domain = @domain,
      ref_id = @ref_id
    WHERE id = @id
  `).run({
    id: req.params.id,
    alt_text: req.body.alt_text ?? current.alt_text,
    tags: req.body.tags ?? current.tags,
    domain: req.body.domain ?? current.domain,
    ref_id: req.body.ref_id ?? current.ref_id
  });
  res.json(withUrl(db.prepare("SELECT * FROM media WHERE id = ?").get(req.params.id)));
});

// DELETE /:id - delete the row; only delete the file when ?withFile=1.
router.delete("/:id", (req, res) => {
  const current = db.prepare("SELECT * FROM media WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Media niet gevonden" });
  db.prepare("DELETE FROM media WHERE id = ?").run(req.params.id);
  if (req.query.withFile === "1") removeUpload(current.file_path);
  res.status(204).end();
});

// POST /cleanup-orphans - remove unreferenced files (confined to uploadDir).
router.post("/cleanup-orphans", (_req, res) => {
  const orphans = findOrphans();
  const removed = [];
  for (const orphan of orphans) {
    // removeUpload joins uploadDir + basename, so deletion stays inside uploadDir.
    removeUpload(orphan.file);
    removed.push(orphan.file);
  }
  record("media", "", "cleanup", removed.length);
  res.json({ removed: removed.length, files: removed });
});

module.exports = { router };
