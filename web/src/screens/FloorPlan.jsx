import { useState, useRef, useEffect } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { Ph, SectionHead, EditButton } from "../components/primitives.jsx";
import { EditDrawer, Field } from "../components/EditDrawer.jsx";

const MARKERS = [["32%", "30%"], ["64%", "42%"], ["46%", "72%"], ["24%", "58%"], ["72%", "70%"]];

const SCALE_UNITS = ["cm", "mm", "m"];
const LAYERS = ["walls", "furniture", "annotations"];
const LAYER_LABELS = { walls: "Wanden", furniture: "Meubels", annotations: "Annotaties" };
const KIND_BY_LAYER = {
  walls: ["wall", "door", "window", "column"],
  furniture: ["sofa", "table", "chair", "bed", "cabinet", "rug", "lamp"],
  annotations: ["note", "dimension", "marker", "label"]
};

function isPdf(name) {
  return !!name && /\.pdf$/i.test(name);
}
function scaleCaption(fp) {
  if (!fp?.scale_ratio || Number(fp.scale_ratio) <= 0) return null;
  const unit = fp.scale_unit ? ` (${fp.scale_unit})` : "";
  return `Schaal 1:${fp.scale_ratio}${unit}`;
}

function RoomsDrawer({ ctx, onClose }) {
  const { project, reload, fail } = ctx;
  const [form, setForm] = useState({ name: "", floor_level: "", concept: "" });
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function add() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.json("/api/rooms", "POST", { project_id: project.id, ...form, sort_order: project.rooms.length });
      setForm({ name: "", floor_level: "", concept: "" });
      await reload();
    } catch (err) { fail(err); } finally { setSaving(false); }
  }
  async function saveRoom(r, patch) { try { await api.json(`/api/rooms/${r.id}`, "PUT", patch); setEditing(null); await reload(); } catch (err) { fail(err); } }
  async function remove(id) { try { await api.del(`/api/rooms/${id}`); await reload(); } catch (err) { fail(err); } }
  async function uploadImage(e, id) {
    if (!e.target.files[0]) return;
    const fd = new FormData(); fd.append("image", e.target.files[0]);
    try { await api.form(`/api/rooms/${id}/image`, fd); await reload(); } catch (err) { fail(err); }
  }

  return (
    <EditDrawer open title="Ruimtes beheren" onClose={onClose}>
      <div className="form-grid" style={{ marginBottom: 26 }}>
        <Field label="Ruimtenaam"><input value={form.name} onChange={set("name")} placeholder="Woonkamer" /></Field>
        <Field label="Verdieping"><input value={form.floor_level} onChange={set("floor_level")} placeholder="Bel-etage" /></Field>
        <Field label="Concept / toelichting"><textarea value={form.concept} onChange={set("concept")} rows={2} /></Field>
        <button type="button" className="btn btn-clay" onClick={add} disabled={saving} style={{ justifyContent: "center" }}>
          <Icon name="plus" size={15} /> {saving ? "Bezig…" : "Ruimte toevoegen"}
        </button>
      </div>
      <div className="hr" style={{ margin: "4px 0 18px" }} />
      <div className="col gap3">
        {project.rooms.map((r) => (
          <div key={r.id} className="card" style={{ padding: 14 }}>
            {editing === r.id ? (
              <RoomEdit room={r} onCancel={() => setEditing(null)} onSave={(patch) => saveRoom(r, patch)} />
            ) : (
              <>
                <div className="row between middle">
                  <div>
                    <strong className="serif" style={{ fontSize: 18 }}>{r.name}</strong>
                    {r.floor_level && <span className="caption" style={{ marginLeft: 8 }}>{r.floor_level}</span>}
                  </div>
                  <div className="row gap2">
                    <button className="btn btn-ghost" style={{ padding: "6px 9px" }} onClick={() => setEditing(r.id)}><Icon name="edit" size={13} /></button>
                    <button className="btn btn-danger" style={{ padding: "6px 9px" }} onClick={() => remove(r.id)}><Icon name="trash" size={13} /></button>
                  </div>
                </div>
                {r.concept && <p className="body" style={{ fontSize: 13, margin: "8px 0 0" }}>{r.concept}</p>}
                <label className="row gap2 middle" style={{ marginTop: 10, cursor: "pointer", color: "var(--ink-2)", fontSize: 12, fontWeight: 600 }}>
                  <Icon name="image" size={13} /> {r.image_path ? "Sfeerbeeld vervangen" : "Sfeerbeeld toevoegen"}
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => uploadImage(e, r.id)} />
                </label>
              </>
            )}
          </div>
        ))}
        {project.rooms.length === 0 && <p className="caption">Nog geen ruimtes.</p>}
      </div>
    </EditDrawer>
  );
}

