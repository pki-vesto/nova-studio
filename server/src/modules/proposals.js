const express = require("express");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { db } = require("../db/database");
const { id } = require("./utils");
const { validateBody, z } = require("./validate");

const router = express.Router();

// --- Validation schemas ------------------------------------------------------
// JSON routes only. Optional strings keep the handlers' own `|| ""` / `?? current`
// fallbacks. project_id is required on create (NOT NULL FK used directly).
const proposalCreateSchema = z.object({
  project_id: z.string(),
  title: z.string().optional(),
  intro_text: z.string().optional(),
  style_direction: z.string().optional(),
  color_advice: z.string().optional(),
  closing_text: z.string().optional(),
  summary: z.string().optional()
});

const proposalUpdateSchema = z.object({
  title: z.string().optional(),
  intro_text: z.string().optional(),
  style_direction: z.string().optional(),
  color_advice: z.string().optional(),
  closing_text: z.string().optional(),
  summary: z.string().optional(),
  status: z.enum(["concept", "review", "sent", "accepted", "rejected"]).optional()
});

const proposalStatusSchema = z.object({
  status: z.enum(["concept", "review", "sent", "accepted", "rejected"])
});

const sectionCreateSchema = z.object({
  kind: z.string().optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  audience: z.enum(["client", "internal"]).optional(),
  is_enabled: z.coerce.number().int().optional(),
  sort_order: z.coerce.number().int().optional()
});

const sectionUpdateSchema = z.object({
  kind: z.string().optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  audience: z.enum(["client", "internal"]).optional(),
  is_enabled: z.coerce.number().int().optional(),
  sort_order: z.coerce.number().int().optional()
});

const reorderSchema = z.object({
  order: z.array(z.string()).optional()
});

const commentCreateSchema = z.object({
  section_id: z.string().optional(),
  author: z.string().optional(),
  body: z.string().optional()
});
const exportDir = process.env.NOVA_EXPORT_DIR || path.join(process.cwd(), "data", "exports");
fs.mkdirSync(exportDir, { recursive: true });

// Lowercase + non-alphanumerics → '-', collapse and trim dashes. Used for friendly filenames.
function slug(value) {
  return String(value || "voorstel")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "voorstel";
}

function projectBundle(projectId) {
  const project = db.prepare(`
    SELECT p.*, c.name AS client_name, c.email AS client_email, c.phone AS client_phone
    FROM projects p LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = ?
  `).get(projectId);
  if (!project) return null;
  return {
    project,
    intake: db.prepare("SELECT * FROM intake WHERE project_id = ?").get(projectId),
    rooms: db.prepare("SELECT * FROM rooms WHERE project_id = ? ORDER BY sort_order, name").all(projectId),
    floorplans: db.prepare("SELECT * FROM floorplans WHERE project_id = ? ORDER BY created_at DESC").all(projectId),
    moodboards: db.prepare("SELECT * FROM moodboards WHERE project_id = ? ORDER BY created_at DESC").all(projectId),
    materials: db.prepare("SELECT * FROM materials WHERE project_id = ? ORDER BY sort_order, name").all(projectId),
    products: db.prepare(`
      SELECT pp.quantity, pp.designer_note, pp.fit_reason, pp.is_feature, r.name AS room_name,
        p.name, p.brand, p.supplier, p.category, p.image_path, p.price, p.purchase_price, p.sale_price,
        p.webshop_url, p.description, p.sku, p.dimensions, p.lead_time
      FROM project_products pp
      JOIN products p ON p.id = pp.product_id
      LEFT JOIN rooms r ON r.id = pp.room_id
      WHERE pp.project_id = ?
      ORDER BY r.sort_order, r.name, p.category, p.name
    `).all(projectId)
  };
}

function writeSection(doc, title) {
  doc.moveDown(1.2).font("Helvetica-Bold").fontSize(18).fillColor("#2d2926").text(title);
  doc.moveTo(54, doc.y + 6).lineTo(558, doc.y + 6).strokeColor("#d8cec2").stroke();
  doc.moveDown(0.8).font("Helvetica").fontSize(10).fillColor("#2d2926");
}

