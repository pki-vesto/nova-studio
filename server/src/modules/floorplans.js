const express = require("express");
const { db } = require("../db/database");
const { id, parseJson, uploadUrl } = require("./utils");
const { upload, removeUpload, uploadDir } = require("./uploads");
const { createPdfThumbnail } = require("./pdfThumbnails");
const { validateBody, validateForm, z } = require("./validate");

const router = express.Router();

// ---- Validation schemas ----------------------------------------------------

// Multipart create (after multer). north_angle arrives as a string and is
// coerced; drawing_json arrives as a JSON string and stays a string.
const createSchema = z.object({
  project_id: z.string(),
  room_id: z.string().optional(),
  name: z.string().optional(),
  floor_level: z.string().optional(),
  north_angle: z.coerce.number().optional(),
  drawing_json: z.string().optional(),
  notes: z.string().optional()
});

const updateSchema = z.object({
  name: z.string().optional(),
  room_id: z.string().optional(),
  floor_level: z.string().optional(),
  north_angle: z.coerce.number().optional(),
  drawing_json: z.string().optional(),
  drawing: z.any().optional(),
  notes: z.string().optional(),
  scale_ratio: z.coerce.number().optional(),
  scale_unit: z.string().optional()
});

const objectSchema = z.object({
  layer: z.string().optional(),
  kind: z.string().optional(),
  label: z.string().optional(),
  sort_order: z.coerce.number().int().optional(),
  geometry: z.any().optional()
});

const objectUpdateSchema = z.object({
  layer: z.string().optional(),
  kind: z.string().optional(),
  label: z.string().optional(),
  sort_order: z.coerce.number().int().optional(),
  geometry: z.any().optional()
});

function serializePlan(row) {
  if (!row) return row;
  return {
    ...row,
    drawing: parseJson(row.drawing_json, {}),
    file_url: uploadUrl(row.file_path),
    thumb_url: uploadUrl(row.thumb_path)
  };
}

function serializeObject(row) {
  if (!row) return row;
  return { ...row, geometry: parseJson(row.geometry_json, {}) };
}

router.get("/project/:projectId", (req, res) => {
  const rows = db.prepare("SELECT * FROM floorplans WHERE project_id = ? ORDER BY created_at DESC").all(req.params.projectId);
  res.json(rows.map(serializePlan));
});

router.get("/:id", (req, res) => {
  const row = db.prepare("SELECT * FROM floorplans WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Floorplan not found" });
  res.json(serializePlan(row));
});

