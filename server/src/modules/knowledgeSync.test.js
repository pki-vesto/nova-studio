const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const tmp = path.join(os.tmpdir(), `nova-knowledge-sync-${crypto.randomUUID().slice(0, 8)}`);
process.env.NOVA_DATA_DIR = tmp;
process.env.NOVA_DB_PATH = path.join(tmp, "test.db");
process.env.NOVA_UPLOAD_DIR = path.join(tmp, "uploads");
process.env.NOVA_EXPORT_DIR = path.join(tmp, "exports");
fs.mkdirSync(tmp, { recursive: true });

const express = require("express");
const { migrate } = require("../db/schema");
const { db } = require("../db/database");
const { promoteEntity, safePromote } = require("./knowledgeSync");

migrate();

const app = express();
app.use(express.json());
app.use("/api/clients", require("./clients"));
app.use("/api/projects", require("./projects"));
app.use("/api/products", require("./products"));
app.use("/api/materials", require("./materials"));
app.use("/api/suppliers", require("./suppliers"));
app.use("/api/knowledge", require("./knowledge"));
app.use((err, _req, res, _next) => res.status(err.name === "ZodError" ? 400 : 500).json({ error: err.message }));

let base;
const server = app.listen(0);
test.before(() => new Promise((r) => (server.listening ? r() : server.on("listening", r))).then(() => { base = `http://127.0.0.1:${server.address().port}`; }));
test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function j(route, method, body) {
  const res = await fetch(`${base}${route}`, {
    method: method || "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function node(type, refId) {
  return db.prepare("SELECT * FROM knowledge_nodes WHERE type = ? AND ref_id = ?").get(type, refId);
}

function nodeCount(type, refId) {
  return db.prepare("SELECT COUNT(*) AS count FROM knowledge_nodes WHERE type = ? AND ref_id = ?").get(type, refId).count;
}

function dataOf(row) {
  return JSON.parse(row.data_json || "{}");
}

async function assertPromotedFlow({ type, create, update, updatedLabel, forbidden = [] }) {
  const created = await create();
  assert.equal(nodeCount(type, created.id), 1, `${type} create promotes exactly one node`);
  const first = node(type, created.id);
  assert.equal(first.label, created.name || created.title);

  const promoteCreate = db.prepare("SELECT * FROM audit_log WHERE entity = 'knowledge_node' AND entity_id = ? AND action = 'promote_create'").get(first.id);
  assert.ok(promoteCreate, `${type} promote_create audit written`);

  const updated = await update(created);
  assert.equal(nodeCount(type, created.id), 1, `${type} update does not duplicate node`);
  const refreshed = node(type, created.id);
  assert.equal(refreshed.id, first.id);
  assert.equal(refreshed.label, updatedLabel);

  const promoteUpdate = db.prepare("SELECT * FROM audit_log WHERE entity = 'knowledge_node' AND entity_id = ? AND action = 'promote_update'").get(first.id);
  assert.ok(promoteUpdate, `${type} promote_update audit written`);

  const data = dataOf(refreshed);
  for (const key of forbidden) {
    assert.equal(Object.hasOwn(data, key), false, `${type} data_json does not leak ${key}`);
  }
  return { created, updated, node: refreshed, data };
}

test("promoteEntity upserts one knowledge node and safePromote never throws", () => {
  const first = promoteEntity("concept", "ref-1", "Eerste label", { version: 1 });
  const second = promoteEntity("concept", "ref-1", "Tweede label", { version: 2 });

  assert.equal(first.id, second.id);
  assert.equal(nodeCount("concept", "ref-1"), 1);
  assert.equal(node("concept", "ref-1").label, "Tweede label");
  assert.equal(dataOf(node("concept", "ref-1")).version, 2);

  const circular = {};
  circular.self = circular;
  assert.doesNotThrow(() => safePromote("concept", "bad-ref", "Bad", circular));
  const errorAudit = db.prepare(`
    SELECT * FROM audit_log
    WHERE entity = 'knowledge_node' AND entity_id = 'bad-ref' AND action = 'promote_error'
  `).get();
  assert.ok(errorAudit);
});

test("manual /knowledge/promote keeps the shared idempotent upsert behavior", async () => {
  const created = await j("/api/knowledge/promote", "POST", {
    type: "moodboard",
    ref_id: "moodboard-1",
    label: "Moodboard een",
    data: { status: "draft" }
  });
  assert.equal(created.status, 200);

  const updated = await j("/api/knowledge/promote", "POST", {
    type: "moodboard",
    ref_id: "moodboard-1",
    label: "Moodboard definitief",
    data: { status: "final" }
  });
  assert.equal(updated.status, 200);
  assert.equal(created.body.id, updated.body.id);
  assert.equal(nodeCount("moodboard", "moodboard-1"), 1);
  assert.equal(node("moodboard", "moodboard-1").label, "Moodboard definitief");
});

test("domain create/update auto-promotes idempotent knowledge nodes with safe data", async () => {
  await assertPromotedFlow({
    type: "client",
    create: async () => (await j("/api/clients", "POST", {
      name: "Familie Jansen",
      company: "Jansen BV",
      email: "jansen@example.nl",
      phone: "0612345678",
      address: "Straat 1",
      notes: "Interne notitie"
    })).body,
    update: async (client) => (await j(`/api/clients/${client.id}`, "PUT", { name: "Familie Jansen Updated", email: "nieuw@example.nl" })).body,
    updatedLabel: "Familie Jansen Updated",
    forbidden: ["email", "phone", "address", "notes", "preferences_json"]
  });

  await assertPromotedFlow({
    type: "supplier",
    create: async () => (await j("/api/suppliers", "POST", {
      name: "Vescom Sync",
      email: "sales@example.nl",
      phone: "0201234567",
      category: "Textiel",
      conditions: "Intern",
      reliability_notes: "Alleen intern"
    })).body,
    update: async (supplier) => (await j(`/api/suppliers/${supplier.id}`, "PUT", { name: "Vescom Sync Updated", phone: "0207654321" })).body,
    updatedLabel: "Vescom Sync Updated",
    forbidden: ["email", "phone", "conditions", "reliability_notes", "notes"]
  });

  await assertPromotedFlow({
    type: "project",
    create: async () => (await j("/api/projects", "POST", {
      title: "Knowledge Project",
      clientName: "Nieuwe kennis klant",
      address: "Projectstraat 1",
      brief: "Intern brief",
      budget_total: 50000
    })).body,
    update: async (project) => (await j(`/api/projects/${project.id}`, "PUT", { title: "Knowledge Project Updated", brief: "Bijgewerkt" })).body,
    updatedLabel: "Knowledge Project Updated",
    forbidden: ["address", "brief", "budget_total", "client_email", "client_phone"]
  });

  const supplier = (await j("/api/suppliers", "POST", { name: "Product Supplier" })).body;
  await assertPromotedFlow({
    type: "product",
    create: async () => (await j("/api/products", "POST", {
      name: "Sync Stoel",
      brand: "Nova",
      supplier: "Product Supplier",
      supplier_id: supplier.id,
      category: "Stoelen",
      sku: "SYNC-1",
      price: 100,
      purchase_price: 40,
      sale_price: 90
    })).body,
    update: async (product) => (await j(`/api/products/${product.id}`, "PUT", { name: "Sync Stoel Updated", sale_price: 95 })).body,
    updatedLabel: "Sync Stoel Updated",
    forbidden: ["price", "purchase_price", "sale_price", "margin", "vat_rate", "webshop_url", "notes"]
  });

  const project = (await j("/api/projects", "POST", { title: "Material Project" })).body;
  await assertPromotedFlow({
    type: "material",
    create: async () => (await j("/api/materials", "POST", {
      project_id: project.id,
      name: "Sync Travertin",
      spec: "Gezoet",
      application: "Badkamer",
      brand: "Stone",
      code: "TRV-SYNC",
      maintenance: "Intern onderhoud",
      sustainability_score: 4,
      supplier_id: supplier.id
    })).body,
    update: async (material) => (await j(`/api/materials/${material.id}`, "PUT", { name: "Sync Travertin Updated", maintenance: "Nieuw intern" })).body,
    updatedLabel: "Sync Travertin Updated",
    forbidden: ["maintenance", "sustainability_score", "image_path", "library_id"]
  });
});
