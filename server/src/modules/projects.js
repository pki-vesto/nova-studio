const express = require("express");
const { z } = require("zod");
const { db } = require("../db/database");
const { id, parseJson, uploadUrl } = require("./utils");
const { upload, removeUpload } = require("./uploads");
const { seedSampleProject } = require("./seed");
const { stampOwnership, visibleProjectWhere } = require("./authorization");
const { hasPagination, parsePagination, paginationSql, setPaginationHeaders } = require("./pagination");
const { safePromote } = require("./knowledgeSync");

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

function scopedProject(req, projectId) {
  const scope = visibleProjectWhere(req, "p");
  return db.prepare(`SELECT p.* FROM projects p WHERE p.id = @id AND ${scope.sql}`).get({ id: projectId, ...scope.params });
}

function rows(table, where, param, order = "created_at") {
  return db.prepare(`SELECT * FROM ${table} WHERE ${where} = ? ORDER BY ${order}`).all(param);
}

function projectBundle(projectId) {
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
  if (!project) return null;
  const client = project.client_id ? db.prepare("SELECT * FROM clients WHERE id = ?").get(project.client_id) : null;
  const intake = db.prepare("SELECT * FROM intake WHERE project_id = ?").get(projectId);
  const rooms = rows("rooms", "project_id", projectId, "sort_order, name");
  const materials = rows("materials", "project_id", projectId, "sort_order, name");
  const floorplans = rows("floorplans", "project_id", projectId, "created_at").map((fp) => ({
    ...fp,
    objects: rows("floorplan_objects", "floorplan_id", fp.id, "layer, sort_order")
  }));
  const moodboards = rows("moodboards", "project_id", projectId, "created_at").map((mb) => ({
    ...mb,
    assets: rows("moodboard_assets", "moodboard_id", mb.id, "sort_order, created_at")
  }));
  const selections = rows("project_products", "project_id", projectId, "sort_order").map((selection) => ({
    ...selection,
    product: db.prepare("SELECT * FROM products WHERE id = ?").get(selection.product_id)
  }));
  const proposalExportTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'proposal_exports'").get();
  const proposals = rows("proposals", "project_id", projectId, "created_at").map((proposal) => ({
    ...proposal,
    sections: rows("proposal_sections", "proposal_id", proposal.id, "sort_order"),
    comments: rows("proposal_comments", "proposal_id", proposal.id, "created_at"),
    exports: proposalExportTable ? rows("proposal_exports", "proposal_id", proposal.id, "created_at") : []
  }));
  const tasks = rows("project_tasks", "project_id", projectId, "sort_order, created_at");
  const milestones = rows("project_milestones", "project_id", projectId, "sort_order, target_date");
  const documents = rows("project_documents", "project_id", projectId, "created_at");
  return {
    bundle_type: "nova.project",
    version: 1,
    exported_at: new Date().toISOString(),
    project,
    client,
    intake,
    rooms,
    materials,
    floorplans,
    moodboards,
    selections,
    proposals,
    tasks,
    milestones,
    documents
  };
}

