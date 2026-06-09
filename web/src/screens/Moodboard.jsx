import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { Ph, SectionHead, EditButton, Tag } from "../components/primitives.jsx";
import { EditDrawer, Field } from "../components/EditDrawer.jsx";

const CELLS = [
  { style: { gridColumn: "span 7", gridRow: "span 4" }, label: "hoofdsfeerbeeld — woonkamer in ochtendlicht", icon: "mood" },
  { style: { gridColumn: "span 5", gridRow: "span 2" }, label: "materiaaldetail — travertijn", icon: "palette" },
  { style: { gridColumn: "span 5", gridRow: "span 2" }, label: "textuur — linnen plooi", icon: "image" },
  { style: { gridColumn: "span 4", gridRow: "span 3" }, label: "stilleven — keramiek & tak", icon: "mood" },
  { quote: true, style: { gridColumn: "span 4", gridRow: "span 3" } },
  { style: { gridColumn: "span 4", gridRow: "span 3" }, label: "lichtinval — namiddag", icon: "image" }
];

const DEFAULT_PILLARS = [
  ["Tactiliteit", "Materialen die je wílt aanraken — geborsteld brons, geolied eiken, gewassen linnen. Het huis voelt eerlijk."],
  ["Gelaagd licht", "Daglicht als hoofdrol; ’s avonds lage, warme lichtbronnen die de ruimte in zones verdelen."],
  ["Geaard palet", "Tinten ontleend aan steen en aarde. Niets schreeuwt; alles ondersteunt."]
];

// Sentiment → colour + Dutch label for the colored dot/tag.
const SENTIMENTS = {
  positive: { color: "var(--sage)", label: "Positief" },
  neutral: { color: "var(--muted-2)", label: "Neutraal" },
  negative: { color: "#8c3b2c", label: "Negatief" }
};

// Lists shown in the drawer accept comma- OR newline-separated values.
function splitList(value) {
  return (value || "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function SentimentDot({ sentiment }) {
  const s = SENTIMENTS[sentiment] || SENTIMENTS.neutral;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-2)", fontWeight: 600 }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: s.color, flex: "none" }} />
      {s.label}
    </span>
  );
}

