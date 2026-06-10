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

let ownerToken, memberToken, adminToken, ownerId, memberId;

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

test("user list rejects unauthenticated requests with 401", async () => {
  const res = await req("/api/auth/users");
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

test("login rate-limiting locks out after repeated failures", async () => {
  const bad = { email: "brute@studio.nl", password: "fout" };
  for (let i = 0; i < 5; i++) {
    const r = await req("/api/auth/login", { method: "POST", body: bad });
    assert.equal(r.status, 401, `attempt ${i + 1} rejected`);
  }
  const locked = await req("/api/auth/login", { method: "POST", body: bad });
  assert.equal(locked.status, 429, "locked out after 5 failures");
  assert.match((await locked.json()).error, /Te veel/);
});

test("RBAC: a member cannot manage users (403)", async () => {
  // Owner creates a member.
  const created = await req("/api/auth/users", { method: "POST", token: ownerToken, body: { name: "Lid", email: "lid@studio.nl", password: "geheim123", role: "member" } });
  assert.equal(created.status, 201);
  memberId = (await created.json()).id;
  const login = await req("/api/auth/login", { method: "POST", body: { email: "lid@studio.nl", password: "geheim123" } });
  memberToken = (await login.json()).token;
  const forbidden = await req("/api/auth/users", { method: "POST", token: memberToken, body: { name: "X", email: "x@studio.nl", password: "geheim123", role: "member" } });
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error, "Onvoldoende rechten");
});

test("RBAC: an admin can list users without password material", async () => {
  const created = await req("/api/auth/users", { method: "POST", token: ownerToken, body: { name: "Admin", email: "admin@studio.nl", password: "geheim123", role: "admin" } });
  assert.equal(created.status, 201);
  const login = await req("/api/auth/login", { method: "POST", body: { email: "admin@studio.nl", password: "geheim123" } });
  adminToken = (await login.json()).token;

  const listed = await req("/api/auth/users", { token: adminToken });
  assert.equal(listed.status, 200);
  const users = await listed.json();
  assert.ok(users.length >= 3);
  assert.ok(users.every((u) => !("password_hash" in u) && !("password_salt" in u)));
});

test("RBAC: an admin cannot grant or revoke owner role", async () => {
  const createOwner = await req("/api/auth/users", { method: "POST", token: adminToken, body: { name: "Nieuwe owner", email: "new-owner@studio.nl", password: "geheim123", role: "owner" } });
  assert.equal(createOwner.status, 403);

  const promote = await req(`/api/auth/users/${memberId}`, { method: "PUT", token: adminToken, body: { role: "owner" } });
  assert.equal(promote.status, 403);

  const demote = await req(`/api/auth/users/${ownerId}`, { method: "PUT", token: adminToken, body: { role: "admin" } });
  assert.equal(demote.status, 403);
});

test("RBAC: only an owner can grant and revoke owner role", async () => {
  const promote = await req(`/api/auth/users/${memberId}`, { method: "PUT", token: ownerToken, body: { role: "owner" } });
  assert.equal(promote.status, 200);
  assert.equal((await promote.json()).role, "owner");

  const demote = await req(`/api/auth/users/${memberId}`, { method: "PUT", token: ownerToken, body: { role: "member" } });
  assert.equal(demote.status, 200);
  assert.equal((await demote.json()).role, "member");
});

test("lockout guard: the last owner cannot be demoted", async () => {
  const res = await req(`/api/auth/users/${ownerId}`, { method: "PUT", token: ownerToken, body: { role: "admin" } });
  assert.equal(res.status, 409);
});

test("lockout guard: the last owner cannot be deleted", async () => {
  const res = await req(`/api/auth/users/${ownerId}`, { method: "DELETE", token: adminToken });
  assert.equal(res.status, 409);
});

test("lockout guard: users cannot delete their own account", async () => {
  const res = await req(`/api/auth/users/${ownerId}`, { method: "DELETE", token: ownerToken });
  assert.equal(res.status, 409);
});
