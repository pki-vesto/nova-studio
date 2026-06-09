const express = require("express");
const crypto = require("crypto");
const { db } = require("../db/database");
const { id, parseJson, uploadUrl } = require("./utils");
const { record } = require("./audit");
const { validateBody, z } = require("./validate");

const router = express.Router();

// ---- Validation schemas ----------------------------------------------------

const accessSchema = z.object({
  project_id: z.string(),
  proposal_id: z.string().optional(),
  label: z.string().optional(),
  expires_at: z.string().optional()
});

const feedbackSchema = z.object({
  target_type: z.enum(["section", "product", "proposal"]).optional(),
  target_id: z.string().optional(),
  decision: z.string().optional(),
  body: z.string().optional()
});

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

// Returns { ok, row, reason } so callers can map a reason to the right status.
// reason: "missing" (404) | "revoked" (410) | "expired" (410)
function loadValidToken(token) {
  const row = db.prepare("SELECT * FROM portal_access WHERE token = ?").get(token);
  if (!row) return { ok: false, row: null, reason: "missing" };
  if (row.revoked) return { ok: false, row, reason: "revoked" };
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, row, reason: "expired" };
  }
  return { ok: true, row, reason: null };
}

function logActivity(token, action, detail = "") {
  try {
    db.prepare(
      "INSERT INTO portal_activity (id, token, action, detail) VALUES (?, ?, ?, ?)"
    ).run(id("pactivity"), token, action, typeof detail === "string" ? detail : JSON.stringify(detail));
  } catch {
    // Activity logging must never break the primary response.
  }
}

// Maps an invalid loadValidToken result to a JSON error response.
function rejectToken(res, reason) {
  if (reason === "missing") return res.status(404).json({ error: "Link niet gevonden" });
  if (reason === "revoked") return res.status(410).json({ error: "Link ingetrokken" });
  return res.status(410).json({ error: "Link verlopen" });
}

// ---------------------------------------------------------------------------
// Designer-side endpoints (mounted at /api/portal). These manage access links
// and let the designer review what the client did inside the portal.
// ---------------------------------------------------------------------------