function importProjectBundle(bundle, req) {
  if (!bundle || bundle.bundle_type !== "nova.project" || Number(bundle.version) !== 1 || !bundle.project) {
    const err = new Error("Ongeldige projectbundel");
    err.status = 400;
    throw err;
  }
  const source = bundle.project;
  const newProjectId = id("project");
  const clientId = id("client");
  const roomIdMap = new Map();
  const materialIdMap = new Map();
  const productIdMap = new Map();
  const floorplanIdMap = new Map();
  const moodboardIdMap = new Map();
  const proposalIdMap = new Map();
  const sectionIdMap = new Map();

  const tx = db.transaction(() => {
    if (bundle.client) {
      db.prepare(`
        INSERT INTO clients (id, name, company, email, phone, address, preferences_json, notes, studio_id, owner_id)
        VALUES (@id, @name, @company, @email, @phone, @address, @preferences_json, @notes, @studio_id, @owner_id)
      `).run(stampOwnership({
        id: clientId,
        name: bundle.client.name || "Geimporteerde klant",
        company: bundle.client.company || "",
        email: bundle.client.email || "",
        phone: bundle.client.phone || "",
        address: bundle.client.address || "",
        preferences_json: bundle.client.preferences_json || "{}",
        notes: bundle.client.notes || "",
        studio_id: null,
        owner_id: null
      }, req.user));
    }
    db.prepare(`
      INSERT INTO projects (
        id, client_id, title, status, is_template, template_name, address, brief, budget_total,
        location, project_type, surface, style, lead, delivery, vision, summary,
        goals_json, principles_json, palette_json, budget_lines_json, hero_image_path,
        studio_id, owner_id
      ) VALUES (
        @id, @client_id, @title, @status, @is_template, @template_name, @address, @brief, @budget_total,
        @location, @project_type, @surface, @style, @lead, @delivery, @vision, @summary,
        @goals_json, @principles_json, @palette_json, @budget_lines_json, @hero_image_path,
        @studio_id, @owner_id
      )
    `).run(stampOwnership({
      id: newProjectId,
      client_id: bundle.client ? clientId : null,
      title: `${source.title || "Project"} import`,
      status: source.status || "active",
      is_template: Number(source.is_template || 0),
      template_name: source.template_name || "",
      address: source.address || "",
      brief: source.brief || "",
      budget_total: Number(source.budget_total || 0),
      location: source.location || "",
      project_type: source.project_type || "",
      surface: source.surface || "",
      style: source.style || "",
      lead: source.lead || "",
      delivery: source.delivery || "",
      vision: source.vision || "",
      summary: source.summary || "",
      goals_json: source.goals_json || "[]",
      principles_json: source.principles_json || "[]",
      palette_json: source.palette_json || "[]",
      budget_lines_json: source.budget_lines_json || "[]",
      hero_image_path: source.hero_image_path || "",
      studio_id: null,
      owner_id: null
    }, req.user));

    if (bundle.intake) {
      db.prepare(`
        INSERT INTO intake (project_id, household, wishes, room_use, style_preferences, color_preferences, budget_indication, existing_furniture, constraints, free_notes, ai_summary, scope_estimate, risks_json, followups_json)
        VALUES (@project_id, @household, @wishes, @room_use, @style_preferences, @color_preferences, @budget_indication, @existing_furniture, @constraints, @free_notes, @ai_summary, @scope_estimate, @risks_json, @followups_json)
      `).run({ ...bundle.intake, project_id: newProjectId });
    } else {
      db.prepare("INSERT INTO intake (project_id) VALUES (?)").run(newProjectId);
    }

    const insertRoom = db.prepare(`
      INSERT INTO rooms (id, project_id, parent_room_id, name, room_type, floor_level, dimensions, orientation, daylight, color_notes, designer_notes, concept, image_path, sort_order)
      VALUES (@id, @project_id, NULL, @name, @room_type, @floor_level, @dimensions, @orientation, @daylight, @color_notes, @designer_notes, @concept, @image_path, @sort_order)
    `);
    (bundle.rooms || []).forEach((room) => {
      const newRoomId = id("room");
      roomIdMap.set(room.id, newRoomId);
      insertRoom.run({ ...room, id: newRoomId, project_id: newProjectId });
    });
    const updateParent = db.prepare("UPDATE rooms SET parent_room_id = ? WHERE id = ?");
    (bundle.rooms || []).forEach((room) => {
      if (room.parent_room_id && roomIdMap.has(room.parent_room_id)) updateParent.run(roomIdMap.get(room.parent_room_id), roomIdMap.get(room.id));
    });

    const insertMaterial = db.prepare(`
      INSERT INTO materials (id, project_id, name, spec, application, image_path, sort_order, brand, code, maintenance, sustainability_score, sample_status, sample_requested_at, sample_received_at, supplier_id, library_id)
      VALUES (@id, @project_id, @name, @spec, @application, @image_path, @sort_order, @brand, @code, @maintenance, @sustainability_score, @sample_status, @sample_requested_at, @sample_received_at, @supplier_id, @library_id)
    `);
    (bundle.materials || []).forEach((m) => {
      const newMaterialId = id("material");
      materialIdMap.set(m.id, newMaterialId);
      insertMaterial.run({ ...m, id: newMaterialId, project_id: newProjectId });
    });

    const insertProduct = db.prepare(`
      INSERT INTO products (id, name, brand, supplier, category, collection, sku, dimensions, lead_time, designer, alternative_to_id, image_path, price, webshop_url, description, notes, tags, status, supplier_id, parent_product_id, purchase_price, sale_price, margin, vat_rate, availability_status, price_date)
      VALUES (@id, @name, @brand, @supplier, @category, @collection, @sku, @dimensions, @lead_time, @designer, NULL, @image_path, @price, @webshop_url, @description, @notes, @tags, @status, @supplier_id, NULL, @purchase_price, @sale_price, @margin, @vat_rate, @availability_status, @price_date)
    `);
    (bundle.selections || []).forEach((selection) => {
      const product = selection.product;
      if (!product || !selection.product_id) return;
      const existing = db.prepare("SELECT id FROM products WHERE id = ?").get(selection.product_id);
      if (existing) {
        productIdMap.set(selection.product_id, selection.product_id);
      } else {
        const newProductId = id("product");
        productIdMap.set(selection.product_id, newProductId);
        insertProduct.run({ ...product, id: newProductId });
      }
    });

    const insertSelection = db.prepare(`
      INSERT INTO project_products (id, project_id, room_id, product_id, quantity, sort_order, designer_note, fit_reason, is_feature, item_status, client_comment, is_alternative)
      VALUES (@id, @project_id, @room_id, @product_id, @quantity, @sort_order, @designer_note, @fit_reason, @is_feature, @item_status, @client_comment, @is_alternative)
    `);
    (bundle.selections || []).forEach((selection) => {
      const productId = productIdMap.get(selection.product_id);
      if (!productId) return;
      insertSelection.run({
        ...selection,
        id: id("selection"),
        project_id: newProjectId,
        room_id: selection.room_id && roomIdMap.has(selection.room_id) ? roomIdMap.get(selection.room_id) : null,
        product_id: productId
      });
    });

    const insertFloorplan = db.prepare(`
      INSERT INTO floorplans (id, project_id, room_id, name, floor_level, file_path, file_name, north_angle, drawing_json, notes, scale_ratio, scale_unit, version, thumb_path)
      VALUES (@id, @project_id, @room_id, @name, @floor_level, @file_path, @file_name, @north_angle, @drawing_json, @notes, @scale_ratio, @scale_unit, @version, @thumb_path)
    `);
    const insertFloorObject = db.prepare(`
      INSERT INTO floorplan_objects (id, floorplan_id, layer, kind, geometry_json, label, sort_order, product_id, material_id)
      VALUES (@id, @floorplan_id, @layer, @kind, @geometry_json, @label, @sort_order, @product_id, @material_id)
    `);
    (bundle.floorplans || []).forEach((fp) => {
      const newFloorplanId = id("floorplan");
      floorplanIdMap.set(fp.id, newFloorplanId);
      insertFloorplan.run({
        ...fp,
        id: newFloorplanId,
        project_id: newProjectId,
        room_id: fp.room_id && roomIdMap.has(fp.room_id) ? roomIdMap.get(fp.room_id) : null
      });
      (fp.objects || []).forEach((obj) => insertFloorObject.run({
        ...obj,
        id: id("fpobj"),
        floorplan_id: newFloorplanId,
        product_id: obj.product_id && productIdMap.has(obj.product_id) ? productIdMap.get(obj.product_id) : null,
        material_id: obj.material_id && materialIdMap.has(obj.material_id) ? materialIdMap.get(obj.material_id) : null
      }));
    });

    const insertMoodboard = db.prepare(`
      INSERT INTO moodboards (id, project_id, room_id, title, description, colors_json, materials_json, variant_of_id, variant_label, layout_json)
      VALUES (@id, @project_id, @room_id, @title, @description, @colors_json, @materials_json, NULL, @variant_label, @layout_json)
    `);
    const insertAsset = db.prepare(`
      INSERT INTO moodboard_assets (id, moodboard_id, file_path, file_name, caption, source_url, tags, sort_order)
      VALUES (@id, @moodboard_id, @file_path, @file_name, @caption, @source_url, @tags, @sort_order)
    `);
    (bundle.moodboards || []).forEach((mb) => {
      const newMoodboardId = id("moodboard");
      moodboardIdMap.set(mb.id, newMoodboardId);
      insertMoodboard.run({
        ...mb,
        id: newMoodboardId,
        project_id: newProjectId,
        room_id: mb.room_id && roomIdMap.has(mb.room_id) ? roomIdMap.get(mb.room_id) : null
      });
      (mb.assets || []).forEach((asset) => insertAsset.run({ ...asset, id: id("asset"), moodboard_id: newMoodboardId }));
    });
    const updateVariant = db.prepare("UPDATE moodboards SET variant_of_id = ? WHERE id = ?");
    (bundle.moodboards || []).forEach((mb) => {
      if (mb.variant_of_id && moodboardIdMap.has(mb.variant_of_id)) updateVariant.run(moodboardIdMap.get(mb.variant_of_id), moodboardIdMap.get(mb.id));
    });

    const insertProposal = db.prepare(`
      INSERT INTO proposals (id, project_id, title, intro_text, style_direction, color_advice, closing_text, generated_pdf_path, version, status, summary, accepted_at)
      VALUES (@id, @project_id, @title, @intro_text, @style_direction, @color_advice, @closing_text, @generated_pdf_path, @version, @status, @summary, @accepted_at)
    `);
    const insertSection = db.prepare(`
      INSERT INTO proposal_sections (id, proposal_id, kind, title, body, audience, is_enabled, sort_order)
      VALUES (@id, @proposal_id, @kind, @title, @body, @audience, @is_enabled, @sort_order)
    `);
    const insertComment = db.prepare(`
      INSERT INTO proposal_comments (id, proposal_id, section_id, author, body)
      VALUES (@id, @proposal_id, @section_id, @author, @body)
    `);
    (bundle.proposals || []).forEach((proposal) => {
      const newProposalId = id("proposal");
      proposalIdMap.set(proposal.id, newProposalId);
      insertProposal.run({ ...proposal, id: newProposalId, project_id: newProjectId });
      (proposal.sections || []).forEach((section) => {
        const newSectionId = id("psection");
        sectionIdMap.set(section.id, newSectionId);
        insertSection.run({ ...section, id: newSectionId, proposal_id: newProposalId });
      });
      (proposal.comments || []).forEach((comment) => insertComment.run({
        ...comment,
        id: id("pcomment"),
        proposal_id: newProposalId,
        section_id: comment.section_id && sectionIdMap.has(comment.section_id) ? sectionIdMap.get(comment.section_id) : null
      }));
    });

    const insertTask = db.prepare(`
      INSERT INTO project_tasks (id, project_id, room_id, title, status, due_date, linked_proposal_status, sort_order)
      VALUES (@id, @project_id, @room_id, @title, @status, @due_date, @linked_proposal_status, @sort_order)
    `);
    (bundle.tasks || []).forEach((task) => insertTask.run({
      ...task,
      id: id("task"),
      project_id: newProjectId,
      room_id: task.room_id && roomIdMap.has(task.room_id) ? roomIdMap.get(task.room_id) : null
    }));
    const insertMilestone = db.prepare(`
      INSERT INTO project_milestones (id, project_id, title, target_date, done, sort_order)
      VALUES (@id, @project_id, @title, @target_date, @done, @sort_order)
    `);
    (bundle.milestones || []).forEach((milestone) => insertMilestone.run({ ...milestone, id: id("milestone"), project_id: newProjectId }));
    const insertDocument = db.prepare(`
      INSERT INTO project_documents (id, project_id, kind, title, file_path, file_name)
      VALUES (@id, @project_id, @kind, @title, @file_path, @file_name)
    `);
    (bundle.documents || []).forEach((doc) => insertDocument.run({ ...doc, id: id("doc"), project_id: newProjectId }));
  });
  tx();
  return newProjectId;
}

