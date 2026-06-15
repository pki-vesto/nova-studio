const express = require("express");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { db } = require("../db/database");
const { id } = require("./utils");
const { upload, removeUpload } = require("./uploads");
const { validateBody, z } = require("./validate");

const router = express.Router();
const exportDir = process.env.NOVA_EXPORT_DIR || path.join(process.cwd(), "data", "exports");
fs.mkdirSync(exportDir, { recursive: true });

const schema = z.object({
  project_id: z.string().min(1),
  parent_room_id: z.string().optional(),
  name: z.string().min(1),
  room_type: z.string().optional(),
  floor_level: z.string().optional(),
  dimensions: z.string().optional(),
  orientation: z.string().optional(),
  daylight: z.string().optional(),
  color_notes: z.string().optional(),
  designer_notes: z.string().optional(),
  concept: z.string().optional(),
  sort_order: z.coerce.number().int().optional()
});

const reorderSchema = z.object({
  order: z.array(z.string()).optional()
});

function slug(value) {
  return String(value || "afwerkstaat")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "afwerkstaat";
}

function finishScheduleBundle(roomId) {
  const room = db.prepare(`
    SELECT r.*, p.title AS project_title, p.address AS project_address, p.location AS project_location
    FROM rooms r
    JOIN projects p ON p.id = r.project_id
    WHERE r.id = ?
  `).get(roomId);
  if (!room) return null;
  const colors = db.prepare(`
    SELECT rc.*,
      COALESCE(NULLIF(rc.name, ''), cl.name, '') AS resolved_name,
      COALESCE(NULLIF(NULLIF(rc.hex, ''), '#cccccc'), cl.hex, rc.hex, '') AS resolved_hex,
      cl.name AS library_name,
      cl.hex AS library_hex,
      cl.brand AS library_brand,
      cl.code AS library_code,
      cl.finish AS library_finish
    FROM room_colors rc
    LEFT JOIN color_library cl ON cl.id = rc.color_id
    WHERE rc.room_id = ?
    ORDER BY rc.created_at, rc.name
  `).all(roomId);
  const materials = db.prepare(`
    SELECT id, project_id, name, spec, application, brand, code, maintenance, sustainability_score, sample_status, supplier_id, library_id
    FROM materials
    WHERE project_id = ?
    ORDER BY sort_order, name
  `).all(room.project_id);
  return {
    room,
    project: {
      id: room.project_id,
      title: room.project_title || "",
      address: room.project_address || "",
      location: room.project_location || ""
    },
    notes: {
      designer_notes: room.designer_notes || "",
      color_notes: room.color_notes || "",
      concept: room.concept || ""
    },
    colors,
    materials
  };
}

function writeSection(doc, title) {
  doc.moveDown(1.1).font("Helvetica-Bold").fontSize(15).fillColor("#2d2926").text(title);
  doc.moveTo(54, doc.y + 6).lineTo(558, doc.y + 6).strokeColor("#d8cec2").stroke();
  doc.moveDown(0.8).font("Helvetica").fontSize(10).fillColor("#2d2926");
}

function renderTable(doc, columns, rows, emptyText) {
  if (!rows.length) {
    doc.font("Helvetica").fontSize(10).fillColor("#6f655c").text(emptyText);
    return;
  }
  const startX = 54;
  const drawHeader = () => {
    let x = startX;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#6f655c");
    columns.forEach((col) => {
      doc.text(col.label, x, doc.y, { width: col.width, lineBreak: false });
      x += col.width;
    });
    doc.moveDown(0.3);
    doc.moveTo(startX, doc.y).lineTo(558, doc.y).strokeColor("#d8cec2").stroke();
    doc.moveDown(0.2);
  };
  drawHeader();
  doc.font("Helvetica").fontSize(9).fillColor("#2d2926");
  rows.forEach((cells) => {
    if (doc.y > 760) {
      doc.addPage();
      drawHeader();
      doc.font("Helvetica").fontSize(9).fillColor("#2d2926");
    }
    const rowY = doc.y;
    let x = startX;
    columns.forEach((col, index) => {
      doc.text(String(cells[index] || ""), x, rowY, { width: col.width, lineBreak: false });
      x += col.width;
    });
    doc.y = rowY + 18;
  });
}

