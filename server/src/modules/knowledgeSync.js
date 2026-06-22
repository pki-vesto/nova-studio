const { db } = require("../db/database");
const { id, parseJson } = require("./utils");
const { record } = require("./audit");

function normalizeData(data) {
  return typeof data === "string" ? parseJson(data, {}) : (data ?? {});
}

function fallbackLabel(type, refId, label) {
  const value = String(label || "").trim();
  return value || `${type || "concept"}#${refId || ""}`;
}

function hydrate(node) {
  if (!node) return node;
  return { ...node, data: parseJson(node.data_json, {}) };
}

function promoteEntity(type = "concept", refId = "", label = "", data = {}) {
  const nodeType = type || "concept";
  const nodeRefId = refId || "";
  const nodeLabel = fallbackLabel(nodeType, nodeRefId, label);
  const dataJson = JSON.stringify(normalizeData(data));

  const existing = nodeRefId
    ? db.prepare("SELECT * FROM knowledge_nodes WHERE type = ? AND ref_id = ? ORDER BY created_at, rowid").get(nodeType, nodeRefId)
    : null;

  if (existing) {
    db.prepare("UPDATE knowledge_nodes SET label = ?, data_json = ? WHERE id = ?").run(nodeLabel, dataJson, existing.id);
    record("knowledge_node", existing.id, "promote_update", nodeLabel);
    return hydrate(db.prepare("SELECT * FROM knowledge_nodes WHERE id = ?").get(existing.id));
  }

  const nodeId = id("knode");
  db.prepare(`
    INSERT INTO knowledge_nodes (id, type, label, ref_id, data_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(nodeId, nodeType, nodeLabel, nodeRefId, dataJson);
  record("knowledge_node", nodeId, "promote_create", nodeLabel);
  return hydrate(db.prepare("SELECT * FROM knowledge_nodes WHERE id = ?").get(nodeId));
}

function safePromote(type, refId, label, data) {
  try {
    return promoteEntity(type, refId, label, data);
  } catch (err) {
    record("knowledge_node", refId || "", "promote_error", {
      type,
      ref_id: refId || "",
      error: err && err.message ? err.message : String(err)
    });
    return null;
  }
}

function resolveEntityNode(type, refId, options = {}) {
  if (!type || !refId) return null;
  const existing = db.prepare("SELECT * FROM knowledge_nodes WHERE type = ? AND ref_id = ? ORDER BY created_at, rowid").get(type, refId);
  if (existing) return hydrate(existing);
  return safePromote(type, refId, options.label || "", options.data || {});
}

function linkEntities(fromType, fromRef, toType, toRef, relation, options = {}) {
  try {
    if (!fromType || !fromRef || !toType || !toRef || !relation) return null;
    const from = resolveEntityNode(fromType, fromRef, options.from || {});
    const to = resolveEntityNode(toType, toRef, options.to || {});
    if (!from || !to) return null;

    const existing = db.prepare(`
      SELECT * FROM knowledge_edges
      WHERE from_id = ? AND to_id = ? AND relation = ?
      ORDER BY created_at, rowid
    `).get(from.id, to.id, relation);
    if (existing) return existing;

    const edgeId = id("kedge");
    db.prepare(`
      INSERT INTO knowledge_edges (id, from_id, to_id, relation, weight)
      VALUES (?, ?, ?, ?, ?)
    `).run(edgeId, from.id, to.id, relation, Number(options.weight ?? 1));
    record("knowledge_edge", edgeId, "create", relation);
    return db.prepare("SELECT * FROM knowledge_edges WHERE id = ?").get(edgeId);
  } catch (err) {
    record("knowledge_edge", "", "link_error", {
      from_type: fromType || "",
      from_ref: fromRef || "",
      to_type: toType || "",
      to_ref: toRef || "",
      relation: relation || "",
      error: err && err.message ? err.message : String(err)
    });
    return null;
  }
}

module.exports = { promoteEntity, safePromote, hydrate, linkEntities, resolveEntityNode };