function safeImage(doc, filePath, x, y, options) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  try {
    doc.image(filePath, x, y, options);
    return true;
  } catch {
    return false;
  }
}

// Explicit, visually distinct workflow warning for empty fields (instead of filler placeholder text).
function warn(doc, message) {
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#b4541f").text(`⚠ ${message}`, { lineGap: 4 });
  doc.font("Helvetica").fontSize(10).fillColor("#2d2926");
}

// Render a field value, or a workflow warning when it is empty.
function fieldOrWarn(doc, value, warning) {
  if (value && String(value).trim()) {
    doc.font("Helvetica").fontSize(10).fillColor("#2d2926").text(value, { lineGap: 4 });
  } else {
    warn(doc, warning);
  }
}

function pageBreakIfNeeded(doc, continuationTitle) {
  if (doc.y > 690) {
    doc.addPage();
    if (continuationTitle) writeSection(doc, continuationTitle);
  }
}

function renderIntake(doc, bundle) {
  const intake = bundle.intake || {};
  const rows = [
    ["Wensen", intake.wishes],
    ["Gebruik", intake.room_use],
    ["Stijl", intake.style_preferences],
    ["Kleur", intake.color_preferences],
    ["Budget", intake.budget_indication],
    ["Randvoorwaarden", intake.constraints]
  ].filter(([, value]) => value);
  if (!rows.length) {
    warn(doc, "Intake nog aan te vullen door de ontwerper");
    return;
  }
  rows.forEach(([label, value]) => {
    doc.font("Helvetica-Bold").fillColor("#2d2926").text(`${label}: `, { continued: true })
      .font("Helvetica").text(value, { lineGap: 3 });
  });
}

function renderRooms(doc, bundle) {
  if (!bundle.rooms.length) {
    warn(doc, "Nog geen ruimtes toegevoegd door de ontwerper");
    return;
  }
  bundle.rooms.forEach((room) => {
    pageBreakIfNeeded(doc, "Ruimtes vervolg");
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#2d2926").text(room.name);
    doc.font("Helvetica").fontSize(10).fillColor("#2d2926")
      .text([room.dimensions, room.orientation, room.daylight, room.color_notes].filter(Boolean).join(" | "), { lineGap: 3 });
    doc.moveDown(0.5);
  });
}

function renderShopping(doc, bundle) {
  if (!bundle.products.length) {
    warn(doc, "Shoppinglijst nog leeg – nog aan te vullen door de ontwerper");
    return;
  }
  const total = bundle.products.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1), 0);
  bundle.products.forEach((item, index) => {
    if (doc.y > 690) {
      doc.addPage();
      writeSection(doc, "Shoppinglijst vervolg");
    }
    const y = doc.y;
    const hasImage = safeImage(doc, item.image_path, 54, y, { fit: [118, 92] });
    if (!hasImage) {
      doc.roundedRect(54, y, 118, 92, 4).fillAndStroke("#eee7df", "#d8cec2");
    }
    doc.fillColor("#2d2926").font("Helvetica-Bold").fontSize(12).text(`${index + 1}. ${item.name}`, 190, y, { width: 330 });
    doc.font("Helvetica").fontSize(10).fillColor("#6f655c").text([item.brand, item.supplier, item.room_name].filter(Boolean).join(" | "), { width: 330 });
    doc.fillColor("#2d2926").text(`Aantal: ${item.quantity}  Prijs: EUR ${Number(item.price || 0).toFixed(2)}`, { width: 330 });
    if (item.fit_reason) doc.fillColor("#6f655c").text(item.fit_reason, { width: 330, lineGap: 2 });
    doc.y = y + 112;
  });
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#2d2926").text(`Totaalindicatie: EUR ${total.toFixed(2)}`, 54, doc.y + 10);
}

// Generic text section (kind 'text' or unknown kinds): title + body, with a warning when empty.
function renderTextSection(doc, section) {
  fieldOrWarn(doc, section.body, "Nog aan te vullen door de ontwerper");
}

