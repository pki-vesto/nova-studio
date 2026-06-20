// Integration tests for high-risk write/computation flows that previously had
// no coverage: budget margin/VAT math, the client-portal approval write-back,
// project soft-delete + optimistic concurrency, product pricing/CSV, and the
// AI local-fallback. Runs the real routers in-process against a temp DB.
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const tmp = path.join(os.tmpdir(), `nova-flows-${crypto.randomUUID().slice(0, 8)}`);
process.env.NOVA_DATA_DIR = tmp;
process.env.NOVA_DB_PATH = path.join(tmp, "test.db");
process.env.NOVA_UPLOAD_DIR = path.join(tmp, "uploads");
process.env.NOVA_EXPORT_DIR = path.join(tmp, "exports");
process.env.ANTHROPIC_API_KEY = ""; // force the deterministic local AI fallback
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
app.use("/api/suppliers", require("./suppliers"));
app.use("/api/knowledge", require("./knowledge"));
app.use("/api/portal", require("./portal"));
app.use("/api/budget", require("./budget"));
app.use("/api/ai", require("./ai"));
app.use((err, _req, res, _next) => res.status(err.name === "ZodError" ? 400 : 500).json({ error: err.message }));

let base;
const server = app.listen(0);
test.before(() => new Promise((r) => (server.listening ? r() : server.on("listening", r))).then(() => { base = `http://127.0.0.1:${server.address().port}`; }));
test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function j(p, method, body) {
  const res = await fetch(`${base}${p}`, {
    method: method || "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test("budget overview computes spent, margin and VAT from effective prices", async () => {
  const project = (await j("/api/projects", "POST", { title: "Budgetproject", budget_total: 5000 })).body;
  const product = (await j("/api/products", "POST", { name: "Bank", price: 1000, sale_price: 1200, purchase_price: 800, vat_rate: 21 })).body;
  assert.equal(product.margin, 400, "margin auto-computed = sale - purchase");
  await j("/api/products/select", "POST", { project_id: project.id, product_id: product.id, quantity: 2 });

  const o = (await j(`/api/budget/overview/project/${project.id}`)).body;
  assert.equal(o.spent, 2400, "2 × effective 1200");
  assert.equal(o.margin_total, 800, "2 × (1200 - 800)");
  assert.equal(o.vat_total, 504, "2 × 1200 × 21%");
  assert.equal(o.remaining, 2600, "5000 - 2400");
});

test("knowledge auto-edges link product selections idempotently and traverse project to supplier", async () => {
  const supplier = (await j("/api/suppliers", "POST", { name: "Edge Supplier" })).body;
  const project = (await j("/api/projects", "POST", { title: "Edge Project" })).body;
  const product = (await j("/api/products", "POST", {
    name: "Edge Product",
    supplier_id: supplier.id
  })).body;

  await j("/api/products/select", "POST", { project_id: project.id, product_id: product.id });
  await j("/api/products/select", "POST", { project_id: project.id, product_id: product.id });

  const projectNode = db.prepare("SELECT * FROM knowledge_nodes WHERE type = 'project' AND ref_id = ?").get(project.id);
  const productNode = db.prepare("SELECT * FROM knowledge_nodes WHERE type = 'product' AND ref_id = ?").get(product.id);
  const supplierNode = db.prepare("SELECT * FROM knowledge_nodes WHERE type = 'supplier' AND ref_id = ?").get(supplier.id);
  const clientNode = db.prepare("SELECT * FROM knowledge_nodes WHERE type = 'client' AND ref_id = ?").get(project.client_id);
  assert.ok(projectNode, "project node promoted");
  assert.ok(productNode, "product node promoted");
  assert.ok(supplierNode, "supplier node promoted");
  assert.ok(clientNode, "client node promoted from project client_id");

  const bevatCount = db.prepare(`
    SELECT COUNT(*) AS count FROM knowledge_edges
    WHERE from_id = ? AND to_id = ? AND relation = 'bevat'
  `).get(projectNode.id, productNode.id).count;
  assert.equal(bevatCount, 1, "repeated selection creates exactly one project-product edge");

  const supplierEdgeCount = db.prepare(`
    SELECT COUNT(*) AS count FROM knowledge_edges
    WHERE from_id = ? AND to_id = ? AND relation = 'leverancier'
  `).get(productNode.id, supplierNode.id).count;
  assert.equal(supplierEdgeCount, 1, "product supplier_id creates supplier edge");

  const clientEdgeCount = db.prepare(`
    SELECT COUNT(*) AS count FROM knowledge_edges
    WHERE from_id = ? AND to_id = ? AND relation = 'klant'
  `).get(projectNode.id, clientNode.id).count;
  assert.equal(clientEdgeCount, 1, "project client_id creates client edge");

  const material = (await j("/api/materials", "POST", {
    project_id: project.id,
    name: "Edge Material"
  })).body;
  const materialNode = db.prepare("SELECT * FROM knowledge_nodes WHERE type = 'material' AND ref_id = ?").get(material.id);
  assert.ok(materialNode, "material node promoted");
  const materialEdgeCount = db.prepare(`
    SELECT COUNT(*) AS count FROM knowledge_edges
    WHERE from_id = ? AND to_id = ? AND relation = 'gebruikt'
  `).get(projectNode.id, materialNode.id).count;
  assert.equal(materialEdgeCount, 1, "project material create links material edge");

  const pathResult = (await j(`/api/knowledge/path?from=${projectNode.id}&to=${supplierNode.id}`)).body;
  assert.deepEqual(pathResult.path.map((node) => node.id), [projectNode.id, productNode.id, supplierNode.id]);
});

test("client portal: client-safe view + per-product approval writes back the selection status", async () => {
  const project = (await j("/api/projects", "POST", { title: "Portaalproject" })).body;
  const product = (await j("/api/products", "POST", { name: "Lamp", price: 300, purchase_price: 150 })).body;
  await j("/api/products/select", "POST", { project_id: project.id, product_id: product.id, quantity: 1 });

  const access = (await j("/api/portal/access", "POST", { project_id: project.id, label: "Klant" })).body;
  assert.ok(access.token, "magic-link token issued");

  const view = (await j(`/api/portal/view/${access.token}`)).body;
  assert.equal(view.products.length, 1);
  const item = view.products[0];
  assert.equal(item.item_status, "proposed", "starts proposed");
  assert.ok(!("purchase_price" in item), "internal purchase_price not leaked to the client");
  assert.ok(!("margin" in item), "internal margin not leaked");

  const fb = await j(`/api/portal/view/${access.token}/feedback`, "POST", { target_type: "product", target_id: item.id, decision: "approve", body: "Mooi!" });
  assert.equal(fb.status, 201);

  const after = (await j(`/api/portal/view/${access.token}`)).body;
  assert.equal(after.products[0].item_status, "approved", "approval written back to the selection");
});

test("projects: soft-delete hides from the list, undelete restores", async () => {
  const project = (await j("/api/projects", "POST", { title: "Wegproject" })).body;
  const del = await j("/api/projects/" + project.id, "DELETE");
  assert.ok(del.status === 200 || del.status === 204, "soft-delete succeeds");
  let list = (await j("/api/projects?status=")).body;
  assert.ok(!list.some((p) => p.id === project.id), "soft-deleted project hidden");
  await j(`/api/projects/${project.id}/undelete`, "POST");
  list = (await j("/api/projects?status=")).body;
  assert.ok(list.some((p) => p.id === project.id), "restored project visible again");
});

test("projects: optimistic concurrency rejects a stale row_version with 409", async () => {
  const project = (await j("/api/projects", "POST", { title: "Concurrentie" })).body;
  const stale = await j(`/api/projects/${project.id}`, "PUT", { title: "Nieuw", row_version: 999 });
  assert.equal(stale.status, 409);
  const fresh = await j(`/api/projects/${project.id}`, "PUT", { title: "Nieuw", row_version: project.row_version });
  assert.equal(fresh.status, 200);
});

test("products: CSV export/import round-trips", async () => {
  await j("/api/products", "POST", { name: "CSV Stoel", price: 250, brand: "TestMerk" });
  const res = await fetch(`${base}/api/products/export.csv`);
  assert.match(res.headers.get("content-type") || "", /text\/csv/);
  const csv = await res.text();
  assert.ok(csv.includes("CSV Stoel"), "export contains the product");

  const imported = await j("/api/products/import-csv", "POST", { csv: "name,brand,price\nGeimporteerd,ImportMerk,99\n" });
  assert.equal(imported.body.created, 1);
  const all = (await j("/api/products")).body;
  assert.ok(all.some((p) => p.name === "Geimporteerd" && Number(p.price) === 99), "imported product persisted");
});

test("AI run falls back to an honest local draft when no API key is set", async () => {
  const project = (await j("/api/projects", "POST", { title: "AI-project" })).body;
  const run = await j("/api/ai/run", "POST", { flow: "knowledge_retrieval", project_id: project.id });
  assert.equal(run.status, 201);
  assert.equal(run.body.review_status, "pending", "starts pending review");
  assert.match(run.body.output_text, /Lokaal concept|lokaal concept/, "honest local-draft marker");
  const jobs = (await j(`/api/ai/jobs?project_id=${project.id}`)).body;
  assert.ok(jobs.some((x) => x.id === run.body.id), "job persisted and listable");
});

test("AI proposal section regenerate creates local section job and validates section", async () => {
  const project = (await j("/api/projects", "POST", { title: "Sectie AI-project", brief: "Warm familiehuis" })).body;
  const source = await j("/api/ai/run", "POST", { flow: "proposal_writing", project_id: project.id, input: { text: "Maak een voorstel" } });
  assert.equal(source.status, 201);

  const section = await j(`/api/ai/jobs/${source.body.id}/regenerate-section`, "POST", { section: "style" });
  assert.equal(section.status, 201);
  assert.equal(section.body.flow, "proposal_writing");
  assert.equal(section.body.review_status, "pending");
  assert.equal(section.body.input.section, "style");
  assert.match(section.body.output_text, /Lokaal concept|lokaal concept/);
  assert.match(section.body.output_text, /Schrijf uitsluitend de sectie/);
  assert.doesNotMatch(section.body.output_text, /Ontbrekende content checklist/);

  const invalid = await j(`/api/ai/jobs/${source.body.id}/regenerate-section`, "POST", { section: "onbekend" });
  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.body.valid_sections, ["intro", "style", "rationale", "next-steps"]);
});

test("AI tone presets list, persist and regenerate", async () => {
  const presets = await j("/api/ai/tone-presets");
  assert.equal(presets.status, 200);
  assert.deepEqual(presets.body.map((p) => p.key), ["standaard", "premium-editorial", "warm-persoonlijk", "zakelijk-beknopt"]);

  const project = (await j("/api/projects", "POST", { title: "Tone AI-project" })).body;
  const run = await j("/api/ai/run", "POST", {
    flow: "proposal_writing",
    project_id: project.id,
    input: { text: "Schrijf compact" },
    tone: "premium-editorial"
  });
  assert.equal(run.status, 201);
  assert.equal(run.body.tone, "premium-editorial");
  assert.match(run.body.output_text, /Lokaal concept|lokaal concept/);

  const regenerated = await j(`/api/ai/jobs/${run.body.id}/regenerate`, "POST", {});
  assert.equal(regenerated.status, 201);
  assert.equal(regenerated.body.tone, "premium-editorial");

  const fallback = await j("/api/ai/run", "POST", { flow: "knowledge_retrieval", project_id: project.id, tone: "onbekend" });
  assert.equal(fallback.status, 201);
  assert.equal(fallback.body.tone, "standaard");
});
