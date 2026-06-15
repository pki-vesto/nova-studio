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

migrate();

const app = express();
app.use(express.json());
app.use("/api/projects", require("./projects"));
app.use("/api/products", require("./products"));
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
