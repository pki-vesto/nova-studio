const express = require("express");
const crypto = require("crypto");
const { z } = require("zod");
const { db } = require("../db/database");
const { id } = require("./utils");
const { record } = require("./audit");

const router = express.Router();

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dagen
const ROLES = ["owner", "admin", "member"];

// ---------------------------------------------------------------------------
// Password hashing (Node built-in crypto / scrypt — geen externe provider).
// ---------------------------------------------------------------------------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(pw, salt, hash) {
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(pw, salt, 64).toString("hex");
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Never leak password material to clients.
function publicUser(row) {
  if (!row) return null;
  const { password_hash, password_salt, ...safe } = row;
  return safe;
}

function userCount() {
  return db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
}

function normalizeRole(role, fallback = "member") {
  return ROLES.includes(role) ? role : fallback;
}

function createSession(userId) {
  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expiresAt);
  return { token, expiresAt };
}

function readToken(req) {
  const header = req.headers["authorization"] || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  const alt = req.headers["x-nova-token"];
  if (typeof alt === "string" && alt.trim()) return alt.trim();
  return "";
}

function userForToken(token) {
  if (!token) return null;
  const session = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
  if (!session) return null;
  if (session.expires_at && new Date(session.expires_at).getTime() <= Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }
  return db.prepare("SELECT * FROM users WHERE id = ?").get(session.user_id) || null;
}

// ---------------------------------------------------------------------------
// Optionele auth middleware. Blokkeert NOOIT — bewaart single-user lokale modus
// waar geen gebruikers bestaan.
// ---------------------------------------------------------------------------
function sessionMiddleware(req, _res, next) {
  try {
    const user = userForToken(readToken(req));
    req.user = publicUser(user);
  } catch {
    req.user = null;
  }
  next();
}

// ---------------------------------------------------------------------------
// Enforcement. Auth is OFF (open) while no users exist — single-user local mode
// stays frictionless. Once a user is created, a valid session is required.
// ---------------------------------------------------------------------------
function requireAuth(req, res, next) {
  if (userCount() === 0) return next();
  if (req.user) return next();
  return res.status(401).json({ error: "Authenticatie vereist" });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (userCount() === 0) return next();
    if (!req.user) return res.status(401).json({ error: "Authenticatie vereist" });
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Onvoldoende rechten" });
    }
    next();
  };
}

// Mounted at /api: protects every API route except health, the auth endpoints
// themselves, and the public client-portal view (token IS the credential).
function apiGate(req, res, next) {
  const p = req.path;
  if (p === "/health" || p.startsWith("/auth") || p.startsWith("/portal/view")) return next();
  return requireAuth(req, res, next);
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().min(1),
  password: z.string().min(1)
});

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1)
});

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().min(1),
  password: z.string().min(1),
  role: z.string().optional().default("member")
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.string().optional()
});

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function insertUser({ name, email, password, role }) {
  const userId = id("user");
  const { salt, hash } = hashPassword(password);
  db.prepare(`
    INSERT INTO users (id, studio_id, name, email, password_hash, password_salt, role)
    VALUES (?, 'studio_default', ?, ?, ?, ?, ?)
  `).run(userId, name, normalizeEmail(email), hash, salt, role);
  db.prepare(`
    INSERT INTO memberships (id, studio_id, user_id, role)
    VALUES (?, 'studio_default', ?, ?)
  `).run(id("membership"), userId, role);
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}

// ---------------------------------------------------------------------------
// Routes (mounted at /api/auth)
// ---------------------------------------------------------------------------

// Lets the frontend decide whether to show login.
router.get("/status", (req, res) => {
  res.json({ hasUsers: userCount() > 0, user: req.user || null });
});

router.post("/register", (req, res) => {
  const input = registerSchema.parse(req.body);
  const email = normalizeEmail(input.email);
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    return res.status(409).json({ error: "E-mailadres is al in gebruik" });
  }
  // First user becomes owner; subsequent self-registration is a member.
  const role = userCount() === 0 ? "owner" : "member";
  const user = insertUser({ name: input.name, email, password: input.password, role });
  const { token } = createSession(user.id);
  record("user", user.id, "register", { role }, user.id);
  res.status(201).json({ token, user: publicUser(user) });
});

router.post("/login", (req, res) => {
  const input = loginSchema.parse(req.body);
  const email = normalizeEmail(input.email);
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !verifyPassword(input.password, user.password_salt, user.password_hash)) {
    return res.status(401).json({ error: "Onjuiste inloggegevens" });
  }
  const { token } = createSession(user.id);
  record("user", user.id, "login", "", user.id);
  res.json({ token, user: publicUser(user) });
});

router.post("/logout", (req, res) => {
  const token = readToken(req);
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  res.status(204).end();
});

router.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Niet ingelogd" });
  res.json(req.user);
});

// Member management.
router.get("/users", (_req, res) => {
  const rows = db.prepare("SELECT * FROM users ORDER BY created_at, name").all();
  res.json(rows.map(publicUser));
});

router.post("/users", requireRole("owner", "admin"), (req, res) => {
  const input = createUserSchema.parse(req.body);
  const email = normalizeEmail(input.email);
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    return res.status(409).json({ error: "E-mailadres is al in gebruik" });
  }
  const role = normalizeRole(input.role, "member");
  const user = insertUser({ name: input.name, email, password: input.password, role });
  record("user", user.id, "create", { role }, req.user ? req.user.id : "");
  res.status(201).json(publicUser(user));
});

router.put("/users/:id", requireRole("owner", "admin"), (req, res) => {
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Gebruiker niet gevonden" });
  const input = updateUserSchema.parse(req.body);
  const name = "name" in req.body && input.name !== undefined ? input.name : existing.name;
  const role = "role" in req.body ? normalizeRole(input.role, existing.role) : existing.role;
  db.prepare("UPDATE users SET name = ?, role = ? WHERE id = ?").run(name, role, req.params.id);
  db.prepare("UPDATE memberships SET role = ? WHERE user_id = ?").run(role, req.params.id);
  record("user", req.params.id, "update", { name, role }, req.user ? req.user.id : "");
  res.json(publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id)));
});

router.delete("/users/:id", requireRole("owner", "admin"), (req, res) => {
  const existing = db.prepare("SELECT 1 FROM users WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Gebruiker niet gevonden" });
  // sessions + memberships cascade via ON DELETE CASCADE.
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  record("user", req.params.id, "delete", "", req.user ? req.user.id : "");
  res.status(204).end();
});

module.exports = { router, sessionMiddleware, requireAuth, requireRole, apiGate, hashPassword, verifyPassword, publicUser };