// Render the structured style + color advice (used both in the default layout and the 'style' section kind).
function renderStyle(doc, proposal) {
  if (proposal.style_direction && String(proposal.style_direction).trim()) {
    doc.font("Helvetica").fontSize(10).fillColor("#2d2926").text(proposal.style_direction, { lineGap: 4 });
  } else {
    warn(doc, "Nog aan te vullen door de ontwerper");
  }
  doc.moveDown(0.5);
  if (proposal.color_advice && String(proposal.color_advice).trim()) {
    doc.font("Helvetica").fontSize(10).fillColor("#2d2926").text(proposal.color_advice, { lineGap: 4 });
  } else {
    warn(doc, "Kleuradvies nog aan te vullen door de ontwerper");
  }
}

// Simple two-pass table renderer (columns: [{label, width, align}], rows: array of arrays of strings).
function renderTable(doc, columns, rows) {
  const startX = 54;
  const lineHeight = 16;
  const drawHeader = () => {
    let x = startX;
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#6f655c");
    columns.forEach((col) => {
      doc.text(col.label, x, doc.y, { width: col.width, align: col.align || "left", continued: false, lineBreak: false });
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
    columns.forEach((col, ci) => {
      doc.text(String(cells[ci] != null ? cells[ci] : ""), x, rowY, { width: col.width, align: col.align || "left", lineBreak: false });
      x += col.width;
    });
    doc.y = rowY + lineHeight;
  });
}

// Appendices: price list, materials list, feature products. Each only renders when data exists.
function renderAppendices(doc, bundle) {
  // Prijsbijlage — product / qty / unit price / line total + grand total.
  if (bundle.products.length) {
    doc.addPage();
    writeSection(doc, "Prijsbijlage");
    let total = 0;
    const rows = bundle.products.map((item) => {
      const unit = Number(item.sale_price || item.price || 0);
      const qty = Number(item.quantity || 1);
      const line = unit * qty;
      total += line;
      return [item.name, String(qty), `EUR ${unit.toFixed(2)}`, `EUR ${line.toFixed(2)}`];
    });
    renderTable(doc, [
      { label: "Product", width: 250 },
      { label: "Aantal", width: 70, align: "right" },
      { label: "Stukprijs", width: 90, align: "right" },
      { label: "Regeltotaal", width: 94, align: "right" }
    ], rows);
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#2d2926")
      .text(`Totaal: EUR ${total.toFixed(2)}`, 54, doc.y, { width: 504, align: "right" });
  }

  // Materiaalstaat — name / spec / application.
  if (bundle.materials.length) {
    doc.addPage();
    writeSection(doc, "Materiaalstaat");
    renderTable(doc, [
      { label: "Materiaal", width: 170 },
      { label: "Specificatie", width: 184 },
      { label: "Toepassing", width: 150 }
    ], bundle.materials.map((m) => [m.name, m.spec || "", m.application || ""]));
  }

  // Productbijlage — one block per feature product.
  const features = bundle.products.filter((item) => Number(item.is_feature) === 1);
  if (features.length) {
    doc.addPage();
    writeSection(doc, "Productbijlage");
    features.forEach((item) => {
      if (doc.y > 660) {
        doc.addPage();
        writeSection(doc, "Productbijlage vervolg");
      }
      const y = doc.y;
      const hasImage = safeImage(doc, item.image_path, 54, y, { fit: [140, 110] });
      if (!hasImage) {
        doc.roundedRect(54, y, 140, 110, 4).fillAndStroke("#eee7df", "#d8cec2");
      }
      doc.fillColor("#2d2926").font("Helvetica-Bold").fontSize(13).text(item.name, 210, y, { width: 348 });
      doc.font("Helvetica").fontSize(10).fillColor("#6f655c")
        .text([item.brand, item.supplier, item.category].filter(Boolean).join(" | "), { width: 348 });
      doc.fillColor("#2d2926").fontSize(10)
        .text([item.sku && `Art.nr: ${item.sku}`, item.dimensions, item.lead_time && `Levertijd: ${item.lead_time}`].filter(Boolean).join("  |  "), { width: 348 });
      doc.text(`Prijs: EUR ${Number(item.sale_price || item.price || 0).toFixed(2)}`, { width: 348 });
      if (item.description) doc.fillColor("#6f655c").text(item.description, { width: 348, lineGap: 2 });
      if (item.designer_note) doc.fillColor("#6f655c").text(item.designer_note, { width: 348, lineGap: 2 });
      doc.y = Math.max(doc.y, y + 130);
      doc.moveDown(0.5);
    });
  }
}

// Render a single configured section by its kind.
function renderSectionByKind(doc, section, bundle, proposal) {
  writeSection(doc, section.title || "Sectie");
  switch (section.kind) {
    case "rooms":
      renderRooms(doc, bundle);
      break;
    case "shopping":
      renderShopping(doc, bundle);
      break;
    case "style":
      renderStyle(doc, proposal);
      break;
    case "intake":
      renderIntake(doc, bundle);
      break;
    case "text":
    default:
      renderTextSection(doc, section);
      break;
  }
}

// Visible sections for an audience: internal sees all enabled; client sees only audience='client'.
function audienceSections(proposalId, audience) {
  const all = db.prepare("SELECT * FROM proposal_sections WHERE proposal_id = ? AND is_enabled = 1 ORDER BY sort_order").all(proposalId);
  if (audience === "internal") return all;
  return all.filter((s) => s.audience === "client");
}

function renderCover(doc, bundle, proposal, audience) {
  doc.rect(0, 0, 595, 842).fill("#f7f2ec");
  doc.fillColor("#2d2926").font("Helvetica-Bold").fontSize(34).text(proposal.title, 54, 100, { width: 420 });
  doc.font("Helvetica").fontSize(13).fillColor("#6f655c").text(bundle.project.client_name || "", 54, 202);
  doc.fontSize(10).text(bundle.project.address || "", 54, 222);
  doc.fontSize(10).fillColor("#a47755").text(`Versie ${proposal.version || 1}${audience === "internal" ? " · intern" : ""}`, 54, 244);
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#a47755").text("Nova Studio interieurvoorstel", 54, 720);
}

function renderPdf(bundle, proposal, outputPath, options = {}) {
  const audience = options.audience === "internal" ? "internal" : "client";
  return new Promise((resolve, reject) => {
  const doc = new PDFDocument({ size: "A4", margin: 54, info: { Title: proposal.title } });
  const stream = fs.createWriteStream(outputPath);
  stream.on("finish", resolve);
  stream.on("error", reject);
  doc.pipe(stream);

  renderCover(doc, bundle, proposal, audience);

  const sections = audienceSections(proposal.id, audience);

  if (sections.length) {
    // Section-model layout: render each configured/enabled section for this audience.
    doc.addPage();
    sections.forEach((section, index) => {
      if (index > 0) pageBreakIfNeeded(doc);
      renderSectionByKind(doc, section, bundle, proposal);
    });
  } else {
    // Fallback fixed layout for older proposals without sections.
    doc.addPage();
    writeSection(doc, "Introductie");
    fieldOrWarn(doc, proposal.intro_text || bundle.project.brief, "Introductie nog aan te vullen door de ontwerper");

    writeSection(doc, "Intake samenvatting");
    renderIntake(doc, bundle);

    writeSection(doc, "Stijl en kleuradvies");
    renderStyle(doc, proposal);

    writeSection(doc, "Ruimtes en licht");
    renderRooms(doc, bundle);

    doc.addPage();
    writeSection(doc, "Shoppinglijst");
    renderShopping(doc, bundle);

    writeSection(doc, "Afsluiting");
    if (proposal.closing_text && String(proposal.closing_text).trim()) {
      doc.font("Helvetica").fontSize(10).fillColor("#2d2926").text(proposal.closing_text, { lineGap: 4 });
    } else {
      warn(doc, "Afsluitende tekst nog aan te vullen door de ontwerper");
    }
  }

  // Appendices appended after the main body when their data exists.
  renderAppendices(doc, bundle);

  doc.end();
  });
}

// ---------------------------------------------------------------------------
// Section seeding (used by POST / when a proposal is created).
// ---------------------------------------------------------------------------
const DEFAULT_SECTIONS = [
  { kind: "text", title: "Introductie" },
  { kind: "style", title: "Stijl & kleur" },
  { kind: "rooms", title: "Ruimtes" },
  { kind: "shopping", title: "Shoppinglijst" },
  { kind: "text", title: "Afsluiting" }
];

function seedSections(proposalId) {
  const insert = db.prepare(`
    INSERT INTO proposal_sections (id, proposal_id, kind, title, body, audience, is_enabled, sort_order)
    VALUES (?, ?, ?, ?, '', 'client', 1, ?)
  `);
  DEFAULT_SECTIONS.forEach((section, index) => {
    insert.run(id("psection"), proposalId, section.kind, section.title, index);
  });
}

// ---------------------------------------------------------------------------
// Proposal CRUD
// ---------------------------------------------------------------------------
router.post("/", validateBody(proposalCreateSchema), (req, res) => {
  const proposalId = id("proposal");
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO proposals (id, project_id, title, intro_text, style_direction, color_advice, closing_text, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      proposalId,
      req.body.project_id,
      req.body.title || "Interieurvoorstel",
      req.body.intro_text || "",
      req.body.style_direction || "",
      req.body.color_advice || "",
      req.body.closing_text || "",
      req.body.summary || ""
    );
    seedSections(proposalId);
  });
  tx();
  res.status(201).json(db.prepare("SELECT * FROM proposals WHERE id = ?").get(proposalId));
});

