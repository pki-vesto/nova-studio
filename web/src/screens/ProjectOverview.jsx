import { useState } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { Ph, Kicker, PROJECT_STATUS_MODEL, Tag, EditButton, statusLabel } from "../components/primitives.jsx";
import { EditDrawer, Field } from "../components/EditDrawer.jsx";

function MetaDrawer({ ctx, onClose }) {
  const { project, reload, fail } = ctx;
  const [form, setForm] = useState({
    status: project.status || "proposal",
    style: project.style || "",
    location: project.location || project.address || "",
    surface: project.surface || "",
    project_type: project.project_type || "",
    delivery: project.delivery || "",
    lead: project.lead || "",
    vision: project.vision || "",
    summary: project.summary || "",
    goals: (project.goals || []).join("\n"),
    principles: (project.principles || []).map((p) => `${p.k}: ${p.v}`).join("\n")
  });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    try {
      await api.json(`/api/projects/${project.id}`, "PUT", {
        status: form.status, style: form.style, location: form.location, surface: form.surface,
        project_type: form.project_type, delivery: form.delivery, lead: form.lead,
        vision: form.vision, summary: form.summary,
        goals: form.goals.split("\n").map((s) => s.trim()).filter(Boolean),
        principles: form.principles.split("\n").map((line) => {
          const i = line.indexOf(":");
          if (i < 0) return null;
          return { k: line.slice(0, i).trim(), v: line.slice(i + 1).trim() };
        }).filter(Boolean)
      });
      if (file) {
        const fd = new FormData();
        fd.append("image", file);
        await api.form(`/api/projects/${project.id}/hero`, fd);
      }
      await reload();
      onClose();
    } catch (err) { fail(err); setSaving(false); }
  }

  return (
    <EditDrawer open title="Project bewerken" onClose={onClose} onSave={save} saving={saving}>
      <div className="form-grid">
        <div className="form-grid form-grid-2">
          <Field label="Status">
            <select value={form.status} onChange={set("status")}>
              {PROJECT_STATUS_MODEL.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Stijlrichting"><input value={form.style} onChange={set("style")} placeholder="Warm minimalisme" /></Field>
          <Field label="Locatie"><input value={form.location} onChange={set("location")} placeholder="Amsterdam — Grachtengordel" /></Field>
          <Field label="Oppervlakte"><input value={form.surface} onChange={set("surface")} placeholder="240 m²" /></Field>
          <Field label="Type"><input value={form.project_type} onChange={set("project_type")} placeholder="Volledige renovatie" /></Field>
          <Field label="Oplevering"><input value={form.delivery} onChange={set("delivery")} placeholder="Voorjaar 2026" /></Field>
        </div>
        <Field label="Ontwerper / lead"><input value={form.lead} onChange={set("lead")} placeholder="Eline Vermeer" /></Field>
        <Field label="Ontwerpvisie (kort)"><textarea value={form.vision} onChange={set("vision")} rows={4} /></Field>
        <Field label="Samenvatting opdracht"><textarea value={form.summary} onChange={set("summary")} rows={4} /></Field>
        <Field label="Uitgangspunten (één per regel)"><textarea value={form.goals} onChange={set("goals")} rows={5} /></Field>
        <Field label="Kernprincipes (Label: Waarde, één per regel)"><textarea value={form.principles} onChange={set("principles")} rows={4} /></Field>
        <Field label="Hero-afbeelding"><input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} /></Field>
      </div>
    </EditDrawer>
  );
}