function promoteProject(row) {
  if (!row) return;
  safePromote("project", row.id, row.title, {
    title: row.title || "",
    status: row.status || "",
    client_id: row.client_id || "",
    project_type: row.project_type || "",
    style: row.style || ""
  });
}

router.get("/", (req, res) => {
  const q = `%${req.query.q || ""}%`;
  const status = req.query.status || "";
  const templates = req.query.templates === "1";
  const scope = visibleProjectWhere(req, "p");
  const paged = hasPagination(req.query);
  const page = parsePagination(req.query);
  const params = { q, status, is_template: templates ? 1 : 0, ...scope.params, ...page };
  if (paged) {
    const total = db.prepare(`
      SELECT COUNT(*) AS total
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      WHERE (p.title LIKE @q OR c.name LIKE @q OR p.address LIKE @q)
        AND (@status = '' OR p.status = @status)
        AND p.is_template = @is_template
        AND (p.deleted_at IS NULL OR p.deleted_at = '')
        AND ${scope.sql}
    `).get(params).total;
    setPaginationHeaders(res, { total, ...page });
  }
  const projects = db.prepare(`
    SELECT p.*, c.name AS client_name
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE (p.title LIKE @q OR c.name LIKE @q OR p.address LIKE @q)
      AND (@status = '' OR p.status = @status)
      AND p.is_template = @is_template
      AND (p.deleted_at IS NULL OR p.deleted_at = '')
      AND ${scope.sql}
    ORDER BY p.updated_at DESC
    ${paginationSql(paged)}
  `).all(params);
  res.json(projects);
});

