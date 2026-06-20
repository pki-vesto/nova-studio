const express = require("express");
const { db } = require("../db/database");
const { id, parseJson } = require("./utils");
const { record } = require("./audit");
const { validateBody, z } = require("./validate");
const { promoteEntity } = require("./knowledgeSync");

const router = express.Router();

// ---- Validation schemas ----------------------------------------------------

const nodeSchema = z.object({
  type: z.string(),
  label: z.string(),
  ref_id: z.string().optional(),
  data: z.any().optional()
});

const sourceSchema = z.object({
  label: z.string().optional(),
  url: z.string().optional()
});

const edgeSchema = z.object({
  from_id: z.string(),
  to_id: z.string(),
  relation: z.string().optional(),
  weight: z.coerce.number().optional()
});

const promoteSchema = z.object({
  type: z.string(),
  label: z.string(),
  ref_id: z.string().optional(),
  data: z.any().optional()
});

// Hydrate a raw node row: parse data_json into a `data` object.
function hydrate(node) {
  if (!node) return node;
  return { ...node, data: parseJson(node.data_json, {}) };
}

// ---- Nodes -----------------------------------------------------------------

router.get("/nodes", (req, res) => {
  const { type = "", q = "" } = req.query;
  const rows = db.prepare(`
    SELECT * FROM knowledge_nodes
    WHERE (@type = '' OR type = @type)
      AND (@q = '' OR label LIKE '%' || @q || '%')
    ORDER BY created_at DESC, label
  `).all({ type, q });
  res.json(rows.map(hydrate));
});

router.post("/nodes", validateBody(nodeSchema), (req, res) => {
  const nodeId = id("knode");
  const data = req.body.data ?? {};
  db.prepare(`
    INSERT INTO knowledge_nodes (id, type, label, ref_id, data_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    nodeId,
    req.body.type || "concept",
    req.body.label || "Naamloos",
    req.body.ref_id || "",
    JSON.stringify(typeof data === "string" ? parseJson(data, {}) : data)
  );
  record("knowledge_node", nodeId, "create", req.body.label || "");
  res.status(201).json(hydrate(db.prepare("SELECT * FROM knowledge_nodes WHERE id = ?").get(nodeId)));
});

router.delete("/nodes/:id", (req, res) => {
  const current = db.prepare("SELECT id FROM knowledge_nodes WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Knooppunt niet gevonden" });
  // Edges and sources cascade via FK ON DELETE CASCADE.
  db.prepare("DELETE FROM knowledge_nodes WHERE id = ?").run(req.params.id);
  record("knowledge_node", req.params.id, "delete");
  res.status(204).end();
});

router.post("/nodes/:id/sources", validateBody(sourceSchema), (req, res) => {
  const node = db.prepare("SELECT id FROM knowledge_nodes WHERE id = ?").get(req.params.id);
  if (!node) return res.status(404).json({ error: "Knooppunt niet gevonden" });
  const sourceId = id("ksrc");
  db.prepare(`
    INSERT INTO knowledge_sources (id, node_id, label, url)
    VALUES (?, ?, ?, ?)
  `).run(sourceId, req.params.id, req.body.label || "", req.body.url || "");
  record("knowledge_node", req.params.id, "add_source", req.body.url || req.body.label || "");
  res.status(201).json(db.prepare("SELECT * FROM knowledge_sources WHERE id = ?").get(sourceId));
});

// ---- Edges -----------------------------------------------------------------

router.get("/edges", (_req, res) => {
  res.json(db.prepare("SELECT * FROM knowledge_edges ORDER BY created_at DESC").all());
});

router.post("/edges", validateBody(edgeSchema), (req, res) => {
  const from = db.prepare("SELECT id FROM knowledge_nodes WHERE id = ?").get(req.body.from_id);
  const to = db.prepare("SELECT id FROM knowledge_nodes WHERE id = ?").get(req.body.to_id);
  if (!from || !to) return res.status(404).json({ error: "Knooppunt niet gevonden" });
  const edgeId = id("kedge");
  db.prepare(`
    INSERT INTO knowledge_edges (id, from_id, to_id, relation, weight)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    edgeId,
    req.body.from_id,
    req.body.to_id,
    req.body.relation || "related",
    Number(req.body.weight ?? 1)
  );
  record("knowledge_edge", edgeId, "create", req.body.relation || "related");
  res.status(201).json(db.prepare("SELECT * FROM knowledge_edges WHERE id = ?").get(edgeId));
});

