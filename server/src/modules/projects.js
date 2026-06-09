const express = require("express");
const { z } = require("zod");
const { db } = require("../db/database");
const { id, parseJson, uploadUrl } = require("./utils");
const { upload, removeUpload } = require("./uploads");
const { seedSampleProject } = require("./seed");

const router = express.Router();

const projectSchema = z.object({
  client_id: z.string().optional().default(""),
  clientName: z.string().optional().default("Nieuwe klant"),
  clientEmail: z.string().optional().default(""),
  clientPhone: z.string().optional().default(""),
  title: z.string().min(1),
  status: z.string().optional().default("active"),
  is_template: z.coerce.number().optional().default(0),
  template_name: z.string().optional().default(""),
  address: z.string().optional().default(""),
  brief: z.string().optional().default(""),
  budget_total: z.coerce.number().optional().default(0)
});

function hydrateProject(row) {
  if (!row) return null;
  const rooms = db.prepare("SELECT * FROM rooms WHERE project_id = ? ORDER BY sort_order, name").all(row.id)
    .map((room) => ({ ...room, image_url: uploadUrl(room.image_path) }));
  const intake = db.prepare("SELECT * FROM intake WHERE project_id = ?").get(row.id);
  const products = db.prepare(`
    SELECT pp.*, p.name, p.brand, p.supplier, p.category, p.price, p.image_path, p.webshop_url, p.description, p.designer,
      r.name AS room_name
    FROM project_products pp
    JOIN products p ON p.id = pp.product_id
    LEFT JOIN rooms r ON r.id = pp.room_id
    WHERE pp.project_id = ?
    ORDER BY pp.sort_order, p.category, p.name
  `).all(row.id).map((p) => ({ ...p, image_url: uploadUrl(p.image_path) }));
  const materials = db.prepare("SELECT * FROM materials WHERE project_id = ? ORDER BY sort_order, name").all(row.id)
    .map((m) => ({ ...m, image_url: uploadUrl(m.image_path) }));
  return {
    ...row,
    hero_image_url: uploadUrl(row.hero_image_path),
    goals: parseJson(row.goals_json, []),
    principles: parseJson(row.principles_json, []),
    palette: parseJson(row.palette_json, []),
    budget_lines: parseJson(row.budget_lines_json, []),
    rooms,
    intake,
    products,
    materials
  };
}

router.get("/", (req, res) => {
  const q = `%${req.query.q || ""}%`;
  const status = req.query.status || "";
  const templates = req.query.templates === "1";
  const projects = db.prepare(`
    SELECT p.*, c.name AS client_name
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE (p.title LIKE @q OR c.name LIKE @q OR p.address LIKE @q)
      AND (@status = '' OR p.status = @status)
      AND p.is_template = @is_template
      AND (p.deleted_at IS NULL OR p.deleted_at = '')
    ORDER BY p.updated_at DESC
  `).all({ q, status, is_template: templates ? 1 : 0 });
  res.json(projects);
});

