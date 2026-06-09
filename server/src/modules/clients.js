const express = require("express");
const { z } = require("zod");
const { db } = require("../db/database");
const { id, parseJson } = require("./utils");
const { validateBody } = require("./validate");

const router = express.Router();

const contactSchema = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  is_primary: z.any().optional()
});

const addressSchema = z.object({
  label: z.string().optional(),
  street: z.string().optional(),
  postal_code: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional()
});

const clientSchema = z.object({
  name: z.string().min(1),
  company: z.string().optional().default(""),
  email: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  address: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  preferences: z.any().optional().default({})
});

function hydrate(client) {
  if (!client) return null;
  return {
    ...client,
    preferences: parseJson(client.preferences_json, {}),
    contacts: db.prepare("SELECT * FROM client_contacts WHERE client_id = ? ORDER BY is_primary DESC, name").all(client.id),
    addresses: db.prepare("SELECT * FROM client_addresses WHERE client_id = ? ORDER BY created_at DESC").all(client.id),
    projects: db.prepare("SELECT id, title, status, is_template, updated_at FROM projects WHERE client_id = ? ORDER BY updated_at DESC").all(client.id)
  };
}

router.get("/", (req, res) => {
  const q = `%${req.query.q || ""}%`;
  res.json(db.prepare(`
    SELECT c.*, COUNT(p.id) AS project_count, MAX(p.updated_at) AS last_project_at
    FROM clients c
    LEFT JOIN projects p ON p.client_id = c.id
    WHERE c.name LIKE ? OR c.company LIKE ? OR c.email LIKE ?
    GROUP BY c.id
    ORDER BY c.updated_at DESC, c.name
  `).all(q, q, q).map((row) => ({ ...row, preferences: parseJson(row.preferences_json, {}) })));
});

router.post("/", (req, res) => {
  const input = clientSchema.parse(req.body);
  const clientId = id("client");
  db.prepare(`
    INSERT INTO clients (id, name, company, email, phone, address, notes, preferences_json)
    VALUES (@id, @name, @company, @email, @phone, @address, @notes, @preferences_json)
  `).run({ id: clientId, ...input, preferences_json: JSON.stringify(input.preferences || {}) });
  res.status(201).json(hydrate(db.prepare("SELECT * FROM clients WHERE id = ?").get(clientId)));
});

router.get("/:id", (req, res) => {
  const client = hydrate(db.prepare("SELECT * FROM clients WHERE id = ?").get(req.params.id));
  if (!client) return res.status(404).json({ error: "Klant niet gevonden" });
  res.json(client);
});

router.put("/:id", (req, res) => {
  const input = clientSchema.partial().parse(req.body);
  // .partial() still fills .default() values for omitted keys (including
  // preferences -> {}), so restrict the update to columns the client actually
  // sent — otherwise a partial edit would wipe untouched columns.
  const fields = Object.keys(input).filter((field) => field !== "preferences" && field in req.body);
  const payload = { id: req.params.id, ...input };
  if ("preferences" in req.body) {
    fields.push("preferences_json");
    payload.preferences_json = JSON.stringify(input.preferences || {});
  }
  if (fields.length) {
    db.prepare(`UPDATE clients SET ${fields.map((field) => `${field} = @${field}`).join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run(payload);
  }
  res.json(hydrate(db.prepare("SELECT * FROM clients WHERE id = ?").get(req.params.id)));
});

router.delete("/:id", (req, res) => {
  const projectCount = db.prepare("SELECT COUNT(*) AS count FROM projects WHERE client_id = ?").get(req.params.id).count;
  if (projectCount > 0) return res.status(409).json({ error: "Klant heeft projecten en kan niet worden verwijderd" });
  db.prepare("DELETE FROM clients WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

router.post("/:id/contacts", validateBody(contactSchema), (req, res) => {
  const contactId = id("contact");
  db.prepare(`
    INSERT INTO client_contacts (id, client_id, name, role, email, phone, notes, is_primary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(contactId, req.params.id, req.body.name || "Contactpersoon", req.body.role || "", req.body.email || "", req.body.phone || "", req.body.notes || "", req.body.is_primary ? 1 : 0);
  res.status(201).json(db.prepare("SELECT * FROM client_contacts WHERE id = ?").get(contactId));
});

router.put("/contacts/:contactId", validateBody(contactSchema, { partial: true }), (req, res) => {
  db.prepare(`
    UPDATE client_contacts SET name = @name, role = @role, email = @email, phone = @phone, notes = @notes, is_primary = @is_primary
    WHERE id = @id
  `).run({
    id: req.params.contactId,
    name: req.body.name || "Contactpersoon",
    role: req.body.role || "",
    email: req.body.email || "",
    phone: req.body.phone || "",
    notes: req.body.notes || "",
    is_primary: req.body.is_primary ? 1 : 0
  });
  res.json(db.prepare("SELECT * FROM client_contacts WHERE id = ?").get(req.params.contactId));
});

router.delete("/contacts/:contactId", (req, res) => {
  db.prepare("DELETE FROM client_contacts WHERE id = ?").run(req.params.contactId);
  res.status(204).end();
});

router.post("/:id/addresses", validateBody(addressSchema), (req, res) => {
  const addressId = id("address");
  db.prepare(`
    INSERT INTO client_addresses (id, client_id, label, street, postal_code, city, country, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(addressId, req.params.id, req.body.label || "Projectadres", req.body.street || "", req.body.postal_code || "", req.body.city || "", req.body.country || "Nederland", req.body.notes || "");
  res.status(201).json(db.prepare("SELECT * FROM client_addresses WHERE id = ?").get(addressId));
});

router.delete("/addresses/:addressId", (req, res) => {
  db.prepare("DELETE FROM client_addresses WHERE id = ?").run(req.params.addressId);
  res.status(204).end();
});

module.exports = router;