router.delete("/edges/:id", (req, res) => {
  const current = db.prepare("SELECT id FROM knowledge_edges WHERE id = ?").get(req.params.id);
  if (!current) return res.status(404).json({ error: "Relatie niet gevonden" });
  db.prepare("DELETE FROM knowledge_edges WHERE id = ?").run(req.params.id);
  record("knowledge_edge", req.params.id, "delete");
  res.status(204).end();
});

// ---- Search ----------------------------------------------------------------

router.get("/search", (req, res) => {
  const { q = "" } = req.query;
  const matches = db.prepare(`
    SELECT * FROM knowledge_nodes
    WHERE @q = '' OR label LIKE '%' || @q || '%'
    ORDER BY created_at DESC, label
  `).all({ q });

  const matchIds = matches.map((n) => n.id);
  let edges = [];
  const neighborIds = new Set();
  if (matchIds.length) {
    const placeholders = matchIds.map(() => "?").join(",");
    edges = db.prepare(`
      SELECT * FROM knowledge_edges
      WHERE from_id IN (${placeholders}) OR to_id IN (${placeholders})
    `).all(...matchIds, ...matchIds);
    const matchSet = new Set(matchIds);
    for (const e of edges) {
      if (!matchSet.has(e.from_id)) neighborIds.add(e.from_id);
      if (!matchSet.has(e.to_id)) neighborIds.add(e.to_id);
    }
  }

  let neighbors = [];
  if (neighborIds.size) {
    const ids = [...neighborIds];
    const placeholders = ids.map(() => "?").join(",");
    neighbors = db.prepare(`SELECT * FROM knowledge_nodes WHERE id IN (${placeholders})`).all(...ids);
  }

  res.json({
    nodes: matches.map(hydrate),
    edges,
    neighbors: neighbors.map(hydrate)
  });
});

// ---- Graph -----------------------------------------------------------------

router.get("/graph", (_req, res) => {
  const nodes = db.prepare("SELECT * FROM knowledge_nodes ORDER BY created_at DESC, label").all();
  const edges = db.prepare("SELECT * FROM knowledge_edges ORDER BY created_at DESC").all();
  res.json({ nodes: nodes.map(hydrate), edges });
});

// ---- Path (BFS, undirected) -----------------------------------------------

router.get("/path", (req, res) => {
  const { from = "", to = "" } = req.query;
  const fromNode = db.prepare("SELECT id FROM knowledge_nodes WHERE id = ?").get(from);
  const toNode = db.prepare("SELECT id FROM knowledge_nodes WHERE id = ?").get(to);
  if (!fromNode || !toNode) return res.status(404).json({ error: "Knooppunt niet gevonden" });

  if (from === to) {
    return res.json({ path: [hydrate(db.prepare("SELECT * FROM knowledge_nodes WHERE id = ?").get(from))] });
  }

  // Build undirected adjacency map.
  const adjacency = new Map();
  for (const e of db.prepare("SELECT from_id, to_id FROM knowledge_edges").all()) {
    if (!adjacency.has(e.from_id)) adjacency.set(e.from_id, new Set());
    if (!adjacency.has(e.to_id)) adjacency.set(e.to_id, new Set());
    adjacency.get(e.from_id).add(e.to_id);
    adjacency.get(e.to_id).add(e.from_id);
  }

  // BFS tracking predecessors to reconstruct the shortest path.
  const visited = new Set([from]);
  const prev = new Map();
  const queue = [from];
  let found = false;
  while (queue.length) {
    const current = queue.shift();
    if (current === to) {
      found = true;
      break;
    }
    for (const next of adjacency.get(current) || []) {
      if (!visited.has(next)) {
        visited.add(next);
        prev.set(next, current);
        queue.push(next);
      }
    }
  }

  if (!found) return res.json({ path: [] });

  // Reconstruct id path from `to` back to `from`.
  const idPath = [];
  let cursor = to;
  while (cursor !== undefined) {
    idPath.unshift(cursor);
    if (cursor === from) break;
    cursor = prev.get(cursor);
  }

  const placeholders = idPath.map(() => "?").join(",");
  const rows = db.prepare(`SELECT * FROM knowledge_nodes WHERE id IN (${placeholders})`).all(...idPath);
  const byId = new Map(rows.map((n) => [n.id, hydrate(n)]));
  res.json({ path: idPath.map((nid) => byId.get(nid)).filter(Boolean) });
});

// ---- Promote (upsert from a domain entity) --------------------------------

router.post("/promote", validateBody(promoteSchema), (req, res) => {
  const type = req.body.type || "concept";
  const label = req.body.label || "Naamloos";
  const node = promoteEntity(type, req.body.ref_id || "", { label, data: req.body.data ?? {} });
  res.json(hydrate(node));
});

module.exports = router;