export function ProjectOverview({ ctx }) {
  const { project: p, go } = ctx;
  const [editing, setEditing] = useState(false);
  const specs = [
    ["Klant", p.client_name],
    ["Locatie", p.location || p.address],
    ["Oppervlakte", p.surface],
    ["Type", p.project_type],
    ["Oplevering", p.delivery]
  ].filter(([, v]) => v);

  return (
    <div className="content content-wide rise">
      {/* Hero */}
      <div style={{ display: "grid", gridTemplateColumns: "1.05fr .95fr", gap: 56, alignItems: "center", marginBottom: 72 }}>
        <div>
          <div className="row gap2 middle wrap" style={{ marginBottom: 22 }}>
            <Tag variant="clay">{statusLabel(p.status)}</Tag>
            {p.style && <Tag>{p.style}</Tag>}
            <EditButton onClick={() => setEditing(true)} />
          </div>
          <h1 className="display" style={{ fontSize: "clamp(40px,5.2vw,68px)" }}>{p.title}</h1>
          <p className="lede" style={{ marginTop: 24, maxWidth: 520 }}>
            {p.vision || "Voeg een ontwerpvisie toe via Bewerk — de openingszin van het voorstel."}
          </p>
          <div className="row gap3 middle wrap" style={{ marginTop: 32 }}>
            <button className="btn btn-primary btn-lg" onClick={() => go("present")}><Icon name="present" size={16} /> Presenteer voorstel</button>
            <button className="btn btn-ghost btn-lg" onClick={() => go("proposal")}><Icon name="proposal" size={16} /> Open voorstel</button>
          </div>
        </div>
        <Ph label="woonkamer — hero, full bleed" src={p.hero_image_path} icon="mood" style={{ aspectRatio: "4/5", borderRadius: "var(--r-md)" }} />
      </div>

      {/* Specs strip */}
      {specs.length > 0 && (
        <div className="card" style={{ padding: "8px 36px", marginBottom: 64 }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${specs.length},1fr)`, gap: 24 }}>
            {specs.map(([k, v]) => (
              <div key={k} style={{ padding: "22px 0" }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>{k}</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)" }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two-col: visie + doelen */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64 }}>
        <div>
          <Kicker style={{ marginBottom: 16 }}>Ontwerpvisie</Kicker>
          <p className="body" style={{ fontSize: 17 }}>{p.summary || "Nog geen samenvatting — voeg de opdracht en stijlrichting toe via Bewerk."}</p>
          {(p.principles || []).length > 0 && (
            <div style={{ marginTop: 28 }}>
              {p.principles.map((pr) => (
                <div className="spec-row" key={pr.k}><span className="k">{pr.k}</span><span className="v">{pr.v}</span></div>
              ))}
            </div>
          )}
        </div>
        <div>
          <Kicker style={{ marginBottom: 16 }}>Uitgangspunten</Kicker>
          {(p.goals || []).length > 0 ? (
            <ol style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {p.goals.map((g, i) => (
                <li key={i} style={{ display: "flex", gap: 18, padding: "18px 0", borderBottom: "1px solid var(--line)" }}>
                  <span className="serif" style={{ fontSize: 26, color: "var(--clay)", lineHeight: 1, width: 34, flex: "none" }}>{String(i + 1).padStart(2, "0")}</span>
                  <span className="body" style={{ marginTop: 2 }}>{g}</span>
                </li>
              ))}
            </ol>
          ) : <p className="body" style={{ color: "var(--muted)" }}>Voeg uitgangspunten toe via Bewerk.</p>}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-3" style={{ marginTop: 72 }}>
        {[
          ["mood", "Moodboard", "De sfeer van het huis", "moodboard"],
          ["palette", "Kleur & materiaal", "Palet en stalen", "material"],
          ["cart", "Shoppinglijst", "Geselecteerde stukken", "shopping"]
        ].map(([ic, title, sub, target]) => (
          <div key={title} className="card" style={{ padding: 28, cursor: "pointer", display: "flex", flexDirection: "column", gap: 14 }} onClick={() => go(target)}>
            <Icon name={ic} size={22} style={{ color: "var(--clay)" }} />
            <div>
              <h3 className="serif" style={{ fontSize: 22, margin: "0 0 4px" }}>{title}</h3>
              <span className="caption">{sub}</span>
            </div>
            <span className="row gap2 middle" style={{ color: "var(--ink-2)", fontSize: 12.5, fontWeight: 600, marginTop: "auto" }}>
              Bekijk <Icon name="arrowR" size={13} />
            </span>
          </div>
        ))}
      </div>

      {editing && <MetaDrawer ctx={ctx} onClose={() => setEditing(false)} />}
    </div>
  );
}
