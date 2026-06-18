import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { money } from "../lib/format.js";
import { computeBudget } from "../lib/budget.js";
import { Ph, Kicker } from "../components/primitives.jsx";
import { BudgetBlock } from "../components/BudgetBlock.jsx";
import { EditDrawer, Field } from "../components/EditDrawer.jsx";

function DocPage({ children, label, n, dark }) {
  return (
    <section className={`doc-page ${dark ? "doc-page-dark" : ""}`} style={{ background: dark ? "var(--surface-ink)" : "var(--surface)", color: dark ? "var(--surface)" : "var(--ink)",
      borderRadius: "var(--r-lg)", border: "1px solid " + (dark ? "var(--line-ink)" : "var(--line)"), overflow: "hidden",
      padding: "clamp(36px,5vw,72px)", position: "relative", marginBottom: 28 }}>
      {label && (
        <div className="row between" style={{ marginBottom: 36, opacity: 0.85 }}>
          <span className="eyebrow" style={{ color: dark ? "var(--clay-soft)" : "var(--clay)" }}>{label}</span>
          <span className="mono" style={{ color: "var(--muted)" }}>Nova Studio · {String(n).padStart(2, "0")}</span>
        </div>
      )}
      {children}
    </section>
  );
}

function ProposalDrawer({ ctx, proposal, onClose }) {
  const { project, reload, fail } = ctx;
  const [form, setForm] = useState({
    title: proposal?.title || `Ontwerpvoorstel — ${project.title}`,
    summary: proposal?.summary || "",
    intro_text: proposal?.intro_text || project.vision || "",
    style_direction: proposal?.style_direction || project.summary || "",
    color_advice: proposal?.color_advice || "",
    closing_text: proposal?.closing_text || ""
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    try {
      // proposals module has no PUT — recreate to keep latest on top (matches existing app pattern).
      await api.json("/api/proposals", "POST", { project_id: project.id, ...form });
      await reload();
      onClose();
    } catch (err) { fail(err); setSaving(false); }
  }

  return (
    <EditDrawer open title="Voorsteltekst bewerken" onClose={onClose} onSave={save} saving={saving}>
      <div className="form-grid">
        <Field label="Titel"><input value={form.title} onChange={set("title")} /></Field>
        <Field label="Samenvatting"><textarea value={form.summary} onChange={set("summary")} rows={3} placeholder="Korte samenvatting van dit voorstel…" /></Field>
        <Field label="Introductie"><textarea value={form.intro_text} onChange={set("intro_text")} rows={4} /></Field>
        <Field label="Stijlrichting"><textarea value={form.style_direction} onChange={set("style_direction")} rows={4} /></Field>
        <Field label="Kleuradvies"><textarea value={form.color_advice} onChange={set("color_advice")} rows={3} /></Field>
        <Field label="Afsluiting"><textarea value={form.closing_text} onChange={set("closing_text")} rows={3} /></Field>
      </div>
    </EditDrawer>
  );
}

/* ---------------------------------------------------------------------------
   Status helpers
--------------------------------------------------------------------------- */
const STATUSES = [
  { value: "concept", label: "Concept", color: "var(--muted-2)", wash: "var(--surface-2)" },
  { value: "review", label: "Ter review", color: "var(--clay)", wash: "var(--clay-wash)" },
  { value: "sent", label: "Verstuurd", color: "var(--ink)", wash: "var(--surface-2)" },
  { value: "accepted", label: "Geaccepteerd", color: "var(--sage, #5f7a55)", wash: "rgba(95,122,85,.12)" },
  { value: "rejected", label: "Afgewezen", color: "#8c3b2c", wash: "#f3e4df" }
];
function statusMeta(s) {
  return STATUSES.find((x) => x.value === s) || { value: s, label: s || "—", color: "var(--muted)", wash: "var(--surface-2)" };
}
function StatusBadge({ status }) {
  const m = statusMeta(status);
  return (
    <span className="tag" style={{ color: m.color, background: m.wash, borderColor: "transparent" }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: m.color }} />
      {m.label}
    </span>
  );
}

