import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { EmptyState, InlineError, Ph, Kicker } from "../components/primitives.jsx";
import { EditDrawer, Field } from "../components/EditDrawer.jsx";

function MaterialDrawer({ ctx, material, onReload, onClose }) {
  const { fail } = ctx;
  const editing = !!material;
  const [form, setForm] = useState({
    name: material?.name || "", category: material?.category || "", brand: material?.brand || "",
    code: material?.code || "", spec: material?.spec || "", maintenance: material?.maintenance || "",
    sustainability_score: material?.sustainability_score ?? "", notes: material?.notes || ""
  });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append("image", file);
      if (editing) await api.form(`/api/material-library/${material.id}`, fd, "PUT");
      else await api.form("/api/material-library", fd);
      await onReload();
      onClose();
    } catch (err) { fail(err); setSaving(false); }
  }

  return (
    <EditDrawer open title={editing ? "Materiaal bewerken" : "Nieuw materiaal"} onClose={onClose} onSave={save} saving={saving}>
      <div className="form-grid">
        <Field label="Materiaalnaam"><input value={form.name} onChange={set("name")} placeholder="Travertijn Navona" /></Field>
        <div className="form-grid form-grid-2">
          <Field label="Categorie"><input value={form.category} onChange={set("category")} placeholder="Natuursteen" /></Field>
          <Field label="Merk"><input value={form.brand} onChange={set("brand")} placeholder="Solid Nature" /></Field>
          <Field label="Code / artikelnummer"><input value={form.code} onChange={set("code")} placeholder="TRV-NAV-20" /></Field>
          <Field label="Duurzaamheidsscore (0–5)"><input type="number" min="0" max="5" step="1" value={form.sustainability_score} onChange={set("sustainability_score")} placeholder="4" /></Field>
        </div>
        <Field label="Specificatie"><textarea value={form.spec} onChange={set("spec")} rows={2} placeholder="Gezoet, 20 mm, formaat 600×600" /></Field>
        <Field label="Onderhoud"><textarea value={form.maintenance} onChange={set("maintenance")} rows={2} placeholder="Impregneren, pH-neutraal reinigen" /></Field>
        <Field label="Notities"><textarea value={form.notes} onChange={set("notes")} rows={3} /></Field>
        <Field label="Materiaalfoto"><input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} /></Field>
      </div>
    </EditDrawer>
  );
}

function Stars({ score }) {
  const n = Math.max(0, Math.min(5, Math.round(Number(score) || 0)));
  if (!n) return null;
  return (
    <span className="row gap1" style={{ color: "var(--clay)" }} title={`Duurzaamheid ${n}/5`}>
      {Array.from({ length: n }).map((_, i) => <Icon key={i} name="star" size={14} />)}
    </span>
  );
}

const SAMPLE_GROUP_META = {
  requested: { label: "Aangevraagd", emptyLabel: "Geen openstaande samples" },
  none: { label: "Geen sample", emptyLabel: "Geen materialen zonder sample" },
  received: { label: "Ontvangen", emptyLabel: "Nog geen samples ontvangen" }
};

function sampleDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function SampleGroupCard({ kind, rows, dim, defaultOpen }) {
  const meta = SAMPLE_GROUP_META[kind];
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card" style={{ padding: 24, opacity: dim ? 0.85 : 1 }}>
      <button type="button"
        onClick={() => setOpen((v) => !v)}
        className="row between middle"
        style={{
          width: "100%", padding: 0, background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left", color: "inherit"
        }}>
        <div className="row gap2 middle">
          <Icon name={open ? "chevD" : "chevR"} size={14} />
          <h3 className="serif" style={{ fontSize: 22, margin: 0 }}>{meta.label}</h3>
          <span className="tag">{rows.length}</span>
        </div>
      </button>
      {open && (
        <div style={{ marginTop: 18 }}>
          {rows.length === 0 ? (
            <p className="caption" style={{ margin: 0 }}>{meta.emptyLabel}.</p>
          ) : (
            <div className="col gap3">
              {rows.map((row) => {
                const dateField = kind === "requested" ? row.sample_requested_at
                  : kind === "received" ? row.sample_received_at : "";
                const meta2 = [
                  [row.brand, row.code].filter(Boolean).join(" "),
                  row.supplier_name || "—",
                  sampleDate(dateField)
                ].filter(Boolean).join(" · ");
                return (
                  <a key={row.id}
                    href={`#/project/${row.project_id}/material`}
                    className="row between middle"
                    style={{
                      gap: 14, padding: "10px 0", borderBottom: "1px solid var(--line)",
                      textDecoration: "none", color: "inherit"
                    }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{row.name || "Materiaal"}</div>
                      <Kicker style={{ marginTop: 4 }}>{row.project_title}</Kicker>
                      {meta2 && <div className="caption" style={{ marginTop: 4 }}>{meta2}</div>}
                    </div>
                    <Icon name="chevR" size={14} />
                  </a>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SampleOverviewPanel({ fail }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await api.get("/api/materials/sample-overview");
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err?.message || String(err));
        fail(err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) return <InlineError title="Sample-overzicht kon niet worden geladen" body={error} />;
  if (!data) return <p className="caption">Sample-overzicht laden…</p>;

  const counts = data.counts || { requested: 0, none: 0, received: 0 };
  const total = counts.requested + counts.none + counts.received;
  if (total === 0) {
    return (
      <EmptyState
        title="Nog geen sample-statussen"
        body="Voeg projectmaterialen toe en markeer samples als aangevraagd of ontvangen om hier de cross-project planning te zien."
      />
    );
  }

  return (
    <div className="col gap4">
      <p className="body" style={{ marginTop: 0, marginBottom: 4 }}>
        Openstaande en ontvangen stalen over alle actieve projecten — klik een rij om naar het project te springen.
      </p>
      <SampleGroupCard kind="requested" rows={data.groups.requested || []} defaultOpen />
      <SampleGroupCard kind="none" rows={data.groups.none || []} defaultOpen={false} />
      <SampleGroupCard kind="received" rows={data.groups.received || []} defaultOpen={false} dim />
    </div>
  );
}

export function MaterialLibraryScreen({ ctx }) {
  const { fail } = ctx;
  const [materials, setMaterials] = useState([]);
  const [cat, setCat] = useState("Alle");
  const [loadError, setLoadError] = useState("");
  const [drawer, setDrawer] = useState(null); // null | {} | material
  const [tab, setTab] = useState("library"); // "library" | "samples"

  async function load() {
    setLoadError("");
    try { setMaterials(await api.get("/api/material-library")); }
    catch (err) {
      const message = err?.message || String(err);
      setLoadError(message);
      fail(err);
    }
  }
  useEffect(() => { load(); }, []);

  const cats = ["Alle", ...Array.from(new Set(materials.map((m) => m.category).filter(Boolean)))];
  const list = materials.filter((m) => cat === "Alle" || m.category === cat);

  async function remove(id) { try { await api.del(`/api/material-library/${id}`); await load(); } catch (err) { fail(err); } }

  return (
    <div className="content content-wide rise">
      <div className="page-head">
        <div><Kicker style={{ marginBottom: 14 }}>Globale bron</Kicker><h1 className="page-title">Materiaalbibliotheek</h1></div>
        {tab === "library" && (
          <button className="btn btn-primary btn-lg" onClick={() => setDrawer({})}><Icon name="plus" size={16} /> Materiaal toevoegen</button>
        )}
      </div>

      <div className="row gap2 wrap" style={{ marginBottom: 32 }}>
        <button className={`btn ${tab === "library" ? "btn-primary" : "btn-ghost"}`}
          style={{ borderRadius: 99, padding: "8px 16px" }} onClick={() => setTab("library")}>
          Bibliotheek
        </button>
        <button className={`btn ${tab === "samples" ? "btn-primary" : "btn-ghost"}`}
          style={{ borderRadius: 99, padding: "8px 16px" }} onClick={() => setTab("samples")}>
          Sample-status
        </button>
      </div>

      {tab === "samples" ? (
        <SampleOverviewPanel fail={fail} />
      ) : loadError ? (
        <InlineError
          title="Materiaalbibliotheek kon niet worden geladen"
          body={loadError}
          action={<button className="btn btn-ghost" onClick={load}>Opnieuw proberen</button>}
        />
      ) : materials.length === 0 ? (
        <EmptyState
          title="Nog geen materialen"
          body="Voeg stalen toe aan de globale bibliotheek. Daarna zijn ze beschikbaar om in projecten over te nemen."
          action={<button className="btn btn-clay" onClick={() => setDrawer({})}><Icon name="plus" size={15} /> Eerste materiaal</button>}
        />
      ) : (
        <>
          <div className="row between middle wrap" style={{ gap: 16, marginBottom: 36 }}>
            <div className="row gap2 wrap">
              {cats.map((c) => (<button key={c} className={`btn ${cat === c ? "btn-primary" : "btn-ghost"}`} style={{ borderRadius: 99, padding: "8px 15px" }} onClick={() => setCat(c)}>{c}</button>))}
            </div>
            <span className="caption">{list.length} materialen</span>
          </div>
          {list.length === 0 ? (
            <EmptyState
              title="Geen materialen in deze categorie"
              body="Kies een andere categorie of voeg een materiaal met deze categorie toe."
              action={<button className="btn btn-clay" onClick={() => setDrawer({})}><Icon name="plus" size={15} /> Materiaal toevoegen</button>}
            />
          ) : (
            <div className="grid grid-3">
              {list.map((m) => (
              <article key={m.id} className="card" style={{ overflow: "hidden" }}>
                <Ph label={`${m.name} — staal`} src={m.image_path} icon="palette" style={{ aspectRatio: "1/1" }} />
                <div style={{ padding: "16px 18px 18px" }}>
                  <div className="row between" style={{ alignItems: "baseline" }}>
                    <Kicker>{[m.category, m.brand].filter(Boolean).join(" · ") || "Materiaal"}</Kicker>
                    <Stars score={m.sustainability_score} />
                  </div>
                  <h3 className="serif" style={{ fontSize: 21, margin: "8px 0 2px", lineHeight: 1.08 }}>{m.name}</h3>
                  {m.code ? <div className="mono caption" style={{ color: "var(--ink-2)" }}>{m.code}</div> : null}
                  {m.maintenance ? <div className="caption" style={{ marginTop: 6, color: "var(--ink-2)" }}>{m.maintenance}</div> : null}
                  <div className="row gap2 no-print" style={{ marginTop: 14 }}>
                    <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={() => setDrawer(m)}><Icon name="edit" size={13} /> Bewerk</button>
                    <button className="btn btn-danger" style={{ padding: "6px 10px" }} onClick={() => remove(m.id)}><Icon name="trash" size={13} /></button>
                  </div>
                </div>
              </article>
              ))}
            </div>
          )}
        </>
      )}

      {drawer && <MaterialDrawer ctx={ctx} material={drawer.id ? drawer : null} onReload={load} onClose={() => setDrawer(null)} />}
    </div>
  );
}