function RoomEdit({ room, onCancel, onSave }) {
  const [f, setF] = useState({ name: room.name, floor_level: room.floor_level || "", concept: room.concept || "" });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <div className="form-grid">
      <Field label="Naam"><input value={f.name} onChange={set("name")} /></Field>
      <Field label="Verdieping"><input value={f.floor_level} onChange={set("floor_level")} /></Field>
      <Field label="Concept"><textarea value={f.concept} onChange={set("concept")} rows={2} /></Field>
      <div className="row gap2">
        <button type="button" className="btn btn-primary" onClick={() => onSave(f)}>Opslaan</button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Annuleren</button>
      </div>
    </div>
  );
}

const EMPTY_DRAWING = { walls: [], doors: [], windows: [], objects: [], dimensions: [], labels: [] };

function PlanDrawer({ ctx, onClose }) {
  const { project, floorplans, reload, fail } = ctx;
  const [drawing, setDrawing] = useState(EMPTY_DRAWING);
  const [draft, setDraft] = useState(null);
  const [tool, setTool] = useState("walls");
  const [meta, setMeta] = useState({ name: "Concept plattegrond", floor_level: "" });
  const [file, setFile] = useState(null);
  const svgRef = useRef(null);
  const STROKES = { walls: ["#2d2926", 5], doors: ["#a47755", 4], windows: ["#447c88", 4], dimensions: ["#7c563c", 2] };

  function point(e) {
    const rect = svgRef.current.getBoundingClientRect();
    return { x: Math.round((e.clientX - rect.left) * (720 / rect.width)), y: Math.round((e.clientY - rect.top) * (420 / rect.height)) };
  }
  function clickCanvas(e) {
    const p = point(e);
    if (tool === "objects") { setDrawing((d) => ({ ...d, objects: [...d.objects, { x: p.x, y: p.y, w: 54, h: 34 }] })); return; }
    if (!draft) setDraft(p);
    else { setDrawing((d) => ({ ...d, [tool]: [...d[tool], { x1: draft.x, y1: draft.y, x2: p.x, y2: p.y }] })); setDraft(null); }
  }
  function undo() { setDrawing((d) => ({ ...d, [tool]: d[tool].slice(0, -1) })); }

  async function save() {
    try {
      const labels = project.rooms.map((r, i) => ({ text: r.name, x: 40, y: 40 + i * 24 }));
      const fd = new FormData();
      fd.append("project_id", project.id);
      fd.append("name", meta.name);
      fd.append("floor_level", meta.floor_level);
      fd.append("drawing_json", JSON.stringify({ ...drawing, labels }));
      if (file) fd.append("file", file);
      await api.form("/api/floorplans", fd);
      setDrawing(EMPTY_DRAWING); setFile(null);
      await reload();
    } catch (err) { fail(err); }
  }
  async function remove(id) { try { await api.del(`/api/floorplans/${id}`); await reload(); } catch (err) { fail(err); } }

  return (
    <EditDrawer open title="Plattegrond beheren" onClose={onClose}>
      <div className="form-grid form-grid-2" style={{ marginBottom: 14 }}>
        <Field label="Naam"><input value={meta.name} onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))} /></Field>
        <Field label="Verdieping"><input value={meta.floor_level} onChange={(e) => setMeta((m) => ({ ...m, floor_level: e.target.value }))} /></Field>
      </div>
      <div className="row gap2 wrap" style={{ marginBottom: 10 }}>
        {["walls", "doors", "windows", "objects", "dimensions"].map((it) => (
          <button key={it} type="button" className={`btn ${tool === it ? "btn-primary" : "btn-ghost"}`} style={{ padding: "7px 11px" }} onClick={() => { setTool(it); setDraft(null); }}>{it}</button>
        ))}
        <button type="button" className="btn btn-ghost" style={{ padding: "7px 11px" }} onClick={undo}>Ongedaan</button>
        <button type="button" className="btn btn-ghost" style={{ padding: "7px 11px" }} onClick={() => setDrawing(EMPTY_DRAWING)}>Leeg</button>
      </div>
      <div className="card" style={{ overflow: "hidden", marginBottom: 12 }}>
        <svg ref={svgRef} viewBox="0 0 720 420" onClick={clickCanvas} style={{ display: "block", width: "100%", cursor: "crosshair" }}>
          <rect x="0" y="0" width="720" height="420" fill="var(--surface-2)" />
          {["walls", "doors", "windows", "dimensions"].map((kind) => (
            <g key={kind} stroke={STROKES[kind][0]} strokeWidth={STROKES[kind][1]} strokeLinecap="round" strokeDasharray={kind === "dimensions" ? "8 6" : undefined}>
              {drawing[kind].map((l, i) => <line key={i} {...l} />)}
            </g>
          ))}
          {drawing.objects.map((o, i) => <rect key={i} x={o.x} y={o.y} width={o.w} height={o.h} rx="4" fill="#e8ded3" stroke="#a47755" />)}
          {draft && <circle cx={draft.x} cy={draft.y} r="6" fill="var(--clay)" />}
        </svg>
      </div>
      <Field label="Of upload een bestaande plattegrond (afbeelding/PDF)"><input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files[0])} /></Field>
      <button type="button" className="btn btn-clay" onClick={save} style={{ justifyContent: "center", width: "100%", marginTop: 14 }}><Icon name="plus" size={15} /> Plattegrond opslaan</button>
      <div className="hr" style={{ margin: "20px 0 14px" }} />
      <div className="col gap2">
        {floorplans.map((fp) => (
          <div key={fp.id} className="row between middle" style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <div className="row gap2 middle">
              <div>
                <strong style={{ fontSize: 14 }}>{fp.name}</strong> <span className="caption">{[fp.floor_level, fp.file_name, scaleCaption(fp)].filter(Boolean).join(" · ")}</span>
              </div>
              {fp.version > 1 && <span className="tag">v{fp.version}</span>}
            </div>
            <button className="btn btn-danger" style={{ padding: "6px 9px" }} onClick={() => remove(fp.id)}><Icon name="trash" size={13} /></button>
          </div>
        ))}
        {floorplans.length === 0 && <p className="caption">Nog geen plattegronden.</p>}
      </div>
    </EditDrawer>
  );
}