router.post("/", (req, res) => {
  const input = projectSchema.parse(req.body);
  const clientId = input.client_id || id("client");
  const projectId = id("project");
  const tx = db.transaction(() => {
    if (!input.client_id) {
      db.prepare(`
        INSERT INTO clients (id, name, email, phone, address, studio_id, owner_id)
        VALUES (@id, @name, @email, @phone, @address, @studio_id, @owner_id)
      `).run(stampOwnership({
        id: clientId,
        name: input.clientName || "Nieuwe klant",
        email: input.clientEmail,
        phone: input.clientPhone,
        address: input.address,
        studio_id: null,
        owner_id: null
      }, req.user));
    }
    db.prepare(`
      INSERT INTO projects (id, client_id, title, status, is_template, template_name, address, brief, budget_total, studio_id, owner_id)
      VALUES (@id, @client_id, @title, @status, @is_template, @template_name, @address, @brief, @budget_total, @studio_id, @owner_id)
    `).run(stampOwnership({
      id: projectId,
      client_id: clientId,
      title: input.title,
      status: input.status,
      is_template: input.is_template,
      template_name: input.template_name,
      address: input.address,
      brief: input.brief,
      budget_total: input.budget_total,
      studio_id: null,
      owner_id: null
    }, req.user));
    db.prepare("INSERT INTO intake (project_id) VALUES (?)").run(projectId);
  });
  tx();
  const project = db.prepare(`
    SELECT p.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone
    FROM projects p LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = ?
  `).get(projectId);
  promoteProject(project);
  res.status(201).json(hydrateProject(project));
});

