// API integration tests for the main flows (project → client → products →
// selection → proposal → PDF export). Runs the real routers in-process against
// an isolated temp database, so it never touches the live data dir.
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Isolate the DB / uploads / exports BEFORE requiring any module that opens them.
const tmp = path.join(os.tmpdir(), `nova-test-${crypto.randomUUID().slice(0, 8)}`);
process.env.NOVA_DATA_DIR = tmp;
process.env.NOVA_DB_PATH = path.join(tmp, "test.db");
process.env.NOVA_UPLOAD_DIR = path.join(tmp, "uploads");
process.env.NOVA_EXPORT_DIR = path.join(tmp, "exports");
fs.mkdirSync(tmp, { recursive: true });

const express = require("express");
const { migrate } = require("../db/schema");

migrate();

const app = express();
app.use(express.json());
app.use("/api/clients", require("./clients"));
app.use("/api/projects", require("./projects"));
app.use("/api/products", require("./products"));
app.use("/api/proposals", require("./proposals"));
app.use("/api/suppliers", require("./suppliers"));
app.use((err, _req, res, _next) => res.status(err.name === "ZodError" ? 400 : 500).json({ error: err.message }));

let base;
const server = app.listen(0);
test.before(() => new Promise((r) => server.listening ? r() : server.on("listening", r)).then(() => { base = `http://127.0.0.1:${server.address().port}`; }));
test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const j = (path, method, body) => fetch(`${base}${path}`, {
  method: method || "GET",
  headers: body ? { "Content-Type": "application/json" } : undefined,
  body: body ? JSON.stringify(body) : undefined
});

test("client aanmaken", async () => {
  const res = await j("/api/clients", "POST", { name: "Familie De Vries", email: "vries@example.nl" });
  assert.equal(res.status, 201);
  const client = await res.json();
  assert.equal(client.name, "Familie De Vries");
  assert.match(client.id, /^client_/);
});

test("project aanmaken met nieuwe klant en in lijst zichtbaar", async () => {
  const res = await j("/api/projects", "POST", { title: "Keizersgracht Huis", clientName: "Nieuwe Klant" });
  assert.equal(res.status, 201);
  const project = await res.json();
  assert.match(project.id, /^project_/);
  assert.ok(project.intake, "intake row hydrated");
  const list = await (await j("/api/projects?status=")).json();
  assert.ok(list.some((p) => p.id === project.id), "project appears in list");
});

test("productselectie en shoppinglijst totaal", async () => {
  const project = await (await j("/api/projects", "POST", { title: "Selectieproject" })).json();
  const product = await (await j("/api/products", "POST", { name: "Bank", price: 1000 })).json();
  const sel = await j("/api/products/select", "POST", { project_id: project.id, product_id: product.id, quantity: 2 });
  assert.equal(sel.status, 201);
  const shopping = await (await j(`/api/products/shopping-list/${project.id}`)).json();
  assert.equal(shopping.items.length, 1);
  assert.equal(shopping.total, 2000, "2 × €1000");
});

test("voorstel aanmaken, secties geseed en PDF-export", async () => {
  const project = await (await j("/api/projects", "POST", { title: "Voorstelproject" })).json();
  const proposal = await (await j("/api/proposals", "POST", { project_id: project.id, title: "Interieurvoorstel" })).json();
  assert.match(proposal.id, /^proposal_/);
  const sections = await (await j(`/api/proposals/${proposal.id}/sections`)).json();
  assert.ok(sections.length >= 4, "default sections seeded");
  const exportRes = await j(`/api/proposals/${proposal.id}/export-pdf?audience=client`, "POST");
  assert.equal(exportRes.status, 200);
  const out = await exportRes.json();
  assert.ok(out.filename.endsWith(".pdf"));
  const onDisk = path.join(process.env.NOVA_EXPORT_DIR, path.basename(out.path));
  assert.ok(fs.existsSync(onDisk), "PDF written to export dir");
  assert.ok(fs.statSync(onDisk).size > 500, "PDF is non-trivial");
});

test("proposal status flow zet accepted_at", async () => {
  const project = await (await j("/api/projects", "POST", { title: "Statusproject" })).json();
  const proposal = await (await j("/api/proposals", "POST", { project_id: project.id, title: "V" })).json();
  const updated = await (await j(`/api/proposals/${proposal.id}/status`, "PUT", { status: "accepted" })).json();
  assert.equal(updated.status, "accepted");
  assert.ok(updated.accepted_at && updated.accepted_at !== "", "accepted_at set");
});

test("supplier price list import: updates SKU-match, creates new as candidate, links supplier", async () => {
  const supplier = await (await j("/api/suppliers", "POST", { name: "Leverancier X" })).json();
  assert.match(supplier.id, /^supplier_/);

  // Pre-seed a product whose SKU matches the first CSV row.
  const seeded = await (await j("/api/products", "POST", { name: "Oude bank", sku: "SKU-A", price: 999 })).json();

  const csv = [
    "name,sku,purchase_price,sale_price,vat_rate",
    "Widget A,SKU-A,10,20,21",
    "Widget B,SKU-B,5,15,21"
  ].join("\n");

  const res = await j(`/api/suppliers/${supplier.id}/import-price-list`, "POST", { csv });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { created: 1, updated: 1, skipped: 0 });

  const products = await (await j("/api/products")).json();

  const updated = products.find((p) => p.id === seeded.id);
  assert.ok(updated, "seeded product still present");
  assert.equal(updated.supplier_id, supplier.id, "supplier_id set on updated product");
  assert.equal(updated.purchase_price, 10);
  assert.equal(updated.sale_price, 20);
  assert.equal(updated.margin, 10, "margin = sale - purchase");

  const created = products.find((p) => p.sku === "SKU-B");
  assert.ok(created, "new product created from CSV");
  assert.equal(created.status, "candidate");
  assert.equal(created.supplier_id, supplier.id);
  assert.equal(created.sale_price, 15);
});

test("supplier price list import: unknown supplier returns 404", async () => {
  const res = await j("/api/suppliers/supplier_does_not_exist/import-price-list", "POST", { csv: "name,sku\nX,Y" });
  assert.equal(res.status, 404);
});

test("supplier price list import: empty body returns zero counts", async () => {
  const supplier = await (await j("/api/suppliers", "POST", { name: "Leeg" })).json();
  const res = await j(`/api/suppliers/${supplier.id}/import-price-list`, "POST", {});
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { created: 0, updated: 0, skipped: 0 });
});

test("supplier price list import: emits an audit entry with the counts", async () => {
  const supplier = await (await j("/api/suppliers", "POST", { name: "Audit-leverancier" })).json();
  const csv = "name,sku\nNieuw Item,SKU-AUDIT-1\n,SKU-EMPTY\n";
  const res = await j(`/api/suppliers/${supplier.id}/import-price-list`, "POST", { csv });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { created: 1, updated: 0, skipped: 1 });

  // audit_log persists via the audit module; query through the DB directly here
  // since the audit router is not mounted in this test app.
  const { db } = require("../db/database");
  const entry = db.prepare(
    "SELECT action, detail FROM audit_log WHERE entity = 'supplier' AND entity_id = ? AND action = 'price_list_import' ORDER BY rowid DESC LIMIT 1"
  ).get(supplier.id);
  assert.ok(entry, "audit entry recorded");
  assert.deepEqual(JSON.parse(entry.detail), { created: 1, updated: 0, skipped: 1 });
});