function PlanVisual({ plan }) {
  // Uploaded file: prefer the served thumb/file URL. PDFs can't render inline.
  if (plan?.file_url || plan?.thumb_url) {
    if (isPdf(plan.file_name)) {
      return (
        <div className="ph" style={{ aspectRatio: "16/11", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <a className="btn btn-ghost" href={plan.file_url} target="_blank" rel="noreferrer" style={{ gap: 8 }}>
            <Icon name="doc" size={16} /> PDF openen
          </a>
        </div>
      );
    }
    const src = plan.thumb_url || plan.file_url;
    return (
      <div className="ph has-img" style={{ aspectRatio: "16/11" }}>
        <img src={src} alt={plan.name || "Plattegrond"} />
      </div>
    );
  }
  if (plan?.file_path) {
    return <Ph label="" src={plan.file_path} icon="plan" style={{ aspectRatio: "16/11" }} alt={plan.name} />;
  }
  const d = plan?.drawing;
  const hasDrawing = d && (d.walls?.length || d.doors?.length || d.windows?.length);
  if (hasDrawing) {
    return (
      <svg viewBox="0 0 720 420" style={{ display: "block", width: "100%", aspectRatio: "16/11", background: "var(--surface-2)" }}>
        <g stroke="#2d2926" strokeWidth="5" strokeLinecap="round">{(d.walls || []).map((l, i) => <line key={i} {...l} />)}</g>
        <g stroke="#a47755" strokeWidth="4" strokeLinecap="round">{(d.doors || []).map((l, i) => <line key={i} {...l} />)}</g>
        <g stroke="#447c88" strokeWidth="4" strokeLinecap="round">{(d.windows || []).map((l, i) => <line key={i} {...l} />)}</g>
        {(d.objects || []).map((o, i) => <rect key={i} x={o.x} y={o.y} width={o.w} height={o.h} rx="4" fill="#e8ded3" stroke="#a47755" />)}
      </svg>
    );
  }
  return <Ph label="plattegrond — technische tekening" icon="plan" style={{ aspectRatio: "16/11" }} />;
}

// Edit an existing floorplan's metadata + scale, plus its objects/layers.
function PlanEditDrawer({ ctx, plan, onClose }) {
  const { reload, fail } = ctx;
  const [f, setF] = useState({
    name: plan.name || "",
    floor_level: plan.floor_level || "",
    notes: plan.notes || "",
    scale_ratio: plan.scale_ratio ? String(plan.scale_ratio) : "",
    scale_unit: plan.scale_unit || "cm"
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    try {
      await api.json(`/api/floorplans/${plan.id}`, "PUT", {
        name: f.name,
        floor_level: f.floor_level,
        notes: f.notes,
        scale_ratio: Number(f.scale_ratio) || 0,
        scale_unit: f.scale_unit
      });
      await reload();
      onClose();
    } catch (err) { fail(err); } finally { setSaving(false); }
  }

  return (
    <EditDrawer open title="Plattegrond bewerken" onClose={onClose} onSave={save} saving={saving}>
      <div className="form-grid form-grid-2" style={{ marginBottom: 14 }}>
        <Field label="Naam"><input value={f.name} onChange={set("name")} /></Field>
        <Field label="Verdieping"><input value={f.floor_level} onChange={set("floor_level")} placeholder="Bel-etage" /></Field>
      </div>
      <div className="form-grid form-grid-2" style={{ marginBottom: 14 }}>
        <Field label="Schaal 1:N"><input type="number" min="0" value={f.scale_ratio} onChange={set("scale_ratio")} placeholder="50" /></Field>
        <Field label="Eenheid">
          <select value={f.scale_unit} onChange={set("scale_unit")}>
            {SCALE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notities"><textarea value={f.notes} onChange={set("notes")} rows={3} /></Field>
      {scaleCaption(f.scale_ratio ? { scale_ratio: f.scale_ratio, scale_unit: f.scale_unit } : {}) && (
        <p className="caption" style={{ marginTop: 8 }}>{scaleCaption({ scale_ratio: f.scale_ratio, scale_unit: f.scale_unit })}</p>
      )}
      <div className="hr" style={{ margin: "20px 0 14px" }} />
      <ObjectsPanel ctx={ctx} plan={plan} />
    </EditDrawer>
  );
}

// Objects/layers editor for a single floorplan. Loads independently of ctx.
function ObjectsPanel({ ctx, plan }) {
  const { fail } = ctx;
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ layer: "walls", kind: "wall", label: "" });
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editLabel, setEditLabel] = useState("");

  async function load() {
    setLoading(true);
    try { setObjects(await api.get(`/api/floorplans/${plan.id}/objects`)); }
    catch (err) { fail(err); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [plan.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function pickLayer(layer) {
    setForm((p) => ({ ...p, layer, kind: KIND_BY_LAYER[layer][0] }));
  }
  async function add() {
    setBusy(true);
    try {
      await api.json(`/api/floorplans/${plan.id}/objects`, "POST", {
        layer: form.layer,
        kind: form.kind,
        label: form.label.trim() || null,
        geometry: {},
        sort_order: objects.filter((o) => o.layer === form.layer).length
      });
      setForm((p) => ({ ...p, label: "" }));
      await load();
    } catch (err) { fail(err); } finally { setBusy(false); }
  }
  async function saveLabel(oid) {
    try { await api.json(`/api/floorplans/objects/${oid}`, "PUT", { label: editLabel.trim() || null }); setEditing(null); await load(); }
    catch (err) { fail(err); }
  }
  async function remove(oid) {
    try { await api.del(`/api/floorplans/objects/${oid}`); await load(); }
    catch (err) { fail(err); }
  }

  const byLayer = LAYERS.map((layer) => ({ layer, items: objects.filter((o) => o.layer === layer) }));

  return (
    <div>
      <h4 className="serif" style={{ fontSize: 18, margin: "0 0 12px" }}>Objecten & lagen</h4>
      <div className="form-grid form-grid-2" style={{ marginBottom: 10 }}>
        <Field label="Laag">
          <select value={form.layer} onChange={(e) => pickLayer(e.target.value)}>
            {LAYERS.map((l) => <option key={l} value={l}>{LAYER_LABELS[l]}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select value={form.kind} onChange={(e) => setForm((p) => ({ ...p, kind: e.target.value }))}>
            {KIND_BY_LAYER[form.layer].map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Label (optioneel)"><input value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} placeholder="Bijv. Bank 3-zits" /></Field>
      <button type="button" className="btn btn-clay" onClick={add} disabled={busy} style={{ justifyContent: "center", width: "100%", marginTop: 12 }}>
        <Icon name="plus" size={15} /> {busy ? "Bezig…" : "Object toevoegen"}
      </button>

      <div className="hr" style={{ margin: "18px 0 14px" }} />
      {loading && <p className="caption">Laden…</p>}
      {!loading && objects.length === 0 && <p className="caption">Nog geen objecten.</p>}
      {!loading && byLayer.filter((g) => g.items.length).map((g) => (
        <div key={g.layer} style={{ marginBottom: 16 }}>
          <div className="kicker" style={{ marginBottom: 8 }}>{LAYER_LABELS[g.layer]}</div>
          <div className="col gap2">
            {g.items.map((o) => (
              <div key={o.id} className="row between middle" style={{ padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
                {editing === o.id ? (
                  <div className="row gap2 middle" style={{ flex: 1 }}>
                    <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} style={{ flex: 1 }} autoFocus />
                    <button type="button" className="btn btn-primary" style={{ padding: "6px 9px" }} onClick={() => saveLabel(o.id)}><Icon name="check" size={13} /></button>
                    <button type="button" className="btn btn-ghost" style={{ padding: "6px 9px" }} onClick={() => setEditing(null)}><Icon name="close" size={13} /></button>
                  </div>
                ) : (
                  <>
                    <div>
                      <strong style={{ fontSize: 14 }}>{o.label || o.kind}</strong>
                      <span className="caption" style={{ marginLeft: 8 }}>{o.kind}</span>
                    </div>
                    <div className="row gap2">
                      <button type="button" className="btn btn-ghost" style={{ padding: "6px 9px" }} onClick={() => { setEditing(o.id); setEditLabel(o.label || ""); }}><Icon name="edit" size={13} /></button>
                      <button type="button" className="btn btn-danger" style={{ padding: "6px 9px" }} onClick={() => remove(o.id)}><Icon name="trash" size={13} /></button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function FloorPlan({ ctx }) {
  const { project, floorplans, reload, fail } = ctx;
  const rooms = project.rooms || [];
  const [active, setActive] = useState(0);
  const [editRooms, setEditRooms] = useState(false);
  const [editPlan, setEditPlan] = useState(false);
  const [editMeta, setEditMeta] = useState(false);
  const [versioning, setVersioning] = useState(false);
  const plan = floorplans[0];
  const caption = scaleCaption(plan);

  async function newVersion() {
    if (!plan) return;
    setVersioning(true);
    try { await api.json(`/api/floorplans/${plan.id}/new-version`, "POST", {}); await reload(); }
    catch (err) { fail(err); } finally { setVersioning(false); }
  }

  return (
    <div className="content content-wide rise">
      <SectionHead kicker={`Plattegrond${plan?.floor_level ? " — " + plan.floor_level : ""}`}
        title="Indeling & circulatie"
        sub="Een rustige, logische looproute. De annotaties verwijzen naar de ruimteconcepten in het voorstel."
        right={<div className="row gap2">
          <EditButton onClick={() => setEditRooms(true)} label="Ruimtes" />
          <EditButton onClick={() => setEditPlan(true)} label="Plattegrond" />
          {plan && <EditButton onClick={() => setEditMeta(true)} label="Bewerk" />}
          {plan && <button className="btn btn-ghost no-print" style={{ padding: "8px 12px" }} onClick={newVersion} disabled={versioning}><Icon name="history" size={13} /> {versioning ? "Bezig…" : "Nieuwe versie"}</button>}
        </div>} />

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 40, alignItems: "start" }}>
        <div className="card" style={{ padding: 0, overflow: "hidden", position: "relative" }}>
          <PlanVisual plan={plan} />
          {plan && (plan.version > 1 || caption) && (
            <div className="row gap2 middle" style={{ position: "absolute", left: 12, top: 12, gap: 8 }}>
              {plan.version > 1 && <span className="tag tag-solid">v{plan.version}</span>}
              {caption && <span className="tag">{caption}</span>}
            </div>
          )}
          {rooms.slice(0, MARKERS.length).map((r, i) => (
            <button key={r.id} onClick={() => setActive(i)}
              style={{ position: "absolute", left: MARKERS[i][0], top: MARKERS[i][1], transform: "translate(-50%,-50%)",
                width: 30, height: 30, borderRadius: 99, border: "2px solid var(--surface)",
                background: active === i ? "var(--clay)" : "var(--ink)", color: "#fff",
                fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "var(--shadow-2)" }}>{String(i + 1).padStart(2, "0")}</button>
          ))}
        </div>
        <div>
          {rooms.length === 0 && <p className="body" style={{ color: "var(--muted)" }}>Nog geen ruimtes — voeg ze toe via <b>Ruimtes</b>.</p>}
          {rooms.map((r, i) => (
            <div key={r.id} onClick={() => setActive(i)}
              style={{ padding: "22px 0", borderBottom: "1px solid var(--line)", cursor: "pointer", opacity: active === i ? 1 : 0.55, transition: "opacity .2s" }}>
              <div className="row gap3 middle">
                <span style={{ width: 26, height: 26, borderRadius: 99, background: active === i ? "var(--clay)" : "var(--surface-2)", color: active === i ? "#fff" : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, border: "1px solid var(--line)" }}>{String(i + 1).padStart(2, "0")}</span>
                <h4 className="serif" style={{ fontSize: 21, margin: 0 }}>{r.name}</h4>
              </div>
              {r.floor_level && <div className="caption" style={{ marginTop: 8, marginLeft: 38 }}>{r.floor_level}</div>}
              {active === i && r.concept && <p className="body" style={{ fontSize: 14, marginTop: 10, marginLeft: 38, marginBottom: 0 }}>{r.concept}</p>}
            </div>
          ))}
        </div>
      </div>

      {editRooms && <RoomsDrawer ctx={ctx} onClose={() => setEditRooms(false)} />}
      {editPlan && <PlanDrawer ctx={ctx} onClose={() => setEditPlan(false)} />}
      {editMeta && plan && <PlanEditDrawer ctx={ctx} plan={plan} onClose={() => setEditMeta(false)} />}
    </div>
  );
}
