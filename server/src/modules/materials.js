const express = require("express");
const { db } = require("../db/database");
const { id, uploadUrl } = require("./utils");
const { upload, removeUpload } = require("./uploads");
const { validateBody, validateForm, z } = require("./validate");

const router = express.Router();

const materialSchema = z.object({
  project_id: z.string().min(1),
  name: z.string().optional(),
  spec: z.string().optional(),
  application: z.string().optional(),
  sort_order: z.coerce.number().int().optional(),
  brand: z.string().optional(),
  code: z.string().optional(),
  maintenance: z.string().optional(),
  sustainability_score: z.coerce.number().int().optional(),
  sample_status: z.enum(["none", "requested", "received"]).optional(),
  supplier_id: z.string().optional(),
  library_id: z.string().optional()
});

const reorderSchema = z.object({
  order: z.array(z.string()).optional()
});

const fromLibrarySchema = z.object({
  project_id: z.string().min(1),
  library_id: z.string().min(1)
});

function hydrate(row) {
  if (!row) return null;
  return { ...row, image_url: uploadUrl(row.image_path) };
}

router.get("/project/:projectId", (req, res) => {
  const rows = db.prepare("SELECT * FROM materials WHERE project_id = ? ORDER BY sort_order, name").all(req.params.projectId);
  res.json(rows.map(hydrate));
});

router.post("/", upload.single("image"), validateForm(materialSchema), (req, res) => {
  const materialId = id("material");
  db.prepare(`
    INSERT INTO materials (
      id, project_id, name, spec, application, image_path, sort_order,
      brand, code, maintenance, sustainability_score, sample_status, supplier_id, library_id
    )
    VALUES (
      @id, @project_id, @name, @spec, @application, @image_path, @sort_order,
      @brand, @code, @maintenance, @sustainability_score, @sample_status, @supplier_id, @library_id
    )
  `).run({
    id: materialId,
    project_id: req.body.project_id,
    name: req.body.name || "Materiaal",
    spec: req.body.spec || "",
    application: req.body.application || "",
    image_path: req.file?.path || "",
    sort_order: Number(req.body.sort_order || 0),
    brand: req.body.brand || "",
    code: req.body.code || "",
    maintenance: req.body.maintenance || "",
    sustainability_score: Number(req.body.sustainability_score || 0),
    sample_status: req.body.sample_status || "none",
    supplier_id: req.body.supplier_id || null,
    library_id: req.body.library_id || null
  });
  res.status(201).json(hydrate(db.prepare("SELECT * FROM materials WHERE id = ?").get(materialId)));
});

// Materials sorting from UI: { order: [ids] } -> sort_order by index.
router.put("/reorder", validateBody(reorderSchema), (req, res) => {
  const order = req.body.order;
  if (!Array.isArray(order)) return res.status(400).json({ error: "Ongeldige volgorde" });
  const update = db.prepare("UPDATE materials SET sort_order = ? WHERE id = ?");
  const apply = db.transaction((ids) => {
    ids.forEach((materialId, index) => update.run(index, materialId));
  });
  apply(order);
  res.json({ ok: true });
});

// Copy a material_library row into a new project material.
router.post("/from-library", validateBody(fromLibrarySchema), (req, res) => {
  const { project_id, library_id } = req.body;
  if (!project_id || !library_id) return res.status(400).json({ error: "project_id en library_id zijn verplicht" });
  const lib = db.prepare("SELECT * FROM material_library WHERE id = ?").get(library_id);
  if (!lib) return res.status(404).json({ error: "Bibliotheekmateriaal niet gevonden" });
  const materialId = id("material");
  const sort = db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM materials WHERE project_id = ?").get(project_id);
  db.prepare(`
    INSERT INTO materials (
      id, project_id, name, spec, image_path, sort_order,
      brand, code, maintenance, sustainability_score, library_id
    )
    VALUES (
      @id, @project_id, @name, @spec, @image_path, @sort_order,
      @brand, @code, @maintenance, @sustainability_score, @library_id
    )
  `).run({
    id: materialId,
    project_id,
    name: lib.name || "Materiaal",
    spec: lib.spec || "",
    image_path: lib.image_path || "",
    sort_order: sort.next,
    brand: lib.brand || "",
    code: lib.code || "",
    maintenance: lib.maintenance || "",
    sustainability_score: Number(lib.sustainability_score || 0),
    library_id: lib.id
  });
  res.status(201).json(hydrate(db.prepare("SELECT * FROM materials WHERE id = ?").get(materialId)));
});

router.put("/:id", upload.single("image"), validateForm(materialSchema, { partial: true }), (req, res) => {
  const current = db.prepare("SELECT * FROM materials WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Materiaal niet gevonden" });
  db.prepare(`
    UPDATE materials SET
      name = @name,
      spec = @spec,
      application = @application,
      image_path = @image_path,
      sort_order = @sort_order,
      brand = @brand,
      code = @code,
      maintenance = @maintenance,
      sustainability_score = @sustainability_score,
      sample_status = @sample_status,
      supplier_id = @supplier_id,
      library_id = @library_id
    WHERE id = @id
  `).run({
    id: req.params.id,
    name: req.body.name ?? current.name,
    spec: req.body.spec ?? current.spec,
    application: req.body.application ?? current.application,
    image_path: req.file?.path || current.image_path,
    sort_order: Number(req.body.sort_order ?? current.sort_order),
    brand: req.body.brand ?? current.brand,
    code: req.body.code ?? current.code,
    maintenance: req.body.maintenance ?? current.maintenance,
    sustainability_score: Number(req.body.sustainability_score ?? current.sustainability_score),
    sample_status: req.body.sample_status ?? current.sample_status,
    supplier_id: req.body.supplier_id !== undefined ? (req.body.supplier_id || null) : current.supplier_id,
    library_id: req.body.library_id !== undefined ? (req.body.library_id || null) : current.library_id
  });
  if (req.file && current.image_path && current.image_path !== req.file.path) {
    removeUpload(current.image_path);
  }
  res.json(hydrate(db.prepare("SELECT * FROM materials WHERE id = ?").get(req.params.id)));
});

router.delete("/:id", (req, res) => {
  const current = db.prepare("SELECT image_path FROM materials WHERE id = ?").get(req.params.id);
  db.prepare("DELETE FROM materials WHERE id = ?").run(req.params.id);
  if (current) removeUpload(current.image_path);
  res.status(204).end();
});

module.exports = router;