/* ── Board editor: PUT /api/moodboards/:id ───────────────────────────── */
function BoardEditDrawer({ board, fail, reload, onClose }) {
  const [form, setForm] = useState({
    title: board.title || "",
    description: board.description || "",
    colors: (board.colors || []).join(", "),
    materials: (board.materials || []).join(", ")
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    try {
      await api.json(`/api/moodboards/${board.id}`, "PUT", {
        title: form.title,
        description: form.description,
        colors: splitList(form.colors),
        materials: splitList(form.materials),
        layout_json: board.layout || {}
      });
      await reload();
      onClose();
    } catch (err) { fail(err); } finally { setSaving(false); }
  }

  return (
    <EditDrawer open title="Bord bewerken" onClose={onClose} onSave={save} saving={saving}>
      <div className="form-grid">
        <Field label="Titel"><input value={form.title} onChange={set("title")} placeholder="Warm minimalisme" /></Field>
        <Field label="Toelichting"><textarea value={form.description} onChange={set("description")} rows={4} /></Field>
        <Field label="Kleuren (komma of regel-gescheiden hex)">
          <textarea value={form.colors} onChange={set("colors")} rows={2} placeholder="#EFE9DE, #A86F4C" />
        </Field>
        <Field label="Materialen (komma of regel-gescheiden)">
          <textarea value={form.materials} onChange={set("materials")} rows={2} placeholder="Eiken, linnen, brons" />
        </Field>
      </div>
    </EditDrawer>
  );
}

/* ── Asset metadata editor: PUT /api/moodboards/assets/:assetId ──────── */
function AssetEditDrawer({ asset, fail, reload, onClose }) {
  const [form, setForm] = useState({
    caption: asset.caption || "",
    source_url: asset.source_url || "",
    tags: asset.tags || "",
    sort_order: asset.sort_order ?? 0
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    try {
      await api.json(`/api/moodboards/assets/${asset.id}`, "PUT", {
        caption: form.caption,
        source_url: form.source_url,
        tags: form.tags,
        sort_order: Number(form.sort_order) || 0
      });
      await reload();
      onClose();
    } catch (err) { fail(err); } finally { setSaving(false); }
  }

  return (
    <EditDrawer open title="Beeld bewerken" onClose={onClose} onSave={save} saving={saving}>
      <div style={{ marginBottom: 18 }}>
        <Ph label="" src={asset.url || asset.file_path} icon="image" style={{ width: "100%", aspectRatio: "4/3", borderRadius: "var(--r-md)" }} />
      </div>
      <div className="form-grid">
        <Field label="Bijschrift"><input value={form.caption} onChange={set("caption")} placeholder="Materiaaldetail — travertijn" /></Field>
        <Field label="Bron-URL"><input value={form.source_url} onChange={set("source_url")} placeholder="https://…" /></Field>
        <Field label="Tags (komma-gescheiden)"><input value={form.tags} onChange={set("tags")} placeholder="steen, warm, vloer" /></Field>
        <Field label="Volgorde"><input type="number" value={form.sort_order} onChange={set("sort_order")} /></Field>
      </div>
    </EditDrawer>
  );
}

/* ── Client feedback panel: GET/POST /api/moodboards/:id/feedback ────── */
function FeedbackPanel({ board, fail }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ author: "", sentiment: "positive", body: "" });
  const [posting, setPosting] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function load() {
    try { setItems(await api.get(`/api/moodboards/${board.id}/feedback`)); }
    catch (err) { fail(err); } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [board.id]);

  async function add() {
    if (!form.body.trim()) return;
    setPosting(true);
    try {
      await api.json(`/api/moodboards/${board.id}/feedback`, "POST", {
        author: form.author.trim() || "klant",
        sentiment: form.sentiment,
        body: form.body.trim()
      });
      setForm({ author: "", sentiment: "positive", body: "" });
      await load();
    } catch (err) { fail(err); } finally { setPosting(false); }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div className="caption" style={{ marginBottom: 8, letterSpacing: ".14em", textTransform: "uppercase" }}>Feedback klant</div>
      <div className="col gap2" style={{ marginBottom: 12 }}>
        {loading && <p className="caption" style={{ margin: 0 }}>Laden…</p>}
        {!loading && items.length === 0 && <p className="caption" style={{ margin: 0 }}>Nog geen feedback.</p>}
        {items.map((f) => (
          <div key={f.id} style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: "var(--r-md)", background: "var(--surface)" }}>
            <div className="row between middle" style={{ marginBottom: 4 }}>
              <strong style={{ fontSize: 13 }}>{f.author || "klant"}</strong>
              <SentimentDot sentiment={f.sentiment} />
            </div>
            <p className="body" style={{ fontSize: 13, margin: 0 }}>{f.body}</p>
          </div>
        ))}
      </div>
      <div className="form-grid">
        <div className="row gap2">
          <input style={{ flex: 1 }} value={form.author} onChange={set("author")} placeholder="Naam klant" />
          <select value={form.sentiment} onChange={set("sentiment")}>
            <option value="positive">Positief</option>
            <option value="neutral">Neutraal</option>
            <option value="negative">Negatief</option>
          </select>
        </div>
        <textarea value={form.body} onChange={set("body")} rows={2} placeholder="Reactie van de klant…" />
        <button type="button" className="btn btn-ghost" onClick={add} disabled={posting} style={{ justifyContent: "center" }}>
          <Icon name="plus" size={13} /> {posting ? "Bezig…" : "Feedback toevoegen"}
        </button>
      </div>
    </div>
  );
}

