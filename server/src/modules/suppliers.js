const express = require("express");
const fs = require("fs");
const { db } = require("../db/database");
const { id } = require("./utils");
const { record } = require("./audit");
const { upload, removeUpload } = require("./uploads");
const { validateBody, validateForm, z } = require("./validate");

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

const importPriceListSchema = z.object({
  csv: z.string().optional()
});

function computeMargin(salePrice, purchasePrice) {
  const sale = Number(salePrice || 0);
  const purchase = Number(purchasePrice || 0);
  return (sale > 0 && purchase > 0) ? sale - purchase : 0;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

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

router.post("/:id/import-price-list", upload.single("file"), validateForm(importPriceListSchema), (req, res) => {
  const supplier = db.prepare("SELECT id, name FROM suppliers WHERE id = ?").get(req.params.id);
  if (!supplier) {
    if (req.file) removeUpload(req.file.path);
    return res.status(404).json({ error: "Leverancier niet gevonden" });
  }

  let text = "";
  if (req.file) {
    text = fs.readFileSync(req.file.path, "utf8");
    removeUpload(req.file.path);
  } else if (typeof req.body === "string") {
    text = req.body;
  } else if (req.body && typeof req.body.csv === "string") {
    text = req.body.csv;
  }
  text = String(text || "").trim();

  const counts = { created: 0, updated: 0, skipped: 0 };
  if (!text) {
    record("supplier", req.params.id, "price_list_import", counts);
    return res.json(counts);
  }

  const rows = parseCsv(text);
  if (rows.length < 2) {
    counts.skipped = Math.max(rows.length - 1, 0);
    record("supplier", req.params.id, "price_list_import", counts);
    return res.json(counts);
  }

  const header = rows[0].map((cell) => cell.trim());
  const indexOf = (name) => header.indexOf(name);
  const idx = {
    name: indexOf("name"),
    sku: indexOf("sku"),
    purchase_price: indexOf("purchase_price"),
    sale_price: indexOf("sale_price"),
    price: indexOf("price"),
    vat_rate: indexOf("vat_rate"),
    category: indexOf("category"),
    brand: indexOf("brand")
  };
  const cell = (row, key) => (idx[key] >= 0 ? (row[idx[key]] ?? "") : "");
  const numeric = (value) => Number(value || 0) || 0;
  const vat = (value) => String(value ?? "").trim() === "" ? 21 : numeric(value);

  const findBySku = db.prepare("SELECT id FROM products WHERE sku = ? AND sku != ''");
  const insert = db.prepare(`
    INSERT INTO products (id, name, brand, supplier, category, sku, price, purchase_price, sale_price, margin, vat_rate, status, supplier_id)
    VALUES (@id, @name, @brand, @supplier, @category, @sku, @price, @purchase_price, @sale_price, @margin, @vat_rate, @status, @supplier_id)
  `);
  const update = db.prepare(`
    UPDATE products SET
      supplier = @supplier,
      price = @price,
      purchase_price = @purchase_price,
      sale_price = @sale_price,
      margin = @margin,
      vat_rate = @vat_rate,
      supplier_id = @supplier_id,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);

  const importRows = db.transaction((dataRows) => {
    for (const row of dataRows) {
      const name = String(cell(row, "name") || "").trim();
      if (!name) {
        counts.skipped += 1;
        continue;
      }
      const sku = String(cell(row, "sku") || "").trim();
      const salePrice = numeric(cell(row, "sale_price"));
      const purchasePrice = numeric(cell(row, "purchase_price"));
      const product = {
        name,
        brand: String(cell(row, "brand") || "").trim(),
        supplier: supplier.name || "",
        category: String(cell(row, "category") || "").trim(),
        sku,
        price: numeric(cell(row, "price")),
        purchase_price: purchasePrice,
        sale_price: salePrice,
        margin: computeMargin(salePrice, purchasePrice),
        vat_rate: vat(cell(row, "vat_rate")),
        supplier_id: req.params.id
      };
      const existing = sku ? findBySku.get(sku) : null;
      if (existing) {
        update.run({
          id: existing.id,
          supplier: product.supplier,
          price: product.price,
          purchase_price: product.purchase_price,
          sale_price: product.sale_price,
          margin: product.margin,
          vat_rate: product.vat_rate,
          supplier_id: product.supplier_id
        });
        counts.updated += 1;
      } else {
        insert.run({ ...product, id: id("product"), status: "candidate" });
        counts.created += 1;
      }
    }
  });
  importRows(rows.slice(1));
  record("supplier", req.params.id, "price_list_import", counts);
  res.json(counts);
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
