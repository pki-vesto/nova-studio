import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { money } from "../lib/format.js";
import { Ph, Kicker } from "../components/primitives.jsx";
import { EditDrawer, Field } from "../components/EditDrawer.jsx";

function formatChangedAt(value) {
  if (!value) return "";
  const iso = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" });
}

function PriceHistoryPanel({ productId }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!productId) { setRows([]); return; }
    let cancelled = false;
    api.get(`/api/products/${productId}/price-history`)
      .then((data) => { if (!cancelled) setRows(data || []); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [productId]);

  if (rows === null) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <Kicker style={{ marginBottom: 8 }}>Prijsgeschiedenis</Kicker>
      {rows.length === 0 ? (
        <p className="caption" style={{ margin: 0, color: "var(--ink-2)" }}>
          Nog geen prijswijzigingen vastgelegd.
        </p>
      ) : (
        <table className="table" style={{ width: "100%", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Datum</th>
              <th style={{ textAlign: "right" }}>Inkoop</th>
              <th style={{ textAlign: "right" }}>Verkoop</th>
              <th style={{ textAlign: "right" }}>Prijs</th>
              <th style={{ textAlign: "right" }}>Marge</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{formatChangedAt(row.changed_at)}</td>
                <td style={{ textAlign: "right" }}>{money(row.purchase_price)}</td>
                <td style={{ textAlign: "right" }}>{money(row.sale_price)}</td>
                <td style={{ textAlign: "right" }}>{money(row.price)}</td>
                <td style={{ textAlign: "right" }}>{money(row.margin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ProductDrawer({ ctx, product, categories, onCategoriesChanged, onClose }) {
  const { loadProjectList, fail } = ctx;
  const editing = !!product;
  const [form, setForm] = useState({
    name: product?.name || "", brand: product?.brand || "", designer: product?.designer || "",
    supplier: product?.supplier || "", category: product?.category || "", price: product?.price || "",
    purchase_price: product?.purchase_price || "", sale_price: product?.sale_price || "",
    webshop_url: product?.webshop_url || "", description: product?.description || ""
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
      if (editing) await api.form(`/api/products/${product.id}`, fd, "PUT");
      else await api.form("/api/products", fd);
      await loadProjectList();
      await onCategoriesChanged();
      onClose();
    } catch (err) { fail(err); setSaving(false); }
  }

  return (
    <EditDrawer open title={editing ? "Product bewerken" : "Nieuw product"} onClose={onClose} onSave={save} saving={saving}>
      <div className="form-grid">
        <Field label="Productnaam"><input value={form.name} onChange={set("name")} placeholder="Develius modulaire bank" /></Field>
        <div className="form-grid form-grid-2">
          <Field label="Merk"><input value={form.brand} onChange={set("brand")} placeholder="&Tradition" /></Field>
          <Field label="Ontwerper"><input value={form.designer} onChange={set("designer")} placeholder="Edward van Vliet" /></Field>
          <Field label="Leverancier"><input value={form.supplier} onChange={set("supplier")} placeholder="Studio Lijn, Amsterdam" /></Field>
          <Field label="Categorie">
            <select value={form.category} onChange={set("category")}>
              <option value="">Geen categorie</option>
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="form-grid form-grid-2">
          <Field label="Richtprijs (€)"><input type="number" step="0.01" value={form.price} onChange={set("price")} placeholder="4890" /></Field>
          <Field label="Inkoopprijs (€)"><input type="number" step="0.01" value={form.purchase_price} onChange={set("purchase_price")} placeholder="3200" /></Field>
          <Field label="Verkoopprijs (€)"><input type="number" step="0.01" value={form.sale_price} onChange={set("sale_price")} placeholder="4890" /></Field>
          <Field label="Webshoplink"><input value={form.webshop_url} onChange={set("webshop_url")} placeholder="https://" /></Field>
        </div>
        <Field label="Omschrijving / motivatie"><textarea value={form.description} onChange={set("description")} rows={3} /></Field>
        <Field label="Productfoto"><input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} /></Field>
        {editing && <PriceHistoryPanel productId={product.id} />}
      </div>
    </EditDrawer>
  );
}

function CategoryManager({ categories, reload, fail }) {
  const [name, setName] = useState("");
  const [drafts, setDrafts] = useState({});
  const draftFor = (c) => drafts[c.id] ?? c.name;

  async function createCategory() {
    const clean = name.trim();
    if (!clean) return;
    try {
      await api.json("/api/products/categories", "POST", { name: clean });
      setName("");
      await reload();
    } catch (err) { fail(err); }
  }

  async function renameCategory(c) {
    const next = draftFor(c).trim();
    if (!next || next === c.name) return;
    try {
      await api.json(`/api/products/categories/${c.id}`, "PUT", { name: next });
      await reload();
    } catch (err) { fail(err); }
  }

  async function deleteCategory(c) {
    try {
      await api.del(`/api/products/categories/${c.id}`);
      await reload();
    } catch (err) { fail(err); }
  }

  return (
    <section className="card" style={{ padding: 20, marginBottom: 30 }}>
      <div className="row between middle wrap" style={{ gap: 14, marginBottom: 16 }}>
        <div>
          <Kicker style={{ marginBottom: 6 }}>Categoriebeheer</Kicker>
          <p className="caption" style={{ margin: 0, color: "var(--ink-2)" }}>Beheer het vaste vocabularium voor productfilters en productinvoer.</p>
        </div>
        <div className="row gap2 middle" style={{ flex: "1 1 280px", justifyContent: "flex-end" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nieuwe categorie" style={{ maxWidth: 220 }} />
          <button className="btn btn-primary" onClick={createCategory}><Icon name="plus" size={14} /> Voeg toe</button>
        </div>
      </div>
      {categories.length === 0 ? (
        <p className="caption" style={{ margin: 0, color: "var(--muted)" }}>Nog geen categorieën.</p>
      ) : (
        <div className="grid grid-3" style={{ gap: 12 }}>
          {categories.map((c) => (
            <div key={c.id} style={{ border: "1px solid var(--line)", borderRadius: "var(--r-sm)", padding: 12, background: "var(--paper)" }}>
              <div className="row gap2 middle">
                <input value={draftFor(c)} onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))} />
                <button className="btn btn-ghost" style={{ padding: "6px 9px" }} onClick={() => renameCategory(c)}><Icon name="check" size={13} /></button>
                <button className="btn btn-danger" style={{ padding: "6px 9px" }} onClick={() => deleteCategory(c)}><Icon name="trash" size={13} /></button>
              </div>
              <div className="caption" style={{ marginTop: 8, color: "var(--ink-2)" }}>{c.product_count || 0} producten</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function Library({ ctx }) {
  const { libraryProducts, loadProjectList, fail, query } = ctx;
  const [cat, setCat] = useState("Alle");
  const [drawer, setDrawer] = useState(null); // null | {} | product
  const [categories, setCategories] = useState([]);
  async function loadCategories() {
    try { setCategories(await api.get("/api/products/categories")); }
    catch (err) { fail(err); }
  }
  useEffect(() => { loadCategories(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (cat !== "Alle" && !categories.some((c) => c.name === cat)) setCat("Alle");
  }, [cat, categories]);
  const cats = ["Alle", ...categories.map((c) => c.name)];
  const q = (query || "").toLowerCase();
  const list = libraryProducts.filter((p) =>
    (cat === "Alle" || p.category === cat) &&
    (!q || `${p.name} ${p.brand || ""} ${p.designer || ""}`.toLowerCase().includes(q))
  );

  async function remove(id) { try { await api.del(`/api/products/${id}`); await loadProjectList(); } catch (err) { fail(err); } }

  return (
    <div className="content content-wide rise">
      <div className="page-head">
        <div><Kicker style={{ marginBottom: 14 }}>Nova Studio — Bronnen</Kicker><h1 className="page-title">Productbibliotheek</h1></div>
        <button className="btn btn-primary btn-lg" onClick={() => setDrawer({})}><Icon name="plus" size={16} /> Product toevoegen</button>
      </div>

      <CategoryManager categories={categories} reload={async () => { await loadProjectList(); await loadCategories(); }} fail={fail} />

      {libraryProducts.length === 0 ? (
        <div className="empty"><p className="body" style={{ margin: 0 }}>Nog geen producten. Voeg herbruikbare stukken toe — ze verschijnen hier en zijn te selecteren in elk project.</p>
          <button className="btn btn-clay" onClick={() => setDrawer({})}><Icon name="plus" size={15} /> Eerste product</button>
        </div>
      ) : (
        <>
          <div className="row between middle wrap" style={{ gap: 16, marginBottom: 36 }}>
            <div className="row gap2 wrap">
              {cats.map((c) => (<button key={c} className={`btn ${cat === c ? "btn-primary" : "btn-ghost"}`} style={{ borderRadius: 99, padding: "8px 15px" }} onClick={() => setCat(c)}>{c}</button>))}
            </div>
            <span className="caption">{list.length} producten</span>
          </div>
          <div className="grid grid-3">
            {list.map((p) => (
              <article key={p.id} className="card" style={{ overflow: "hidden" }}>
                <Ph label={`${p.name} — productfoto`} src={p.image_path} icon="cart" style={{ aspectRatio: "1/1" }} />
                <div style={{ padding: "16px 18px 18px" }}>
                  <div className="row between" style={{ alignItems: "baseline" }}>
                    <Kicker>{p.category || "Product"}</Kicker>
                    {p.price ? <span className="serif num" style={{ fontSize: 18 }}>{money(p.price)}</span> : null}
                  </div>
                  <h3 className="serif" style={{ fontSize: 21, margin: "8px 0 2px", lineHeight: 1.08 }}>{p.name}</h3>
                  <div className="caption" style={{ color: "var(--ink-2)" }}>{[p.brand, p.designer].filter(Boolean).join(" · ")}</div>
                  <div className="row gap2 no-print" style={{ marginTop: 14 }}>
                    <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={() => setDrawer(p)}><Icon name="edit" size={13} /> Bewerk</button>
                    <button className="btn btn-danger" style={{ padding: "6px 10px" }} onClick={() => remove(p.id)}><Icon name="trash" size={13} /></button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {drawer && <ProductDrawer ctx={ctx} product={drawer.id ? drawer : null} categories={categories} onCategoriesChanged={loadCategories} onClose={() => setDrawer(null)} />}
    </div>
  );
}
