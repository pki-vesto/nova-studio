const express = require("express");
const { db } = require("../db/database");
const { id, parseJson, uploadUrl } = require("./utils");
const { upload, removeUpload } = require("./uploads");

const router = express.Router();

// Normalise an asset row: parse none, but expose a resolvable url next to file_path.
function presentAsset(row) {
  if (!row) return row;
  return {
    ...row,
    url: uploadUrl(row.file_path)
  };
}

function loadAssets(moodboardId) {
  return db
    .prepare("SELECT * FROM moodboard_assets WHERE moodboard_id = ? ORDER BY sort_order ASC, created_at DESC")
    .all(moodboardId)
    .map(presentAsset);
}

function hydrate(row) {
  if (!row) return null;
  return {
    ...row,
    colors: parseJson(row.colors_json, []),
    materials: parseJson(row.materials_json, []),
    layout: parseJson(row.layout_json, {}),
    assets: loadAssets(row.id)
  };
}

function getBoard(boardId) {
  return db.prepare("SELECT * FROM moodboards WHERE id = ?").get(boardId);
}

router.get("/project/:projectId", (req, res) => {
  res.json(db.prepare("SELECT * FROM moodboards WHERE project_id = ? ORDER BY created_at DESC").all(req.params.projectId).map(hydrate));
});

router.post("/", (req, res) => {
  const boardId = id("moodboard");
  db.prepare(`
    INSERT INTO moodboards (id, project_id, room_id, title, description, colors_json, materials_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    boardId,
    req.body.project_id,
    req.body.room_id || null,
    req.body.title || "Moodboard",
    req.body.description || "",
    JSON.stringify(req.body.colors || []),
    JSON.stringify(req.body.materials || [])
  );
  res.status(201).json(hydrate(getBoard(boardId)));
});

// Edit a moodboard after creation. Keeps current values when a field is omitted.
router.put("/:id", (req, res) => {
  const current = getBoard(req.params.id);
  if (!current) return res.status(404).json({ error: "Moodboard niet gevonden" });
  db.prepare(`
    UPDATE moodboards SET
      room_id = @room_id,
      title = @title,
      description = @description,
      colors_json = @colors_json,
      materials_json = @materials_json,
      layout_json = @layout_json
    WHERE id = @id
  `).run({
    id: req.params.id,
    room_id: "room_id" in req.body ? (req.body.room_id || null) : current.room_id,
    title: req.body.title ?? current.title,
    description: req.body.description ?? current.description,
    colors_json: "colors" in req.body ? JSON.stringify(req.body.colors || []) : current.colors_json,
    materials_json: "materials" in req.body ? JSON.stringify(req.body.materials || []) : current.materials_json,
    layout_json: "layout_json" in req.body ? JSON.stringify(req.body.layout_json || {}) : current.layout_json
  });
  res.json(hydrate(getBoard(req.params.id)));
});

router.delete("/:id", (req, res) => {
  const assets = db.prepare("SELECT file_path FROM moodboard_assets WHERE moodboard_id = ?").all(req.params.id);
  db.prepare("DELETE FROM moodboards WHERE id = ?").run(req.params.id);
  assets.forEach((asset) => removeUpload(asset.file_path));
  res.status(204).end();
});

// Clone a moodboard as a variant of the source. variant_of_id points back to
// the original; copies title/description/colors/materials and, optionally, assets.
router.post("/:id/variant", (req, res) => {
  const source = getBoard(req.params.id);
  if (!source) return res.status(404).json({ error: "Moodboard niet gevonden" });

  const variantId = id("moodboard");
  db.prepare(`
    INSERT INTO moodboards (id, project_id, room_id, title, description, colors_json, materials_json, variant_of_id, variant_label, layout_json)
    VALUES (@id, @project_id, @room_id, @title, @description, @colors_json, @materials_json, @variant_of_id, @variant_label, @layout_json)
  `).run({
    id: variantId,
    project_id: source.project_id,
    room_id: source.room_id || null,
    title: req.body.title || source.title,
    description: req.body.description ?? source.description,
    colors_json: source.colors_json,
    materials_json: source.materials_json,
    variant_of_id: source.id,
    variant_label: req.body.variant_label || "",
    layout_json: source.layout_json || "{}"
  });

  // Optionally duplicate the source assets (file paths are reused/shared).
  const cloneAssets = req.body.clone_assets === true || req.body.clone_assets === "true";
  if (cloneAssets) {
    const assets = db.prepare("SELECT * FROM moodboard_assets WHERE moodboard_id = ?").all(source.id);
    const insert = db.prepare(`
      INSERT INTO moodboard_assets (id, moodboard_id, file_path, file_name, caption, source_url, tags, sort_order)
      VALUES (@id, @moodboard_id, @file_path, @file_name, @caption, @source_url, @tags, @sort_order)
    `);
    const copyAll = db.transaction((rows) => {
      rows.forEach((asset) => {
        insert.run({
          id: id("asset"),
          moodboard_id: variantId,
          file_path: asset.file_path,
          file_name: asset.file_name,
          caption: asset.caption || "",
          source_url: asset.source_url || "",
          tags: asset.tags || "",
          sort_order: asset.sort_order || 0
        });
      });
    });
    copyAll(assets);
  }

  res.status(201).json(hydrate(getBoard(variantId)));
});

// Client feedback on a moodboard.
router.get("/:id/feedback", (req, res) => {
  res.json(
    db.prepare("SELECT * FROM moodboard_feedback WHERE moodboard_id = ? ORDER BY created_at DESC").all(req.params.id)
  );
});

router.post("/:id/feedback", (req, res) => {
  const board = getBoard(req.params.id);
  if (!board) return res.status(404).json({ error: "Moodboard niet gevonden" });

  const allowed = ["positive", "neutral", "negative"];
  const sentiment = allowed.includes(req.body.sentiment) ? req.body.sentiment : "neutral";

  const feedbackId = id("feedback");
  db.prepare(`
    INSERT INTO moodboard_feedback (id, moodboard_id, author, sentiment, body)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    feedbackId,
    req.params.id,
    req.body.author || "klant",
    sentiment,
    req.body.body || ""
  );
  res.status(201).json(db.prepare("SELECT * FROM moodboard_feedback WHERE id = ?").get(feedbackId));
});