router.post("/", (req, res) => {
  const input = projectSchema.parse(req.body);
  const clientId = input.client_id || id("client");
  const projectId = id("project");
  const tx = db.transaction(() => {
    if (!input.client_id) {
      db.prepare("INSERT INTO clients (id, name, email, phone, address) VALUES (?, ?, ?, ?, ?)").run(
        clientId,
        input.clientName || "Nieuwe klant",
        input.clientEmail,
        input.clientPhone,
        input.address
      );
    }
    db.prepare(`
      INSERT INTO projects (id, client_id, title, status, is_template, template_name, address, brief, budget_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      projectId,
      clientId,
      input.title,
      input.status,
      input.is_template,
      input.template_name,
      input.address,
      input.brief,
      input.budget_total
    );
    db.prepare("INSERT INTO intake (project_id) VALUES (?)").run(projectId);
  });
  tx();
  res.status(201).json(hydrateProject(db.prepare(`
    SELECT p.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone
    FROM projects p LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = ?
  `).get(projectId)));
});

router.get("/:id", (req, res) => {
  const row = db.prepare(`
    SELECT p.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone, c.notes AS client_notes
    FROM projects p LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = ?
  `).get(req.params.id);
  if (!row) return res.status(404).json({ error: "Project niet gevonden" });
  res.json(hydrateProject(row));
});

router.put("/:id", (req, res) => {
  const scalarFields = [
    "client_id", "title", "status", "is_template", "template_name", "address", "brief", "budget_total",
    "location", "project_type", "surface", "style", "lead", "delivery", "vision", "summary"
  ];
  // Array fields arrive as JS arrays and are stored JSON-encoded.
  const jsonFields = { goals: "goals_json", principles: "principles_json", palette: "palette_json", budget_lines: "budget_lines_json" };

  const set = [];
  const params = { id: req.params.id };
  for (const field of scalarFields) {
    if (field in req.body) {
      set.push(`${field} = @${field}`);
      params[field] = req.body[field];
    }
  }
  for (const [key, column] of Object.entries(jsonFields)) {
    if (key in req.body) {
      set.push(`${column} = @${column}`);
      params[column] = JSON.stringify(req.body[key] || []);
    }
  }
  // Optimistic concurrency: only when the caller sends a row_version (backward compatible otherwise).
  if ("row_version" in req.body && req.body.row_version != null) {
    const stored = db.prepare("SELECT row_version FROM projects WHERE id = ?").get(req.params.id);
    if (stored && Number(stored.row_version) !== Number(req.body.row_version)) {
      return res.status(409).json({ error: "Project is intussen gewijzigd" });
    }
    set.push("row_version = row_version + 1");
  } else if (set.length) {
    set.push("row_version = row_version + 1");
  }
  if (set.length) {
    db.prepare(`UPDATE projects SET ${set.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run(params);
  }
  res.json(hydrateProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id)));
});

// Cover/hero image for the editorial proposal + presentation.
router.post("/:id/hero", upload.single("image"), (req, res) => {
  const current = db.prepare("SELECT hero_image_path FROM projects WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Project niet gevonden" });
  db.prepare("UPDATE projects SET hero_image_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(req.file?.path || "", req.params.id);
  if (req.file && current.hero_image_path && current.hero_image_path !== req.file.path) {
    removeUpload(current.hero_image_path);
  }
  res.json(hydrateProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id)));
});

// Opt-in: populate a fully worked sample project (Herenhuis aan de Keizersgracht).
router.post("/seed-sample", (_req, res) => {
  const projectId = seedSampleProject();
  res.status(201).json(hydrateProject(db.prepare(`
    SELECT p.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone
    FROM projects p LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = ?
  `).get(projectId)));
});

router.post("/:id/archive", (req, res) => {
  db.prepare("UPDATE projects SET status = 'archived', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
  res.json(hydrateProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id)));
});

router.post("/:id/restore", (req, res) => {
  db.prepare("UPDATE projects SET status = 'active', archived_at = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
  res.json(hydrateProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id)));
});

// Soft delete: keep the row, flag it as deleted (recoverable via /undelete).
router.delete("/:id", (req, res) => {
  const current = db.prepare("SELECT id FROM projects WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Project niet gevonden" });
  db.prepare("UPDATE projects SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
  res.json(hydrateProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id)));
});

router.post("/:id/undelete", (req, res) => {
  const current = db.prepare("SELECT id FROM projects WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Project niet gevonden" });
  db.prepare("UPDATE projects SET deleted_at = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
  res.json(hydrateProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id)));
});