// Update scalar text fields + status. Keeps the current value when a field is missing.
router.put("/:id", validateBody(proposalUpdateSchema, { partial: true }), (req, res) => {
  const current = db.prepare("SELECT * FROM proposals WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Voorstel niet gevonden" });
  const fields = ["title", "intro_text", "style_direction", "color_advice", "closing_text", "summary", "status"];
  const params = { id: req.params.id };
  fields.forEach((field) => {
    params[field] = field in req.body && req.body[field] != null ? req.body[field] : current[field];
  });
  db.prepare(`
    UPDATE proposals
    SET title = @title, intro_text = @intro_text, style_direction = @style_direction,
        color_advice = @color_advice, closing_text = @closing_text, summary = @summary,
        status = @status, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run(params);
  res.json(db.prepare("SELECT * FROM proposals WHERE id = ?").get(req.params.id));
});

router.delete("/:id", (req, res) => {
  const current = db.prepare("SELECT * FROM proposals WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Voorstel niet gevonden" });
  // Best-effort cleanup of the generated PDF (sections/comments cascade via FK).
  if (current.generated_pdf_path) {
    try { fs.rmSync(current.generated_pdf_path, { force: true }); } catch { /* ignore */ }
  }
  db.prepare("DELETE FROM proposals WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// Clone a proposal into a new version, copying scalar fields + its sections.
router.post("/:id/new-version", (req, res) => {
  const source = db.prepare("SELECT * FROM proposals WHERE id = ?").get(req.params.id);
  if (!source) return res.status(404).json({ error: "Voorstel niet gevonden" });
  const newId = id("proposal");
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO proposals (id, project_id, title, intro_text, style_direction, color_advice, closing_text, summary, version, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'concept')
    `).run(
      newId,
      source.project_id,
      source.title,
      source.intro_text,
      source.style_direction,
      source.color_advice,
      source.closing_text,
      source.summary,
      Number(source.version || 1) + 1
    );
    const insertSection = db.prepare(`
      INSERT INTO proposal_sections (id, proposal_id, kind, title, body, audience, is_enabled, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.prepare("SELECT * FROM proposal_sections WHERE proposal_id = ? ORDER BY sort_order").all(source.id).forEach((s) => {
      insertSection.run(id("psection"), newId, s.kind, s.title, s.body, s.audience, s.is_enabled, s.sort_order);
    });
  });
  tx();
  res.status(201).json(db.prepare("SELECT * FROM proposals WHERE id = ?").get(newId));
});

// Status transition (sets accepted_at when entering 'accepted').
const VALID_STATUSES = ["concept", "review", "sent", "accepted", "rejected"];
router.put("/:id/status", validateBody(proposalStatusSchema), (req, res) => {
  const current = db.prepare("SELECT * FROM proposals WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Voorstel niet gevonden" });
  const status = req.body.status;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Ongeldige status" });
  }
  if (status === "accepted") {
    db.prepare("UPDATE proposals SET status = ?, accepted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, req.params.id);
  } else {
    db.prepare("UPDATE proposals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(status, req.params.id);
  }
  res.json(db.prepare("SELECT * FROM proposals WHERE id = ?").get(req.params.id));
});

// ---------------------------------------------------------------------------
// Sections CRUD
// ---------------------------------------------------------------------------
router.get("/:id/sections", (req, res) => {
  res.json(db.prepare("SELECT * FROM proposal_sections WHERE proposal_id = ? ORDER BY sort_order").all(req.params.id));
});

router.post("/:id/sections", validateBody(sectionCreateSchema), (req, res) => {
  const proposal = db.prepare("SELECT id FROM proposals WHERE id = ?").get(req.params.id);
  if (!proposal) return res.status(404).json({ error: "Voorstel niet gevonden" });
  const maxRow = db.prepare("SELECT MAX(sort_order) AS m FROM proposal_sections WHERE proposal_id = ?").get(req.params.id);
  const sortOrder = req.body.sort_order != null ? Number(req.body.sort_order) : (maxRow && maxRow.m != null ? maxRow.m + 1 : 0);
  const sectionId = id("psection");
  db.prepare(`
    INSERT INTO proposal_sections (id, proposal_id, kind, title, body, audience, is_enabled, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sectionId,
    req.params.id,
    req.body.kind || "text",
    req.body.title || "",
    req.body.body || "",
    req.body.audience || "client",
    req.body.is_enabled != null ? Number(req.body.is_enabled) : 1,
    sortOrder
  );
  res.status(201).json(db.prepare("SELECT * FROM proposal_sections WHERE id = ?").get(sectionId));
});

