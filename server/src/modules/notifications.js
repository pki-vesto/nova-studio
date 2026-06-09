const express = require("express");
const { db } = require("../db/database");
const { id } = require("./utils");
const mailer = require("./mailer");

// Create a notification: always recorded in-app (the designer sees it via the
// bell), and additionally emailed when SMTP is configured. Returns the row.
// Fire-and-forget email so the primary write never waits on the network.
function notify({ kind = "general", subject = "", body = "", ref_type = "", ref_id = "", to } = {}) {
  const notifId = id("notif");
  db.prepare(
    "INSERT INTO notifications (id, kind, subject, body, ref_type, ref_id) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(notifId, kind, subject, body, ref_type, ref_id);
  // Best-effort email; mark `sent` when it actually goes out.
  mailer.send({ to, subject, body })
    .then((r) => { if (r.sent) db.prepare("UPDATE notifications SET sent = 1 WHERE id = ?").run(notifId); })
    .catch(() => { /* never break on mail errors */ });
  return db.prepare("SELECT * FROM notifications WHERE id = ?").get(notifId);
}

const router = express.Router();

router.get("/", (req, res) => {
  const unread = req.query.unread === "1";
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = db.prepare(`
    SELECT * FROM notifications
    WHERE (@unread = 0 OR read_at = '' OR read_at IS NULL)
    ORDER BY created_at DESC, rowid DESC
    LIMIT @limit
  `).all({ unread: unread ? 1 : 0, limit });
  res.json(rows);
});

router.get("/count", (_req, res) => {
  const unread = db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE read_at = '' OR read_at IS NULL").get().n;
  res.json({ unread, email: mailer.isConfigured() });
});

router.post("/:id/read", (req, res) => {
  const row = db.prepare("SELECT * FROM notifications WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Notificatie niet gevonden" });
  db.prepare("UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.params.id);
  res.json(db.prepare("SELECT * FROM notifications WHERE id = ?").get(req.params.id));
});

router.post("/read-all", (_req, res) => {
  const info = db.prepare("UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE read_at = '' OR read_at IS NULL").run();
  res.json({ marked: info.changes });
});

module.exports = { router, notify };
