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
const { db } = require("../db/database");

migrate();

const app = express();
app.use(express.json());
app.use("/api/clients", require("./clients"));
app.use("/api/projects", require("./projects"));
app.use("/api/products", require("./products"));
app.use("/api/intake", require("./intake"));
app.use("/api/rooms", require("./rooms"));
app.use("/api/materials", require("./materials"));
app.use("/api/suppliers", require("./suppliers"));
app.use("/api/proposals", require("./proposals"));
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

function pdfStructure(buffer) {
  const text = buffer.toString("latin1");
  return {
    header: text.slice(0, 5),
    pageCount: (text.match(/\/Type\s*\/Page\b/g) || []).length,
    hasA4MediaBox: text.includes("/MediaBox [0 0 595.28 841.89]"),
    fontRefs: (text.match(/\/Font\b/g) || []).length,
    hasCatalog: text.includes("/Type /Catalog"),
    hasTrailer: text.includes("%%EOF")
  };
}

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

test("intake questionnaire is configurable", async () => {
  const initial = await (await j("/api/intake/questionnaire")).json();
  assert.ok(initial.some((q) => q.key === "wishes"), "default questions are seeded");

  const next = initial.map((q) => q.key === "wishes"
    ? { ...q, label: "Ontwerpvraag", placeholder: "Wat moet het ontwerp oplossen?", sort_order: 5, is_enabled: true }
    : q);
  const res = await j("/api/intake/questionnaire", "PUT", { questions: next });
  assert.equal(res.status, 200);
  const saved = await res.json();
  const wishes = saved.find((q) => q.key === "wishes");
  assert.equal(wishes.label, "Ontwerpvraag");
  assert.equal(wishes.placeholder, "Wat moet het ontwerp oplossen?");
  assert.equal(wishes.sort_order, 5);
  assert.equal(wishes.is_enabled, true);
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

test("productcategorieen beheren en toepassen op producten", async () => {
  const product = await (await j("/api/products", "POST", { name: "Categorie-bank", category: "Meubilair", price: 1000 })).json();

  const initial = await (await j("/api/products/categories")).json();
  const furniture = initial.find((c) => c.name === "Meubilair");
  assert.ok(furniture, "product write seeds the managed category vocabulary");
  assert.equal(furniture.product_count, 1);

  const createdRes = await j("/api/products/categories", "POST", { name: "Verlichting" });
  assert.equal(createdRes.status, 201);
  const created = await createdRes.json();
  assert.equal(created.name, "Verlichting");

  const renamedRes = await j(`/api/products/categories/${furniture.id}`, "PUT", { name: "Zitmeubilair" });
  assert.equal(renamedRes.status, 200);
  assert.equal((await renamedRes.json()).name, "Zitmeubilair");
  const renamedProduct = db.prepare("SELECT category FROM products WHERE id = ?").get(product.id);
  assert.equal(renamedProduct.category, "Zitmeubilair", "renaming category updates linked products");

  const duplicate = await j(`/api/products/categories/${created.id}`, "PUT", { name: "zitmeubilair" });
  assert.equal(duplicate.status, 409);

  const deleteLinkedRes = await j(`/api/products/categories/${furniture.id}`, "DELETE");
  assert.equal(deleteLinkedRes.status, 204);
  const clearedProduct = db.prepare("SELECT category FROM products WHERE id = ?").get(product.id);
  assert.equal(clearedProduct.category, "", "deleting category clears linked product category");

  const deleteRes = await j(`/api/products/categories/${created.id}`, "DELETE");
  assert.equal(deleteRes.status, 204);
  const afterDelete = await (await j("/api/products/categories")).json();
  assert.equal(afterDelete.some((c) => c.id === created.id), false);
});

test("room finish schedule bundelt kleuren materialen en notities", async () => {
  const project = await (await j("/api/projects", "POST", { title: "Afwerkproject" })).json();
  const room = await (await j("/api/rooms", "POST", {
    project_id: project.id,
    name: "Woonkamer",
    floor_level: "Bel-etage",
    concept: "Rustig en tactiel",
    color_notes: "Kalkmat op de wanden",
    designer_notes: "Plinten in dezelfde tint"
  })).json();

  db.prepare("INSERT INTO color_library (id, name, hex, code, finish) VALUES (?, ?, ?, ?, ?)")
    .run("color_test", "Kalkwit", "#f4efe7", "KW-01", "Mat");
  db.prepare("INSERT INTO room_colors (id, room_id, color_id, application) VALUES (?, ?, ?, ?)")
    .run("roomcolor_test", room.id, "color_test", "Wanden");
  db.prepare(`
    INSERT INTO materials (id, project_id, name, spec, application, maintenance)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run("material_test", project.id, "Eiken vloer", "Gerookt, geolied", "Vloer", "pH-neutraal reinigen");

  const res = await j(`/api/rooms/${room.id}/finish-schedule`);
  assert.equal(res.status, 200);
  const bundle = await res.json();
  assert.equal(bundle.room.id, room.id);
  assert.equal(bundle.notes.concept, "Rustig en tactiel");
  assert.equal(bundle.colors.length, 1);
  assert.equal(bundle.colors[0].resolved_name, "Kalkwit");
  assert.equal(bundle.colors[0].resolved_hex, "#f4efe7");
  assert.equal(bundle.colors[0].library_finish, "Mat");
  assert.equal(bundle.materials.length, 1);
  assert.equal(bundle.materials[0].name, "Eiken vloer");

  const pdfRes = await j(`/api/rooms/${room.id}/finish-schedule.pdf`, "POST");
  assert.equal(pdfRes.status, 200);
  const out = await pdfRes.json();
  assert.ok(out.filename.endsWith(".pdf"));
  const onDisk = path.join(process.env.NOVA_EXPORT_DIR, path.basename(out.path));
  assert.ok(fs.existsSync(onDisk), "finish schedule PDF written");
  const pdf = fs.readFileSync(onDisk);
  assert.equal(pdf.subarray(0, 4).toString("utf8"), "%PDF");
  assert.ok(pdf.length > 500, "finish schedule PDF is non-trivial");
  assert.equal(pdf.includes(Buffer.from("9999")), false, "internal price/margin values are absent");
});

test("room finish schedule export werkt voor lege ruimte en 404", async () => {
  const project = await (await j("/api/projects", "POST", { title: "Leeg afwerkproject" })).json();
  const room = await (await j("/api/rooms", "POST", { project_id: project.id, name: "Hal" })).json();

  const bundleRes = await j(`/api/rooms/${room.id}/finish-schedule`);
  assert.equal(bundleRes.status, 200);
  const bundle = await bundleRes.json();
  assert.equal(bundle.colors.length, 0);
  assert.equal(bundle.materials.length, 0);

  const pdfRes = await j(`/api/rooms/${room.id}/finish-schedule.pdf`, "POST");
  assert.equal(pdfRes.status, 200);
  const out = await pdfRes.json();
  const onDisk = path.join(process.env.NOVA_EXPORT_DIR, path.basename(out.path));
  assert.equal(fs.readFileSync(onDisk).subarray(0, 4).toString("utf8"), "%PDF");

  assert.equal((await j("/api/rooms/missing-room/finish-schedule")).status, 404);
  assert.equal((await j("/api/rooms/missing-room/finish-schedule.pdf", "POST")).status, 404);
});

test("material sample workflow request receive reset en dashboard", async () => {
  const project = await (await j("/api/projects", "POST", { title: "Sampleproject" })).json();
  const supplier = await (await j("/api/suppliers", "POST", { name: "Stalenhuis" })).json();
  const material = await (await j("/api/materials", "POST", {
    project_id: project.id,
    name: "Travertin sample",
    spec: "Gezoet",
    application: "Badkamer",
    supplier_id: supplier.id
  })).json();
  assert.equal(material.sample_status, "none");

  const requested = await (await j(`/api/materials/${material.id}/sample/request`, "POST")).json();
  assert.equal(requested.sample_status, "requested");
  assert.ok(requested.sample_requested_at);
  assert.equal(requested.sample_received_at || "", "");

  const requestedAgain = await (await j(`/api/materials/${material.id}/sample/request`, "POST")).json();
  assert.equal(requestedAgain.sample_requested_at, requested.sample_requested_at);

  const received = await (await j(`/api/materials/${material.id}/sample/receive`, "POST")).json();
  assert.equal(received.sample_status, "received");
  assert.equal(received.sample_requested_at, requested.sample_requested_at);
  assert.ok(received.sample_received_at);

  const dashboard = await (await j(`/api/materials/project/${project.id}/sample-dashboard`)).json();
  assert.equal(dashboard.received.length, 1);
  assert.equal(dashboard.received[0].name, "Travertin sample");
  assert.equal(dashboard.received[0].supplier_name, "Stalenhuis");
  assert.equal(dashboard.requested.length, 0);

  const reset = await (await j(`/api/materials/${material.id}/sample/reset`, "POST")).json();
  assert.equal(reset.sample_status, "none");
  assert.equal(reset.sample_requested_at || "", "");
  assert.equal(reset.sample_received_at || "", "");

  const auditRequest = db.prepare("SELECT * FROM audit_log WHERE entity = 'material' AND entity_id = ? AND action = 'sample_request'").get(material.id);
  const auditReceive = db.prepare("SELECT * FROM audit_log WHERE entity = 'material' AND entity_id = ? AND action = 'sample_receive'").get(material.id);
  assert.ok(auditRequest);
  assert.ok(auditReceive);
  assert.equal((await j("/api/materials/project/missing-project/sample-dashboard")).status, 404);
});

test("material sample overview groepeert per status en sluit soft-deleted projecten uit", async () => {
  const p1 = await (await j("/api/projects", "POST", { title: "Sample Overview A" })).json();
  const p2 = await (await j("/api/projects", "POST", { title: "Sample Overview B" })).json();
  const p3 = await (await j("/api/projects", "POST", { title: "Sample Overview Verwijderd" })).json();
  const supplier = await (await j("/api/suppliers", "POST", { name: "Overview Stalenhuis" })).json();

  const m1 = await (await j("/api/materials", "POST", {
    project_id: p1.id, name: "Travertin OV1", brand: "Solid", code: "TRV-OV1",
    sample_status: "requested", supplier_id: supplier.id
  })).json();
  await j("/api/materials", "POST", {
    project_id: p1.id, name: "Marmer OV2", sample_status: "received", supplier_id: supplier.id
  });
  await j("/api/materials", "POST", { project_id: p1.id, name: "Eik OV3", sample_status: "none" });
  await j("/api/materials", "POST", {
    project_id: p2.id, name: "Linnen OV4", sample_status: "requested"
  });
  const deleted = await (await j("/api/materials", "POST", {
    project_id: p3.id, name: "Wool OV5", sample_status: "requested", supplier_id: supplier.id
  })).json();

  // Soft-delete project 3 — its materials must be excluded from the overview.
  db.prepare("UPDATE projects SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(p3.id);

  const overview = await (await j("/api/materials/sample-overview")).json();
  assert.ok(overview.groups, "groups present");
  assert.ok(overview.counts, "counts present");

  const all = [...overview.groups.requested, ...overview.groups.received, ...overview.groups.none];
  const ids = all.map((r) => r.id);
  assert.equal(ids.includes(deleted.id), false, "soft-deleted project material excluded");

  // Only assert on materials seeded in this test, to stay isolated from other tests.
  const seeded = (rows) => rows.filter((r) => r.project_id === p1.id || r.project_id === p2.id);
  const requested = seeded(overview.groups.requested);
  const received = seeded(overview.groups.received);
  const none = seeded(overview.groups.none);
  assert.equal(requested.length, 2, "two requested samples across both projects");
  assert.equal(received.length, 1, "one received sample");
  assert.equal(none.length, 1, "one none sample");

  // Counts mirror group lengths (sanity, not seed-only).
  assert.equal(overview.counts.requested, overview.groups.requested.length);
  assert.equal(overview.counts.received, overview.groups.received.length);
  assert.equal(overview.counts.none, overview.groups.none.length);

  // Row shape: project_title is always present; supplier_name reflects the join.
  const m1row = requested.find((r) => r.id === m1.id);
  assert.ok(m1row, "seeded requested material present");
  assert.equal(m1row.project_title, "Sample Overview A");
  assert.equal(m1row.supplier_name, "Overview Stalenhuis");
  const linnen = requested.find((r) => r.name === "Linnen OV4");
  assert.equal(linnen.supplier_name, null, "supplier_name is null when not linked");
});

test("supplier price list import maakt kandidaten en update SKU matches", async () => {
  const supplier = await (await j("/api/suppliers", "POST", { name: "Vescom" })).json();
  const existing = await (await j("/api/products", "POST", {
    name: "Oude wandbekleding",
    sku: "SKU-1",
    price: 10,
    purchase_price: 4,
    sale_price: 9
  })).json();

  const csv = [
    "name,sku,purchase_price,sale_price,price,vat_rate,category,brand,ignored",
    "Nieuwe wandbekleding,SKU-2,20,35,40,21,Wandbekleding,Vescom,x",
    "Vernieuwde wandbekleding,SKU-1,12,30,33,9,Wandbekleding,Vescom,y",
    ",SKU-EMPTY,1,2,3,21,Decor,Vescom,z"
  ].join("\n");

  const res = await j(`/api/suppliers/${supplier.id}/import-price-list`, "POST", { csv });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { created: 1, updated: 1, skipped: 1 });

  const updated = db.prepare("SELECT * FROM products WHERE id = ?").get(existing.id);
  assert.equal(updated.name, "Oude wandbekleding");
  assert.equal(updated.supplier_id, supplier.id);
  assert.equal(updated.supplier, "Vescom");
  assert.equal(updated.price, 33);
  assert.equal(updated.purchase_price, 12);
  assert.equal(updated.sale_price, 30);
  assert.equal(updated.margin, 18);
  assert.equal(updated.vat_rate, 9);

  const created = db.prepare("SELECT * FROM products WHERE sku = ?").get("SKU-2");
  assert.ok(created);
  assert.equal(created.status, "candidate");
  assert.equal(created.supplier_id, supplier.id);
  assert.equal(created.supplier, "Vescom");
  assert.equal(created.margin, 15);

  const audit = db.prepare(`
    SELECT * FROM audit_log
    WHERE entity = 'supplier' AND entity_id = ? AND action = 'price_list_import'
    ORDER BY rowid DESC
  `).get(supplier.id);
  assert.ok(audit);
  assert.deepEqual(JSON.parse(audit.detail), { created: 1, updated: 1, skipped: 1 });
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

test("proposal PDF visual smoke bewaakt documentstructuur", async () => {
  const project = await (await j("/api/projects", "POST", {
    title: "Visual Smoke Proposal",
    clientName: "Familie Smoke",
    address: "Rotterdam",
    brief: "Warme basis met natuurlijke materialen"
  })).json();
  const room = await (await j("/api/rooms", "POST", { project_id: project.id, name: "Woonkamer", concept: "Rustig en tactiel" })).json();
  const product = await (await j("/api/products", "POST", { name: "Linnen bank", brand: "Nova", price: 2400 })).json();
  await j("/api/products/select", "POST", { project_id: project.id, room_id: room.id, product_id: product.id, quantity: 1 });
  await j("/api/materials", "POST", { project_id: project.id, name: "Travertin", spec: "Gezoet", application: "Salontafel" });
  const proposal = await (await j("/api/proposals", "POST", {
    project_id: project.id,
    title: "Visual Smoke Voorstel",
    intro_text: "Een rustige basis met zichtbare materialen.",
    style_direction: "Warm minimalisme",
    color_advice: "Kalk, linnen en salie",
    closing_text: "Na akkoord werken we planning en inkoop uit."
  })).json();

  const exportRes = await j(`/api/proposals/${proposal.id}/export-pdf?audience=client`, "POST");
  assert.equal(exportRes.status, 200);
  const out = await exportRes.json();
  const onDisk = path.join(process.env.NOVA_EXPORT_DIR, path.basename(out.path));
  const pdf = fs.readFileSync(onDisk);
  const structure = pdfStructure(pdf);

  assert.equal(structure.header, "%PDF-");
  assert.ok(pdf.length > 2000, "visual smoke PDF has meaningful size");
  assert.ok(structure.pageCount >= 2, "proposal has cover plus body pages");
  assert.equal(structure.hasA4MediaBox, true, "proposal renders on A4 pages");
  assert.ok(structure.fontRefs >= 1, "proposal has font resources");
  assert.equal(structure.hasCatalog, true, "proposal has a PDF catalog");
  assert.equal(structure.hasTrailer, true, "proposal has a complete trailer");
});

test("product price history capture en surface", async () => {
  const product = await (await j("/api/products", "POST", {
    name: "Eames Lounge", purchase_price: 10, sale_price: 25, price: 25
  })).json();
  const initial = await (await j(`/api/products/${product.id}/price-history`)).json();
  assert.equal(initial.length, 1, "initial row written on create");
  assert.equal(initial[0].purchase_price, 10);
  assert.equal(initial[0].sale_price, 25);
  assert.equal(initial[0].margin, 15, "margin = sale - purchase");

  const bumped = await j(`/api/products/${product.id}`, "PUT", { sale_price: 30 });
  assert.equal(bumped.status, 200);
  const afterBump = await (await j(`/api/products/${product.id}/price-history`)).json();
  assert.equal(afterBump.length, 2, "price-changing update appends a row");
  assert.equal(afterBump[0].sale_price, 30, "newest row first");

  const noop = await j(`/api/products/${product.id}`, "PUT", { sale_price: 30, purchase_price: 10, price: 25 });
  assert.equal(noop.status, 200);
  const afterNoop = await (await j(`/api/products/${product.id}/price-history`)).json();
  assert.equal(afterNoop.length, 2, "identical prices do not pollute history");

  const nameOnly = await j(`/api/products/${product.id}`, "PUT", { name: "Eames Lounge — herzien" });
  assert.equal(nameOnly.status, 200);
  const afterNameEdit = await (await j(`/api/products/${product.id}/price-history`)).json();
  assert.equal(afterNameEdit.length, 2, "non-price edits do not append history");

  const missing = await j("/api/products/product_does_not_exist/price-history");
  assert.equal(missing.status, 404);
});

// Hex-encode an ASCII string the way PDFKit writes glyphs inside `<...>` TJ
// hex strings (lowercase). Used to assert text fragments survive into the
// uncompressed PDF stream, even though kerning gaps split longer runs.
const asPdfHex = (s) => Buffer.from(s, "utf8").toString("hex");

test("projectoverdracht PDF bundelt ruimtes materialen producten en documenten zonder inkoopdata", async () => {
  const project = await (await j("/api/projects", "POST", { title: "Overdrachtproject" })).json();

  await j("/api/rooms", "POST", { project_id: project.id, name: "Woonkamer", dimensions: "5x4" });
  await j("/api/rooms", "POST", { project_id: project.id, name: "Keuken", dimensions: "3x3" });

  db.prepare("INSERT INTO materials (id, project_id, name, spec, application) VALUES (?, ?, ?, ?, ?)")
    .run("mat_handover_1", project.id, "Travertin tegel", "Gezoet", "Vloer badkamer");
  db.prepare("INSERT INTO materials (id, project_id, name, spec, application) VALUES (?, ?, ?, ?, ?)")
    .run("mat_handover_2", project.id, "Eiken hout", "Geolied", "Vloer woonkamer");

  const productA = await (await j("/api/products", "POST", {
    name: "Bank Sloane", brand: "Studio Nord", price: 4500
  })).json();
  const productB = await (await j("/api/products", "POST", { name: "Hanglamp", price: 850 })).json();
  // Internal-only numerics seeded directly so the client-safe filter is tested in isolation.
  db.prepare("UPDATE products SET purchase_price = 2222, margin = 1313 WHERE id = ?").run(productA.id);

  await j("/api/products/select", "POST", { project_id: project.id, product_id: productA.id, quantity: 1 });
  await j("/api/products/select", "POST", { project_id: project.id, product_id: productB.id, quantity: 2 });

  db.prepare("INSERT INTO project_documents (id, project_id, kind, title, file_name) VALUES (?, ?, ?, ?, ?)")
    .run("doc_handover_1", project.id, "contract", "Ondertekend contract", "contract.pdf");

  const res = await j(`/api/proposals/${project.id}/handover-pdf`, "POST");
  assert.equal(res.status, 200);
  const out = await res.json();
  assert.equal(out.kind, "handover");
  assert.ok(out.url.startsWith("/exports/"));
  assert.ok(out.filename.includes("overdracht"));
  assert.ok(out.filename.endsWith(".pdf"));
  assert.ok(/\d{4}-\d{2}-\d{2}/.test(out.filename), "filename carries Europe/Amsterdam dated stamp");
  assert.ok(out.filename.startsWith("overdrachtproject-overdracht-"), "filename slugs the project title");

  const onDisk = path.join(process.env.NOVA_EXPORT_DIR, path.basename(out.path));
  assert.ok(fs.existsSync(onDisk), "handover PDF written to disk");
  const pdf = fs.readFileSync(onDisk);
  assert.equal(pdf.subarray(0, 4).toString("utf8"), "%PDF");
  assert.ok(pdf.length > 500, "handover PDF is non-trivial");

  // The project title goes into the PDF Info dict as a literal string.
  assert.ok(pdf.includes(Buffer.from("Overdrachtproject")), "project title rendered in PDF Info dict");
  // Selected product + document title survive into the page content stream
  // as hex-encoded glyphs inside `<...>` TJ runs. Use short fragments because
  // PDFKit splits longer strings on kerning pairs.
  assert.ok(pdf.includes(Buffer.from(asPdfHex("Bank"))), "selected product glyphs rendered");
  assert.ok(pdf.includes(Buffer.from(asPdfHex("Onder"))), "document index glyphs rendered");

  // Client-safe: purchase_price (2222) and margin (1313) must not leak in any
  // representation — ASCII (Info dict, metadata) or hex (TJ glyph runs).
  assert.equal(pdf.includes(Buffer.from("2222")), false, "purchase_price absent (ASCII)");
  assert.equal(pdf.includes(Buffer.from("1313")), false, "margin absent (ASCII)");
  assert.equal(pdf.includes(Buffer.from(asPdfHex("2222"))), false, "purchase_price absent (TJ hex)");
  assert.equal(pdf.includes(Buffer.from(asPdfHex("1313"))), false, "margin absent (TJ hex)");
});

test("projectoverdracht PDF rendert werkflow-waarschuwingen voor leeg project en geeft 404", async () => {
  const empty = await (await j("/api/projects", "POST", { title: "Leeg overdrachtproject" })).json();
  const res = await j(`/api/proposals/${empty.id}/handover-pdf`, "POST");
  assert.equal(res.status, 200);
  const out = await res.json();
  const onDisk = path.join(process.env.NOVA_EXPORT_DIR, path.basename(out.path));
  const pdf = fs.readFileSync(onDisk);
  assert.equal(pdf.subarray(0, 4).toString("utf8"), "%PDF");
  assert.ok(pdf.length > 500, "empty handover PDF is non-trivial");
  // Workflow-warning text fragments survive into the TJ glyph runs. Searching
  // for short fragments avoids PDFKit's kerning gaps splitting the run.
  assert.ok(pdf.includes(Buffer.from(asPdfHex("ruimtes"))), "rooms-warning fragment rendered");
  assert.ok(pdf.includes(Buffer.from(asPdfHex("materialen"))), "materials-warning fragment rendered");
  assert.ok(pdf.includes(Buffer.from(asPdfHex("oducten"))), "products-warning fragment rendered");
  assert.ok(pdf.includes(Buffer.from(asPdfHex("ojectdocumenten"))), "documents-warning fragment rendered");

  assert.equal((await j("/api/proposals/missing-project/handover-pdf", "POST")).status, 404);
});

test("proposal status flow zet accepted_at", async () => {
  const project = await (await j("/api/projects", "POST", { title: "Statusproject" })).json();
  const proposal = await (await j("/api/proposals", "POST", { project_id: project.id, title: "V" })).json();
  const updated = await (await j(`/api/proposals/${proposal.id}/status`, "PUT", { status: "accepted" })).json();
  assert.equal(updated.status, "accepted");
  assert.ok(updated.accepted_at && updated.accepted_at !== "", "accepted_at set");
});
