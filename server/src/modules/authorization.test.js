const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const tmp = path.join(os.tmpdir(), `nova-authz-${crypto.randomUUID().slice(0, 8)}`);
process.env.NOVA_DATA_DIR = tmp;
process.env.NOVA_DB_PATH = path.join(tmp, "test.db");
process.env.NOVA_UPLOAD_DIR = path.join(tmp, "uploads");
fs.mkdirSync(tmp, { recursive: true });

const express = require("express");
const { migrate } = require("../db/schema");
const { db } = require("../db/database");
const auth = require("./auth");
const audit = require("./audit");
const authorization = require("./authorization");
const { id } = require("./utils");

migrate();

const app = express();
app.use(express.json());
app.use(auth.sessionMiddleware);
app.use((req, _res, next) => audit.runWithUser(req.user && req.user.id, next));
app.use("/api", auth.apiGate);
app.use("/api", authorization.routeGate);
app.use("/api/auth", auth.router);
app.use("/api/clients", require("./clients"));
app.use("/api/projects", require("./projects"));
app.use("/api/rooms", require("./rooms"));
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

let ownerToken, adminToken, memberToken, ownerId, memberId, ownerProjectId, memberProjectId, ownerClientId, memberClientId;

test("authorization setup creates users and owner-scoped project data", async () => {
  const ownerRes = await req("/api/auth/register", { method: "POST", body: { name: "Owner", email: "owner@nova.test", password: "secret" } });
  assert.equal(ownerRes.status, 201);
  const owner = await ownerRes.json();
  ownerToken = owner.token;
  ownerId = owner.user.id;

  const adminRes = await req("/api/auth/users", { method: "POST", token: ownerToken, body: { name: "Admin", email: "admin@nova.test", password: "secret", role: "admin" } });
  assert.equal(adminRes.status, 201);
  const adminLogin = await req("/api/auth/login", { method: "POST", body: { email: "admin@nova.test", password: "secret" } });
  adminToken = (await adminLogin.json()).token;

  const memberRes = await req("/api/auth/users", { method: "POST", token: ownerToken, body: { name: "Member", email: "member@nova.test", password: "secret", role: "member" } });
  assert.equal(memberRes.status, 201);
  memberId = (await memberRes.json()).id;
  const memberLogin = await req("/api/auth/login", { method: "POST", body: { email: "member@nova.test", password: "secret" } });
  memberToken = (await memberLogin.json()).token;

  const projectRes = await req("/api/projects", { method: "POST", token: ownerToken, body: { title: "Owner Project", clientName: "Owner Client" } });
  assert.equal(projectRes.status, 201);
  const project = await projectRes.json();
  ownerProjectId = project.id;
  ownerClientId = project.client_id;
  assert.equal(project.owner_id, ownerId);

  memberClientId = id("client");
  memberProjectId = id("project");
  db.prepare("INSERT INTO clients (id, name, studio_id, owner_id) VALUES (?, ?, 'studio_default', ?)").run(memberClientId, "Member Client", memberId);
  db.prepare("INSERT INTO projects (id, client_id, title, studio_id, owner_id) VALUES (?, ?, ?, 'studio_default', ?)").run(memberProjectId, memberClientId, "Member Project", memberId);
  db.prepare("INSERT INTO intake (project_id) VALUES (?)").run(memberProjectId);
});

test("write routes return 401 without a session once users exist", async () => {
  const res = await req("/api/projects", { method: "POST", body: { title: "No token" } });
  assert.equal(res.status, 401);
});

test("members cannot write project-scoped data", async () => {
  const create = await req("/api/projects", { method: "POST", token: memberToken, body: { title: "Member write" } });
  assert.equal(create.status, 403);

  const room = await req("/api/rooms", { method: "POST", token: memberToken, body: { project_id: memberProjectId, name: "Keuken" } });
  assert.equal(room.status, 403);
  assert.equal((await room.json()).error, "Onvoldoende rechten");
});

test("members cannot read projects or clients owned by another user", async () => {
  const project = await req(`/api/projects/${ownerProjectId}`, { token: memberToken });
  assert.equal(project.status, 403);

  const client = await req(`/api/clients/${ownerClientId}`, { token: memberToken });
  assert.equal(client.status, 403);
});

test("member list endpoints are filtered to their own ownership scope", async () => {
  const projects = await (await req("/api/projects", { token: memberToken })).json();
  assert.ok(projects.some((p) => p.id === memberProjectId));
  assert.ok(!projects.some((p) => p.id === ownerProjectId));

  const clients = await (await req("/api/clients", { token: memberToken })).json();
  assert.ok(clients.some((c) => c.id === memberClientId));
  assert.ok(!clients.some((c) => c.id === ownerClientId));
});

test("admins can mutate project data within their studio", async () => {
  const res = await req(`/api/projects/${ownerProjectId}`, { method: "PUT", token: adminToken, body: { title: "Admin update" } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).title, "Admin update");
});

test("forbidden decisions are written to the audit log", async () => {
  await req(`/api/projects/${ownerProjectId}`, { token: memberToken });
  const row = db.prepare("SELECT * FROM audit_log WHERE entity = 'authorization' AND action = 'forbidden' ORDER BY rowid DESC").get();
  assert.ok(row);
  assert.equal(row.user_id, memberId);
  assert.match(row.detail, /project_ownership/);
});
