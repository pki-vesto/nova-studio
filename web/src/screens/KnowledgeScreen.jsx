// Kennisgraaf — global knowledge-graph viewer with a relation-path tool.
import { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { Kicker, SectionHead } from "../components/primitives.jsx";
import { EditDrawer, Field } from "../components/EditDrawer.jsx";

// Stable palette keyed by node type. Falls back to a neutral tone.
const TYPE_COLORS = ["var(--clay)", "var(--sage)", "var(--ink-2)", "var(--muted-2)", "var(--muted)"];
function colorForType(type, types) {
  const i = types.indexOf(type);
  return i < 0 ? "var(--muted)" : TYPE_COLORS[i % TYPE_COLORS.length];
}

// SVG layout: nodes evenly on a circle, radius 220 around centre (400,280).
const CX = 400, CY = 280, R = 220;
function layout(nodes) {
  const n = nodes.length;
  const pos = {};
  nodes.forEach((node, i) => {
    const a = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
    pos[node.id] = { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
  });
  return pos;
}

function NodeDrawer({ onClose, onSaved, fail }) {
  const [form, setForm] = useState({ type: "", label: "", ref_id: "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  async function save() {
    if (!form.label.trim()) return;
    setSaving(true);
    try {
      await api.json("/api/knowledge/nodes", "POST", {
        type: form.type.trim(), label: form.label.trim(), ref_id: form.ref_id.trim() || null, data: {}
      });
      await onSaved();
      onClose();
    } catch (err) { fail(err); setSaving(false); }
  }
  return (
    <EditDrawer open title="Knoop toevoegen" onClose={onClose} onSave={save} saving={saving}>
      <div className="form-grid">
        <Field label="Type"><input value={form.type} onChange={set("type")} placeholder="merk, stijl, materiaal…" /></Field>
        <Field label="Label"><input value={form.label} onChange={set("label")} placeholder="&Tradition" /></Field>
        <Field label="Ref-id (optioneel)"><input value={form.ref_id} onChange={set("ref_id")} placeholder="product- of project-id" /></Field>
      </div>
    </EditDrawer>
  );
}

function EdgeDrawer({ nodes, onClose, onSaved, fail }) {
  const [form, setForm] = useState({ from_id: "", to_id: "", relation: "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  async function save() {
    if (!form.from_id || !form.to_id) return;
    setSaving(true);
    try {
      await api.json("/api/knowledge/edges", "POST", {
        from_id: form.from_id, to_id: form.to_id, relation: form.relation.trim(), weight: 1
      });
      await onSaved();
      onClose();
    } catch (err) { fail(err); setSaving(false); }
  }
  return (
    <EditDrawer open title="Relatie toevoegen" onClose={onClose} onSave={save} saving={saving}>
      <div className="form-grid">
        <div className="form-grid form-grid-2">
          <Field label="Van knoop">
            <select value={form.from_id} onChange={set("from_id")}>
              <option value="">— kies —</option>
              {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </Field>
          <Field label="Naar knoop">
            <select value={form.to_id} onChange={set("to_id")}>
              <option value="">— kies —</option>
              {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Relatie"><input value={form.relation} onChange={set("relation")} placeholder="past bij, leverancier van…" /></Field>
      </div>
    </EditDrawer>
  );
}

export function KnowledgeScreen({ ctx }) {
  const { fail } = ctx;
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [matchIds, setMatchIds] = useState(null); // null = no active search
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [path, setPath] = useState(undefined); // undefined = not run, [] = no path
  const [drawer, setDrawer] = useState(null); // null | "node" | "edge"

  const load = useCallback(async () => {
    try {
      const g = await api.get("/api/knowledge/graph");
      setNodes(g.nodes || []);
      setEdges(g.edges || []);
    } catch (err) { fail(err); }
  }, [fail]);

  useEffect(() => { load(); }, [load]);

  const types = useMemo(() => Array.from(new Set(nodes.map((n) => n.type).filter(Boolean))), [nodes]);
  const pos = useMemo(() => layout(nodes), [nodes]);
  const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);

  async function runSearch(e) {
    e?.preventDefault?.();
    const q = query.trim();
    if (!q) { setMatchIds(null); return; }
    try {
      const res = await api.get(`/api/knowledge/search?q=${encodeURIComponent(q)}`);
      const list = Array.isArray(res) ? res : (res.nodes || res.results || []);
      setMatchIds(new Set(list.map((n) => n.id)));
    } catch (err) { fail(err); }
  }

  async function findPath() {
    if (!from || !to) return;
    try {
      const res = await api.get(`/api/knowledge/path?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setPath(res.path || []);
    } catch (err) { fail(err); }
  }

  async function removeNode(id) {
    try { await api.del(`/api/knowledge/nodes/${id}`); if (selected === id) setSelected(null); await load(); }
    catch (err) { fail(err); }
  }
  async function removeEdge(id) {
    try { await api.del(`/api/knowledge/edges/${id}`); await load(); }
    catch (err) { fail(err); }
  }

  function isDim(id) {
    return matchIds && !matchIds.has(id);
  }

  return (
    <div className="content content-wide rise">
      <div className="page-head">
        <div>
          <Kicker style={{ marginBottom: 14 }}>Nova Studio — Kennis</Kicker>
          <h1 className="page-title">Kennisgraaf</h1>
        </div>
        <div className="row gap2">
          <button className="btn btn-ghost btn-lg" onClick={() => setDrawer("edge")} disabled={nodes.length < 2}>
            <Icon name="link" size={16} /> Relatie toevoegen
          </button>
          <button className="btn btn-primary btn-lg" onClick={() => setDrawer("node")}>
            <Icon name="plus" size={16} /> Knoop toevoegen
          </button>
        </div>
      </div>

      {nodes.length === 0 ? (
        <div className="empty">
          <p className="body" style={{ margin: 0 }}>Nog geen kennis in kaart. Voeg knopen toe — merken, stijlen, materialen — en verbind ze met relaties om de graaf te laten groeien.</p>
          <button className="btn btn-clay" onClick={() => setDrawer("node")}><Icon name="plus" size={15} /> Eerste knoop</button>
        </div>
      ) : (
        <>
          {/* Search */}
          <form className="row gap2 middle" onSubmit={runSearch} style={{ marginBottom: 24, maxWidth: 520 }}>
            <div className="row middle gap2 card" style={{ flex: 1, padding: "8px 14px" }}>
              <Icon name="search" size={16} />
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim()) setMatchIds(null); }}
                placeholder="Zoek knopen op label of type…"
                style={{ border: "none", background: "transparent", outline: "none", flex: 1 }}
              />
            </div>
            <button type="submit" className="btn btn-ghost">Zoek</button>
            {matchIds && <button type="button" className="btn btn-quiet" onClick={() => { setQuery(""); setMatchIds(null); }}>Wis</button>}
          </form>
          {matchIds && <div className="caption" style={{ marginBottom: 16 }}>{matchIds.size} knoop(en) gevonden</div>}

          {/* Graph */}
          <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 28 }}>
            <svg viewBox="0 0 800 560" style={{ width: "100%", height: 600, display: "block" }} role="img" aria-label="Kennisgraaf">
              {edges.map((ed) => {
                const a = pos[ed.from_id], b = pos[ed.to_id];
                if (!a || !b) return null;
                return (
                  <line key={ed.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke="var(--line)" strokeWidth={Math.max(1, (ed.weight || 1))} />
                );
              })}
              {nodes.map((n) => {
                const p = pos[n.id];
                if (!p) return null;
                const sel = selected === n.id;
                const dim = isDim(n.id);
                const match = matchIds && matchIds.has(n.id);
                return (
                  <g key={n.id} style={{ cursor: "pointer", opacity: dim ? 0.25 : 1 }}
                     onClick={() => setSelected(sel ? null : n.id)}>
                    <circle cx={p.x} cy={p.y} r={sel ? 17 : 13}
                      fill={colorForType(n.type, types)}
                      stroke={match ? "var(--clay)" : (sel ? "var(--ink)" : "var(--bg)")}
                      strokeWidth={match || sel ? 3 : 2} />
                    <text x={p.x} y={p.y - (sel ? 24 : 20)} textAnchor="middle"
                      style={{ fontSize: 13, fill: "var(--ink)", fontWeight: sel ? 700 : 500, pointerEvents: "none" }}>
                      {n.label}
                    </text>
                  </g>
                );
              })}
            </svg>
            {/* Legend + selection */}
            <div className="row between middle wrap" style={{ padding: "12px 18px", borderTop: "1px solid var(--line)", gap: 16 }}>
              <div className="row gap3 wrap">
                {types.map((t) => (
                  <span key={t} className="row middle gap2 caption">
                    <span style={{ width: 10, height: 10, borderRadius: 99, background: colorForType(t, types) }} /> {t}
                  </span>
                ))}
              </div>
              {selected && nodeById[selected] && (
                <span className="caption">
                  Geselecteerd: <strong className="serif">{nodeById[selected].label}</strong>
                  {nodeById[selected].type ? ` · ${nodeById[selected].type}` : ""}
                </span>
              )}
            </div>
          </div>

          {/* Relatiepad */}
          <div className="card" style={{ padding: 18, marginBottom: 28 }}>
            <SectionHead kicker="Verbinding" title="Relatiepad" />
            <div className="row gap2 middle wrap" style={{ marginTop: -8 }}>
              <select value={from} onChange={(e) => setFrom(e.target.value)}>
                <option value="">Van…</option>
                {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
              <Icon name="arrowR" size={16} />
              <select value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Naar…</option>
                {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
              <button className="btn btn-primary" onClick={findPath} disabled={!from || !to}>
                <Icon name="link" size={15} /> Vind pad
              </button>
            </div>
            {path !== undefined && (
              <div style={{ marginTop: 18 }}>
                {path.length === 0 ? (
                  <span className="caption">Geen pad gevonden</span>
                ) : (
                  <div className="row middle wrap" style={{ gap: 6 }}>
                    {path.map((step, i) => (
                      <span key={step.id ?? i} className="row middle gap2">
                        <span className="serif" style={{ fontSize: 17 }}>{step.label}</span>
                        {i < path.length - 1 && <Icon name="chevR" size={14} style={{ color: "var(--clay)" }} />}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Lists with delete */}
          <div className="form-grid form-grid-2">
            <div className="card" style={{ padding: 18 }}>
              <div className="row between middle" style={{ marginBottom: 12 }}>
                <Kicker>Knopen</Kicker><span className="caption">{nodes.length}</span>
              </div>
              <div className="col" style={{ gap: 4 }}>
                {nodes.map((n) => (
                  <div key={n.id} className="row between middle" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                    <span className="row middle gap2">
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: colorForType(n.type, types) }} />
                      <span>{n.label}</span>
                      {n.type && <span className="caption mono">{n.type}</span>}
                    </span>
                    <button className="btn btn-danger" style={{ padding: "5px 9px" }} onClick={() => removeNode(n.id)} aria-label="Verwijder knoop">
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="card" style={{ padding: 18 }}>
              <div className="row between middle" style={{ marginBottom: 12 }}>
                <Kicker>Relaties</Kicker><span className="caption">{edges.length}</span>
              </div>
              {edges.length === 0 ? (
                <span className="caption">Nog geen relaties.</span>
              ) : (
                <div className="col" style={{ gap: 4 }}>
                  {edges.map((ed) => (
                    <div key={ed.id} className="row between middle" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                      <span className="row middle gap2">
                        <span>{nodeById[ed.from_id]?.label || ed.from_id}</span>
                        <Icon name="dot" size={14} style={{ color: "var(--clay)" }} />
                        {ed.relation && <span className="caption">{ed.relation}</span>}
                        <Icon name="chevR" size={13} />
                        <span>{nodeById[ed.to_id]?.label || ed.to_id}</span>
                      </span>
                      <button className="btn btn-danger" style={{ padding: "5px 9px" }} onClick={() => removeEdge(ed.id)} aria-label="Verwijder relatie">
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {drawer === "node" && <NodeDrawer fail={fail} onClose={() => setDrawer(null)} onSaved={load} />}
      {drawer === "edge" && <EdgeDrawer nodes={nodes} fail={fail} onClose={() => setDrawer(null)} onSaved={load} />}
    </div>
  );
}
