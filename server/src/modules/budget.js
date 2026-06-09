const express = require("express");
const { db } = require("../db/database");
const { id, parseJson } = require("./utils");
const { record } = require("./audit");

const router = express.Router();

// effectivePrice = sale_price > 0 ? sale_price : price
const EFFECTIVE_PRICE_SQL = "CASE WHEN COALESCE(p.sale_price, 0) > 0 THEN p.sale_price ELSE COALESCE(p.price, 0) END";

function serializeScenario(row) {
  if (!row) return row;
  const { lines_json, ...rest } = row;
  return { ...rest, lines: parseJson(lines_json, []) };
}

function normalizeLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.map((line) => ({
    label: line?.label ?? "",
    amount: Number(line?.amount || 0)
  }));
}

/* ---------------------------------------------------------------- Scenarios */

router.get("/scenarios/project/:pid", (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM budget_scenarios
    WHERE project_id = ?
    ORDER BY is_active DESC, created_at, name
  `).all(req.params.pid);
  res.json(rows.map(serializeScenario));
});

router.post("/scenarios", (req, res) => {
  const scenarioId = id("scenario");
  db.prepare(`
    INSERT INTO budget_scenarios (id, project_id, name, lines_json, is_active)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    scenarioId,
    req.body.project_id,
    req.body.name || "Basis",
    JSON.stringify(normalizeLines(req.body.lines)),
    req.body.is_active ? 1 : 0
  );
  record("budget_scenario", scenarioId, "create", req.body.name || "Basis");
  res.status(201).json(serializeScenario(db.prepare("SELECT * FROM budget_scenarios WHERE id = ?").get(scenarioId)));
});

router.put("/scenarios/:id", (req, res) => {
  const current = db.prepare("SELECT * FROM budget_scenarios WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Scenario niet gevonden" });
  db.prepare(`
    UPDATE budget_scenarios SET
      name = @name,
      lines_json = @lines_json,
      is_active = @is_active
    WHERE id = @id
  `).run({
    id: req.params.id,
    name: req.body.name || current.name,
    lines_json: "lines" in req.body ? JSON.stringify(normalizeLines(req.body.lines)) : current.lines_json,
    is_active: "is_active" in req.body ? (req.body.is_active ? 1 : 0) : current.is_active
  });
  record("budget_scenario", req.params.id, "update");
  res.json(serializeScenario(db.prepare("SELECT * FROM budget_scenarios WHERE id = ?").get(req.params.id)));
});

router.delete("/scenarios/:id", (req, res) => {
  db.prepare("DELETE FROM budget_scenarios WHERE id = ?").run(req.params.id);
  record("budget_scenario", req.params.id, "delete");
  res.status(204).end();
});

router.post("/scenarios/:id/activate", (req, res) => {
  const current = db.prepare("SELECT * FROM budget_scenarios WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Scenario niet gevonden" });
  const activate = db.transaction(() => {
    db.prepare("UPDATE budget_scenarios SET is_active = 0 WHERE project_id = ?").run(current.project_id);
    db.prepare("UPDATE budget_scenarios SET is_active = 1 WHERE id = ?").run(req.params.id);
  });
  activate();
  record("budget_scenario", req.params.id, "activate");
  res.json(serializeScenario(db.prepare("SELECT * FROM budget_scenarios WHERE id = ?").get(req.params.id)));
});

/* ------------------------------------------------------------- Room budgets */

router.get("/rooms/project/:pid", (req, res) => {
  const rows = db.prepare(`
    SELECT r.id AS room_id, r.name AS room_name,
      COALESCE(rb.amount, 0) AS amount, COALESCE(rb.notes, '') AS notes
    FROM rooms r
    LEFT JOIN room_budgets rb ON rb.room_id = r.id
    WHERE r.project_id = ?
    ORDER BY r.sort_order, r.name
  `).all(req.params.pid);
  res.json(rows);
});

router.put("/room/:roomId", (req, res) => {
  const amount = Number(req.body.amount || 0);
  const notes = req.body.notes || "";
  const existing = db.prepare("SELECT id FROM room_budgets WHERE room_id = ?").get(req.params.roomId);
  if (existing) {
    db.prepare("UPDATE room_budgets SET amount = ?, notes = ? WHERE room_id = ?").run(amount, notes, req.params.roomId);
  } else {
    db.prepare("INSERT INTO room_budgets (id, room_id, amount, notes) VALUES (?, ?, ?, ?)")
      .run(id("roombudget"), req.params.roomId, amount, notes);
  }
  record("room_budget", req.params.roomId, "upsert", String(amount));
  res.json(db.prepare("SELECT * FROM room_budgets WHERE room_id = ?").get(req.params.roomId));
});

/* ---------------------------------------------------------------- Overview */

router.get("/overview/project/:pid", (req, res) => {
  const pid = req.params.pid;
  const project = db.prepare("SELECT budget_total FROM projects WHERE id = ?").get(pid);
  if (!project) return res.status(404).json({ error: "Project niet gevonden" });
  const budget_total = Number(project.budget_total || 0);

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(${EFFECTIVE_PRICE_SQL} * COALESCE(pp.quantity, 1)), 0) AS spent,
      COALESCE(SUM(COALESCE(p.purchase_price, 0) * COALESCE(pp.quantity, 1)), 0) AS purchase_total,
      COALESCE(SUM((${EFFECTIVE_PRICE_SQL} - COALESCE(p.purchase_price, 0)) * COALESCE(pp.quantity, 1)), 0) AS margin_total,
      COALESCE(SUM(${EFFECTIVE_PRICE_SQL} * COALESCE(pp.quantity, 1) * COALESCE(p.vat_rate, 0) / 100.0), 0) AS vat_total
    FROM project_products pp
    JOIN products p ON p.id = pp.product_id
    WHERE pp.project_id = ?
  `).get(pid);

  const spent = Number(totals.spent || 0);
  const purchase_total = Number(totals.purchase_total || 0);
  const margin_total = Number(totals.margin_total || 0);
  const vat_total = Number(totals.vat_total || 0);

  const rooms = db.prepare(`
    SELECT r.id AS room_id, r.name AS room_name,
      COALESCE(rb.amount, 0) AS budget,
      COALESCE((
        SELECT SUM(${EFFECTIVE_PRICE_SQL} * COALESCE(pp.quantity, 1))
        FROM project_products pp
        JOIN products p ON p.id = pp.product_id
        WHERE pp.room_id = r.id
      ), 0) AS spent
    FROM rooms r
    LEFT JOIN room_budgets rb ON rb.room_id = r.id
    WHERE r.project_id = ?
    ORDER BY r.sort_order, r.name
  `).all(pid).map((row) => ({
    room_id: row.room_id,
    room_name: row.room_name,
    budget: Number(row.budget || 0),
    spent: Number(row.spent || 0)
  }));

  const active_scenario = serializeScenario(
    db.prepare("SELECT * FROM budget_scenarios WHERE project_id = ? AND is_active = 1 ORDER BY created_at LIMIT 1").get(pid)
  ) || null;

  res.json({
    budget_total,
    spent,
    purchase_total,
    margin_total,
    vat_total,
    remaining: budget_total - spent,
    rooms,
    active_scenario
  });
});

module.exports = router;
