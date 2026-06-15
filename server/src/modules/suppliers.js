const express = require("express");
const fs = require("fs");
const { db } = require("../db/database");
const { id } = require("./utils");
const { record } = require("./audit");
const { upload, removeUpload } = require("./uploads");
const { validateBody, validateForm, z } = require("./validate");

const router = express.Router();

// Local copies of the tiny CSV helpers used by products.js — kept here so the
// suppliers module stays self-contained and doesn't pull in a CSV dependency.
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

function computeMargin(salePrice, purchasePrice) {
  const sale = Number(salePrice || 0);
  const purchase = Number(purchasePrice || 0);
  return (sale > 0 && purchase > 0) ? sale - purchase : 0;
}

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

const priceListImportSchema = z.object({
  csv: z.string().optional()
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

// --- Price list import ------------------------------------------------------

// Bulk-import a supplier price list. Matching products (by non-empty SKU) get
// their prices + supplier_id refreshed; non-matches are inserted as candidates
// already linked to this supplier. Mirrors the CSV handling in products.js
// (multipart `file` OR JSON `{ csv }` body) and runs inside one transaction.
router.post("/:id/import-price-list", upload.single("file"), validateForm(priceListImportSchema), (req, res) => {
  try {
    const supplier = db.prepare("SELECT id FROM suppliers WHERE id = ?").get(req.params.id);
    if (!supplier) return res.status(404).json({ error: "Leverancier niet gevonden" });

    let text = "";
    if (req.file) {
      text = fs.readFileSync(req.file.path, "utf8");
    } else if (req.body && typeof req.body.csv === "string") {
      text = req.body.csv;
    }
    text = String(text || "").trim();

    let created = 0;
    let updated = 0;
    let skipped = 0;

    if (text) {
      const rows = parseCsv(text);
      if (rows.length >= 2) {
        const header = rows[0].map((c) => c.trim());
        const idx = {
          name: header.indexOf("name"),
          sku: header.indexOf("sku"),
          purchase_price: header.indexOf("purchase_price"),
          sale_price: header.indexOf("sale_price"),
          price: header.indexOf("price"),
          vat_rate: header.indexOf("vat_rate"),
          category: header.indexOf("category"),
          brand: header.indexOf("brand")
        };
        const cell = (row, key) => (idx[key] >= 0 ? String(row[idx[key]] ?? "").trim() : "");
        const numOr = (raw, fallback) => (raw === "" ? Number(fallback) || 0 : Number(raw) || 0);

        const findExisting = db.prepare("SELECT * FROM products WHERE sku = ? AND sku != ''");
        const insert = db.prepare(`
          INSERT INTO products (id, name, brand, category, sku, price, purchase_price, sale_price, margin, vat_rate, status, supplier_id)
          VALUES (@id, @name, @brand, @category, @sku, @price, @purchase_price, @sale_price, @margin, @vat_rate, 'candidate', @supplier_id)
        `);
        // AC says "prices + supplier_id" — leave name/brand/category alone so a
        // partial price list never wipes out existing catalog metadata.
        const update = db.prepare(`
          UPDATE products SET
            price = @price,
            purchase_price = @purchase_price,
            sale_price = @sale_price,
            margin = @margin,
            vat_rate = @vat_rate,
            supplier_id = @supplier_id,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = @id
        `);

        const importAll = db.transaction((dataRows) => {
          for (const row of dataRows) {
            const name = cell(row, "name");
            if (!name) { skipped += 1; continue; }
            const sku = cell(row, "sku");
            const existing = sku ? findExisting.get(sku) : null;
            if (existing) {
              const purchasePrice = numOr(cell(row, "purchase_price"), existing.purchase_price);
              const salePrice = numOr(cell(row, "sale_price"), existing.sale_price);
              const price = numOr(cell(row, "price"), existing.price);
              const vat = numOr(cell(row, "vat_rate"), existing.vat_rate ?? 21);
              update.run({
                id: existing.id,
                price,
                purchase_price: purchasePrice,
                sale_price: salePrice,
                margin: computeMargin(salePrice, purchasePrice),
                vat_rate: vat,
                supplier_id: req.params.id
              });
              updated += 1;
            } else {
              const purchasePrice = numOr(cell(row, "purchase_price"), 0);
              const salePrice = numOr(cell(row, "sale_price"), 0);
              const price = numOr(cell(row, "price"), 0);
              const vat = numOr(cell(row, "vat_rate"), 21);
              insert.run({
                id: id("product"),
                name,
                brand: cell(row, "brand"),
                category: cell(row, "category"),
                sku,
                price,
                purchase_price: purchasePrice,
                sale_price: salePrice,
                margin: computeMargin(salePrice, purchasePrice),
                vat_rate: vat,
                supplier_id: req.params.id
              });
              created += 1;
            }
          }
        });
        importAll(rows.slice(1));
      }
    }

    record("supplier", req.params.id, "price_list_import", { created, updated, skipped });
    res.json({ created, updated, skipped });
  } finally {
    if (req.file) removeUpload(req.file.path);
  }
});

module.exports = router;