// Create a magic-link access token for a project (optionally tied to a proposal).
router.post("/access", validateBody(accessSchema), (req, res) => {
  const { project_id, proposal_id, label, expires_at } = req.body || {};
  if (!project_id) return res.status(400).json({ error: "project_id is verplicht" });
  const project = db.prepare("SELECT id FROM projects WHERE id = ?").get(project_id);
  if (!project) return res.status(404).json({ error: "Project niet gevonden" });

  const token = crypto.randomBytes(18).toString("hex");
  db.prepare(`
    INSERT INTO portal_access (token, project_id, proposal_id, label, expires_at, revoked)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(token, project_id, proposal_id || null, label || "", expires_at || "");

  const row = db.prepare("SELECT * FROM portal_access WHERE token = ?").get(token);
  record("portal_access", token, "create", { project_id, proposal_id: proposal_id || null });
  res.status(201).json({ token, url: `/portal/${token}`, ...row });
});

// List the access links for a project, with a feedback count per link.
router.get("/access", (req, res) => {
  const projectId = req.query.project_id || "";
  if (!projectId) return res.status(400).json({ error: "project_id is verplicht" });
  const rows = db.prepare(`
    SELECT a.*,
      (SELECT COUNT(*) FROM portal_feedback f WHERE f.token = a.token) AS feedback_count
    FROM portal_access a
    WHERE a.project_id = ?
    ORDER BY a.created_at DESC
  `).all(projectId).map((row) => ({ ...row, url: `/portal/${row.token}` }));
  res.json(rows);
});

// Revoke a link so the public view returns 410 from now on.
router.post("/access/:token/revoke", (req, res) => {
  const existing = db.prepare("SELECT token FROM portal_access WHERE token = ?").get(req.params.token);
  if (!existing) return res.status(404).json({ error: "Link niet gevonden" });
  db.prepare("UPDATE portal_access SET revoked = 1 WHERE token = ?").run(req.params.token);
  record("portal_access", req.params.token, "revoke");
  res.status(200).json(db.prepare("SELECT * FROM portal_access WHERE token = ?").get(req.params.token));
});

// All client feedback gathered through a link (designer review view).
router.get("/access/:token/feedback", (req, res) => {
  const existing = db.prepare("SELECT token FROM portal_access WHERE token = ?").get(req.params.token);
  if (!existing) return res.status(404).json({ error: "Link niet gevonden" });
  res.json(db.prepare(
    "SELECT * FROM portal_feedback WHERE token = ? ORDER BY created_at DESC, rowid DESC"
  ).all(req.params.token));
});

// Activity log for a link (views + feedback events).
router.get("/access/:token/activity", (req, res) => {
  const existing = db.prepare("SELECT token FROM portal_access WHERE token = ?").get(req.params.token);
  if (!existing) return res.status(404).json({ error: "Link niet gevonden" });
  res.json(db.prepare(
    "SELECT * FROM portal_activity WHERE token = ? ORDER BY created_at DESC, rowid DESC"
  ).all(req.params.token));
});

// ---------------------------------------------------------------------------
// Public read-only endpoints. NO auth middleware — the token IS the credential.
// These never leak internal-only fields (purchase_price, margin, internal
// sections, supplier data, designer notes).
// ---------------------------------------------------------------------------

// Validate a token + return a client-safe bundle of the project/proposal.
router.get("/view/:token", (req, res) => {
  const { ok, row, reason } = loadValidToken(req.params.token);
  if (!ok) return rejectToken(res, reason);

  const project = db.prepare(`
    SELECT p.id, p.title, p.address, p.location, p.project_type, p.surface,
      p.style, p.summary, p.vision, p.hero_image_path,
      c.name AS client_name
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.id = ?
  `).get(row.project_id);
  if (!project) return res.status(404).json({ error: "Project niet gevonden" });

  let proposal = null;
  let sections = [];
  if (row.proposal_id) {
    proposal = db.prepare(
      "SELECT id, title, version, status, summary FROM proposals WHERE id = ?"
    ).get(row.proposal_id);
    sections = db.prepare(`
      SELECT id, kind, title, body, sort_order
      FROM proposal_sections
      WHERE proposal_id = ? AND audience = 'client' AND is_enabled = 1
      ORDER BY sort_order, created_at
    `).all(row.proposal_id);
  }

  // Client-safe product list: name/brand/image/room/quantity, client-facing
  // price only (sale_price when set, otherwise the catalogue price), and the
  // client-facing status + their own comment. No purchase_price / margin.
  const products = db.prepare(`
    SELECT pp.id, pp.quantity, pp.item_status, pp.client_comment,
      p.name, p.brand, p.image_path,
      COALESCE(NULLIF(p.sale_price, 0), p.price) AS price,
      r.name AS room_name
    FROM project_products pp
    JOIN products p ON p.id = pp.product_id
    LEFT JOIN rooms r ON r.id = pp.room_id
    WHERE pp.project_id = ?
    ORDER BY pp.sort_order, r.sort_order, r.name, p.category, p.name
  `).all(row.project_id).map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    image_url: uploadUrl(p.image_path),
    room_name: p.room_name || "",
    quantity: p.quantity,
    sale_price: p.price,
    item_status: p.item_status,
    client_comment: p.client_comment || ""
  }));

  logActivity(row.token, "view", row.proposal_id ? `proposal:${row.proposal_id}` : "project");

  res.json({
    token: row.token,
    label: row.label,
    project: {
      title: project.title,
      client_name: project.client_name || "",
      location: project.location || "",
      address: project.address || "",
      project_type: project.project_type || "",
      surface: project.surface || "",
      style: project.style || "",
      summary: project.summary || "",
      vision: project.vision || "",
      hero_image_url: uploadUrl(project.hero_image_path)
    },
    proposal: proposal
      ? { title: proposal.title, version: proposal.version, status: proposal.status, summary: proposal.summary || "" }
      : null,
    sections,
    products
  });
});

// Client submits feedback on a section / product / the whole proposal.
router.post("/view/:token/feedback", validateBody(feedbackSchema), (req, res) => {
  const { ok, row, reason } = loadValidToken(req.params.token);
  if (!ok) return rejectToken(res, reason);

  const targetType = req.body?.target_type || "proposal";
  const targetId = req.body?.target_id || "";
  const decision = req.body?.decision || "";
  const body = req.body?.body || "";
  if (!["section", "product", "proposal"].includes(targetType)) {
    return res.status(400).json({ error: "Ongeldig feedbacktype" });
  }

  const feedbackId = id("pfeedback");
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO portal_feedback (id, token, target_type, target_id, decision, body)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(feedbackId, row.token, targetType, targetId, decision, body);

    // For a per-product approve/reject, reflect the client's choice straight
    // onto the project_products row so the designer's lists stay in sync.
    if (targetType === "product" && targetId && ["approve", "reject"].includes(decision)) {
      const status = decision === "approve" ? "approved" : "rejected";
      db.prepare(
        "UPDATE project_products SET item_status = ?, client_comment = ? WHERE id = ? AND project_id = ?"
      ).run(status, body, targetId, row.project_id);
    }

    // Notification scaffolding — queued (sent = 0), no email is actually sent.
    const subject = `Nieuwe portaalreactie (${targetType}${decision ? ` · ${decision}` : ""})`;
    const notifBody = [
      `Project: ${row.project_id}`,
      `Type: ${targetType}`,
      targetId ? `Item: ${targetId}` : "",
      decision ? `Beslissing: ${decision}` : "",
      body ? `Opmerking: ${body}` : ""
    ].filter(Boolean).join("\n");
    db.prepare(
      "INSERT INTO notifications (id, kind, subject, body, sent) VALUES (?, 'portal', ?, ?, 0)"
    ).run(id("notif"), subject, notifBody);
  });
  tx();

  logActivity(row.token, "feedback", `${targetType}:${targetId || "-"}${decision ? `:${decision}` : ""}`);
  record("portal_feedback", feedbackId, "create", { token: row.token, target_type: targetType, decision });

  res.status(201).json(db.prepare("SELECT * FROM portal_feedback WHERE id = ?").get(feedbackId));
});

module.exports = router;