function MoodboardDrawer({ ctx, onClose }) {
  const { project, moodboards, reload, fail } = ctx;
  const [form, setForm] = useState({ title: "", description: "", colors: "", materials: "" });
  const [saving, setSaving] = useState(false);
  const [editBoard, setEditBoard] = useState(null);
  const [editAsset, setEditAsset] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function flash(msg) {
    setNotice(msg);
    setTimeout(() => setNotice(""), 3200);
  }

  async function create() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await api.json("/api/moodboards", "POST", {
        project_id: project.id, title: form.title, description: form.description,
        colors: splitList(form.colors),
        materials: splitList(form.materials)
      });
      setForm({ title: "", description: "", colors: "", materials: "" });
      await reload();
    } catch (err) { fail(err); } finally { setSaving(false); }
  }
  async function uploadAsset(e, id) {
    if (!e.target.files[0]) return;
    const fd = new FormData();
    fd.append("file", e.target.files[0]);
    try { await api.form(`/api/moodboards/${id}/assets`, fd); await reload(); } catch (err) { fail(err); }
  }
  async function removeBoard(id) { try { await api.del(`/api/moodboards/${id}`); await reload(); } catch (err) { fail(err); } }
  async function removeAsset(id) { try { await api.del(`/api/moodboards/assets/${id}`); await reload(); } catch (err) { fail(err); } }

  async function makeVariant(b) {
    const variant_label = window.prompt("Label voor deze variant (bv. ‘lichter palet’):", "");
    if (variant_label === null) return;
    setBusyId(b.id);
    try {
      await api.json(`/api/moodboards/${b.id}/variant`, "POST", { variant_label: variant_label.trim() });
      await reload();
      flash("Variant gemaakt.");
    } catch (err) { fail(err); } finally { setBusyId(null); }
  }

  async function promote(b) {
    setBusyId(b.id);
    try {
      await api.json(`/api/moodboards/${b.id}/promote`, "POST", {});
      flash(`“${b.title}” toegevoegd aan de Design Library.`);
    } catch (err) { fail(err); } finally { setBusyId(null); }
  }

  return (
    <EditDrawer open title="Moodboard beheren" onClose={onClose}>
      {notice && (
        <div className="row gap2 middle" style={{ marginBottom: 16, padding: "10px 12px", borderRadius: "var(--r-md)", background: "var(--clay-wash)", border: "1px solid var(--clay-soft)", color: "var(--clay)", fontSize: 13, fontWeight: 600 }}>
          <Icon name="check" size={14} /> {notice}
        </div>
      )}
      <div className="form-grid" style={{ marginBottom: 26 }}>
        <Field label="Titel"><input value={form.title} onChange={set("title")} placeholder="Warm minimalisme" /></Field>
        <Field label="Toelichting"><textarea value={form.description} onChange={set("description")} rows={3} /></Field>
        <Field label="Kleuren (komma-gescheiden hex)"><input value={form.colors} onChange={set("colors")} placeholder="#EFE9DE, #A86F4C" /></Field>
        <Field label="Materialen (komma-gescheiden)"><input value={form.materials} onChange={set("materials")} placeholder="Eiken, linnen, brons" /></Field>
        <button type="button" className="btn btn-clay" onClick={create} disabled={saving} style={{ justifyContent: "center" }}>
          <Icon name="plus" size={15} /> {saving ? "Bezig…" : "Moodboard toevoegen"}
        </button>
      </div>
      <div className="hr" style={{ margin: "4px 0 18px" }} />
      <div className="col gap4">
        {moodboards.map((b) => (
          <div key={b.id} className="card" style={{ padding: 16 }}>
            <div className="row between middle" style={{ gap: 8 }}>
              <div className="row gap2 middle wrap">
                <strong className="serif" style={{ fontSize: 18 }}>{b.title}</strong>
                {b.variant_of_id && (
                  <Tag variant="clay">Variant{b.variant_label ? ` — ${b.variant_label}` : ""}</Tag>
                )}
              </div>
              <button className="btn btn-danger" style={{ padding: "6px 9px" }} onClick={() => removeBoard(b.id)} title="Verwijderen"><Icon name="trash" size={13} /></button>
            </div>
            {b.description && <p className="body" style={{ fontSize: 13, margin: "6px 0 10px" }}>{b.description}</p>}
            <div className="row gap2 wrap" style={{ marginBottom: 10 }}>
              {(b.colors || []).map((c) => <span key={c} title={c} style={{ width: 20, height: 20, borderRadius: 4, background: c, border: "1px solid rgba(0,0,0,.08)" }} />)}
            </div>

            <div className="row gap2 wrap" style={{ marginBottom: 12 }}>
              <button type="button" className="btn btn-ghost" style={{ padding: "7px 10px" }} onClick={() => setEditBoard(b)}>
                <Icon name="edit" size={13} /> Bewerk bord
              </button>
              <button type="button" className="btn btn-ghost" style={{ padding: "7px 10px" }} onClick={() => makeVariant(b)} disabled={busyId === b.id}>
                <Icon name="layers" size={13} /> Variant maken
              </button>
              <button type="button" className="btn btn-ghost" style={{ padding: "7px 10px" }} onClick={() => promote(b)} disabled={busyId === b.id}>
                <Icon name="library" size={13} /> Naar Design Library
              </button>
            </div>

            <div className="row gap3 wrap" style={{ marginBottom: 6 }}>
              {(b.assets || []).map((a) => (
                <div key={a.id} style={{ position: "relative", width: 96 }}>
                  <Ph label="" src={a.url || a.file_path} icon="image" style={{ width: 96, height: 72, borderRadius: 4 }} />
                  <button onClick={() => setEditAsset(a)} title="Beeld bewerken"
                    style={{ position: "absolute", top: -6, left: -6, width: 18, height: 18, borderRadius: 99, border: 0, background: "var(--clay)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="edit" size={10} stroke={2} />
                  </button>
                  <button onClick={() => removeAsset(a.id)} title="Verwijderen"
                    style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: 99, border: 0, background: "var(--ink)", color: "#fff", cursor: "pointer", fontSize: 10 }}>✕</button>
                  {a.caption && <div className="caption" style={{ marginTop: 4, fontSize: 11, lineHeight: 1.3 }}>{a.caption}</div>}
                  {a.source_url && (
                    <a href={a.source_url} target="_blank" rel="noreferrer" className="caption" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--clay)" }}>
                      <Icon name="link" size={10} /> bron
                    </a>
                  )}
                  {a.tags && (
                    <div className="row gap2 wrap" style={{ marginTop: 3 }}>
                      {splitList(a.tags).map((t) => <span key={t} className="tag" style={{ fontSize: 10, padding: "1px 6px" }}>{t}</span>)}
                    </div>
                  )}
                </div>
              ))}
              <label className="btn btn-ghost" style={{ padding: "8px 10px", cursor: "pointer", alignSelf: "flex-start" }}>
                <Icon name="plus" size={13} /> Beeld
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => uploadAsset(e, b.id)} />
              </label>
            </div>

            <div className="hr" style={{ margin: "12px 0 0" }} />
            <FeedbackPanel board={b} fail={fail} />
          </div>
        ))}
        {moodboards.length === 0 && <p className="caption">Nog geen moodboards.</p>}
      </div>

      {editBoard && <BoardEditDrawer board={editBoard} fail={fail} reload={reload} onClose={() => setEditBoard(null)} />}
      {editAsset && <AssetEditDrawer asset={editAsset} fail={fail} reload={reload} onClose={() => setEditAsset(null)} />}
    </EditDrawer>
  );
}

