const express = require("express");
const { db } = require("../db/database");
const { id, parseJson, uploadUrl } = require("./utils");
const { upload, removeUpload } = require("./uploads");
const { record } = require("./audit");

const router = express.Router();

// Normalise a stored row into the API shape: parse data_json into `data`
// and expose a resolvable image_url next to the raw image_path.
function present(row) {
  if (!row) return row;
  return {
    ...row,
    data: parseJson(row.data_json, {}),
    image_url: uploadUrl(row.image_path)
  };
}

// Accept `data` as either a JSON string (from multipart form fields) or an
// already-parsed object, and always return a JSON string for storage.
function serializeData(value) {
  if (value === undefined || value === null || value === "") return "{}";
  if (typeof value === "string") {
    const parsed = parseJson(value, undefined);
    return JSON.stringify(parsed === undefined ? {} : parsed);
  }
  return JSON.stringify(value);
}

router.get("/", (req, res) => {
  const kind = req.query.kind || "";
  const rows = db.prepare(`
    SELECT * FROM design_library
    WHERE (@kind = '' OR kind = @kind)
    ORDER BY created_at DESC
  `).all({ kind });
  res.json(rows.map(present));
});

router.post("/", upload.single("image"), (req, res) => {
  const itemId = id("design");
  db.prepare(`
    INSERT INTO design_library (id, kind, title, summary, body, data_json, tags, image_path, source_project_id)
    VALUES (@id, @kind, @title, @summary, @body, @data_json, @tags, @image_path, @source_project_id)
  `).run({
    id: itemId,
    kind: req.body.kind || "concept",
    title: req.body.title || "Naamloos",
    summary: req.body.summary || "",
    body: req.body.body || "",
    data_json: serializeData(req.body.data),
    tags: req.body.tags || "",
    image_path: req.file?.path || "",
    source_project_id: req.body.source_project_id || null
  });
  record("design_library", itemId, "create", req.body.title || "");
  res.status(201).json(present(db.prepare("SELECT * FROM design_library WHERE id = ?").get(itemId)));
});

router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM design_library WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Bibliotheekitem niet gevonden" });
  res.json(present(row));
});

router.put("/:id", upload.single("image"), (req, res) => {
  const current = db.prepare("SELECT * FROM design_library WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Bibliotheekitem niet gevonden" });
  db.prepare(`
    UPDATE design_library SET
      kind = @kind,
      title = @title,
      summary = @summary,
      body = @body,
      data_json = @data_json,
      tags = @tags,
      image_path = @image_path,
      source_project_id = @source_project_id
    WHERE id = @id
  `).run({
    id: req.params.id,
    kind: req.body.kind ?? current.kind,
    title: req.body.title || current.title,
    summary: req.body.summary ?? current.summary,
    body: req.body.body ?? current.body,
    data_json: "data" in req.body ? serializeData(req.body.data) : current.data_json,
    tags: req.body.tags ?? current.tags,
    image_path: req.file?.path || current.image_path,
    source_project_id: req.body.source_project_id ?? current.source_project_id
  });
  if (req.file && current.image_path && current.image_path !== req.file.path) {
    removeUpload(current.image_path);
  }
  record("design_library", req.params.id, "update", req.body.title || current.title);
  res.json(present(db.prepare("SELECT * FROM design_library WHERE id = ?").get(req.params.id)));
});

router.delete("/:id", (req, res) => {
  const current = db.prepare("SELECT image_path FROM design_library WHERE id = ?").get(req.params.id);
  db.prepare("DELETE FROM design_library WHERE id = ?").run(req.params.id);
  if (current) removeUpload(current.image_path);
  record("design_library", req.params.id, "delete");
  res.status(204).end();
});

// Convenience create for promoting something from a project into the library.
// Same as POST but JSON-only (no image upload).
router.post("/promote", (req, res) => {
  const itemId = id("design");
  db.prepare(`
    INSERT INTO design_library (id, kind, title, summary, body, data_json, tags, image_path, source_project_id)
    VALUES (@id, @kind, @title, @summary, @body, @data_json, @tags, @image_path, @source_project_id)
  `).run({
    id: itemId,
    kind: req.body.kind || "concept",
    title: req.body.title || "Naamloos",
    summary: req.body.summary || "",
    body: req.body.body || "",
    data_json: serializeData(req.body.data),
    tags: req.body.tags || "",
    image_path: "",
    source_project_id: req.body.source_project_id || null
  });
  record("design_library", itemId, "promote", req.body.title || "");
  res.status(201).json(present(db.prepare("SELECT * FROM design_library WHERE id = ?").get(itemId)));
});

module.exports = router;
