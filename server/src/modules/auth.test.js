// Auth enforcement, RBAC and audit-attribution tests. The API is open while no
// users exist (single-user mode) and gated once a user is created.
const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const tmp = path.join(os.tmpdir(), `nova-auth-${crypto.randomUUID().slice(0, 8)}`);
process.env.NOVA_DATA_DIR = tmp;
process.env.NOVA_DB_PATH = path.join(tmp, "test.db");
process.env.NOVA_UPLOAD_DIR = path.join(tmp, "uploads");
fs.mkdirSync(tmp, { recursive: true });

const express = require("express");
const { migrate } = require("../db/schema");
const { db } = require("../db/database");
const auth = require("./auth");
const audit = require("./audit");

migrate();

const app = express();
app.use(express.json());
app.use(auth.sessionMiddleware);
app.use((req, _res, next) => audit.runWithUser(req.user && req.user.id, next));
app.use("/api", auth.apiGate);
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", auth.router);
app.use("/api/suppliers", require("./suppliers"));
app.use((err, _req, res, _next) => res.status(err.name === "ZodError" ? 400 : 500).json({ error: err.message }));

let base;
const server = app.listen(0);
test.before(() => new Promise((r) => (server.listening ? r() : server.on("listening", r))).then(() => { base = `http://127.0.0.1:${server.address().port}`; }));
test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const req = (p, { method = "GET", token, body } = {}) => fetch(`${base}${p}`, {
  method,
  headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: body ? JSON.stringify(body) : undefined
});

let ownerToken, memberToken, ownerId;

test("single-user mode: API is open while no users exist", async () => {
  assert.equal((await req("/api/suppliers")).status, 200, "suppliers open");
  assert.equal((await req("/api/health")).status, 200, "health open");
});

test("registering the first owner enables enforcement", async () => {
  const res = await req("/api/auth/register", { method: "POST", body: { name: "Eigenaar", email: "owner@studio.nl", password: "geheim123" } });
  assert.equal(res.status, 201);
  const data = await res.json();
  ownerToken = data.token; ownerId = data.user.id;
  assert.equal(data.user.role, "owner");
});

test("protected route rejects unauthenticated requests with 401", async () => {
  const res = await req("/api/suppliers");
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, "Authenticatie vereist");
});

test("auth + portal-view + health stay open even when enforced", async () => {
  assert.equal((await req("/api/health")).status, 200);
  assert.equal((await req("/api/auth/status")).status, 200);
});

test("valid session passes the gate", async () => {
  assert.equal((await req("/api/suppliers", { token: ownerToken })).status, 200);
});

test("mutations are attributed to the acting user in the audit log", async () => {
  const res = await req("/api/suppliers", { method: "POST", token: ownerToken, body: { name: "Vescom" } });
  assert.equal(res.status, 201);
  const row = db.prepare("SELECT * FROM audit_log WHERE entity = 'supplier' AND action = 'create' ORDER BY rowid DESC").get();
  assert.ok(row, "audit row written");
  assert.equal(row.user_id, ownerId, "attributed to the owner");
});

test("RBAC: a member cannot manage users (403)", async () => {
  // Owner creates a member.
  const created = await req("/api/auth/users", { method: "POST", token: ownerToken, body: { name: "Lid", email: "lid@studio.nl", password: "geheim123", role: "member" } });
  assert.equal(created.status, 201);
  const login = await req("/api/auth/login", { method: "POST", body: { email: "lid@studio.nl", password: "geheim123" } });
  memberToken = (await login.json()).token;
  const forbidden = await req("/api/auth/users", { method: "POST", token: memberToken, body: { name: "X", email: "x@studio.nl", password: "geheim123", role: "member" } });
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error, "Onvoldoende rechten");
});
