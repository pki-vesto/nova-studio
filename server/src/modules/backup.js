const express = require("express");
const fs = require("fs");
const path = require("path");
const { db, dbPath } = require("../db/database");
const { record } = require("./audit");

// Backups live next to the database (inside the mounted ./data volume) unless
// overridden. Keeping them in data/ means a host-level copy of ./data captures
// both the live DB and its snapshots.
const backupDir = process.env.NOVA_BACKUP_DIR || path.join(path.dirname(dbPath), "backups");
const KEEP = Number(process.env.NOVA_BACKUP_KEEP || 14);

// Created lazily on first use — no filesystem side-effects at module load.
function ensureDir() {
  fs.mkdirSync(backupDir, { recursive: true });
}

function stamp() {
  // Filesystem-safe ISO timestamp (no colons): 2026-06-09T21-30-00-000Z
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function listBackups() {
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir)
    .filter((f) => f.startsWith("nova-") && f.endsWith(".db"))
    .map((f) => {
      const st = fs.statSync(path.join(backupDir, f));
      return { filename: f, size: st.size, created_at: st.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function prune(keep = KEEP) {
  const extra = listBackups().slice(keep);
  for (const b of extra) {
    try { fs.rmSync(path.join(backupDir, b.filename), { force: true }); } catch { /* best-effort */ }
  }
  return extra.length;
}

// Consistent online snapshot. better-sqlite3's backup() is WAL-safe and runs
// without blocking the server. Returns the new backup's metadata.
async function createBackup() {
  ensureDir();
  const filename = `nova-${stamp()}.db`;
  const dest = path.join(backupDir, filename);
  await db.backup(dest);
  prune();
  const st = fs.statSync(dest);
  return { filename, path: dest, size: st.size, created_at: st.mtime.toISOString() };
}

// Resolve a requested backup filename safely to a path inside backupDir.
function resolveBackup(name) {
  const safe = path.basename(String(name || ""));
  if (!safe.startsWith("nova-") || !safe.endsWith(".db")) return null;
  const full = path.join(backupDir, safe);
  return fs.existsSync(full) ? full : null;
}

const router = express.Router();

router.get("/", (_req, res) => {
  res.json({ dir: backupDir, keep: KEEP, backups: listBackups() });
});

router.post("/", async (_req, res, next) => {
  try {
    const info = await createBackup();
    record("backup", info.filename, "create", `${info.size} bytes`);
    res.status(201).json(info);
  } catch (err) { next(err); }
});

// Fresh on-demand snapshot streamed straight to the browser as a download.
router.get("/download", async (_req, res, next) => {
  try {
    const info = await createBackup();
    record("backup", info.filename, "download", `${info.size} bytes`);
    res.download(info.path, `nova-studio-${info.filename}`);
  } catch (err) { next(err); }
});

// Download a previously created backup by filename.
router.get("/download/:filename", (req, res) => {
  const full = resolveBackup(req.params.filename);
  if (!full) return res.status(404).json({ error: "Back-up niet gevonden" });
  res.download(full);
});

router.delete("/:filename", (req, res) => {
  const full = resolveBackup(req.params.filename);
  if (!full) return res.status(404).json({ error: "Back-up niet gevonden" });
  fs.rmSync(full, { force: true });
  record("backup", path.basename(full), "delete");
  res.status(204).end();
});

module.exports = { router, createBackup, listBackups, prune, backupDir };
