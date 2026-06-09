const express = require("express");
const fs = require("fs");
const path = require("path");
const { db } = require("../db/database");
const { id, parseJson, uploadUrl } = require("./utils");
const { uploadDir } = require("./uploads");
const { record } = require("./audit");

const router = express.Router();

// Escape text for safe inclusion in SVG markup.
function svgEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- Provider adapters -------------------------------------------------------
// A provider is an async function(job) => output file path (absolute, inside
// uploadDir). The job argument is the full render_jobs row plus a parsed
// `input` object. Real providers (image generation, 3D rendering, etc.) plug in
// here by registering under a new name and implementing the same interface:
//
//   PROVIDERS["my-3d-engine"] = async (job) => {
//     // talk to the external service using job.input, write the result file,
//     // and return its path on disk.
//     return path.join(uploadDir, `${job.id}.png`);
//   };
//
// Registering a provider is intentionally just an object assignment so new
// adapters can be added without touching the routes below.
const PROVIDERS = {
  // Honest scaffolding: produces a labeled SVG so the pipeline is visibly wired
  // end-to-end without pretending to be a real renderer.
  placeholder: async (job) => {
    const project = db
      .prepare("SELECT title FROM projects WHERE id = ?")
      .get(job.project_id);
    const room = job.room_id
      ? db.prepare("SELECT name FROM rooms WHERE id = ?").get(job.room_id)
      : null;

    const projectLabel = project ? project.title : job.project_id;
    const roomLabel = room ? room.name : "Hele woning";

    const outputPath = path.join(uploadDir, `${job.id}.svg`);
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#1f2933"/>
  <rect x="40" y="40" width="1200" height="640" fill="none" stroke="#52606d" stroke-width="2" stroke-dasharray="12 10"/>
  <text x="640" y="300" fill="#e4e7eb" font-family="Helvetica, Arial, sans-serif" font-size="48" font-weight="bold" text-anchor="middle">${svgEscape(projectLabel)}</text>
  <text x="640" y="360" fill="#9aa5b1" font-family="Helvetica, Arial, sans-serif" font-size="32" text-anchor="middle">${svgEscape(roomLabel)}</text>
  <text x="640" y="440" fill="#7b8794" font-family="Helvetica, Arial, sans-serif" font-size="24" text-anchor="middle">Render placeholder — koppel een render-provider</text>
</svg>
`;
    fs.writeFileSync(outputPath, svg, "utf8");
    return outputPath;
  }
};

// Shape a stored row for API output: parse input_json and expose output_url.
function present(job) {
  if (!job) return job;
  const { input_json, ...rest } = job;
  return {
    ...rest,
    input: parseJson(input_json, {}),
    output_url: uploadUrl(job.output_path)
  };
}

function getJob(jobId) {
  return db.prepare("SELECT * FROM render_jobs WHERE id = ?").get(jobId);
}

// GET /project/:pid — all render jobs for a project (newest first).
router.get("/project/:pid", (req, res) => {
  const jobs = db
    .prepare("SELECT * FROM render_jobs WHERE project_id = ? ORDER BY created_at DESC, rowid DESC")
    .all(req.params.pid);
  res.json(jobs.map(present));
});

// POST / — create a queued render job.
router.post("/", (req, res) => {
  const { project_id, room_id, provider, input } = req.body || {};
  if (!project_id) return res.status(400).json({ error: "project_id is verplicht" });

  const providerName = provider || "placeholder";
  if (!PROVIDERS[providerName]) {
    return res.status(400).json({ error: `Onbekende render-provider: ${providerName}` });
  }

  const jobId = id("render");
  db.prepare(`
    INSERT INTO render_jobs (id, project_id, room_id, provider, status, input_json)
    VALUES (?, ?, ?, ?, 'queued', ?)
  `).run(
    jobId,
    project_id,
    room_id || null,
    providerName,
    JSON.stringify(input && typeof input === "object" ? input : {})
  );
  record("render_job", jobId, "create", { project_id, provider: providerName });
  res.status(201).json(present(getJob(jobId)));
});

// GET /:id — one render job.
router.get("/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Render-job niet gevonden" });
  res.json(present(job));
});

// POST /:id/run — run the job through its provider.
router.post("/:id/run", async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Render-job niet gevonden" });

  const runner = PROVIDERS[job.provider];
  if (!runner) {
    db.prepare("UPDATE render_jobs SET status = 'failed' WHERE id = ?").run(job.id);
    return res.status(400).json({ error: `Onbekende render-provider: ${job.provider}` });
  }

  db.prepare("UPDATE render_jobs SET status = 'running' WHERE id = ?").run(job.id);
  try {
    const outputPath = await runner({ ...job, input: parseJson(job.input_json, {}) });
    db.prepare("UPDATE render_jobs SET status = 'done', output_path = ? WHERE id = ?")
      .run(outputPath || "", job.id);
    record("render_job", job.id, "run", { provider: job.provider, status: "done" });
    res.json(present(getJob(job.id)));
  } catch (err) {
    db.prepare("UPDATE render_jobs SET status = 'failed' WHERE id = ?").run(job.id);
    record("render_job", job.id, "run", { provider: job.provider, status: "failed", error: String(err.message || err) });
    res.status(500).json({ error: "Render mislukt", detail: String(err.message || err) });
  }
});

// DELETE /:id
router.delete("/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Render-job niet gevonden" });
  db.prepare("DELETE FROM render_jobs WHERE id = ?").run(job.id);
  record("render_job", job.id, "delete");
  res.status(204).end();
});

module.exports = router;
