import { useEffect, useState } from "react";
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

function NewProjectDrawer({ ctx, template = false, onSaved, onClose }) {
  const { clients, loadProjectList, openProject, fail } = ctx;
  const [form, setForm] = useState({ title: "", client_id: "", clientName: "", address: "", status: "proposal", template_name: "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const created = await api.json("/api/projects", "POST", {
        ...form,
        is_template: template ? 1 : 0,
        template_name: template ? (form.template_name || form.title) : ""
      });
      await loadProjectList();
      await onSaved?.();
      onClose();
      await openProject(created.id);
    } catch (err) { fail(err); setSaving(false); }
  }

  return (
    <EditDrawer open title={template ? "Nieuw projecttemplate" : "Nieuw project"} onClose={onClose} onSave={save} saving={saving} saveLabel={template ? "Template aanmaken" : "Project aanmaken"}>
      <div className="form-grid">
        <Field label={template ? "Templatenaam" : "Projectnaam"}><input value={form.title} onChange={set("title")} placeholder={template ? "Stadsappartement basispakket" : "Herenhuis aan de Keizersgracht"} required /></Field>
        {template && <Field label="Interne naam"><input value={form.template_name} onChange={set("template_name")} placeholder="Basis intake + voorstelstructuur" /></Field>}
        {!template && (
          <>
            <Field label="Klant">
              <select value={form.client_id} onChange={set("client_id")}>
                <option value="">Nieuwe klant…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            {!form.client_id && <Field label="Naam nieuwe klant"><input value={form.clientName} onChange={set("clientName")} placeholder="Familie Van der Velde" /></Field>}
          </>
        )}
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
  const [mode, setMode] = useState("projects");
  const [filter, setFilter] = useState("alle");
  const [creating, setCreating] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [templates, setTemplates] = useState([]);

  async function loadTemplates() {
    try { setTemplates(await api.get("/api/projects?status=&templates=1")); }
    catch (err) { fail(err); }
  }

  useEffect(() => { loadTemplates(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const q = (query || "").toLowerCase();
  const source = mode === "templates" ? templates : projects;
  const list = source.filter((p) =>
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
        <div className="row gap2 wrap">
          <button className="btn btn-ghost btn-lg" onClick={() => setCreatingTemplate(true)}><Icon name="library" size={16} /> Nieuw template</button>
          <button className="btn btn-primary btn-lg" onClick={() => setCreating(true)}><Icon name="plus" size={16} /> Nieuw project</button>
        </div>
      </div>

      <div className="row between middle wrap" style={{ gap: 16, marginBottom: 32 }}>
        <div className="row gap2 wrap">
          <button className={`btn ${mode === "projects" ? "btn-primary" : "btn-ghost"}`} style={{ borderRadius: "var(--r-pill)", padding: "8px 16px" }} onClick={() => setMode("projects")}>Projecten</button>
          <button className={`btn ${mode === "templates" ? "btn-primary" : "btn-ghost"}`} style={{ borderRadius: "var(--r-pill)", padding: "8px 16px" }} onClick={() => setMode("templates")}>Templates</button>
        </div>
        <span className="caption">{templates.length} {templates.length === 1 ? "template" : "templates"}</span>
      </div>

      {source.length === 0 ? (
        <div className="empty">
          <Kicker>{mode === "templates" ? "Templatebeheer" : "Leeg atelier"}</Kicker>
          <h2 className="serif" style={{ fontSize: 30, margin: "4px 0 0" }}>{mode === "templates" ? "Nog geen projecttemplates" : "Nog geen projecten"}</h2>
          <p className="body" style={{ maxWidth: 460, margin: 0 }}>
            {mode === "templates"
              ? "Leg herbruikbare projectstructuren vast voor terugkerende intakes, voorstelopbouw en projecttypen."
              : "Maak een nieuw project aan, of laad het volledig uitgewerkte voorbeeldproject — een herenhuis-renovatie aan de Keizersgracht — om de editorial omgeving meteen te zien."}
          </p>
          <div className="row gap3 middle" style={{ marginTop: 8 }}>
            {mode === "templates" ? (
              <button className="btn btn-primary btn-lg" onClick={() => setCreatingTemplate(true)}><Icon name="plus" size={16} /> Nieuw template</button>
            ) : (
              <>
                <button className="btn btn-primary btn-lg" onClick={() => setCreating(true)}><Icon name="plus" size={16} /> Nieuw project</button>
                <button className="btn btn-ghost btn-lg" onClick={loadSample} disabled={seeding}>{seeding ? "Bezig…" : "Laad voorbeeldproject"}</button>
              </>
            )}
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
            <span className="caption">{list.length} {list.length === 1 ? (mode === "templates" ? "template" : "project") : (mode === "templates" ? "templates" : "projecten")}</span>
          </div>

          {mode === "projects" && !projects.some((p) => (p.title || "").includes("Keizersgracht")) && (
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
                  <span className="caption" style={{ color: "var(--ink-2)" }}>{mode === "templates" ? (p.template_name || "Projecttemplate") : ([p.client_name, p.location || p.address].filter(Boolean).join(" · ") || "Geen klant")}</span>
                  <span className="row gap2 middle" style={{ color: "var(--clay)", fontSize: 12, fontWeight: 600, marginTop: 4, letterSpacing: ".02em" }}>
                    {mode === "templates" ? "Open template" : "Open project"} <Icon name="arrowR" size={14} />
                  </span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {creating && <NewProjectDrawer ctx={ctx} onClose={() => setCreating(false)} />}
      {creatingTemplate && <NewProjectDrawer ctx={ctx} template onSaved={loadTemplates} onClose={() => setCreatingTemplate(false)} />}
    </div>
  );
}
