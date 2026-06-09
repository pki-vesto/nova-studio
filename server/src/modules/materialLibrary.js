const express = require("express");
const { db } = require("../db/database");
const { id, uploadUrl } = require("./utils");
const { upload, removeUpload } = require("./uploads");
const { record } = require("./audit");
const { validateForm, z } = require("./validate");

const router = express.Router();

const materialLibrarySchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  brand: z.string().optional(),
  code: z.string().optional(),
  spec: z.string().optional(),
  maintenance: z.string().optional(),
  sustainability_score: z.coerce.number().int().optional(),
  notes: z.string().optional()
});

router.get("/", (_req, res) => {
  const rows = db.prepare("SELECT * FROM material_library ORDER BY name").all();
  res.json(rows.map((row) => ({ ...row, image_url: uploadUrl(row.image_path) })));
});

router.post("/", upload.single("image"), validateForm(materialLibrarySchema), (req, res) => {
  const materialId = id("material");
  db.prepare(`
    INSERT INTO material_library (id, name, category, brand, code, spec, maintenance, sustainability_score, image_path, notes)
    VALUES (@id, @name, @category, @brand, @code, @spec, @maintenance, @sustainability_score, @image_path, @notes)
  `).run({
    id: materialId,
    name: req.body.name || "Nieuw materiaal",
    category: req.body.category || "",
    brand: req.body.brand || "",
    code: req.body.code || "",
    spec: req.body.spec || "",
    maintenance: req.body.maintenance || "",
    sustainability_score: Number(req.body.sustainability_score || 0),
    image_path: req.file?.path || "",
    notes: req.body.notes || ""
  });
  record("material_library", materialId, "create", req.body.name || "");
  res.status(201).json(db.prepare("SELECT * FROM material_library WHERE id = ?").get(materialId));
});

router.put("/:id", upload.single("image"), validateForm(materialLibrarySchema, { partial: true }), (req, res) => {
  const current = db.prepare("SELECT * FROM material_library WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Materiaal niet gevonden" });
  db.prepare(`
    UPDATE material_library SET
      name = @name,
      category = @category,
      brand = @brand,
      code = @code,
      spec = @spec,
      maintenance = @maintenance,
      sustainability_score = @sustainability_score,
      image_path = @image_path,
      notes = @notes
    WHERE id = @id
  `).run({
    id: req.params.id,
    name: req.body.name || current.name,
    category: req.body.category ?? current.category,
    brand: req.body.brand ?? current.brand,
    code: req.body.code ?? current.code,
    spec: req.body.spec ?? current.spec,
    maintenance: req.body.maintenance ?? current.maintenance,
    sustainability_score: Number(req.body.sustainability_score ?? current.sustainability_score),
    image_path: req.file?.path || current.image_path,
    notes: req.body.notes ?? current.notes
  });
  if (req.file && current.image_path && current.image_path !== req.file.path) {
    removeUpload(current.image_path);
  }
  record("material_library", req.params.id, "update", req.body.name || current.name);
  res.json(db.prepare("SELECT * FROM material_library WHERE id = ?").get(req.params.id));
});

router.delete("/:id", (req, res) => {
  const current = db.prepare("SELECT image_path FROM material_library WHERE id = ?").get(req.params.id);
  db.prepare("DELETE FROM material_library WHERE id = ?").run(req.params.id);
  if (current) removeUpload(current.image_path);
  record("material_library", req.params.id, "delete");
  res.status(204).end();
});

module.exports = router;
