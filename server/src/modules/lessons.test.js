const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const tmp = path.join(os.tmpdir(), `nova-lessons-test-${crypto.randomUUID().slice(0, 8)}`);
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
app.use("/api/projects", require("./projects"));
app.use("/api/lessons", require("./lessons"));
app.use((err, _req, res, _next) => res.status(err.name === "ZodError" ? 400 : 500).json({ error: err.message }));

let base;
const server = app.listen(0);
test.before(() => new Promise((resolve) => server.listening ? resolve() : server.on("listening", resolve)).then(() => { base = `http://127.0.0.1:${server.address().port}`; }));
test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const j = (url, method, body) => fetch(`${base}${url}`, {
  method: method || "GET",
  headers: body ? { "Content-Type": "application/json" } : undefined,
  body: body ? JSON.stringify(body) : undefined
});

test("projectlessen zijn per project en cross-project terugvindbaar", async () => {
  const projectA = await (await j("/api/projects", "POST", { title: "Project A" })).json();
  const projectB = await (await j("/api/projects", "POST", { title: "Project B" })).json();

  const create = await j("/api/lessons", "POST", {
    project_id: projectA.id,
    category: "materiaal",
    title: "Eiken vloer vroeg bemonsteren",
    body: "Matte lak werkte beter bij veel daglicht.",
    sentiment: "positief",
    tags: ["eik", "vloer", "eik"]
  });
  assert.equal(create.status, 201);
  const lesson = await create.json();
  assert.match(lesson.id, /^lesson_/);
  assert.deepEqual(lesson.tags, ["eik", "vloer"]);

  const scoped = await (await j(`/api/lessons?project_id=${projectA.id}`)).json();
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0].id, lesson.id);

  const otherScoped = await (await j(`/api/lessons?project_id=${projectB.id}`)).json();
  assert.equal(otherScoped.length, 0);

  const byQuery = await (await j("/api/lessons?q=eik")).json();
  assert.equal(byQuery.length, 1);
  assert.equal(byQuery[0].project_id, projectA.id);
  assert.equal(byQuery[0].project_label, "Project A");
  assert.deepEqual(byQuery[0].tags, ["eik", "vloer"]);

  const byCategoryAndTag = await (await j("/api/lessons?category=materiaal&tag=eik")).json();
  assert.deepEqual(byCategoryAndTag.map((row) => row.id), [lesson.id]);

  const update = await j(`/api/lessons/${lesson.id}`, "PUT", { title: "Eiken vloer altijd vroeg bemonsteren", tags: ["eik"] });
  assert.equal(update.status, 200);
  const updated = await update.json();
  assert.equal(updated.title, "Eiken vloer altijd vroeg bemonsteren");
  assert.deepEqual(updated.tags, ["eik"]);

  const invalid = await j("/api/lessons", "POST", { project_id: projectA.id, category: "materiaal" });
  assert.equal(invalid.status, 400);
  const invalidBody = await invalid.json();
  assert.equal(invalidBody.error, "Validatiefout");
  assert.ok(Array.isArray(invalidBody.details));

  const del = await j(`/api/lessons/${lesson.id}`, "DELETE");
  assert.equal(del.status, 204);
  const missing = await j(`/api/lessons/${lesson.id}`);
  assert.equal(missing.status, 404);
});