// Promote a moodboard into the reusable design library as a concept.
router.post("/:id/promote", (req, res) => {
  const board = getBoard(req.params.id);
  if (!board) return res.status(404).json({ error: "Moodboard niet gevonden" });

  const itemId = id("design");
  db.prepare(`
    INSERT INTO design_library (id, kind, title, summary, body, data_json, tags, image_path, source_project_id)
    VALUES (@id, @kind, @title, @summary, @body, @data_json, @tags, @image_path, @source_project_id)
  `).run({
    id: itemId,
    kind: "concept",
    title: board.title || "Moodboard",
    summary: board.description || "",
    body: "",
    data_json: JSON.stringify({
      colors: parseJson(board.colors_json, []),
      materials: parseJson(board.materials_json, [])
    }),
    tags: "",
    image_path: "",
    source_project_id: board.project_id || null
  });
  res.status(201).json(db.prepare("SELECT * FROM design_library WHERE id = ?").get(itemId));
});

router.post("/:id/assets", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Geen bestand ontvangen" });
  const assetId = id("asset");
  db.prepare(`
    INSERT INTO moodboard_assets (id, moodboard_id, file_path, file_name, caption, source_url, tags, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    assetId,
    req.params.id,
    req.file.path,
    req.file.originalname,
    req.body.caption || "",
    req.body.source_url || "",
    req.body.tags || "",
    Number(req.body.sort_order) || 0
  );
  res.status(201).json(presentAsset(db.prepare("SELECT * FROM moodboard_assets WHERE id = ?").get(assetId)));
});

// Edit asset metadata: caption, source attribution, tags, ordering.
router.put("/assets/:assetId", (req, res) => {
  const current = db.prepare("SELECT * FROM moodboard_assets WHERE id = ?").get(req.params.assetId);
  if (!current) return res.status(404).json({ error: "Asset niet gevonden" });
  db.prepare(`
    UPDATE moodboard_assets SET
      caption = @caption,
      source_url = @source_url,
      tags = @tags,
      sort_order = @sort_order
    WHERE id = @id
  `).run({
    id: req.params.assetId,
    caption: req.body.caption ?? current.caption,
    source_url: req.body.source_url ?? current.source_url,
    tags: req.body.tags ?? current.tags,
    sort_order: "sort_order" in req.body ? (Number(req.body.sort_order) || 0) : current.sort_order
  });
  res.json(presentAsset(db.prepare("SELECT * FROM moodboard_assets WHERE id = ?").get(req.params.assetId)));
});

router.delete("/assets/:assetId", (req, res) => {
  const asset = db.prepare("SELECT file_path FROM moodboard_assets WHERE id = ?").get(req.params.assetId);
  db.prepare("DELETE FROM moodboard_assets WHERE id = ?").run(req.params.assetId);
  if (asset) removeUpload(asset.file_path);
  res.status(204).end();
});

module.exports = router;
