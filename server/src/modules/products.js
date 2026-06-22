const express = require("express");
const { db } = require("../db/database");
const { id } = require("./utils");
const { upload, removeUpload } = require("./uploads");
const { validateBody, validateForm, z } = require("./validate");
const { record } = require("./audit");
const { safePromote } = require("./knowledgeSync");

const router = express.Router();

// --- Validation schemas ------------------------------------------------------
// Product create/update/variant share the same multipart field set. Body values
// arrive as strings (multer), so numbers use z.coerce. Everything is optional —
// the handlers keep their own `|| ""` / `?? current` fallbacks.
const productSchema = z.object({
  name: z.string().optional(),
  brand: z.string().optional(),
  supplier: z.string().optional(),
  category: z.string().optional(),
  collection: z.string().optional(),
  sku: z.string().optional(),
  dimensions: z.string().optional(),
  lead_time: z.string().optional(),
  designer: z.string().optional(),
  alternative_to_id: z.string().optional(),
  price: z.coerce.number().optional(),
  webshop_url: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  tags: z.string().optional(),
  status: z.string().optional(),
  supplier_id: z.string().optional(),
  parent_product_id: z.string().optional(),
  purchase_price: z.coerce.number().optional(),
  sale_price: z.coerce.number().optional(),
  vat_rate: z.coerce.number().optional(),
  availability_status: z.string().optional(),
  price_date: z.string().optional()
});

// POST /select needs project_id + product_id (used directly in the INSERT).
const selectSchema = z.object({
  project_id: z.string(),
  product_id: z.string(),
  room_id: z.string().optional(),
  quantity: z.coerce.number().optional(),
  sort_order: z.coerce.number().optional(),
  designer_note: z.string().optional(),
  fit_reason: z.string().optional(),
  // Left untyped: the handler does its own truthiness coercion (`x ? 1 : 0`),
  // so coercing here could alter the meaning of strings like "false".
  is_feature: z.any().optional(),
  item_status: z.enum(["proposed", "approved", "rejected"]).optional(),
  client_comment: z.string().optional(),
  is_alternative: z.any().optional()
});

const selectionUpdateSchema = z.object({
  room_id: z.string().optional(),
  quantity: z.coerce.number().optional(),
  sort_order: z.coerce.number().optional(),
  designer_note: z.string().optional(),
  fit_reason: z.string().optional(),
  is_feature: z.any().optional(),
  item_status: z.enum(["proposed", "approved", "rejected"]).optional(),
  client_comment: z.string().optional(),
  is_alternative: z.any().optional()
});

const selectionStatusSchema = z.object({
  item_status: z.enum(["proposed", "approved", "rejected"]).optional(),
  client_comment: z.string().optional()
});

const importCsvSchema = z.object({
  csv: z.string().optional()
});

const categorySchema = z.object({
  name: z.string().trim().min(1)
});

// margin = sale_price - purchase_price, but only when both are > 0.
function computeMargin(salePrice, purchasePrice) {
  const sale = Number(salePrice || 0);
  const purchase = Number(purchasePrice || 0);
  return (sale > 0 && purchase > 0) ? sale - purchase : 0;
}

function ensureProductCategory(name) {
  const clean = String(name || "").trim();
  if (!clean) return null;
  db.prepare("INSERT OR IGNORE INTO product_categories (id, name) VALUES (?, ?)")
    .run(id("category"), clean);
  return db.prepare("SELECT * FROM product_categories WHERE lower(name) = lower(?)").get(clean);
}

function syncProductCategoriesFromProducts() {
  db.prepare(`
    INSERT OR IGNORE INTO product_categories (id, name)
    SELECT 'category_' || lower(hex(randomblob(8))), trim(category)
      FROM products
     WHERE trim(COALESCE(category, '')) <> ''
  `).run();
}

