const express = require("express");
const { db } = require("../db/database");
const { id } = require("./utils");
const { record } = require("./audit");
const { validateBody, z } = require("./validate");

const router = express.Router();

const supplierSchema = z.object({
  name: z.string().min(1),
  website: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  category: z.string().optional(),
  conditions: z.string().optional(),
  reliability_notes: z.string().optional(),
  rating: z.coerce.number().optional(),
  notes: z.string().optional()
});

const contactSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional()
});

const leadTimeSchema = z.object({
  lead_days: z.coerce.number().int().optional(),
  notes: z.string().optional()
});

// --- Suppliers --------------------------------------------------------------

router.get("/", (_req, res) => {
  res.json(db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM supplier_contacts c WHERE c.supplier_id = s.id) AS contact_count,
      (SELECT lt.lead_days FROM supplier_lead_times lt
        WHERE lt.supplier_id = s.id
        ORDER BY lt.recorded_at DESC, lt.rowid DESC
        LIMIT 1) AS latest_lead_days
    FROM suppliers s
    ORDER BY s.updated_at DESC, s.name
  `).all());
});

router.post("/", validateBody(supplierSchema), (req, res) => {
  const supplierId = id("supplier");
  db.prepare(`
    INSERT INTO suppliers (id, name, website, email, phone, category, conditions, reliability_notes, rating, notes)
    VALUES (@id, @name, @website, @email, @phone, @category, @conditions, @reliability_notes, @rating, @notes)
  `).run({
    id: supplierId,
    name: req.body.name || "Nieuwe leverancier",
    website: req.body.website || "",
    email: req.body.email || "",
    phone: req.body.phone || "",
    category: req.body.category || "",
    conditions: req.body.conditions || "",
    reliability_notes: req.body.reliability_notes || "",
    rating: Number(req.body.rating || 0),
    notes: req.body.notes || ""
  });
  record("supplier", supplierId, "create", req.body.name || "");
  res.status(201).json(db.prepare("SELECT * FROM suppliers WHERE id = ?").get(supplierId));
});

router.get("/:id", (req, res) => {
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(req.params.id);
  if (!supplier) return res.status(404).json({ error: "Leverancier niet gevonden" });
  supplier.contacts = db.prepare(
    "SELECT * FROM supplier_contacts WHERE supplier_id = ? ORDER BY created_at, name"
  ).all(req.params.id);
  supplier.lead_times = db.prepare(
    "SELECT * FROM supplier_lead_times WHERE supplier_id = ? ORDER BY recorded_at DESC, rowid DESC"
  ).all(req.params.id);
  res.json(supplier);
});

router.put("/:id", validateBody(supplierSchema, { partial: true }), (req, res) => {
  const current = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Leverancier niet gevonden" });
  db.prepare(`
    UPDATE suppliers SET
      name = @name,
      website = @website,
      email = @email,
      phone = @phone,
      category = @category,
      conditions = @conditions,
      reliability_notes = @reliability_notes,
      rating = @rating,
      notes = @notes,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({
    id: req.params.id,
    name: req.body.name || current.name,
    website: req.body.website ?? current.website,
    email: req.body.email ?? current.email,
    phone: req.body.phone ?? current.phone,
    category: req.body.category ?? current.category,
    conditions: req.body.conditions ?? current.conditions,
    reliability_notes: req.body.reliability_notes ?? current.reliability_notes,
    rating: Number(req.body.rating ?? current.rating),
    notes: req.body.notes ?? current.notes
  });
  record("supplier", req.params.id, "update");
  res.json(db.prepare("SELECT * FROM suppliers WHERE id = ?").get(req.params.id));
});

router.delete("/:id", (req, res) => {
  const current = db.prepare("SELECT id FROM suppliers WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Leverancier niet gevonden" });
  db.prepare("DELETE FROM suppliers WHERE id = ?").run(req.params.id);
  record("supplier", req.params.id, "delete");
  res.status(204).end();
});

// --- Contacts ---------------------------------------------------------------

router.post("/:id/contacts", validateBody(contactSchema), (req, res) => {
  const supplier = db.prepare("SELECT id FROM suppliers WHERE id = ?").get(req.params.id);
  if (!supplier) return res.status(404).json({ error: "Leverancier niet gevonden" });
  const contactId = id("contact");
  db.prepare(`
    INSERT INTO supplier_contacts (id, supplier_id, name, role, email, phone, notes)
    VALUES (@id, @supplier_id, @name, @role, @email, @phone, @notes)
  `).run({
    id: contactId,
    supplier_id: req.params.id,
    name: req.body.name || "Nieuw contact",
    role: req.body.role || "",
    email: req.body.email || "",
    phone: req.body.phone || "",
    notes: req.body.notes || ""
  });
  record("supplier", req.params.id, "contact_add", req.body.name || "");
  res.status(201).json(db.prepare("SELECT * FROM supplier_contacts WHERE id = ?").get(contactId));
});

router.put("/contacts/:cid", validateBody(contactSchema, { partial: true }), (req, res) => {
  const current = db.prepare("SELECT * FROM supplier_contacts WHERE id = ?").get(req.params.cid);
  if (!current) return res.status(404).json({ error: "Contact niet gevonden" });
  db.prepare(`
    UPDATE supplier_contacts SET
      name = @name,
      role = @role,
      email = @email,
      phone = @phone,
      notes = @notes
    WHERE id = @id
  `).run({
    id: req.params.cid,
    name: req.body.name || current.name,
    role: req.body.role ?? current.role,
    email: req.body.email ?? current.email,
    phone: req.body.phone ?? current.phone,
    notes: req.body.notes ?? current.notes
  });
  record("supplier", current.supplier_id, "contact_update", req.params.cid);
  res.json(db.prepare("SELECT * FROM supplier_contacts WHERE id = ?").get(req.params.cid));
});

router.delete("/contacts/:cid", (req, res) => {
  const current = db.prepare("SELECT * FROM supplier_contacts WHERE id = ?").get(req.params.cid);
  if (!current) return res.status(404).json({ error: "Contact niet gevonden" });
  db.prepare("DELETE FROM supplier_contacts WHERE id = ?").run(req.params.cid);
  record("supplier", current.supplier_id, "contact_delete", req.params.cid);
  res.status(204).end();
});

// --- Lead times -------------------------------------------------------------

router.post("/:id/lead-times", validateBody(leadTimeSchema), (req, res) => {
  const supplier = db.prepare("SELECT id FROM suppliers WHERE id = ?").get(req.params.id);
  if (!supplier) return res.status(404).json({ error: "Leverancier niet gevonden" });
  const leadId = id("leadtime");
  db.prepare(`
    INSERT INTO supplier_lead_times (id, supplier_id, lead_days, notes)
    VALUES (@id, @supplier_id, @lead_days, @notes)
  `).run({
    id: leadId,
    supplier_id: req.params.id,
    lead_days: Number(req.body.lead_days || 0),
    notes: req.body.notes || ""
  });
  record("supplier", req.params.id, "lead_time_add", String(req.body.lead_days ?? ""));
  res.status(201).json(db.prepare("SELECT * FROM supplier_lead_times WHERE id = ?").get(leadId));
});

router.get("/:id/lead-times", (req, res) => {
  const supplier = db.prepare("SELECT id FROM suppliers WHERE id = ?").get(req.params.id);
  if (!supplier) return res.status(404).json({ error: "Leverancier niet gevonden" });
  res.json(db.prepare(
    "SELECT * FROM supplier_lead_times WHERE supplier_id = ? ORDER BY recorded_at DESC, rowid DESC"
  ).all(req.params.id));
});

module.exports = router;