export function Moodboard({ ctx }) {
  const { project, moodboards } = ctx;
  const [editing, setEditing] = useState(false);
  const assets = moodboards.flatMap((b) => b.assets || []);
  const pillars = moodboards.filter((b) => b.title && b.description).slice(0, 3).map((b) => [b.title, b.description]);
  const shownPillars = pillars.length ? pillars : DEFAULT_PILLARS;

  let imgIdx = 0;
  return (
    <div className="content content-wide rise">
      <SectionHead kicker="Moodboard — Sfeer & richting"
        title="Het huis als een warm, geaard verhaal"
        sub={project.vision || "De sfeer en materiaalrichting van het project."}
        right={<EditButton onClick={() => setEditing(true)} />} />

      {/* Asymmetric editorial collage */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12,1fr)", gridAutoRows: "118px", gap: 18, marginTop: 16 }}>
        {CELLS.map((cell, i) => {
          if (cell.quote) {
            return (
              <div key={i} style={{ ...cell.style, display: "flex", flexDirection: "column", justifyContent: "center", padding: "8px 6px" }}>
                <span className="serif" style={{ fontSize: 30, lineHeight: 1.15, color: "var(--ink)" }}>
                  “Rust ontstaat niet door leegte, maar door materialen die kloppen.”
                </span>
                <span className="caption" style={{ marginTop: 16, color: "var(--clay)" }}>— Ontwerpnotitie, Nova Studio</span>
              </div>
            );
          }
          const asset = assets[imgIdx++];
          return <Ph key={i} label={cell.label} src={asset?.url || asset?.file_path} icon={cell.icon} style={{ ...cell.style, borderRadius: "var(--r-md)" }} />;
        })}
      </div>

      <hr className="hr" style={{ margin: "56px 0" }} />

      <div className="grid grid-3">
        {shownPillars.map(([t, d]) => (
          <div key={t}>
            <div className="serif" style={{ fontSize: 22, marginBottom: 10 }}>{t}</div>
            <p className="body" style={{ margin: 0 }}>{d}</p>
          </div>
        ))}
      </div>

      {editing && <MoodboardDrawer ctx={ctx} onClose={() => setEditing(false)} />}
    </div>
  );
}