// Append a row to product_price_history. Wrapped so a failure here can never
// abort the surrounding product write (mirrors the audit.record pattern).
function recordPriceHistory(productId, prices, note) {
  try {
    const purchase = Number(prices.purchase_price || 0);
    const sale = Number(prices.sale_price || 0);
    const price = Number(prices.price || 0);
    db.prepare(`
      INSERT INTO product_price_history (id, product_id, purchase_price, sale_price, price, margin, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id("price"), productId, purchase, sale, price, computeMargin(sale, purchase), note || "");
  } catch {
    // Never break the primary write.
  }
}

function promoteProduct(row) {
  if (!row) return;
  safePromote("product", row.id, row.name, {
    name: row.name || "",
    brand: row.brand || "",
    supplier: row.supplier || "",
    supplier_id: row.supplier_id || "",
    category: row.category || "",
    collection: row.collection || "",
    sku: row.sku || "",
    status: row.status || "",
    availability_status: row.availability_status || ""
  });
}

// Quote a single CSV cell: wrap in quotes and double inner quotes when it
// contains a comma, quote, or newline. Keeps numbers/plain text untouched.
function csvCell(value) {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Minimal CSV parser: comma-separated, optional double-quoted fields with
// doubled-quote escaping. Returns an array of string arrays (rows of cells).
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
  // Drop fully-empty lines (e.g. trailing newline).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

router.get("/", (_req, res) => {
  res.json(db.prepare(`
    SELECT p.*, alt.name AS alternative_to_name,
      EXISTS(SELECT 1 FROM product_favorites f WHERE f.product_id = p.id) AS is_favorite
    FROM products p
    LEFT JOIN products alt ON alt.id = p.alternative_to_id
    ORDER BY p.updated_at DESC, p.name
  `).all());
});

// --- Managed categories ------------------------------------------------------
router.get("/categories", (_req, res) => {
  syncProductCategoriesFromProducts();
  res.json(db.prepare(`
    SELECT c.*, COUNT(p.id) AS product_count
      FROM product_categories c
      LEFT JOIN products p ON lower(p.category) = lower(c.name)
     GROUP BY c.id
     ORDER BY c.sort_order, c.name COLLATE NOCASE
  `).all());
});

router.post("/categories", validateBody(categorySchema), (req, res) => {
  const category = ensureProductCategory(req.body.name);
  res.status(201).json(category);
});

router.put("/categories/:id", validateBody(categorySchema), (req, res) => {
  const current = db.prepare("SELECT * FROM product_categories WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Categorie niet gevonden" });
  const duplicate = db.prepare("SELECT id FROM product_categories WHERE lower(name) = lower(?) AND id <> ?").get(req.body.name, req.params.id);
  if (duplicate) return res.status(409).json({ error: "Categorie bestaat al" });
  const tx = db.transaction(() => {
    db.prepare("UPDATE products SET category = ?, updated_at = CURRENT_TIMESTAMP WHERE lower(category) = lower(?)").run(req.body.name, current.name);
    db.prepare("UPDATE product_categories SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.body.name, req.params.id);
  });
  tx();
  res.json(db.prepare("SELECT * FROM product_categories WHERE id = ?").get(req.params.id));
});

router.delete("/categories/:id", (req, res) => {
  const current = db.prepare("SELECT * FROM product_categories WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Categorie niet gevonden" });
  const tx = db.transaction(() => {
    db.prepare("UPDATE products SET category = '', updated_at = CURRENT_TIMESTAMP WHERE lower(category) = lower(?)").run(current.name);
    db.prepare("DELETE FROM product_categories WHERE id = ?").run(req.params.id);
  });
  tx();
  res.status(204).end();
});

router.post("/", upload.single("image"), validateForm(productSchema), (req, res) => {
  const productId = id("product");
  const salePrice = Number(req.body.sale_price || 0);
  const purchasePrice = Number(req.body.purchase_price || 0);
  db.prepare(`
    INSERT INTO products (id, name, brand, supplier, category, collection, sku, dimensions, lead_time, designer, alternative_to_id, image_path, price, webshop_url, description, notes, tags, status, supplier_id, parent_product_id, purchase_price, sale_price, margin, vat_rate, availability_status, price_date)
    VALUES (@id, @name, @brand, @supplier, @category, @collection, @sku, @dimensions, @lead_time, @designer, @alternative_to_id, @image_path, @price, @webshop_url, @description, @notes, @tags, @status, @supplier_id, @parent_product_id, @purchase_price, @sale_price, @margin, @vat_rate, @availability_status, @price_date)
  `).run({
    id: productId,
    name: req.body.name || "Nieuw product",
    brand: req.body.brand || "",
    supplier: req.body.supplier || "",
    category: req.body.category || "",
    collection: req.body.collection || "",
    sku: req.body.sku || "",
    dimensions: req.body.dimensions || "",
    lead_time: req.body.lead_time || "",
    designer: req.body.designer || "",
    alternative_to_id: req.body.alternative_to_id || null,
    image_path: req.file?.path || "",
    price: Number(req.body.price || 0),
    webshop_url: req.body.webshop_url || "",
    description: req.body.description || "",
    notes: req.body.notes || "",
    tags: req.body.tags || "",
    status: req.body.status || "candidate",
    supplier_id: req.body.supplier_id || null,
    parent_product_id: req.body.parent_product_id || null,
    purchase_price: purchasePrice,
    sale_price: salePrice,
    margin: computeMargin(salePrice, purchasePrice),
    vat_rate: Number(req.body.vat_rate ?? 21),
    availability_status: req.body.availability_status || "unknown",
    price_date: req.body.price_date || ""
  });
  ensureProductCategory(req.body.category);
  recordPriceHistory(productId, {
    purchase_price: purchasePrice,
    sale_price: salePrice,
    price: Number(req.body.price || 0)
  }, "initial");
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
  promoteProduct(product);
  res.status(201).json(product);
});

router.put("/:id", upload.single("image"), validateForm(productSchema, { partial: true }), (req, res) => {
  const current = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Product niet gevonden" });
  const salePrice = Number(req.body.sale_price ?? current.sale_price ?? 0);
  const purchasePrice = Number(req.body.purchase_price ?? current.purchase_price ?? 0);
  const newPrice = Number(req.body.price ?? current.price ?? 0);
  const priceChanged =
    Number(current.purchase_price || 0) !== purchasePrice
    || Number(current.sale_price || 0) !== salePrice
    || Number(current.price || 0) !== newPrice;
  db.prepare(`
    UPDATE products SET
      name = @name,
      brand = @brand,
      supplier = @supplier,
      category = @category,
      collection = @collection,
      sku = @sku,
      dimensions = @dimensions,
      lead_time = @lead_time,
      designer = @designer,
      alternative_to_id = @alternative_to_id,
      image_path = @image_path,
      price = @price,
      webshop_url = @webshop_url,
      description = @description,
      notes = @notes,
      tags = @tags,
      status = @status,
      supplier_id = @supplier_id,
      parent_product_id = @parent_product_id,
      purchase_price = @purchase_price,
      sale_price = @sale_price,
      margin = @margin,
      vat_rate = @vat_rate,
      availability_status = @availability_status,
      price_date = @price_date,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({
    id: req.params.id,
    name: req.body.name || current.name,
    brand: req.body.brand ?? current.brand,
    supplier: req.body.supplier ?? current.supplier,
    category: req.body.category ?? current.category,
    collection: req.body.collection ?? current.collection,
    sku: req.body.sku ?? current.sku,
    dimensions: req.body.dimensions ?? current.dimensions,
    lead_time: req.body.lead_time ?? current.lead_time,
    designer: req.body.designer ?? current.designer,
    alternative_to_id: req.body.alternative_to_id || null,
    image_path: req.file?.path || current.image_path,
    price: Number(req.body.price ?? current.price),
    webshop_url: req.body.webshop_url ?? current.webshop_url,
    description: req.body.description ?? current.description,
    notes: req.body.notes ?? current.notes,
    tags: req.body.tags ?? current.tags,
    status: req.body.status ?? current.status,
    supplier_id: ("supplier_id" in req.body ? (req.body.supplier_id || null) : (current.supplier_id ?? null)),
    parent_product_id: ("parent_product_id" in req.body ? (req.body.parent_product_id || null) : (current.parent_product_id ?? null)),
    purchase_price: purchasePrice,
    sale_price: salePrice,
    margin: computeMargin(salePrice, purchasePrice),
    vat_rate: Number(req.body.vat_rate ?? current.vat_rate ?? 21),
    availability_status: req.body.availability_status ?? current.availability_status ?? "unknown",
    price_date: req.body.price_date ?? current.price_date ?? ""
  });
  ensureProductCategory(req.body.category ?? current.category);
  if (req.file && current.image_path && current.image_path !== req.file.path) {
    removeUpload(current.image_path);
  }
  if (priceChanged) {
    recordPriceHistory(req.params.id, {
      purchase_price: purchasePrice,
      sale_price: salePrice,
      price: newPrice
    });
    record("product", req.params.id, "price_change", JSON.stringify({
      from: {
        purchase_price: Number(current.purchase_price || 0),
        sale_price: Number(current.sale_price || 0),
        price: Number(current.price || 0)
      },
      to: { purchase_price: purchasePrice, sale_price: salePrice, price: newPrice }
    }));
  }
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  promoteProduct(product);
  res.json(product);
});

router.delete("/:id", (req, res) => {
  const current = db.prepare("SELECT image_path FROM products WHERE id = ?").get(req.params.id);
  db.prepare("DELETE FROM project_products WHERE product_id = ?").run(req.params.id);
  db.prepare("UPDATE products SET alternative_to_id = NULL WHERE alternative_to_id = ?").run(req.params.id);
  db.prepare("DELETE FROM products WHERE id = ?").run(req.params.id);
  if (current) removeUpload(current.image_path);
  res.status(204).end();
});

// --- Price history -----------------------------------------------------------
router.get("/:id/price-history", (req, res) => {
  const product = db.prepare("SELECT id FROM products WHERE id = ?").get(req.params.id);
  if (!product) return res.status(404).json({ error: "Product niet gevonden" });
  // `changed_at` is second-precision so we fall back to rowid for stable
  // ordering between writes that share a second.
  res.json(db.prepare(`
    SELECT * FROM product_price_history
    WHERE product_id = ?
    ORDER BY changed_at DESC, rowid DESC
  `).all(req.params.id));
});

// --- Variants ----------------------------------------------------------------
router.get("/:id/variants", (req, res) => {
  res.json(db.prepare(`
    SELECT * FROM products WHERE parent_product_id = ? ORDER BY updated_at DESC, name
  `).all(req.params.id));
});

router.post("/:id/variants", upload.single("image"), validateForm(productSchema), (req, res) => {
  const parent = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!parent) return res.status(404).json({ error: "Product niet gevonden" });
  const variantId = id("product");
  const salePrice = Number(req.body.sale_price || 0);
  const purchasePrice = Number(req.body.purchase_price || 0);
  db.prepare(`
    INSERT INTO products (id, name, brand, supplier, category, collection, sku, dimensions, lead_time, designer, alternative_to_id, image_path, price, webshop_url, description, notes, tags, status, supplier_id, parent_product_id, purchase_price, sale_price, margin, vat_rate, availability_status, price_date)
    VALUES (@id, @name, @brand, @supplier, @category, @collection, @sku, @dimensions, @lead_time, @designer, @alternative_to_id, @image_path, @price, @webshop_url, @description, @notes, @tags, @status, @supplier_id, @parent_product_id, @purchase_price, @sale_price, @margin, @vat_rate, @availability_status, @price_date)
  `).run({
    id: variantId,
    name: req.body.name || `${parent.name} (variant)`,
    brand: req.body.brand ?? parent.brand,
    supplier: req.body.supplier ?? parent.supplier,
    category: req.body.category ?? parent.category,
    collection: req.body.collection || "",
    sku: req.body.sku || "",
    dimensions: req.body.dimensions || "",
    lead_time: req.body.lead_time || "",
    designer: req.body.designer || "",
    alternative_to_id: req.body.alternative_to_id || null,
    image_path: req.file?.path || "",
    price: Number(req.body.price || 0),
    webshop_url: req.body.webshop_url || "",
    description: req.body.description || "",
    notes: req.body.notes || "",
    tags: req.body.tags || "",
    status: req.body.status || "candidate",
    supplier_id: ("supplier_id" in req.body ? (req.body.supplier_id || null) : (parent.supplier_id ?? null)),
    parent_product_id: req.params.id,
    purchase_price: purchasePrice,
    sale_price: salePrice,
    margin: computeMargin(salePrice, purchasePrice),
    vat_rate: Number(req.body.vat_rate ?? 21),
    availability_status: req.body.availability_status || "unknown",
    price_date: req.body.price_date || ""
  });
  ensureProductCategory(req.body.category ?? parent.category);
  res.status(201).json(db.prepare("SELECT * FROM products WHERE id = ?").get(variantId));
});

