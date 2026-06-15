const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const tmp = path.join(os.tmpdir(), `nova-floorplan-pdf-${crypto.randomUUID().slice(0, 8)}`);
process.env.NOVA_DATA_DIR = tmp;
process.env.NOVA_DB_PATH = path.join(tmp, "test.db");
process.env.NOVA_UPLOAD_DIR = path.join(tmp, "uploads");
fs.mkdirSync(tmp, { recursive: true });

const express = require("express");
const PDFDocument = require("pdfkit");
const { migrate } = require("../db/schema");
const { db } = require("../db/database");
const uploads = require("./uploads");

migrate();
db.prepare("INSERT INTO projects (id, title, status) VALUES (?, ?, ?)").run("project_pdf_smoke", "PDF Smoke Project", "active");

const app = express();
app.use("/uploads", express.static(uploads.uploadDir));
app.use("/api/floorplans", require("./floorplans"));
app.use((err, _req, res, _next) => res.status(Number(err && err.status) || 500).json({ error: err.message || "Serverfout" }));

let base;
const server = app.listen(0);
test.before(() => new Promise((r) => (server.listening ? r() : server.on("listening", r))).then(() => { base = `http://127.0.0.1:${server.address().port}`; }));
test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

function pdfBuffer() {
  return new Promise((resolve) => {
    const chunks = [];
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.fontSize(24).text("Floorplan Smoke PDF");
    doc.rect(100, 180, 320, 180).stroke();
    doc.moveTo(260, 180).lineTo(260, 360).stroke();
    doc.end();
  });
}

async function uploadFloorplan(file, filename) {
  const form = new FormData();
  form.set("project_id", "project_pdf_smoke");
  form.set("name", "PDF plattegrond");
  form.set("file", new Blob([file], { type: "application/pdf" }), filename);
  return fetch(`${base}/api/floorplans`, { method: "POST", body: form });
}

test("PDF floorplan upload stores a thumbnail path and serves it", async () => {
  const res = await uploadFloorplan(await pdfBuffer(), "begane-grond.pdf");
  assert.equal(res.status, 201);
  const body = await res.json();

  assert.equal(body.file_name, "begane-grond.pdf");
  assert.match(body.file_url, /^\/uploads\/file_[a-f0-9]{18}\.pdf$/);
  assert.match(body.thumb_url, /^\/uploads\/thumb_[a-f0-9]{18}\.(png|svg)$/);
  const row = db.prepare("SELECT * FROM floorplans WHERE id = ?").get(body.id);
  assert.ok(row.thumb_path, "thumb_path persisted");
  assert.ok(fs.existsSync(row.thumb_path), "thumbnail written to upload dir");

  const thumb = await fetch(`${base}${body.thumb_url}`);
  assert.equal(thumb.status, 200);
});

test("corrupt PDF floorplan degrades to a fallback thumbnail instead of failing upload", async () => {
  const res = await uploadFloorplan(Buffer.from("not a real pdf"), "broken.pdf");
  assert.equal(res.status, 201);
  const body = await res.json();

  assert.match(body.file_url, /^\/uploads\/file_[a-f0-9]{18}\.pdf$/);
  assert.match(body.thumb_url, /^\/uploads\/thumb_[a-f0-9]{18}\.svg$/);
  const row = db.prepare("SELECT * FROM floorplans WHERE id = ?").get(body.id);
  assert.ok(fs.existsSync(row.thumb_path), "fallback thumbnail written");
});
