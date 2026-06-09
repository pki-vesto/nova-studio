import { useState } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { Ph, Kicker, StatusDot } from "../components/primitives.jsx";
import { EditDrawer, Field } from "../components/EditDrawer.jsx";

const FILTERS = [
  { key: "alle", label: "Alle" },
  { key: "lead", label: "Lead" },
  { key: "proposal", label: "Voorstel" },
  { key: "active", label: "In uitvoering" },
  { key: "completed", label: "Opgeleverd" }
];

function NewProjectDrawer({ ctx, onClose }) {
  const { clients, loadProjectList, openProject, fail } = ctx;
  const [form, setForm] = useState({ title: "", client_id: "", clientName: "", address: "", status: "proposal" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const created = await api.json("/api/projects", "POST", form);
      await loadProjectList();
      onClose();
      await openProject(created.id);
    } catch (err) { fail(err); setSaving(false); }
  }

  return (
    <EditDrawer open title="Nieuw project" onClose={onClose} onSave={save} saving={saving} saveLabel="Project aanmaken">
      <div className="form-grid">
        <Field label="Projectnaam"><input value={form.title} onChange={set("title")} placeholder="Herenhuis aan de Keizersgracht" required /></Field>
        <Field label="Klant">
          <select value={form.client_id} onChange={set("client_id")}>
            <option value="">Nieuwe klant…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {!form.client_id && <Field label="Naam nieuwe klant"><input value={form.clientName} onChange={set("clientName")} placeholder="Familie Van der Velde" /></Field>}
        <Field label="Locatie"><input value={form.address} onChange={set("address")} placeholder="Amsterdam — Grachtengordel" /></Field>
        <Field label="Status">
          <select value={form.status} onChange={set("status")}>
            <option value="lead">Lead</option>
            <option value="proposal">Voorstel</option>
            <option value="active">In uitvoering</option>
            <option value="approved">Goedgekeurd</option>
            <option value="completed">Opgeleverd</option>
          </select>
        </Field>
      </div>
    </EditDrawer>
  );
}

export function ProjectsIndex({ ctx }) {
  const { projects, openProject, loadProjectList, fail, query } = ctx;
  const [filter, setFilter] = useState("alle");
  const [creating, setCreating] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const q = (query || "").toLowerCase();
  const list = projects.filter((p) =>
    (filter === "alle" || p.status === filter) &&
    (!q || `${p.title} ${p.client_name || ""} ${p.address || ""} ${p.location || ""}`.toLowerCase().includes(q))
  );

  async function loadSample() {
    setSeeding(true);
    try {
      const created = await api.json("/api/projects/seed-sample", "POST", {});
      await loadProjectList();
      await openProject(created.id);
    } catch (err) { fail(err); setSeeding(false); }
  }

  return (
    <div className="content rise">
      <div className="page-head">
        <div>
          <Kicker style={{ marginBottom: 14 }}>Nova Studio — Atelier</Kicker>
          <h1 className="page-title">Projecten</h1>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => setCreating(true)}><Icon name="plus" size={16} /> Nieuw project</button>
      </div>

      {projects.length === 0 ? (
        <div className="empty">
          <Kicker>Leeg atelier</Kicker>
          <h2 className="serif" style={{ fontSize: 30, margin: "4px 0 0" }}>Nog geen projecten</h2>
          <p className="body" style={{ maxWidth: 460, margin: 0 }}>
            Maak een nieuw project aan, of laad het volledig uitgewerkte voorbeeldproject — een herenhuis-renovatie aan de Keizersgracht — om de editorial omgeving meteen te zien.
          </p>
          <div className="row gap3 middle" style={{ marginTop: 8 }}>
            <button className="btn btn-primary btn-lg" onClick={() => setCreating(true)}><Icon name="plus" size={16} /> Nieuw project</button>
            <button className="btn btn-ghost btn-lg" onClick={loadSample} disabled={seeding}>{seeding ? "Bezig…" : "Laad voorbeeldproject"}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="row between middle wrap" style={{ gap: 16, marginBottom: 40 }}>
            <div className="row gap2 wrap">
              {FILTERS.map((f) => (
                <button key={f.key} className={`btn ${filter === f.key ? "btn-primary" : "btn-ghost"}`}
                  style={{ borderRadius: "var(--r-pill)", padding: "8px 16px" }}
                  onClick={() => setFilter(f.key)}>{f.label}</button>
              ))}
            </div>
            <span className="caption">{list.length} {list.length === 1 ? "project" : "projecten"}</span>
          </div>

          {!projects.some((p) => (p.title || "").includes("Keizersgracht")) && (
            <p className="caption tac" style={{ marginBottom: 32, color: "var(--muted-2)" }}>
              Benieuwd naar de volledig uitgewerkte editorial omgeving?{" "}
              <button className="crumb-link" style={{ border: 0, background: "none", color: "var(--clay)", fontWeight: 600, cursor: "pointer", font: "inherit" }} onClick={loadSample} disabled={seeding}>
                {seeding ? "Bezig…" : "Laad het voorbeeldproject →"}
              </button>
            </p>
          )}

          <div className="grid grid-3">
            {list.map((p, i) => (
              <article key={p.id} className="proj-card" style={{ animationDelay: `${i * 50}ms` }} onClick={() => openProject(p.id)}>
                <Ph label={`${p.title} — hero`} src={p.hero_image_path} icon="mood" />
                <div className="col gap2" style={{ paddingTop: 2 }}>
                  <div className="row between" style={{ alignItems: "baseline" }}>
                    <span className="caption num">{(p.created_at || "").slice(0, 4) || "—"}</span>
                    <StatusDot status={p.status} />
                  </div>
                  <h3>{p.title}</h3>
                  <span className="caption" style={{ color: "var(--ink-2)" }}>{[p.client_name, p.location || p.address].filter(Boolean).join(" · ") || "Geen klant"}</span>
                  <span className="row gap2 middle" style={{ color: "var(--clay)", fontSize: 12, fontWeight: 600, marginTop: 4, letterSpacing: ".02em" }}>
                    Open project <Icon name="arrowR" size={14} />
                  </span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {creating && <NewProjectDrawer ctx={ctx} onClose={() => setCreating(false)} />}
    </div>
  );
}
