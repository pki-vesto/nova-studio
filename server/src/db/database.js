const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const dataDir = process.env.NOVA_DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.NOVA_DB_PATH || path.join(dataDir, "nova-studio.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

module.exports = { db, dbPath };