router.put("/sections/:sid", validateBody(sectionUpdateSchema, { partial: true }), (req, res) => {
  const current = db.prepare("SELECT * FROM proposal_sections WHERE id = ?").get(req.params.sid);
  if (!current) return res.status(404).json({ error: "Sectie niet gevonden" });
  const params = {
    id: req.params.sid,
    kind: "kind" in req.body && req.body.kind != null ? req.body.kind : current.kind,
    title: "title" in req.body && req.body.title != null ? req.body.title : current.title,
    body: "body" in req.body && req.body.body != null ? req.body.body : current.body,
    audience: "audience" in req.body && req.body.audience != null ? req.body.audience : current.audience,
    is_enabled: "is_enabled" in req.body && req.body.is_enabled != null ? Number(req.body.is_enabled) : current.is_enabled,
    sort_order: "sort_order" in req.body && req.body.sort_order != null ? Number(req.body.sort_order) : current.sort_order
  };
  db.prepare(`
    UPDATE proposal_sections
    SET kind = @kind, title = @title, body = @body, audience = @audience, is_enabled = @is_enabled, sort_order = @sort_order
    WHERE id = @id
  `).run(params);
  res.json(db.prepare("SELECT * FROM proposal_sections WHERE id = ?").get(req.params.sid));
});