// --- Favorites ---------------------------------------------------------------
router.get("/favorites", (_req, res) => {
  res.json(db.prepare(`
    SELECT p.*, alt.name AS alternative_to_name, 1 AS is_favorite
    FROM product_favorites f
    JOIN products p ON p.id = f.product_id
    LEFT JOIN products alt ON alt.id = p.alternative_to_id
    ORDER BY f.created_at DESC, p.name
  `).all());
});

router.post("/:id/favorite", (req, res) => {
  db.prepare("INSERT OR IGNORE INTO product_favorites (product_id) VALUES (?)").run(req.params.id);
  res.status(201).json({ product_id: req.params.id, is_favorite: 1 });
});

router.delete("/:id/favorite", (req, res) => {
  db.prepare("DELETE FROM product_favorites WHERE product_id = ?").run(req.params.id);
  res.status(204).end();
});

// --- Compare -----------------------------------------------------------------
router.get("/compare", (req, res) => {
  const ids = String(req.query.ids || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (ids.length === 0) return res.json([]);
  const placeholders = ids.map(() => "?").join(",");
  const found = db.prepare(`SELECT * FROM products WHERE id IN (${placeholders})`).all(...ids);
  // Preserve the requested order so the comparison columns line up.
  const byId = new Map(found.map((p) => [p.id, p]));
  res.json(ids.map((value) => byId.get(value)).filter(Boolean));
});

// --- CSV export / import -----------------------------------------------------
router.get("/export.csv", (_req, res) => {
  const products = db.prepare("SELECT * FROM products ORDER BY updated_at DESC, name").all();
  const header = ["id", "name", "brand", "supplier", "category", "sku", "price", "purchase_price", "sale_price", "vat_rate", "availability_status"];
  const lines = [header.map(csvCell).join(",")];
  for (const p of products) {
    lines.push(header.map((field) => csvCell(p[field])).join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="producten.csv"');
  res.send(lines.join("\r\n"));
});

router.post("/import-csv", upload.single("file"), validateForm(importCsvSchema), (req, res) => {
  let text = "";
  if (req.file) {
    text = require("fs").readFileSync(req.file.path, "utf8");
    removeUpload(req.file.path);
  } else if (typeof req.body === "string") {
    text = req.body;
  } else if (req.body && typeof req.body.csv === "string") {
    text = req.body.csv;
  }
  text = String(text || "").trim();
  if (!text) return res.json({ created: 0 });

  const rows = parseCsv(text);
  if (rows.length < 2) return res.json({ created: 0 });
  const header = rows[0].map((cell) => cell.trim());
  const indexOf = (name) => header.indexOf(name);
  const idx = {
    name: indexOf("name"),
    brand: indexOf("brand"),
    supplier: indexOf("supplier"),
    category: indexOf("category"),
    sku: indexOf("sku"),
    price: indexOf("price"),
    purchase_price: indexOf("purchase_price"),
    sale_price: indexOf("sale_price"),
    vat_rate: indexOf("vat_rate"),
    availability_status: indexOf("availability_status")
  };
  const cell = (row, key) => (idx[key] >= 0 ? (row[idx[key]] ?? "") : "");

  const insert = db.prepare(`
    INSERT INTO products (id, name, brand, supplier, category, sku, price, purchase_price, sale_price, margin, vat_rate, availability_status, status)
    VALUES (@id, @name, @brand, @supplier, @category, @sku, @price, @purchase_price, @sale_price, @margin, @vat_rate, @availability_status, @status)
  `);
  let created = 0;
  const importAll = db.transaction((dataRows) => {
    for (const row of dataRows) {
      const name = String(cell(row, "name") || "").trim();
      if (!name) continue;
      const salePrice = Number(cell(row, "sale_price") || 0) || 0;
      const purchasePrice = Number(cell(row, "purchase_price") || 0) || 0;
      const vatRaw = cell(row, "vat_rate");
      const category = String(cell(row, "category") || "").trim();
      insert.run({
        id: id("product"),
        name,
        brand: String(cell(row, "brand") || "").trim(),
        supplier: String(cell(row, "supplier") || "").trim(),
        category,
        sku: String(cell(row, "sku") || "").trim(),
        price: Number(cell(row, "price") || 0) || 0,
        purchase_price: purchasePrice,
        sale_price: salePrice,
        margin: computeMargin(salePrice, purchasePrice),
        vat_rate: vatRaw === "" ? 21 : (Number(vatRaw) || 0),
        availability_status: String(cell(row, "availability_status") || "").trim() || "unknown",
        status: "candidate"
      });
      ensureProductCategory(category);
      created += 1;
    }
  });
  importAll(rows.slice(1));
  res.json({ created });
});

router.post("/select", validateBody(selectSchema), (req, res) => {
  const selectionId = id("selection");
  db.prepare(`
    INSERT INTO project_products (id, project_id, room_id, product_id, quantity, sort_order, designer_note, fit_reason, is_feature, item_status, client_comment, is_alternative)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    selectionId,
    req.body.project_id,
    req.body.room_id || null,
    req.body.product_id,
    Number(req.body.quantity || 1),
    Number(req.body.sort_order || 0),
    req.body.designer_note || "",
    req.body.fit_reason || "",
    req.body.is_feature ? 1 : 0,
    req.body.item_status || "proposed",
    req.body.client_comment || "",
    req.body.is_alternative ? 1 : 0
  );
  res.status(201).json(db.prepare("SELECT * FROM project_products WHERE id = ?").get(selectionId));
});

router.put("/selection/:id", validateBody(selectionUpdateSchema, { partial: true }), (req, res) => {
  const current = db.prepare("SELECT * FROM project_products WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Selectie niet gevonden" });
  db.prepare(`
    UPDATE project_products SET
      room_id = @room_id,
      quantity = @quantity,
      sort_order = @sort_order,
      designer_note = @designer_note,
      fit_reason = @fit_reason,
      is_feature = @is_feature,
      item_status = @item_status,
      client_comment = @client_comment,
      is_alternative = @is_alternative
    WHERE id = @id
  `).run({
    id: req.params.id,
    room_id: req.body.room_id || null,
    quantity: Number(req.body.quantity || 1),
    sort_order: Number(req.body.sort_order || 0),
    designer_note: req.body.designer_note ?? current.designer_note,
    fit_reason: req.body.fit_reason ?? current.fit_reason,
    is_feature: ("is_feature" in req.body ? (req.body.is_feature ? 1 : 0) : current.is_feature),
    item_status: req.body.item_status ?? current.item_status,
    client_comment: req.body.client_comment ?? current.client_comment,
    is_alternative: ("is_alternative" in req.body ? (req.body.is_alternative ? 1 : 0) : current.is_alternative)
  });
  res.json(db.prepare("SELECT * FROM project_products WHERE id = ?").get(req.params.id));
});

// Update just the workflow/feedback fields of a selection.
router.put("/selection/:id/status", validateBody(selectionStatusSchema, { partial: true }), (req, res) => {
  const current = db.prepare("SELECT * FROM project_products WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Selectie niet gevonden" });
  db.prepare(`
    UPDATE project_products SET
      item_status = @item_status,
      client_comment = @client_comment
    WHERE id = @id
  `).run({
    id: req.params.id,
    item_status: req.body.item_status ?? current.item_status,
    client_comment: req.body.client_comment ?? current.client_comment
  });
  res.json(db.prepare("SELECT * FROM project_products WHERE id = ?").get(req.params.id));
});

router.delete("/selection/:id", (req, res) => {
  db.prepare("DELETE FROM project_products WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

// Effective unit price for a shopping-list row: sale_price when set, else price.
function effectivePrice(row) {
  const sale = Number(row.sale_price || 0);
  return sale > 0 ? sale : Number(row.price || 0);
}

function shoppingListRows(projectId) {
  const { uploadUrl } = require("./utils");
  return db.prepare(`
    SELECT pp.id, pp.quantity, pp.sort_order, pp.designer_note, pp.fit_reason, pp.is_feature, pp.room_id, pp.product_id,
      pp.item_status, pp.client_comment, pp.is_alternative,
      r.name AS room_name, r.sort_order AS room_sort,
      p.name, p.brand, p.supplier, p.category, p.image_path, p.price, p.sale_price, p.webshop_url, p.description, p.designer
    FROM project_products pp
    JOIN products p ON p.id = pp.product_id
    LEFT JOIN rooms r ON r.id = pp.room_id
    WHERE pp.project_id = ?
    ORDER BY r.sort_order, r.name, pp.sort_order, p.category, p.name
  `).all(projectId).map((row) => ({ ...row, image_url: uploadUrl(row.image_path) }));
}

router.get("/shopping-list/:projectId", (req, res) => {
  const rows = shoppingListRows(req.params.projectId);
  const total = rows.reduce((sum, row) => sum + effectivePrice(row) * Number(row.quantity || 1), 0);
  res.json({ total, items: rows });
});

router.get("/shopping-list/:projectId/export.csv", (req, res) => {
  const rows = shoppingListRows(req.params.projectId);
  const header = ["room", "product", "brand", "quantity", "unit_price", "line_total"];
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows) {
    const qty = Number(row.quantity || 1);
    const unit = effectivePrice(row);
    lines.push([
      row.room_name || "",
      row.name,
      row.brand,
      qty,
      unit,
      unit * qty
    ].map(csvCell).join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="boodschappenlijst.csv"');
  res.send(lines.join("\r\n"));
});

module.exports = router;
