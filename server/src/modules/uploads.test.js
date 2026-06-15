const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const tmp = path.join(os.tmpdir(), `nova-uploads-${crypto.randomUUID().slice(0, 8)}`);
process.env.NOVA_DATA_DIR = tmp;
process.env.NOVA_DB_PATH = path.join(tmp, "test.db");
process.env.NOVA_UPLOAD_DIR = path.join(tmp, "uploads");
fs.mkdirSync(tmp, { recursive: true });

const express = require("express");
const uploads = require("./uploads");

const app = express();
app.use("/api/uploads", uploads.router);
app.use((err, _req, res, _next) => {
  res.status(Number(err && err.status) || 500).json({ error: err.message || "Serverfout" });
});

let base;
const server = app.listen(0);
test.before(() => new Promise((r) => (server.listening ? r() : server.on("listening", r))).then(() => { base = `http://127.0.0.1:${server.address().port}`; }));
test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

function uploadBody(filename, fields = {}) {
  const form = new FormData();
  form.set("file", new Blob(["nova"], { type: "image/png" }), filename);
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

async function postUpload(filename, fields) {
  return fetch(`${base}/api/uploads`, { method: "POST", body: uploadBody(filename, fields) });
}

function uploadedFiles() {
  return fs.existsSync(uploads.uploadDir) ? fs.readdirSync(uploads.uploadDir) : [];
}

test("upload route accepts a valid file and returns a confined /uploads URL", async () => {
  const res = await postUpload("floorplan.png");
  assert.equal(res.status, 201);
  const body = await res.json();

  assert.match(body.file_path, /^.+file_[a-f0-9]{18}\.png$/);
  assert.match(body.url, /^\/uploads\/file_[a-f0-9]{18}\.png$/);
  assert.equal(path.basename(body.file_path), path.basename(body.url));
  assert.equal(uploadedFiles().length, 1);
});

test("upload route rejects missing files", async () => {
  const res = await fetch(`${base}/api/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: "https://evil.example/floorplan.png" })
  });
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Geen bestand ontvangen" });
});

test("upload route rejects client-supplied URL, path-traversal and alternate destinations", async () => {
  const before = uploadedFiles();
  const unsafeTargets = [
    { url: "https://evil.example/floorplan.png" },
    { file_path: "../floorplan.png" },
    { target: "nested/floorplan.png" },
    { destination: "/tmp/outside/floorplan.png" }
  ];

  for (const fields of unsafeTargets) {
    const res = await postUpload("floorplan.png", fields);
    assert.equal(res.status, 400, `${JSON.stringify(fields)} rejected`);
    assert.deepEqual(await res.json(), { error: "Ongeldige uploadbestemming" });
  }
  assert.deepEqual(uploadedFiles(), before, "rejected uploads do not write files");
});
