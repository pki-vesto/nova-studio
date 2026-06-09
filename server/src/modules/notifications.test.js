// Notifications: notify() records in-app (email stays a no-op when unconfigured),
// and the list/count/read endpoints surface unread items for the designer.
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const tmp = path.join(os.tmpdir(), `nova-notif-${crypto.randomUUID().slice(0, 8)}`);
process.env.NOVA_DATA_DIR = tmp;
process.env.NOVA_DB_PATH = path.join(tmp, "test.db");
delete process.env.NOVA_SMTP_URL; // ensure email stays a no-op (queued in-app)
fs.mkdirSync(tmp, { recursive: true });

const express = require("express");
const { migrate } = require("../db/schema");
const { db } = require("../db/database");
const notifications = require("./notifications");
const mailer = require("./mailer");

migrate();

const app = express();
app.use(express.json());
app.use("/api/notifications", notifications.router);

let base;
const server = app.listen(0);
test.before(() => new Promise((r) => (server.listening ? r() : server.on("listening", r))).then(() => { base = `http://127.0.0.1:${server.address().port}`; }));
test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const j = (p, method, body) => fetch(`${base}${p}`, {
  method: method || "GET",
  headers: body ? { "Content-Type": "application/json" } : undefined,
  body: body ? JSON.stringify(body) : undefined
}).then(async (r) => ({ status: r.status, body: await r.json() }));

test("mailer is a no-op when SMTP is not configured", async () => {
  assert.equal(mailer.isConfigured(), false);
  const r = await mailer.send({ subject: "x", body: "y" });
  assert.deepEqual(r, { sent: false, reason: "not-configured" });
});

test("notify() records an in-app notification (queued, unread)", () => {
  const row = notifications.notify({ kind: "portal", subject: "Reactie", body: "Klant akkoord", ref_type: "portal_feedback", ref_id: "fb1" });
  assert.match(row.id, /^notif_/);
  assert.equal(row.sent, 0, "not emailed when SMTP unconfigured");
  assert.equal(row.read_at || "", "", "starts unread");
  const stored = db.prepare("SELECT * FROM notifications WHERE id = ?").get(row.id);
  assert.equal(stored.subject, "Reactie");
  assert.equal(stored.ref_id, "fb1");
});

test("count + list + read flow", async () => {
  notifications.notify({ kind: "portal", subject: "Tweede", body: "..." });
  const count = (await j("/api/notifications/count")).body;
  assert.ok(count.unread >= 2, "unread count reflects new notifications");
  assert.equal(count.email, false, "email channel reported as off");

  const list = (await j("/api/notifications?unread=1")).body;
  assert.ok(list.length >= 2);

  const read = await j(`/api/notifications/${list[0].id}/read`, "POST");
  assert.equal(read.status, 200);
  assert.ok(read.body.read_at && read.body.read_at !== "", "marked read");

  const afterCount = (await j("/api/notifications/count")).body;
  assert.equal(afterCount.unread, count.unread - 1, "unread count drops by one");

  const all = await j("/api/notifications/read-all", "POST");
  assert.ok(all.body.marked >= 1);
  assert.equal((await j("/api/notifications/count")).body.unread, 0, "all read");
});
