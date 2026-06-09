// Backup creates a consistent, openable snapshot containing the live data, and
// pruning keeps only the most recent N.
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const tmp = path.join(os.tmpdir(), `nova-backup-${crypto.randomUUID().slice(0, 8)}`);
process.env.NOVA_DATA_DIR = tmp;
process.env.NOVA_DB_PATH = path.join(tmp, "test.db");
process.env.NOVA_BACKUP_DIR = path.join(tmp, "backups");
process.env.NOVA_BACKUP_KEEP = "3";
fs.mkdirSync(tmp, { recursive: true });

const Database = require("better-sqlite3");
const { migrate } = require("../db/schema");
const { db } = require("../db/database");
const { createBackup, listBackups, prune, backupDir } = require("./backup");

migrate();

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test("createBackup produces a valid SQLite file with the live data", async () => {
  db.prepare("INSERT INTO clients (id, name) VALUES ('c_backup', 'Back-up Klant')").run();
  const info = await createBackup();
  assert.ok(info.size > 0, "non-empty backup");
  const full = path.join(backupDir, info.filename);
  assert.ok(fs.existsSync(full), "backup file on disk");

  // Open the snapshot independently and confirm the row is there.
  const snap = new Database(full, { readonly: true });
  const row = snap.prepare("SELECT name FROM clients WHERE id = 'c_backup'").get();
  snap.close();
  assert.equal(row.name, "Back-up Klant");
});

test("pruning keeps only the most recent NOVA_BACKUP_KEEP backups", async () => {
  for (let i = 0; i < 5; i++) {
    // Distinct filenames even within the same second.
    fs.writeFileSync(path.join(backupDir, `nova-2026-01-0${i + 1}T00-00-00-000Z.db`), "x");
  }
  prune(3);
  assert.equal(listBackups().length, 3, "pruned to KEEP=3");
});