router.get("/:id", (req, res) => {
  const scope = visibleProjectWhere(req, "p");
  const row = db.prepare(`
    SELECT p.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone, c.notes AS client_notes
    FROM projects p LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.id = @id AND ${scope.sql}
  `).get({ id: req.params.id, ...scope.params });
  if (!row) return res.status(404).json({ error: "Project niet gevonden" });
  res.json(hydrateProject(row));
});

router.get("/:id/export.json", (req, res) => {
  const source = scopedProject(req, req.params.id);
  if (!source) return res.status(404).json({ error: "Project niet gevonden" });
  const bundle = projectBundle(req.params.id);
  const safe = (bundle.project.title || "project").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${safe}-projectbundel.json"`);
  res.json(bundle);
});

router.post("/import", (req, res, next) => {
  try {
    const projectId = importProjectBundle(req.body, req);
    res.status(201).json(hydrateProject(scopedProject(req, projectId)));
  } catch (err) {
    next(err);
  }
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
  const scope = visibleProjectWhere(req, "p");
  const project = db.prepare(`SELECT p.* FROM projects p WHERE p.id = @id AND ${scope.sql}`).get({ id: req.params.id, ...scope.params });
  promoteProject(project);
  res.json(hydrateProject(project));
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
  const scope = visibleProjectWhere(req, "p");
  res.json(hydrateProject(db.prepare(`SELECT p.* FROM projects p WHERE p.id = @id AND ${scope.sql}`).get({ id: req.params.id, ...scope.params })));
});

