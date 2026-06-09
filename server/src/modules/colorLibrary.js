const express = require("express");
const { db } = require("../db/database");
const { id } = require("./utils");
const { record } = require("./audit");
const { validateBody, z } = require("./validate");

const router = express.Router();

const colorSchema = z.object({
  name: z.string().min(1),
  hex: z.string().optional(),
  brand: z.string().optional(),
  code: z.string().optional(),
  finish: z.string().optional(),
  notes: z.string().optional()
});

const roomColorSchema = z.object({
  color_id: z.string().optional(),
  hex: z.string().optional(),
  name: z.string().optional(),
  application: z.string().optional()
});

// --- Color library (reusable palette) ---

router.get("/", (_req, res) => {
  res.json(db.prepare("SELECT * FROM color_library ORDER BY name").all());
});

router.post("/", validateBody(colorSchema), (req, res) => {
  const colorId = id("color");
  db.prepare(`
    INSERT INTO color_library (id, name, hex, brand, code, finish, notes)
    VALUES (@id, @name, @hex, @brand, @code, @finish, @notes)
  `).run({
    id: colorId,
    name: req.body.name || "Nieuwe kleur",
    hex: req.body.hex || "",
    brand: req.body.brand || "",
    code: req.body.code || "",
    finish: req.body.finish || "",
    notes: req.body.notes || ""
  });
  record("color", colorId, "create", req.body.name || "Nieuwe kleur");
  res.status(201).json(db.prepare("SELECT * FROM color_library WHERE id = ?").get(colorId));
});

router.put("/:id", validateBody(colorSchema, { partial: true }), (req, res) => {
  const current = db.prepare("SELECT * FROM color_library WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Kleur niet gevonden" });
  db.prepare(`
    UPDATE color_library SET
      name = @name,
      hex = @hex,
      brand = @brand,
      code = @code,
      finish = @finish,
      notes = @notes
    WHERE id = @id
  `).run({
    id: req.params.id,
    name: req.body.name || current.name,
    hex: req.body.hex ?? current.hex,
    brand: req.body.brand ?? current.brand,
    code: req.body.code ?? current.code,
    finish: req.body.finish ?? current.finish,
    notes: req.body.notes ?? current.notes
  });
  record("color", req.params.id, "update", req.body.name ?? current.name);
  res.json(db.prepare("SELECT * FROM color_library WHERE id = ?").get(req.params.id));
});

router.delete("/:id", (req, res) => {
  db.prepare("UPDATE room_colors SET color_id = NULL WHERE color_id = ?").run(req.params.id);
  db.prepare("DELETE FROM color_library WHERE id = ?").run(req.params.id);
  record("color", req.params.id, "delete");
  res.status(204).end();
});

// --- Room color applications ---

router.get("/room/:roomId", (req, res) => {
  res.json(db.prepare(`
    SELECT rc.*,
      cl.name AS library_name,
      cl.brand AS library_brand,
      cl.code AS library_code
    FROM room_colors rc
    LEFT JOIN color_library cl ON cl.id = rc.color_id
    WHERE rc.room_id = ?
    ORDER BY rc.created_at, rc.name
  `).all(req.params.roomId));
});

router.post("/room/:roomId", validateBody(roomColorSchema), (req, res) => {
  const roomColorId = id("roomcolor");
  let hex = req.body.hex || "";
  let name = req.body.name || "";
  const colorId = req.body.color_id || null;
  if (colorId && (!hex || !name)) {
    const library = db.prepare("SELECT name, hex FROM color_library WHERE id = ?").get(colorId);
    if (library) {
      if (!hex) hex = library.hex || "";
      if (!name) name = library.name || "";
    }
  }
  db.prepare(`
    INSERT INTO room_colors (id, room_id, color_id, hex, name, application)
    VALUES (@id, @room_id, @color_id, @hex, @name, @application)
  `).run({
    id: roomColorId,
    room_id: req.params.roomId,
    color_id: colorId,
    hex,
    name,
    application: req.body.application || ""
  });
  record("room_color", roomColorId, "create", name);
  res.status(201).json(db.prepare("SELECT * FROM room_colors WHERE id = ?").get(roomColorId));
});

router.put("/room-color/:id", validateBody(roomColorSchema, { partial: true }), (req, res) => {
  const current = db.prepare("SELECT * FROM room_colors WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Kleurtoepassing niet gevonden" });
  db.prepare(`
    UPDATE room_colors SET
      color_id = @color_id,
      hex = @hex,
      name = @name,
      application = @application
    WHERE id = @id
  `).run({
    id: req.params.id,
    color_id: ("color_id" in req.body ? (req.body.color_id || null) : current.color_id),
    hex: req.body.hex ?? current.hex,
    name: req.body.name ?? current.name,
    application: req.body.application ?? current.application
  });
  record("room_color", req.params.id, "update", req.body.name ?? current.name);
  res.json(db.prepare("SELECT * FROM room_colors WHERE id = ?").get(req.params.id));
});

router.delete("/room-color/:id", (req, res) => {
  db.prepare("DELETE FROM room_colors WHERE id = ?").run(req.params.id);
  record("room_color", req.params.id, "delete");
  res.status(204).end();
});

module.exports = router;