const KINDS = [
  { value: "text", label: "Tekst" },
  { value: "style", label: "Stijl" },
  { value: "rooms", label: "Ruimtes" },
  { value: "shopping", label: "Shopping" },
  { value: "intake", label: "Intake" }
];
function kindLabel(k) { return (KINDS.find((x) => x.value === k) || {}).label || k; }

function fmtDate(v) {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleString("nl-NL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtSize(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} kB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

/* ---------------------------------------------------------------------------
   Sections editor — add / edit / delete / toggle / reorder
--------------------------------------------------------------------------- */
function SectionForm({ proposalId, section, onClose, onSaved, fail }) {
  const editing = !!section;
  const [form, setForm] = useState({
    kind: section?.kind || "text",
    title: section?.title || "",
    body: section?.body || "",
    audience: section?.audience || "client",
    is_enabled: section ? !!section.is_enabled : true
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    try {
      const body = { ...form, is_enabled: form.is_enabled ? 1 : 0 };
      if (editing) await api.json(`/api/proposals/sections/${section.id}`, "PUT", body);
      else await api.json(`/api/proposals/${proposalId}/sections`, "POST", body);
      await onSaved();
      onClose();
    } catch (err) { fail(err); setSaving(false); }
  }

  return (
    <EditDrawer open title={editing ? "Sectie bewerken" : "Nieuwe sectie"} onClose={onClose} onSave={save} saving={saving}>
      <div className="form-grid">
        <div className="form-grid form-grid-2">
          <Field label="Type">
            <select value={form.kind} onChange={set("kind")}>
              {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </Field>
          <Field label="Doelgroep">
            <select value={form.audience} onChange={set("audience")}>
              <option value="client">Klant</option>
              <option value="internal">Intern</option>
            </select>
          </Field>
        </div>
        <Field label="Titel"><input value={form.title} onChange={set("title")} placeholder="Sectietitel" /></Field>
        <Field label="Tekst"><textarea value={form.body} onChange={set("body")} rows={6} /></Field>
        <label className="row gap2 middle" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={form.is_enabled} onChange={(e) => setForm((f) => ({ ...f, is_enabled: e.target.checked }))} style={{ width: "auto" }} />
          <span style={{ fontSize: 13 }}>Sectie ingeschakeld (zichtbaar in export)</span>
        </label>
      </div>
    </EditDrawer>
  );
}

function SectionsPanel({ proposalId, fail }) {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null); // null | {} | section

  async function load() {
    setLoading(true);
    try { setSections(await api.get(`/api/proposals/${proposalId}/sections`)); }
    catch (err) { fail(err); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [proposalId]);

  async function remove(sid) {
    if (!window.confirm("Sectie verwijderen?")) return;
    try { await api.del(`/api/proposals/sections/${sid}`); await load(); } catch (err) { fail(err); }
  }
  async function toggleEnabled(s) {
    try { await api.json(`/api/proposals/sections/${s.id}`, "PUT", { is_enabled: s.is_enabled ? 0 : 1 }); await load(); }
    catch (err) { fail(err); }
  }
  async function toggleAudience(s) {
    const next = s.audience === "internal" ? "client" : "internal";
    try { await api.json(`/api/proposals/sections/${s.id}`, "PUT", { audience: next }); await load(); }
    catch (err) { fail(err); }
  }
  async function move(idx, dir) {
    const next = idx + dir;
    if (next < 0 || next >= sections.length) return;
    const order = sections.map((s) => s.id);
    [order[idx], order[next]] = [order[next], order[idx]];
    setBusy(true);
    try { await api.json(`/api/proposals/${proposalId}/sections/reorder`, "PUT", { order }); await load(); }
    catch (err) { fail(err); }
    finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ padding: "clamp(20px,3vw,32px)", marginBottom: 28 }}>
      <div className="row between middle wrap" style={{ marginBottom: 18, gap: 12 }}>
        <div>
          <Kicker>Secties</Kicker>
          <p className="caption" style={{ marginTop: 6, marginBottom: 0 }}>Stel samen welke onderdelen het voorstel bevat en voor wie.</p>
        </div>
        <button className="btn btn-ghost" onClick={() => setForm({})}><Icon name="plus" size={15} /> Sectie</button>
      </div>

      {loading ? <p className="caption" style={{ margin: 0 }}>Laden…</p>
        : sections.length === 0 ? <p className="caption" style={{ margin: 0 }}>Nog geen secties. Voeg er een toe.</p>
        : (
          <div className="col" style={{ gap: 10 }}>
            {sections.map((s, i) => (
              <div key={s.id} className="row between middle" style={{ gap: 14, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: "var(--r-md)",
                background: s.is_enabled ? "var(--surface)" : "var(--surface-2)", opacity: s.is_enabled ? 1 : 0.7 }}>
                <div className="row gap3 middle" style={{ minWidth: 0 }}>
                  <div className="col" style={{ gap: 2 }}>
                    <button className="btn btn-quiet" style={{ padding: "1px 5px", lineHeight: 1 }} disabled={i === 0 || busy} onClick={() => move(i, -1)} aria-label="Omhoog"><Icon name="chevD" size={13} style={{ transform: "rotate(180deg)" }} /></button>
                    <button className="btn btn-quiet" style={{ padding: "1px 5px", lineHeight: 1 }} disabled={i === sections.length - 1 || busy} onClick={() => move(i, 1)} aria-label="Omlaag"><Icon name="chevD" size={13} /></button>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="row gap2 middle wrap">
                      <span className="serif" style={{ fontSize: 16 }}>{s.title || "(zonder titel)"}</span>
                      <span className="tag">{kindLabel(s.kind)}</span>
                    </div>
                    {s.body && <p className="caption" style={{ margin: "4px 0 0", maxWidth: 520, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.body}</p>}
                  </div>
                </div>
                <div className="row gap2 middle" style={{ flex: "none" }}>
                  <button className="tag" style={{ cursor: "pointer", color: s.audience === "internal" ? "var(--clay)" : "var(--ink-2)" }}
                    onClick={() => toggleAudience(s)} title="Wissel doelgroep">
                    <Icon name={s.audience === "internal" ? "lock" : "user"} size={12} /> {s.audience === "internal" ? "Intern" : "Klant"}
                  </button>
                  <button className="tag" style={{ cursor: "pointer", color: s.is_enabled ? "var(--sage, #5f7a55)" : "var(--muted)" }}
                    onClick={() => toggleEnabled(s)} title="In-/uitschakelen">
                    <Icon name={s.is_enabled ? "eye" : "close"} size={12} /> {s.is_enabled ? "Aan" : "Uit"}
                  </button>
                  <button className="btn btn-quiet" onClick={() => setForm(s)} aria-label="Bewerk"><Icon name="edit" size={14} /></button>
                  <button className="btn btn-quiet" onClick={() => remove(s.id)} aria-label="Verwijder"><Icon name="trash" size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

      {form && <SectionForm proposalId={proposalId} section={form.id ? form : null} onClose={() => setForm(null)} onSaved={load} fail={fail} />}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Comments panel
--------------------------------------------------------------------------- */
function CommentsPanel({ proposalId, fail }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try { setComments(await api.get(`/api/proposals/${proposalId}/comments`)); }
    catch (err) { fail(err); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [proposalId]);

  async function add(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    try {
      await api.json(`/api/proposals/${proposalId}/comments`, "POST", { author: author.trim() || "Nova Studio", body: body.trim() });
      setBody("");
      await load();
    } catch (err) { fail(err); }
    finally { setSaving(false); }
  }
  async function remove(cid) {
    try { await api.del(`/api/proposals/comments/${cid}`); await load(); } catch (err) { fail(err); }
  }

  return (
    <div className="card" style={{ padding: "clamp(20px,3vw,32px)", marginBottom: 28 }}>
      <Kicker>Opmerkingen</Kicker>
      <div className="col" style={{ gap: 12, margin: "16px 0" }}>
        {loading ? <p className="caption" style={{ margin: 0 }}>Laden…</p>
          : comments.length === 0 ? <p className="caption" style={{ margin: 0 }}>Nog geen opmerkingen.</p>
          : comments.map((c) => (
            <div key={c.id} className="row between" style={{ gap: 12, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: "var(--r-md)" }}>
              <div style={{ minWidth: 0 }}>
                <div className="row gap2 middle">
                  <span className="serif" style={{ fontSize: 14 }}>{c.author || "—"}</span>
                  {c.created_at && <span className="mono" style={{ color: "var(--muted)" }}>{fmtDate(c.created_at)}</span>}
                </div>
                <p className="body" style={{ fontSize: 14, margin: "4px 0 0" }}>{c.body}</p>
              </div>
              <button className="btn btn-quiet" onClick={() => remove(c.id)} aria-label="Verwijder"><Icon name="trash" size={14} /></button>
            </div>
          ))}
      </div>
      <form className="form-grid" onSubmit={add}>
        <div className="form-grid form-grid-2">
          <Field label="Auteur"><input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Naam" /></Field>
          <div />
        </div>
        <Field label="Opmerking"><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Schrijf een opmerking…" /></Field>
        <div className="row end">
          <button type="submit" className="btn btn-primary" disabled={saving || !body.trim()}>{saving ? "Bezig…" : "Plaatsen"}</button>
        </div>
      </form>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Export history
--------------------------------------------------------------------------- */
function ExportHistory({ proposalId, refreshKey, fail }) {
  const [exports, setExports] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setExports(await api.get(`/api/proposals/${proposalId}/exports`)); }
    catch (err) { fail(err); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [proposalId, refreshKey]);

  if (loading) return null;
  if (!exports.length) return null;
  return (
    <div className="card" style={{ padding: "clamp(20px,3vw,28px)", marginBottom: 28 }}>
      <Kicker>Eerdere exports</Kicker>
      <div className="col" style={{ gap: 8, marginTop: 14 }}>
        {exports.map((x) => (
          <a key={x.url || x.filename} href={x.url} target="_blank" rel="noreferrer" download
            className="row between middle" style={{ gap: 12, padding: "10px 14px", border: "1px solid var(--line)", borderRadius: "var(--r-md)" }}>
            <div className="row gap2 middle" style={{ minWidth: 0 }}>
              <Icon name="doc" size={15} />
              <span className="mono" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.filename}</span>
            </div>
            <div className="row gap3 middle" style={{ flex: "none", color: "var(--muted)" }}>
              {x.size != null && <span className="mono">{fmtSize(x.size)}</span>}
              {x.mtime && <span className="mono">{fmtDate(x.mtime)}</span>}
              <Icon name="download" size={15} />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Version + status + management header (no-print)
--------------------------------------------------------------------------- */
function ManageBar({ ctx, proposal, onSelectVersion }) {
  const { reload, fail } = ctx;
  const [busy, setBusy] = useState(false);
  const [showSections, setShowSections] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [exportBusy, setExportBusy] = useState("");
  const [exportKey, setExportKey] = useState(0);

  async function setStatus(status) {
    if (status === proposal.status) return;
    setBusy(true);
    try { await api.json(`/api/proposals/${proposal.id}/status`, "PUT", { status }); await reload(); }
    catch (err) { fail(err); }
    finally { setBusy(false); }
  }
  async function newVersion() {
    setBusy(true);
    try {
      const created = await api.json(`/api/proposals/${proposal.id}/new-version`, "POST", {});
      await reload();
      if (created && created.id) onSelectVersion(created.id);
    } catch (err) { fail(err); }
    finally { setBusy(false); }
  }
  async function exportPdf(audience) {
    setExportBusy(audience);
    try {
      const result = await api.json(`/api/proposals/${proposal.id}/export-pdf?audience=${audience}`, "POST", {});
      if (result && result.url) window.open(result.url, "_blank");
      setExportKey((k) => k + 1);
    } catch (err) { fail(err); }
    finally { setExportBusy(""); }
  }
  async function exportHandover() {
    setExportBusy("handover");
    try {
      const result = await api.json(`/api/proposals/${proposal.project_id}/handover-pdf`, "POST", {});
      if (result && result.url) window.open(result.url, "_blank");
      setExportKey((k) => k + 1);
    } catch (err) { fail(err); }
    finally { setExportBusy(""); }
  }

  return (
    <div className="no-print" style={{ marginBottom: 24 }}>
      <div className="card" style={{ padding: "clamp(18px,2.6vw,26px)" }}>
        <div className="row between middle wrap" style={{ gap: 16 }}>
          <div className="row gap3 middle wrap">
            <span className="serif" style={{ fontSize: 22 }}>Versie {proposal.version ?? 1}</span>
            <StatusBadge status={proposal.status} />
            {proposal.accepted_at && <span className="caption" style={{ margin: 0 }}>Geaccepteerd op {fmtDate(proposal.accepted_at)}</span>}
          </div>
          <div className="row gap2 middle wrap">
            <label className="row gap2 middle" style={{ gap: 8 }}>
              <span className="eyebrow" style={{ color: "var(--muted)" }}>Status</span>
              <select value={proposal.status || "concept"} disabled={busy} onChange={(e) => setStatus(e.target.value)} style={{ minWidth: 150 }}>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <button className="btn btn-ghost" onClick={newVersion} disabled={busy}><Icon name="plus" size={15} /> Nieuwe versie</button>
          </div>
        </div>

        {proposal.summary && <p className="body" style={{ fontSize: 14, margin: "14px 0 0", maxWidth: 720 }}>{proposal.summary}</p>}

        <div className="row gap2 wrap" style={{ marginTop: 18 }}>
          <button className={`btn ${showSections ? "btn-clay" : "btn-ghost"}`} onClick={() => setShowSections((v) => !v)}><Icon name="layers" size={15} /> Secties</button>
          <button className={`btn ${showComments ? "btn-clay" : "btn-ghost"}`} onClick={() => setShowComments((v) => !v)}><Icon name="doc" size={15} /> Opmerkingen</button>
          <span style={{ flex: 1 }} />
          <button className="btn btn-ghost" onClick={() => exportPdf("client")} disabled={!!exportBusy}><Icon name="download" size={15} /> {exportBusy === "client" ? "Bezig…" : "Klantversie (PDF)"}</button>
          <button className="btn btn-ghost" onClick={() => exportPdf("internal")} disabled={!!exportBusy}><Icon name="download" size={15} /> {exportBusy === "internal" ? "Bezig…" : "Interne versie (PDF)"}</button>
          <button className="btn btn-ghost" onClick={exportHandover} disabled={!!exportBusy}><Icon name="download" size={15} /> {exportBusy === "handover" ? "Bezig…" : "Projectoverdracht exporteren"}</button>
        </div>
      </div>

      {showSections && <div style={{ marginTop: 16 }}><SectionsPanel proposalId={proposal.id} fail={fail} /></div>}
      {showComments && <div style={{ marginTop: 16 }}><CommentsPanel proposalId={proposal.id} fail={fail} /></div>}
      <div style={{ marginTop: 16 }}><ExportHistory proposalId={proposal.id} refreshKey={exportKey} fail={fail} /></div>
    </div>
  );
}

export function Proposal({ ctx }) {
  const { project: p, shopping, proposals, go, fail } = ctx;
  const [selectedId, setSelectedId] = useState(null);
  // Resolve the active proposal: explicit selection wins, else newest (index 0).
  const proposal = useMemo(() => {
    if (selectedId != null) return proposals.find((x) => x.id === selectedId) || proposals[0] || null;
    return proposals[0] || null;
  }, [proposals, selectedId]);
  // Drop a stale selection if the proposal list no longer contains it.
  useEffect(() => {
    if (selectedId != null && !proposals.some((x) => x.id === selectedId)) setSelectedId(null);
  }, [proposals, selectedId]);

  const items = shopping.items;
  const feats = items.filter((x) => x.is_feature);
  const featured = feats.length ? feats : items.slice(0, 3);
  const { total } = computeBudget(items, p.budget_lines);
  const palette = p.palette || [];
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function exportPdf() {
    setExporting(true);
    try {
      let prop = proposal;
      if (!prop) prop = await api.json("/api/proposals", "POST", { project_id: p.id, title: `Ontwerpvoorstel — ${p.title}`, intro_text: p.vision, style_direction: p.summary });
      const result = await api.json(`/api/proposals/${prop.id}/export-pdf`, "POST", {});
      window.open(result.url, "_blank");
    } catch (err) { fail(err); } finally { setExporting(false); }
  }

  const introText = proposal?.intro_text || p.vision;
  const summaryText = proposal?.style_direction || p.summary;
  const closingText = proposal?.closing_text || "Na akkoord stellen we de definitieve materiaalstaten en planning op, en begeleiden we het traject tot oplevering.";

  return (
    <div className="content rise" style={{ maxWidth: 1000 }}>
      <div className="row between middle wrap no-print" style={{ marginBottom: 24, gap: 12 }}>
        <Kicker>Voorstel — bladerbaar document</Kicker>
        <div className="row gap2 wrap">
          {proposals.length > 1 && (
            <label className="row gap2 middle" style={{ gap: 8 }}>
              <span className="eyebrow" style={{ color: "var(--muted)" }}>Versie</span>
              <select value={proposal?.id ?? ""} onChange={(e) => setSelectedId(Number(e.target.value))} style={{ minWidth: 130 }}>
                {proposals.map((pr) => <option key={pr.id} value={pr.id}>Versie {pr.version ?? "?"}{pr.status ? ` · ${statusMeta(pr.status).label}` : ""}</option>)}
              </select>
            </label>
          )}
          <button className="btn btn-ghost" onClick={() => setEditing(true)}><Icon name="edit" size={15} /> Bewerk</button>
          <button className="btn btn-ghost" onClick={() => window.print()}><Icon name="proposal" size={15} /> Print</button>
          <button className="btn btn-ghost" onClick={exportPdf} disabled={exporting}><Icon name="proposal" size={15} /> {exporting ? "Bezig…" : "Genereer PDF"}</button>
          <button className="btn btn-primary" onClick={() => go("present")}><Icon name="present" size={15} /> Presenteer</button>
        </div>
      </div>

      {proposal && <ManageBar ctx={ctx} proposal={proposal} onSelectVersion={setSelectedId} />}

      {/* Cover */}
      <DocPage dark>
        <Ph dark label="hero — woonkamer" src={p.hero_image_path} icon="mood" style={{ position: "absolute", inset: 0, border: 0 }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(20,16,12,.2), rgba(20,16,12,.78))" }} />
        <div style={{ position: "relative", minHeight: 480, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div className="row between"><span className="serif" style={{ fontSize: 22, fontWeight: 600 }}>Nova Studio</span><span className="eyebrow" style={{ color: "var(--muted-2)" }}>Ontwerpvoorstel</span></div>
          <div>
            {(p.location || p.address) && <div className="kicker" style={{ color: "var(--clay-soft)", marginBottom: 18 }}>{p.location || p.address}</div>}
            <h1 className="display" style={{ fontSize: "clamp(36px,6vw,72px)", color: "#fff", maxWidth: 760 }}>{p.title}</h1>
            <div className="row gap6" style={{ marginTop: 28 }}>
              {p.client_name && <span style={{ fontSize: 15 }}>{p.client_name}</span>}
              {p.client_name && p.delivery && <span style={{ opacity: 0.5 }}>·</span>}
              {p.delivery && <span style={{ fontSize: 15 }}>{p.delivery}</span>}
            </div>
          </div>
        </div>
      </DocPage>

      {/* Intro */}
      {(introText || summaryText) && (
        <DocPage label="Introductie" n={2}>
          {introText && <p className="display" style={{ fontSize: "clamp(24px,3.2vw,40px)", lineHeight: 1.22, fontWeight: 500, maxWidth: 760 }}>{introText}</p>}
          {summaryText && <p className="body" style={{ fontSize: 16, marginTop: 30, maxWidth: 620 }}>{summaryText}</p>}
        </DocPage>
      )}

      {/* Samenvatting */}
      {((p.principles || []).length > 0 || (p.goals || []).length > 0) && (
        <DocPage label="Project & uitgangspunten" n={3}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56 }}>
            <div>
              <h2 className="display" style={{ fontSize: 32, marginTop: 0 }}>De opdracht</h2>
              {(p.principles || []).map((pr) => (<div className="spec-row" key={pr.k}><span className="k">{pr.k}</span><span className="v">{pr.v}</span></div>))}
            </div>
            <div>
              <h2 className="display" style={{ fontSize: 32, marginTop: 0 }}>Uitgangspunten</h2>
              <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {(p.goals || []).map((g, i) => (<li key={i} style={{ display: "flex", gap: 16, padding: "13px 0", borderBottom: "1px solid var(--line)" }}>
                  <span className="serif" style={{ color: "var(--clay)", fontSize: 20, width: 28 }}>{String(i + 1).padStart(2, "0")}</span>
                  <span className="body" style={{ fontSize: 14 }}>{g}</span></li>))}
              </ol>
            </div>
          </div>
        </DocPage>
      )}

      {/* Kleur */}
      {palette.length > 0 && (
        <DocPage label="Kleurconcept" n={4}>
          <h2 className="display" style={{ fontSize: 36, marginTop: 0, marginBottom: 8 }}>Het palet</h2>
          <p className="body" style={{ maxWidth: 560, marginBottom: 32 }}>{proposal?.color_advice || "Tinten uit steen, aarde en linnen — over alle verdiepingen herhaald."}</p>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(6, palette.length)},1fr)`, gap: 14 }}>
            {palette.map((c) => (<div key={c.name}>
              <div style={{ aspectRatio: "2/3", borderRadius: "var(--r-md)", background: c.hex, border: "1px solid rgba(0,0,0,.06)" }} />
              <div className="serif" style={{ fontSize: 15, marginTop: 10 }}>{c.name}</div>
              <div className="mono" style={{ color: "var(--muted)" }}>{(c.hex || "").toUpperCase()}</div>
            </div>))}
          </div>
        </DocPage>
      )}

      {/* Featured selectie */}
      {featured.length > 0 && (
        <DocPage label="De selectie — uitgelicht" n={5}>
          <h2 className="display" style={{ fontSize: 36, marginTop: 0, marginBottom: 28 }}>Sleutelstukken</h2>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(3, featured.length)},1fr)`, gap: 24 }}>
            {featured.map((pr) => (<div key={pr.id}>
              <Ph label={`${pr.name} — productfoto`} src={pr.image_path} icon="cart" style={{ aspectRatio: "4/5", borderRadius: "var(--r-md)" }} />
              <div className="serif" style={{ fontSize: 18, marginTop: 12 }}>{pr.name}</div>
              <div className="caption" style={{ marginTop: 3 }}>{[pr.brand, money((pr.price || 0) * (pr.quantity || 1))].filter(Boolean).join(" · ")}</div>
            </div>))}
          </div>
          <div className="row middle gap3 no-print" style={{ marginTop: 30, cursor: "pointer", color: "var(--clay)", fontWeight: 600, fontSize: 13 }} onClick={() => go("shopping")}>
            Bekijk de volledige shoppinglijst <Icon name="arrowR" size={15} />
          </div>
        </DocPage>
      )}

      {/* Budget */}
      {items.length > 0 && (
        <DocPage label="Investering" n={6}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 56, alignItems: "center" }}>
            <div>
              <h2 className="display" style={{ fontSize: 36, marginTop: 0 }}>Budgetoverzicht</h2>
              <p className="body" style={{ maxWidth: 380 }}>Transparant verdeeld per categorie. Totaalinvestering inclusief ontwerp en begeleiding.</p>
              <div className="serif num" style={{ fontSize: 48, color: "var(--clay)", marginTop: 18 }}>{money(total)}</div>
            </div>
            <BudgetBlock items={items} budgetLines={p.budget_lines} compact />
          </div>
        </DocPage>
      )}

      {/* Afsluiting */}
      <DocPage label="Vervolg" n={7} dark>
        <h2 className="display" style={{ fontSize: "clamp(32px,4.4vw,52px)", marginTop: 0, color: "#fff" }}>Laten we beginnen.</h2>
        <p className="body" style={{ color: "var(--muted-2)", maxWidth: 520, marginTop: 18 }}>{closingText}</p>
        <div className="row gap8" style={{ marginTop: 36 }}>
          <div>
            <div className="eyebrow" style={{ color: "var(--muted-2)", marginBottom: 6 }}>Contact</div>
            <div className="serif" style={{ fontSize: 20, color: "#fff" }}>{p.lead || "Nova Studio"}</div>
            <div className="caption" style={{ color: "var(--muted-2)", marginTop: 4 }}>studio@novastudio.nl</div>
          </div>
        </div>
      </DocPage>

      {editing && <ProposalDrawer ctx={ctx} proposal={proposal} onClose={() => setEditing(false)} />}
    </div>
  );
}