// Opt-in: populate a fully worked sample project (Herenhuis aan de Keizersgracht).
router.post("/seed-sample", (req, res) => {
  const projectId = seedSampleProject();
  const owned = stampOwnership({ studio_id: null, owner_id: null }, req.user);
  if (owned.owner_id || owned.studio_id) {
    db.prepare("UPDATE projects SET studio_id = COALESCE(studio_id, @studio_id), owner_id = COALESCE(owner_id, @owner_id) WHERE id = @id")
      .run({ id: projectId, ...owned });
  }
  res.status(201).json(hydrateProject(db.prepare(`
    SELECT p.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone
    FROM projects p LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = ?
  `).get(projectId)));
});

router.post("/:id/archive", (req, res) => {
  db.prepare("UPDATE projects SET status = 'archived', archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
  res.json(hydrateProject(scopedProject(req, req.params.id)));
});

router.post("/:id/restore", (req, res) => {
  db.prepare("UPDATE projects SET status = 'active', archived_at = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
  res.json(hydrateProject(scopedProject(req, req.params.id)));
});

// Soft delete: keep the row, flag it as deleted (recoverable via /undelete).
router.delete("/:id", (req, res) => {
  const current = db.prepare("SELECT id FROM projects WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Project niet gevonden" });
  db.prepare("UPDATE projects SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
  res.json(hydrateProject(scopedProject(req, req.params.id)));
});

router.post("/:id/undelete", (req, res) => {
  const current = db.prepare("SELECT id FROM projects WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Project niet gevonden" });
  db.prepare("UPDATE projects SET deleted_at = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
  res.json(hydrateProject(scopedProject(req, req.params.id)));
});

router.post("/:id/duplicate", (req, res) => {
  const source = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
  if (!source) return res.status(404).json({ error: "Project niet gevonden" });
  const newId = id("project");
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO projects (id, client_id, title, status, is_template, template_name, address, brief, budget_total, studio_id, owner_id)
      VALUES (@id, @client_id, @title, 'active', 0, '', @address, @brief, @budget_total, @studio_id, @owner_id)
    `).run(stampOwnership({
      id: newId,
      client_id: source.client_id,
      title: req.body.title || `${source.title} kopie`,
      address: source.address,
      brief: source.brief,
      budget_total: source.budget_total,
      studio_id: source.studio_id || null,
      owner_id: source.owner_id || null
    }, req.user));
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
  res.status(201).json(hydrateProject(scopedProject(req, newId)));
});

module.exports = router;
