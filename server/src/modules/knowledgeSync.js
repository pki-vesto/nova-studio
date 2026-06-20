const { db } = require("../db/database");
const { id, parseJson } = require("./utils");
const { record } = require("./audit");

const ENTITY_META = {
  project: { table: "projects", label: "title" },
  product: { table: "products", label: "name" },
  supplier: { table: "suppliers", label: "name" },
  client: { table: "clients", label: "name" },
  material: { table: "materials", label: "name" }
};

function normalizeRef(ref) {
  return ref === null || ref === undefined ? "" : String(ref);
}

function labelFor(type, refId) {
  const meta = ENTITY_META[type];
  if (!meta || !refId) return refId || "Naamloos";
  const row = db.prepare(`SELECT ${meta.label} AS label FROM ${meta.table} WHERE id = ?`).get(refId);
  return row?.label || refId;
}

function promoteEntity(type, ref, options = {}) {
  const refId = normalizeRef(ref);
  const label = options.label || labelFor(type, refId);
  const data = options.data ?? {};
  const dataJson = JSON.stringify(typeof data === "string" ? parseJson(data, {}) : data);

  const existing = refId
    ? db.prepare("SELECT * FROM knowledge_nodes WHERE type = ? AND ref_id = ?").get(type, refId)
    : null;

  if (existing) {
    db.prepare("UPDATE knowledge_nodes SET label = ?, data_json = ? WHERE id = ?")
      .run(label, dataJson, existing.id);
    record("knowledge_node", existing.id, "promote_update", label);
    return db.prepare("SELECT * FROM knowledge_nodes WHERE id = ?").get(existing.id);
  }

  const nodeId = id("knode");
  db.prepare(`
    INSERT INTO knowledge_nodes (id, type, label, ref_id, data_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(nodeId, type || "concept", label || "Naamloos", refId, dataJson);
  record("knowledge_node", nodeId, "promote_create", label);
  return db.prepare("SELECT * FROM knowledge_nodes WHERE id = ?").get(nodeId);
}

function resolveEntityNode(type, ref, options = {}) {
  const refId = normalizeRef(ref);
  if (!type || !refId) return null;
  const existing = db.prepare("SELECT * FROM knowledge_nodes WHERE type = ? AND ref_id = ?").get(type, refId);
  return existing || promoteEntity(type, refId, options);
}

function linkEntities(fromType, fromRef, toType, toRef, relation, options = {}) {
  try {
    const from = resolveEntityNode(fromType, fromRef, options.from || {});
    const to = resolveEntityNode(toType, toRef, options.to || {});
    if (!from || !to || !relation) return null;

    const existing = db.prepare(`
      SELECT * FROM knowledge_edges
      WHERE from_id = ? AND to_id = ? AND relation = ?
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
    record("knowledge_edge", "", "link_failed", {
      fromType,
      fromRef: normalizeRef(fromRef),
      toType,
      toRef: normalizeRef(toRef),
      relation,
      error: err.message
    });
    return null;
  }
}

module.exports = { promoteEntity, linkEntities, resolveEntityNode };