function renderFinishSchedulePdf(bundle, outputPath) {
  return new Promise((resolve, reject) => {
    const title = `Afwerkstaat - ${bundle.room.name}`;
    const doc = new PDFDocument({ size: "A4", margin: 54, compress: false, info: { Title: title } });
    const stream = fs.createWriteStream(outputPath);
    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.pipe(stream);

    doc.font("Helvetica-Bold").fontSize(28).fillColor("#2d2926").text("Afwerkstaat", 54, 72);
    doc.font("Helvetica").fontSize(12).fillColor("#6f655c")
      .text([bundle.project.title, bundle.room.name].filter(Boolean).join(" | "), 54, 112);
    doc.fontSize(10).fillColor("#a47755")
      .text([bundle.room.floor_level, bundle.room.room_type, bundle.room.dimensions].filter(Boolean).join(" | "), 54, 134);

    writeSection(doc, "Kleuren");
    renderTable(doc, [
      { label: "Toepassing", width: 134 },
      { label: "Naam", width: 160 },
      { label: "Hex/code", width: 104 },
      { label: "Finish", width: 106 }
    ], bundle.colors.map((color) => [
      color.application || "",
      color.resolved_name || color.library_name || "",
      [color.resolved_hex || color.library_hex || "", color.library_code || ""].filter(Boolean).join(" / "),
      color.library_finish || ""
    ]), "Geen kleuren vastgelegd.");

    writeSection(doc, "Materialen");
    renderTable(doc, [
      { label: "Materiaal", width: 144 },
      { label: "Specificatie", width: 154 },
      { label: "Toepassing", width: 116 },
      { label: "Onderhoud", width: 90 }
    ], bundle.materials.map((material) => [
      [material.name, material.brand, material.code].filter(Boolean).join(" - "),
      material.spec || "",
      material.application || "",
      material.maintenance || ""
    ]), "Geen materialen vastgelegd.");

    writeSection(doc, "Notities");
    const notes = [
      ["Concept", bundle.notes.concept],
      ["Kleurnotities", bundle.notes.color_notes],
      ["Ontwerpnotities", bundle.notes.designer_notes]
    ].filter(([, value]) => value && String(value).trim());
    if (!notes.length) {
      doc.font("Helvetica").fontSize(10).fillColor("#6f655c").text("Geen notities vastgelegd.");
    } else {
      notes.forEach(([label, value]) => {
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#2d2926").text(`${label}: `, { continued: true })
          .font("Helvetica").text(value, { lineGap: 4 });
      });
    }

    doc.end();
  });
}

router.post("/", validateBody(schema), (req, res) => {
  const roomId = id("room");
  db.prepare(`
    INSERT INTO rooms (id, project_id, parent_room_id, name, room_type, floor_level, dimensions, orientation, daylight, color_notes, designer_notes, concept, sort_order)
    VALUES (@id, @project_id, @parent_room_id, @name, @room_type, @floor_level, @dimensions, @orientation, @daylight, @color_notes, @designer_notes, @concept, @sort_order)
  `).run({
    id: roomId,
    project_id: req.body.project_id,
    parent_room_id: req.body.parent_room_id || null,
    name: req.body.name,
    room_type: req.body.room_type || "",
    floor_level: req.body.floor_level || "",
    dimensions: req.body.dimensions || "",
    orientation: req.body.orientation || "",
    daylight: req.body.daylight || "",
    color_notes: req.body.color_notes || "",
    designer_notes: req.body.designer_notes || "",
    concept: req.body.concept || "",
    sort_order: req.body.sort_order ?? 0
  });
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
router.put("/reorder", validateBody(reorderSchema), (req, res) => {
  const order = req.body.order;
  if (!Array.isArray(order)) return res.status(400).json({ error: "Ongeldige volgorde" });
  const update = db.prepare("UPDATE rooms SET sort_order = ? WHERE id = ?");
  const apply = db.transaction((ids) => {
    ids.forEach((roomId, index) => update.run(index, roomId));
  });
  apply(order);
  res.json({ ok: true });
});

router.put("/:id", validateBody(schema, { partial: true }), (req, res) => {
  // validateBody merges coerced values onto req.body and leaves absent optionals
  // absent, so restrict the update to columns the client actually sent — otherwise
  // a partial edit would reset untouched columns to defaults.
  const fields = Object.keys(schema.shape).filter((field) => field in req.body);
  if (fields.length) {
    const input = {};
    fields.forEach((field) => { input[field] = req.body[field]; });
    db.prepare(`UPDATE rooms SET ${fields.map((field) => `${field} = @${field}`).join(", ")} WHERE id = @id`).run({
      id: req.params.id,
      ...input,
      parent_room_id: input.parent_room_id || null
    });
  }
  res.json(db.prepare("SELECT * FROM rooms WHERE id = ?").get(req.params.id));
});

router.get("/:id/finish-schedule", (req, res) => {
  const bundle = finishScheduleBundle(req.params.id);
  if (!bundle) return res.status(404).json({ error: "Ruimte niet gevonden" });
  res.json(bundle);
});

router.post("/:id/finish-schedule.pdf", async (req, res) => {
  const bundle = finishScheduleBundle(req.params.id);
  if (!bundle) return res.status(404).json({ error: "Ruimte niet gevonden" });
  const fileName = `${slug(bundle.project.title)}-${slug(bundle.room.name)}-afwerkstaat.pdf`;
  const outputPath = path.join(exportDir, fileName);
  await renderFinishSchedulePdf(bundle, outputPath);
  res.json({ url: `/exports/${fileName}`, path: outputPath, filename: fileName });
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