router.delete("/sections/:sid", (req, res) => {
  db.prepare("DELETE FROM proposal_sections WHERE id = ?").run(req.params.sid);
  res.status(204).end();
});

router.put("/:id/sections/reorder", validateBody(reorderSchema), (req, res) => {
  const order = Array.isArray(req.body.order) ? req.body.order : [];
  const update = db.prepare("UPDATE proposal_sections SET sort_order = ? WHERE id = ? AND proposal_id = ?");
  const tx = db.transaction(() => {
    order.forEach((sectionId, index) => update.run(index, sectionId, req.params.id));
  });
  tx();
  res.json(db.prepare("SELECT * FROM proposal_sections WHERE proposal_id = ? ORDER BY sort_order").all(req.params.id));
});

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------
router.get("/:id/comments", (req, res) => {
  if (req.query.section_id) {
    return res.json(db.prepare(
      "SELECT * FROM proposal_comments WHERE proposal_id = ? AND section_id = ? ORDER BY created_at"
    ).all(req.params.id, req.query.section_id));
  }
  res.json(db.prepare("SELECT * FROM proposal_comments WHERE proposal_id = ? ORDER BY created_at").all(req.params.id));
});

router.post("/:id/comments", validateBody(commentCreateSchema), (req, res) => {
  const proposal = db.prepare("SELECT id FROM proposals WHERE id = ?").get(req.params.id);
  if (!proposal) return res.status(404).json({ error: "Voorstel niet gevonden" });
  const commentId = id("pcomment");
  db.prepare(`
    INSERT INTO proposal_comments (id, proposal_id, section_id, author, body)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    commentId,
    req.params.id,
    req.body.section_id || null,
    req.body.author || "designer",
    req.body.body || ""
  );
  res.status(201).json(db.prepare("SELECT * FROM proposal_comments WHERE id = ?").get(commentId));
});

router.delete("/comments/:cid", (req, res) => {
  db.prepare("DELETE FROM proposal_comments WHERE id = ?").run(req.params.cid);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// PDF export
// ---------------------------------------------------------------------------
router.post("/:id/export-pdf", async (req, res) => {
  const proposal = db.prepare("SELECT * FROM proposals WHERE id = ?").get(req.params.id);
  if (!proposal) return res.status(404).json({ error: "Voorstel niet gevonden" });
  const bundle = projectBundle(proposal.project_id);
  if (!bundle) return res.status(404).json({ error: "Project niet gevonden" });
  const audience = req.query.audience === "internal" ? "internal" : "client";
  const fileName = `${slug(bundle.project.title)}-voorstel-v${proposal.version || 1}${audience === "internal" ? "-intern" : ""}.pdf`;
  const outputPath = path.join(exportDir, fileName);
  await renderPdf(bundle, proposal, outputPath, { audience });
  db.prepare("UPDATE proposals SET generated_pdf_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(outputPath, proposal.id);
  res.json({ url: `/exports/${fileName}`, path: outputPath, filename: fileName });
});

// Export history: PDF files in the export dir matching this proposal's friendly slug or id.
router.get("/:id/exports", (req, res) => {
  const proposal = db.prepare("SELECT * FROM proposals WHERE id = ?").get(req.params.id);
  if (!proposal) return res.status(404).json({ error: "Voorstel niet gevonden" });
  const bundle = projectBundle(proposal.project_id);
  const prefix = bundle ? slug(bundle.project.title) : null;
  let files = [];
  try {
    files = fs.readdirSync(exportDir);
  } catch {
    files = [];
  }
  const matches = files.filter((name) => {
    if (!name.toLowerCase().endsWith(".pdf")) return false;
    return (prefix && name.startsWith(prefix)) || name.startsWith(proposal.id);
  });
  const exports = matches.map((name) => {
    const full = path.join(exportDir, name);
    let stat = null;
    try { stat = fs.statSync(full); } catch { /* ignore */ }
    return {
      filename: name,
      url: `/exports/${name}`,
      size: stat ? stat.size : 0,
      mtime: stat ? stat.mtime.toISOString() : null
    };
  }).sort((a, b) => (b.mtime || "").localeCompare(a.mtime || ""));
  res.json(exports);
});

router.get("/project/:projectId", (req, res) => {
  res.json(db.prepare("SELECT * FROM proposals WHERE project_id = ? ORDER BY updated_at DESC").all(req.params.projectId));
});

module.exports = router;