router.post("/", upload.single("file"), validateForm(createSchema), (req, res) => {
  const floorplanId = id("floorplan");
  const drawing = req.body.drawing_json || '{"walls":[],"doors":[],"windows":[],"labels":[]}';
  const thumbPath = createPdfThumbnail(req.file?.path || "", req.file?.originalname || "", uploadDir);
  db.prepare(`
    INSERT INTO floorplans (id, project_id, room_id, name, floor_level, file_path, file_name, north_angle, drawing_json, notes, thumb_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    floorplanId,
    req.body.project_id,
    req.body.room_id || null,
    req.body.name || "Plattegrond",
    req.body.floor_level || "",
    req.file?.path || "",
    req.file?.originalname || "",
    Number(req.body.north_angle || 0),
    drawing,
    req.body.notes || "",
    thumbPath
  );
  res.status(201).json(serializePlan(db.prepare("SELECT * FROM floorplans WHERE id = ?").get(floorplanId)));
});

router.put("/:id", validateBody(updateSchema, { partial: true }), (req, res) => {
  const current = db.prepare("SELECT * FROM floorplans WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Floorplan not found" });

  let drawingJson = current.drawing_json;
  if (req.body.drawing_json !== undefined) {
    drawingJson = typeof req.body.drawing_json === "string"
      ? req.body.drawing_json
      : JSON.stringify(req.body.drawing_json);
  } else if (req.body.drawing !== undefined) {
    drawingJson = typeof req.body.drawing === "string"
      ? req.body.drawing
      : JSON.stringify(req.body.drawing);
  }

  db.prepare(`
    UPDATE floorplans SET
      name = @name,
      room_id = @room_id,
      floor_level = @floor_level,
      north_angle = @north_angle,
      drawing_json = @drawing_json,
      notes = @notes,
      scale_ratio = @scale_ratio,
      scale_unit = @scale_unit
    WHERE id = @id
  `).run({
    id: req.params.id,
    name: req.body.name !== undefined ? req.body.name : current.name,
    room_id: req.body.room_id !== undefined ? (req.body.room_id || null) : current.room_id,
    floor_level: req.body.floor_level !== undefined ? req.body.floor_level : current.floor_level,
    north_angle: req.body.north_angle !== undefined ? Number(req.body.north_angle || 0) : current.north_angle,
    drawing_json: drawingJson,
    notes: req.body.notes !== undefined ? req.body.notes : current.notes,
    scale_ratio: req.body.scale_ratio !== undefined ? Number(req.body.scale_ratio) : current.scale_ratio,
    scale_unit: req.body.scale_unit !== undefined ? req.body.scale_unit : current.scale_unit
  });
  res.json(serializePlan(db.prepare("SELECT * FROM floorplans WHERE id = ?").get(req.params.id)));
});

router.delete("/:id", (req, res) => {
  const plan = db.prepare("SELECT file_path, thumb_path FROM floorplans WHERE id = ?").get(req.params.id);
  db.prepare("DELETE FROM floorplan_objects WHERE floorplan_id = ?").run(req.params.id);
  db.prepare("DELETE FROM floorplans WHERE id = ?").run(req.params.id);
  if (plan) {
    removeUpload(plan.file_path);
    removeUpload(plan.thumb_path);
  }
  res.status(204).end();
});

// --- Floorplan vector objects (layers: walls / furniture / annotations) ---

router.get("/:id/objects", (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM floorplan_objects WHERE floorplan_id = ? ORDER BY layer, sort_order"
  ).all(req.params.id);
  res.json(rows.map(serializeObject));
});

router.post("/:id/objects", validateBody(objectSchema), (req, res) => {
  const plan = db.prepare("SELECT id FROM floorplans WHERE id = ?").get(req.params.id);
  if (!plan) return res.status(404).json({ error: "Floorplan not found" });

  const objectId = id("fpobj");
  db.prepare(`
    INSERT INTO floorplan_objects (id, floorplan_id, layer, kind, geometry_json, label, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    objectId,
    req.params.id,
    req.body.layer || "walls",
    req.body.kind || "wall",
    JSON.stringify(req.body.geometry || {}),
    req.body.label || null,
    Number(req.body.sort_order || 0)
  );
  res.status(201).json(serializeObject(db.prepare("SELECT * FROM floorplan_objects WHERE id = ?").get(objectId)));
});

router.put("/objects/:oid", validateBody(objectUpdateSchema, { partial: true }), (req, res) => {
  const current = db.prepare("SELECT * FROM floorplan_objects WHERE id = ?").get(req.params.oid);
  if (!current) return res.status(404).json({ error: "Object not found" });

  let geometryJson = current.geometry_json;
  if (req.body.geometry !== undefined) {
    geometryJson = typeof req.body.geometry === "string"
      ? req.body.geometry
      : JSON.stringify(req.body.geometry);
  }

  db.prepare(`
    UPDATE floorplan_objects SET
      layer = @layer,
      kind = @kind,
      geometry_json = @geometry_json,
      label = @label,
      sort_order = @sort_order
    WHERE id = @id
  `).run({
    id: req.params.oid,
    layer: req.body.layer !== undefined ? req.body.layer : current.layer,
    kind: req.body.kind !== undefined ? req.body.kind : current.kind,
    geometry_json: geometryJson,
    label: req.body.label !== undefined ? (req.body.label || null) : current.label,
    sort_order: req.body.sort_order !== undefined ? Number(req.body.sort_order || 0) : current.sort_order
  });
  res.json(serializeObject(db.prepare("SELECT * FROM floorplan_objects WHERE id = ?").get(req.params.oid)));
});

router.delete("/objects/:oid", (req, res) => {
  db.prepare("DELETE FROM floorplan_objects WHERE id = ?").run(req.params.oid);
  res.status(204).end();
});

// --- Versioning: clone a floorplan (and its objects) into a new version ---

router.post("/:id/new-version", (req, res) => {
  const source = db.prepare("SELECT * FROM floorplans WHERE id = ?").get(req.params.id);
  if (!source) return res.status(404).json({ error: "Floorplan not found" });

  const newId = id("floorplan");
  const cloneVersion = db.transaction(() => {
    db.prepare(`
      INSERT INTO floorplans (
        id, project_id, room_id, name, floor_level,
        file_path, file_name, north_angle, drawing_json, notes,
        scale_ratio, scale_unit, version, thumb_path
      ) VALUES (
        @id, @project_id, @room_id, @name, @floor_level,
        @file_path, @file_name, @north_angle, @drawing_json, @notes,
        @scale_ratio, @scale_unit, @version, @thumb_path
      )
    `).run({
      id: newId,
      project_id: source.project_id,
      room_id: source.room_id,
      name: source.name,
      floor_level: source.floor_level,
      file_path: source.file_path,
      file_name: source.file_name,
      north_angle: source.north_angle,
      drawing_json: source.drawing_json,
      notes: source.notes,
      scale_ratio: source.scale_ratio,
      scale_unit: source.scale_unit,
      version: (source.version || 1) + 1,
      thumb_path: source.thumb_path
    });

    const objects = db.prepare("SELECT * FROM floorplan_objects WHERE floorplan_id = ?").all(req.params.id);
    const insertObj = db.prepare(`
      INSERT INTO floorplan_objects (id, floorplan_id, layer, kind, geometry_json, label, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const obj of objects) {
      insertObj.run(
        id("fpobj"),
        newId,
        obj.layer,
        obj.kind,
        obj.geometry_json,
        obj.label,
        obj.sort_order
      );
    }
  });
  cloneVersion();

  res.status(201).json(serializePlan(db.prepare("SELECT * FROM floorplans WHERE id = ?").get(newId)));
});

module.exports = router;
