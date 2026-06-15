// Floorplan object → product/material linkage: round-trip + ON DELETE SET NULL.
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const tmp = path.join(os.tmpdir(), `nova-fp-objects-${crypto.randomUUID().slice(0, 8)}`);
process.env.NOVA_DATA_DIR = tmp;
process.env.NOVA_DB_PATH = path.join(tmp, "test.db");
process.env.NOVA_UPLOAD_DIR = path.join(tmp, "uploads");
fs.mkdirSync(tmp, { recursive: true });

const express = require("express");
const { migrate } = require("../db/schema");
const { db } = require("../db/database");

migrate();

const app = express();
app.use(express.json());
app.use("/api/projects", require("./projects"));
app.use("/api/products", require("./products"));
app.use("/api/materials", require("./materials"));
app.use("/api/floorplans", require("./floorplans"));
app.use((err, _req, res, _next) => res.status(err.name === "ZodError" ? 400 : 500).json({ error: err.message }));

let base;
const server = app.listen(0);
test.before(() => new Promise((r) => (server.listening ? r() : server.on("listening", r))).then(() => { base = `http://127.0.0.1:${server.address().port}`; }));
test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const j = (path, method, body) => fetch(`${base}${path}`, {
  method: method || "GET",
  headers: body ? { "Content-Type": "application/json" } : undefined,
  body: body ? JSON.stringify(body) : undefined
});

test("floorplan object links to a product and survives product delete with NULL", async () => {
  const project = await (await j("/api/projects", "POST", { title: "Plattegrond-koppeling" })).json();
  const product = await (await j("/api/products", "POST", { name: "Loungebank", price: 1500 })).json();

  // Create the floorplan directly via DB to avoid the multipart upload path.
  const floorplanId = "floorplan_test_link";
  db.prepare(`
    INSERT INTO floorplans (id, project_id, name, drawing_json)
    VALUES (?, ?, ?, ?)
  `).run(floorplanId, project.id, "Begane grond", '{"walls":[],"doors":[],"windows":[],"labels":[]}');

  const createRes = await j(`/api/floorplans/${floorplanId}/objects`, "POST", {
    layer: "furniture",
    kind: "sofa",
    label: "Bank 3-zits",
    geometry: { x: 100, y: 100, w: 60, h: 30 },
    product_id: product.id
  });
  assert.equal(createRes.status, 201);
  const created = await createRes.json();
  assert.equal(created.product_id, product.id);
  assert.equal(created.product_name, "Loungebank");
  assert.equal(created.material_id, null);

  // Round-trip via GET.
  const listed = await (await j(`/api/floorplans/${floorplanId}/objects`)).json();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].product_id, product.id);
  assert.equal(listed[0].product_name, "Loungebank");

  // Delete product → object survives with NULL product_id.
  const delRes = await j(`/api/products/${product.id}`, "DELETE");
  assert.equal(delRes.status, 204);

  const afterDelete = await (await j(`/api/floorplans/${floorplanId}/objects`)).json();
  assert.equal(afterDelete.length, 1, "object survives product deletion");
  assert.equal(afterDelete[0].product_id, null, "FK ON DELETE SET NULL nulled the link");
  assert.equal(afterDelete[0].product_name, null);
  assert.equal(afterDelete[0].label, "Bank 3-zits", "other fields untouched");
});

test("PUT can detach a product link by sending null", async () => {
  const project = await (await j("/api/projects", "POST", { title: "Detach-koppeling" })).json();
  const product = await (await j("/api/products", "POST", { name: "Vloerlamp", price: 250 })).json();

  const floorplanId = "floorplan_test_detach";
  db.prepare(`
    INSERT INTO floorplans (id, project_id, name, drawing_json)
    VALUES (?, ?, ?, ?)
  `).run(floorplanId, project.id, "Bel-etage", '{}');

  const created = await (await j(`/api/floorplans/${floorplanId}/objects`, "POST", {
    layer: "furniture",
    kind: "lamp",
    product_id: product.id
  })).json();
  assert.equal(created.product_id, product.id);

  const cleared = await (await j(`/api/floorplans/objects/${created.id}`, "PUT", { product_id: null })).json();
  assert.equal(cleared.product_id, null);
  assert.equal(cleared.product_name, null);

  // Partial PUT without product_id key must not null an existing link.
  const relinked = await (await j(`/api/floorplans/objects/${created.id}`, "PUT", { product_id: product.id })).json();
  assert.equal(relinked.product_id, product.id);
  const labeled = await (await j(`/api/floorplans/objects/${created.id}`, "PUT", { label: "Staande lamp" })).json();
  assert.equal(labeled.product_id, product.id, "partial PUT preserves the existing product link");
  assert.equal(labeled.label, "Staande lamp");
});
