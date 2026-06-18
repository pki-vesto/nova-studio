import { useState, useEffect, useCallback } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { EmptyState, InlineError, Ph, Kicker, Tag } from "../components/primitives.jsx";
import { EditDrawer, Field } from "../components/EditDrawer.jsx";
import { fileUrl } from "../lib/format.js";

const KINDS = [
  { value: "concept", label: "Concept" },
  { value: "room_template", label: "Ruimte-template" },
  { value: "product_set", label: "Productset" },
  { value: "material_set", label: "Materiaalset" },
  { value: "proposal_snippet", label: "Voorstel-snippet" }
];
const kindLabel = (k) => KINDS.find((x) => x.value === k)?.label || k || "Item";

function ItemDrawer({ ctx, item, onClose, onSaved }) {
  const editing = !!item;
  const [form, setForm] = useState({
    kind: item?.kind || "concept",
    title: item?.title || "",
    summary: item?.summary || "",
    body: item?.body || "",
    tags: item?.tags || ""
  });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append("image", file);
      if (editing) await api.form(`/api/design-library/${item.id}`, fd, "PUT");
      else await api.form("/api/design-library", fd);
      await onSaved();
      onClose();
    } catch (err) { ctx.fail(err); setSaving(false); }
  }

  return (
    <EditDrawer open title={editing ? "Item bewerken" : "Nieuw item"} onClose={onClose} onSave={save} saving={saving}>
      <div className="form-grid">
        <Field label="Type">
          <select value={form.kind} onChange={set("kind")}>
            {KINDS.map((k) => (<option key={k.value} value={k.value}>{k.label}</option>))}
          </select>
        </Field>
        <Field label="Titel"><input value={form.title} onChange={set("title")} placeholder="Warme Scandinavische woonkamer" /></Field>
        <Field label="Samenvatting"><input value={form.summary} onChange={set("summary")} placeholder="Korte omschrijving van dit item" /></Field>
        <Field label="Inhoud / details"><textarea value={form.body} onChange={set("body")} rows={5} /></Field>
        <Field label="Tags"><input value={form.tags} onChange={set("tags")} placeholder="scandinavisch, eiken, warm" /></Field>
        <Field label="Afbeelding"><input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} /></Field>
      </div>
    </EditDrawer>
  );
}

export function DesignLibraryScreen({ ctx }) {
  const [items, setItems] = useState([]);
  const [kind, setKind] = useState("Alle");
  const [loadError, setLoadError] = useState("");
  const [drawer, setDrawer] = useState(null); // null | {} | item

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const data = await api.get("/api/design-library");
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err?.message || String(err);
      setLoadError(message);
      ctx.fail(err);
    }
  }, [ctx]);

  useEffect(() => { load(); }, [load]);

  const filters = ["Alle", ...KINDS.map((k) => k.value)];
  const list = items.filter((it) => kind === "Alle" || it.kind === kind);

  async function remove(id) {
    try { await api.del(`/api/design-library/${id}`); await load(); }
    catch (err) { ctx.fail(err); }
  }

  return (
    <div className="content content-wide rise">
      <div className="page-head">
        <div><Kicker style={{ marginBottom: 14 }}>Herbruikbare kennis</Kicker><h1 className="page-title">Design Library</h1></div>
        <button className="btn btn-primary btn-lg" onClick={() => setDrawer({})}><Icon name="plus" size={16} /> Item toevoegen</button>
      </div>

      {loadError ? (
        <InlineError
          title="Design Library kon niet worden geladen"
          body={loadError}
          action={<button className="btn btn-ghost" onClick={load}>Opnieuw proberen</button>}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nog geen items"
          body="Leg concepten, ruimte-templates, product- en materiaalsets en voorstel-snippets vast, zodat ze herbruikbaar zijn in elk project."
          action={<button className="btn btn-clay" onClick={() => setDrawer({})}><Icon name="plus" size={15} /> Eerste item</button>}
        />
      ) : (
        <>
          <div className="row between middle wrap" style={{ gap: 16, marginBottom: 36 }}>
            <div className="row gap2 wrap">
              {filters.map((f) => (
                <button key={f} className={`btn ${kind === f ? "btn-primary" : "btn-ghost"}`} style={{ borderRadius: 99, padding: "8px 15px" }} onClick={() => setKind(f)}>
                  {f === "Alle" ? "Alle" : kindLabel(f)}
                </button>
              ))}
            </div>
            <span className="caption">{list.length} items</span>
          </div>
          {list.length === 0 ? (
            <EmptyState
              title="Geen items in deze categorie"
              body="Kies een andere categorie of voeg een nieuw bibliotheekitem van dit type toe."
              action={<button className="btn btn-clay" onClick={() => setDrawer({})}><Icon name="plus" size={15} /> Item toevoegen</button>}
            />
          ) : (
            <div className="grid grid-3">
              {list.map((it) => (
              <article key={it.id} className="card" style={{ overflow: "hidden" }}>
                <Ph label={`${it.title} — afbeelding`} src={it.image_url || it.image_path} icon="layers" style={{ aspectRatio: "1/1" }} />
                <div style={{ padding: "16px 18px 18px" }}>
                  <Tag variant="clay">{kindLabel(it.kind)}</Tag>
                  <h3 className="serif" style={{ fontSize: 21, margin: "10px 0 4px", lineHeight: 1.08 }}>{it.title}</h3>
                  {it.summary ? <div className="caption" style={{ color: "var(--ink-2)" }}>{it.summary}</div> : null}
                  {it.tags ? (
                    <div className="row gap2 wrap" style={{ marginTop: 10 }}>
                      {String(it.tags).split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                        <span key={t} className="tag">{t}</span>
                      ))}
                    </div>
                  ) : null}
                  <div className="row gap2 no-print" style={{ marginTop: 14 }}>
                    <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={() => setDrawer(it)}><Icon name="edit" size={13} /> Bewerk</button>
                    <button className="btn btn-danger" style={{ padding: "6px 10px" }} onClick={() => remove(it.id)}><Icon name="trash" size={13} /></button>
                  </div>
                </div>
              </article>
              ))}
            </div>
          )}
        </>
      )}

      {drawer && <ItemDrawer ctx={ctx} item={drawer.id ? drawer : null} onClose={() => setDrawer(null)} onSaved={load} />}
    </div>
  );
}
