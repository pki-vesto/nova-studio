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