router.post("/:id/duplicate", (req, res) => {
  const source = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
  if (!source) return res.status(404).json({ error: "Project niet gevonden" });
  const newId = id("project");
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO projects (id, client_id, title, status, is_template, template_name, address, brief, budget_total)
      VALUES (?, ?, ?, 'active', 0, '', ?, ?, ?)
    `).run(newId, source.client_id, req.body.title || `${source.title} kopie`, source.address, source.brief, source.budget_total);
    const intake = db.prepare("SELECT * FROM intake WHERE project_id = ?").get(source.id);
    if (intake) {
      db.prepare(`
        INSERT INTO intake (project_id, household, wishes, room_use, style_preferences, color_preferences, budget_indication, existing_furniture, constraints, free_notes, ai_summary)
        VALUES (@project_id, @household, @wishes, @room_use, @style_preferences, @color_preferences, @budget_indication, @existing_furniture, @constraints, @free_notes, @ai_summary)
      `).run({ ...intake, project_id: newId });
    } else {
      db.prepare("INSERT INTO intake (project_id) VALUES (?)").run(newId);
    }
    // Rooms get fresh ids; keep a map so room-scoped children can be remapped.
    const roomIdMap = new Map();
    db.prepare("SELECT * FROM rooms WHERE project_id = ? ORDER BY sort_order").all(source.id).forEach((room) => {
      const newRoomId = id("room");
      roomIdMap.set(room.id, newRoomId);
      db.prepare(`
        INSERT INTO rooms (id, project_id, parent_room_id, name, room_type, floor_level, dimensions, orientation, daylight, color_notes, designer_notes, sort_order)
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(newRoomId, newId, room.name, room.room_type, room.floor_level, room.dimensions, room.orientation, room.daylight, room.color_notes, room.designer_notes, room.sort_order);
    });

    // Materials (project-scoped; no room link).
    const insertMaterial = db.prepare(`
      INSERT INTO materials (id, project_id, name, spec, application, image_path, sort_order, brand, code, maintenance, sustainability_score, sample_status, supplier_id, library_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.prepare("SELECT * FROM materials WHERE project_id = ? ORDER BY sort_order").all(source.id).forEach((m) => {
      insertMaterial.run(id("material"), newId, m.name, m.spec, m.application, m.image_path, m.sort_order, m.brand, m.code, m.maintenance, m.sustainability_score, m.sample_status, m.supplier_id, m.library_id);
    });

    // Moodboards (room-scoped) + their assets.
    const insertMoodboard = db.prepare(`
      INSERT INTO moodboards (id, project_id, room_id, title, description, colors_json, materials_json, layout_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAsset = db.prepare(`
      INSERT INTO moodboard_assets (id, moodboard_id, file_path, file_name, caption, source_url, tags, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.prepare("SELECT * FROM moodboards WHERE project_id = ?").all(source.id).forEach((mb) => {
      const newMoodboardId = id("moodboard");
      const remappedRoomId = mb.room_id != null && roomIdMap.has(mb.room_id) ? roomIdMap.get(mb.room_id) : null;
      insertMoodboard.run(newMoodboardId, newId, remappedRoomId, mb.title, mb.description, mb.colors_json, mb.materials_json, mb.layout_json);
      db.prepare("SELECT * FROM moodboard_assets WHERE moodboard_id = ? ORDER BY sort_order").all(mb.id).forEach((a) => {
        insertAsset.run(id("asset"), newMoodboardId, a.file_path, a.file_name, a.caption, a.source_url, a.tags, a.sort_order);
      });
    });

    // Product selections (room-scoped).
    const insertSelection = db.prepare(`
      INSERT INTO project_products (id, project_id, room_id, product_id, quantity, sort_order, designer_note, fit_reason, is_feature, item_status, client_comment, is_alternative)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.prepare("SELECT * FROM project_products WHERE project_id = ? ORDER BY sort_order").all(source.id).forEach((pp) => {
      const remappedRoomId = pp.room_id != null && roomIdMap.has(pp.room_id) ? roomIdMap.get(pp.room_id) : null;
      insertSelection.run(id("selection"), newId, remappedRoomId, pp.product_id, pp.quantity, pp.sort_order, pp.designer_note, pp.fit_reason, pp.is_feature, pp.item_status, pp.client_comment, pp.is_alternative);
    });
  });
  tx();
  res.status(201).json(hydrateProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(newId)));
});

module.exports = router;
