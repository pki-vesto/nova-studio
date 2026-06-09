const express = require("express");
const { z } = require("zod");
const { db } = require("../db/database");
const { id } = require("./utils");
const { upload, removeUpload } = require("./uploads");

const router = express.Router();
const schema = z.object({
  project_id: z.string(),
  parent_room_id: z.string().optional().default(""),
  name: z.string().min(1),
  room_type: z.string().optional().default(""),
  floor_level: z.string().optional().default(""),
  dimensions: z.string().optional().default(""),
  orientation: z.string().optional().default(""),
  daylight: z.string().optional().default(""),
  color_notes: z.string().optional().default(""),
  designer_notes: z.string().optional().default(""),
  concept: z.string().optional().default(""),
  sort_order: z.coerce.number().optional().default(0)
});

router.post("/", (req, res) => {
  const input = schema.parse(req.body);
  const roomId = id("room");
  db.prepare(`
    INSERT INTO rooms (id, project_id, parent_room_id, name, room_type, floor_level, dimensions, orientation, daylight, color_notes, designer_notes, concept, sort_order)
    VALUES (@id, @project_id, @parent_room_id, @name, @room_type, @floor_level, @dimensions, @orientation, @daylight, @color_notes, @designer_notes, @concept, @sort_order)
  `).run({ id: roomId, ...input, parent_room_id: input.parent_room_id || null });
  res.status(201).json(db.prepare("SELECT * FROM rooms WHERE id = ?").get(roomId));
});

// Atmospheric / room concept image used in the editorial shopping spread.
router.post("/:id/image", upload.single("image"), (req, res) => {
  const current = db.prepare("SELECT image_path FROM rooms WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Ruimte niet gevonden" });
  db.prepare("UPDATE rooms SET image_path = ? WHERE id = ?").run(req.file?.path || "", req.params.id);
  if (req.file && current.image_path && current.image_path !== req.file.path) {
    removeUpload(current.image_path);
  }
  res.json(db.prepare("SELECT * FROM rooms WHERE id = ?").get(req.params.id));
});

// Room ordering: { order: [ids] } -> sort_order by index.
router.put("/reorder", (req, res) => {
  const order = req.body.order;
  if (!Array.isArray(order)) return res.status(400).json({ error: "Ongeldige volgorde" });
  const update = db.prepare("UPDATE rooms SET sort_order = ? WHERE id = ?");
  const apply = db.transaction((ids) => {
    ids.forEach((roomId, index) => update.run(index, roomId));
  });
  apply(order);
  res.json({ ok: true });
});

router.put("/:id", (req, res) => {
  const input = schema.partial().parse(req.body);
  // .partial() still fills .default() values for omitted keys, so restrict the
  // update to columns the client actually sent — otherwise a partial edit would
  // reset untouched columns (e.g. sort_order) to their defaults.
  const fields = Object.keys(input).filter((field) => field in req.body);
  if (fields.length) {
    db.prepare(`UPDATE rooms SET ${fields.map((field) => `${field} = @${field}`).join(", ")} WHERE id = @id`).run({
      id: req.params.id,
      ...input,
      parent_room_id: input.parent_room_id || null
    });
  }
  res.json(db.prepare("SELECT * FROM rooms WHERE id = ?").get(req.params.id));
});

router.delete("/:id", (req, res) => {
  db.prepare("UPDATE rooms SET parent_room_id = NULL WHERE parent_room_id = ?").run(req.params.id);
  db.prepare("UPDATE floorplans SET room_id = NULL WHERE room_id = ?").run(req.params.id);
  db.prepare("UPDATE moodboards SET room_id = NULL WHERE room_id = ?").run(req.params.id);
  db.prepare("UPDATE project_products SET room_id = NULL WHERE room_id = ?").run(req.params.id);
  db.prepare("DELETE FROM rooms WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

module.exports = router;
