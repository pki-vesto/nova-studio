import { useState, useMemo } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { money } from "../lib/format.js";
import { Ph, Kicker, Tag, SectionHead, EditButton } from "../components/primitives.jsx";
import { BudgetBlock } from "../components/BudgetBlock.jsx";
import { EditDrawer, Field } from "../components/EditDrawer.jsx";

// Client approval status — Dutch labels + dot colours, in display order.
const ITEM_STATUS = {
  proposed: { label: "Voorgesteld", color: "var(--clay)" },
  approved: { label: "Akkoord", color: "var(--sage)" },
  rejected: { label: "Afgewezen", color: "#8c3b2c" }
};
const STATUS_ORDER = ["approved", "rejected", "proposed"];

function normStatus(s) {
  return ITEM_STATUS[s] ? s : "proposed";
}

// Effective unit price: a positive sale_price overrides the list price.
function effPrice(p) {
  return p.sale_price > 0 ? p.sale_price : (p.price || 0);
}
function lineTotal(p) {
  return effPrice(p) * (p.quantity || 1);
}

// Small status pill with a coloured dot.
function StatusBadge({ status }) {
  const s = ITEM_STATUS[normStatus(status)];
  return (
    <span className="tag" style={{ color: s.color, borderColor: s.color }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: s.color }} />
      {s.label}
    </span>
  );
}

// Inline control to change a selection's client status. Optimistic-free: calls
// PUT then ctx.reload(). Rendered in every layout mode.
function StatusControl({ p, onSetStatus }) {
  return (
    <div className="row gap2 middle no-print" style={{ flexWrap: "wrap" }}>
      <StatusBadge status={p.item_status} />
      <select
        value={normStatus(p.item_status)}
        onChange={(e) => onSetStatus(p, e.target.value)}
        style={{ fontSize: 12, padding: "5px 8px", borderRadius: "var(--r-pill)", maxWidth: 150 }}
        title="Status wijzigen"
      >
        {STATUS_ORDER.map((k) => <option key={k} value={k}>{ITEM_STATUS[k].label}</option>)}
      </select>
    </div>
  );
}

// Client's note shown as a quoted caption under an item.
function ClientComment({ text }) {
  if (!text) return null;
  return (
    <p className="caption" style={{ margin: "10px 0 0", display: "flex", gap: 8, fontStyle: "italic", color: "var(--ink-2)" }}>
      <span style={{ color: "var(--clay)" }}>“</span>{text}
    </p>
  );
}

function ProductEditorial({ p, index, selected, onToggle, onSetStatus }) {
  const flip = index % 2 === 1;
  const line = lineTotal(p);
  return (
    <article style={{ display: "grid", gridTemplateColumns: flip ? "1fr 1.15fr" : "1.15fr 1fr", gap: 48, alignItems: "center", opacity: selected ? 1 : 0.5, transition: "opacity .25s" }}>
      <div style={{ order: flip ? 2 : 1 }}>
        <Ph label={`${p.name} — productfoto`} src={p.image_path} icon="cart" style={{ aspectRatio: "4/3", borderRadius: "var(--r-md)" }} />
      </div>
      <div style={{ order: flip ? 1 : 2, padding: "0 8px" }}>
        <div className="row between middle" style={{ marginBottom: 14 }}>
          <Kicker>{p.category}{p.quantity > 1 ? ` · ${p.quantity}×` : ""}</Kicker>
          <button className={`btn ${selected ? "btn-ghost" : "btn-clay"}`} style={{ padding: "7px 13px", borderRadius: "var(--r-pill)" }} onClick={() => onToggle(p.id)}>
            {selected ? <span className="row gap2 middle"><Icon name="check" size={13} /> In selectie</span> : <span className="row gap2 middle"><Icon name="plus" size={13} /> Toevoegen</span>}
          </button>
        </div>
        <div className="row gap2 middle wrap" style={{ marginBottom: 10 }}>
          <StatusBadge status={p.item_status} />
          {!!p.is_alternative && <Tag>Alternatief</Tag>}
        </div>
        <h3 className="serif" style={{ fontSize: 34, margin: "0 0 4px", lineHeight: 1.04 }}>{p.name}</h3>
        <div className="caption" style={{ fontSize: 12.5, color: "var(--ink-2)", marginBottom: 18 }}>
          {[p.brand, p.designer].filter(Boolean).join(" · ")}
        </div>
        {p.fit_reason && <p className="body" style={{ margin: "0 0 22px", maxWidth: 440 }}>{p.fit_reason}</p>}
        <div className="row between end" style={{ borderTop: "1px solid var(--line)", paddingTop: 16, maxWidth: 440 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 5 }}>Leverancier</div>
            <div style={{ fontSize: 13, color: "var(--ink)" }}>{p.supplier || "—"}</div>
          </div>
          <div className="tar">
            <div className="eyebrow" style={{ marginBottom: 5 }}>{p.quantity > 1 ? `${p.quantity} × ${money(effPrice(p))}` : "Richtprijs"}</div>
            <div className="serif num" style={{ fontSize: 26, color: "var(--ink)" }}>{money(line)}</div>
          </div>
        </div>
        <ClientComment text={p.client_comment} />
        <div style={{ marginTop: 16, maxWidth: 440 }}>
          <StatusControl p={p} onSetStatus={onSetStatus} />
        </div>
      </div>
    </article>
  );
}

function ProductCard({ p, selected, onToggle, onSetStatus }) {
  const line = lineTotal(p);
  return (
    <article className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column", opacity: selected ? 1 : 0.5, transition: "opacity .25s" }}>
      <div style={{ position: "relative" }}>
        <Ph label={`${p.name} — productfoto`} src={p.image_path} icon="cart" style={{ aspectRatio: "4/3" }} />
        <button className={`btn ${selected ? "btn-primary" : "btn-clay"}`} style={{ position: "absolute", top: 12, right: 12, padding: "7px 10px", borderRadius: 99, boxShadow: "var(--shadow-1)" }} onClick={() => onToggle(p.id)}>
          {selected ? <Icon name="check" size={14} /> : <Icon name="plus" size={14} />}
        </button>
      </div>
      <div style={{ padding: "18px 18px 20px", display: "flex", flexDirection: "column", flex: 1 }}>
        <div className="row gap2 middle wrap" style={{ marginBottom: 9 }}>
          <StatusBadge status={p.item_status} />
          {!!p.is_alternative && <Tag>Alternatief</Tag>}
        </div>
        <Kicker style={{ marginBottom: 9 }}>{p.category}{p.quantity > 1 ? ` · ${p.quantity}×` : ""}</Kicker>
        <h3 className="serif" style={{ fontSize: 22, margin: "0 0 3px", lineHeight: 1.08 }}>{p.name}</h3>
        <div className="caption" style={{ color: "var(--ink-2)", marginBottom: 12 }}>{p.brand}</div>
        {p.fit_reason && <p className="body" style={{ fontSize: 13.5, margin: "0 0 16px", flex: 1 }}>{p.fit_reason}</p>}
        <ClientComment text={p.client_comment} />
        <div className="row between end" style={{ borderTop: "1px solid var(--line)", paddingTop: 13, marginTop: p.fit_reason ? 16 : "auto" }}>
          <span className="caption">{(p.supplier || "").split(",")[0]}</span>
          <span className="serif num" style={{ fontSize: 21 }}>{money(line)}</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <StatusControl p={p} onSetStatus={onSetStatus} />
        </div>
      </div>
    </article>
  );
}

function ProductRow({ p, selected, onToggle, onSetStatus }) {
  const line = lineTotal(p);
  return (
    <div className="row middle" style={{ gap: 22, padding: "18px 4px", borderBottom: "1px solid var(--line)", opacity: selected ? 1 : 0.5 }}>
      <Ph label="" src={p.image_path} icon="cart" style={{ width: 84, height: 64, borderRadius: "var(--r-md)", flex: "none" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row gap3 middle wrap">
          <h4 className="serif" style={{ fontSize: 20, margin: 0 }}>{p.name}</h4>
          <span className="caption">{p.category}{p.quantity > 1 ? ` · ${p.quantity}×` : ""}</span>
          <StatusBadge status={p.item_status} />
          {!!p.is_alternative && <Tag>Alternatief</Tag>}
        </div>
        <div className="caption" style={{ marginTop: 3, color: "var(--ink-2)" }}>{[p.brand, p.supplier].filter(Boolean).join(" · ")}</div>
        <ClientComment text={p.client_comment} />
      </div>
      <div style={{ flex: "none" }}><StatusControl p={p} onSetStatus={onSetStatus} /></div>
      <span className="serif num" style={{ fontSize: 22, flex: "none", width: 120, textAlign: "right" }}>{money(line)}</span>
      <button className={`btn ${selected ? "btn-ghost" : "btn-clay"}`} style={{ padding: "8px 12px", borderRadius: 99, flex: "none" }} onClick={() => onToggle(p.id)}>
        {selected ? <Icon name="check" size={14} /> : <Icon name="plus" size={14} />}
      </button>
    </div>
  );
}

function SelectionDrawer({ ctx, onClose }) {
  const { project, shopping, libraryProducts, reload, fail } = ctx;
  const [add, setAdd] = useState({ product_id: "", room_id: "", quantity: 1 });
  const set = (k) => (e) => setAdd((a) => ({ ...a, [k]: e.target.value }));

  async function addProduct() {
    if (!add.product_id) return;
    try {
      await api.json("/api/products/select", "POST", {
        project_id: project.id, product_id: add.product_id, room_id: add.room_id || null,
        quantity: Number(add.quantity || 1), sort_order: shopping.items.length
      });
      setAdd({ product_id: "", room_id: "", quantity: 1 });
      await reload();
    } catch (err) { fail(err); }
  }
  async function patch(item, changes) {
    try {
      await api.json(`/api/products/selection/${item.id}`, "PUT", {
        room_id: item.room_id, quantity: item.quantity, sort_order: item.sort_order,
        fit_reason: item.fit_reason, is_feature: item.is_feature, ...changes
      });
      await reload();
    } catch (err) { fail(err); }
  }
  async function remove(id) { try { await api.del(`/api/products/selection/${id}`); await reload(); } catch (err) { fail(err); } }

  return (
    <EditDrawer open title="Selectie beheren" onClose={onClose}>
      <div className="card" style={{ padding: 16, marginBottom: 22 }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>Product toevoegen</div>
        <div className="form-grid">
          <Field label="Uit bibliotheek">
            <select value={add.product_id} onChange={set("product_id")}>
              <option value="">Kies een product…</option>
              {libraryProducts.map((p) => <option key={p.id} value={p.id}>{p.name}{p.brand ? ` — ${p.brand}` : ""}</option>)}
            </select>
          </Field>
          <div className="form-grid form-grid-2">
            <Field label="Ruimte">
              <select value={add.room_id} onChange={set("room_id")}>
                <option value="">Algemeen</option>
                {project.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="Aantal"><input type="number" min="1" value={add.quantity} onChange={set("quantity")} /></Field>
          </div>
          <button type="button" className="btn btn-clay" onClick={addProduct} style={{ justifyContent: "center" }}><Icon name="plus" size={15} /> Toevoegen aan selectie</button>
        </div>
        {libraryProducts.length === 0 && <p className="caption" style={{ marginTop: 10 }}>Nog geen producten in de bibliotheek — voeg ze toe onder Productbibliotheek.</p>}
      </div>

      <div className="col gap4">
        {shopping.items.map((item) => (
          <div key={item.id} className="card" style={{ padding: 14 }}>
            <div className="row between middle">
              <strong className="serif" style={{ fontSize: 18 }}>{item.name}</strong>
              <button className="btn btn-danger" style={{ padding: "6px 9px" }} onClick={() => remove(item.id)}><Icon name="trash" size={13} /></button>
            </div>
            <div className="caption" style={{ margin: "3px 0 12px" }}>{[item.brand, money(item.price)].filter(Boolean).join(" · ")}</div>
            <div className="form-grid form-grid-2">
              <Field label="Ruimte">
                <select defaultValue={item.room_id || ""} onChange={(e) => patch(item, { room_id: e.target.value || null })}>
                  <option value="">Algemeen</option>
                  {project.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </Field>
              <Field label="Aantal"><input type="number" min="1" defaultValue={item.quantity} onBlur={(e) => patch(item, { quantity: Number(e.target.value || 1) })} /></Field>
            </div>
            <Field label="Motivatie"><textarea defaultValue={item.fit_reason || ""} rows={2} onBlur={(e) => patch(item, { fit_reason: e.target.value })} /></Field>
            <label className="check-line" style={{ marginTop: 10 }}>
              <input type="checkbox" defaultChecked={!!item.is_feature} onChange={(e) => patch(item, { is_feature: e.target.checked })} /> Sleutelstuk (uitgelicht in voorstel)
            </label>
          </div>
        ))}
        {shopping.items.length === 0 && <p className="caption">Nog geen producten geselecteerd.</p>}
      </div>
    </EditDrawer>
  );
}

export function Shopping({ ctx, layout: forcedLayout }) {
  const { project, shopping } = ctx;
  const items = shopping.items;
  const [layout, setLayout] = useState(forcedLayout || "editorial");
  const [roomFilter, setRoomFilter] = useState("alle");
  const [selected, setSelected] = useState(() => new Set(items.map((p) => p.id)));
  const [editing, setEditing] = useState(false);

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Persist a client status change, then refresh from the server.
  async function setStatus(p, item_status) {
    try {
      await api.json(`/api/products/selection/${p.id}/status`, "PUT", {
        item_status, client_comment: p.client_comment || null
      });
      await ctx.reload();
    } catch (err) { ctx.fail(err); }
  }

  const exportUrl = `/api/products/shopping-list/${project.id}/export.csv`;

  // Counts per status for the summary line (display order: akkoord · afgewezen · voorgesteld).
  const statusCounts = useMemo(() => {
    const c = { approved: 0, rejected: 0, proposed: 0 };
    for (const it of items) c[normStatus(it.item_status)]++;
    return c;
  }, [items]);
  const statusSummary = STATUS_ORDER
    .filter((k) => statusCounts[k] > 0)
    .map((k) => `${statusCounts[k]} ${ITEM_STATUS[k].label.toLowerCase()}`)
    .join(" · ");

  // Group selection by room (project room order; un-roomed → "Algemeen").
  const groups = useMemo(() => {
    const byRoom = new Map();
    for (const it of items) {
      const key = it.room_id || "__none";
      if (!byRoom.has(key)) byRoom.set(key, []);
      byRoom.get(key).push(it);
    }
    const ordered = [];
    for (const r of project.rooms) {
      if (byRoom.has(r.id)) { ordered.push({ id: r.id, name: r.name, floor: r.floor_level, image_path: r.image_path, items: byRoom.get(r.id) }); byRoom.delete(r.id); }
    }
    for (const [key, list] of byRoom) ordered.push({ id: key, name: "Algemeen", floor: "", image_path: "", items: list });
    return ordered;
  }, [items, project.rooms]);

  const shownGroups = groups.filter((g) => roomFilter === "alle" || g.id === roomFilter);
  const selTotal = items.filter((p) => selected.has(p.id)).reduce((s, p) => s + lineTotal(p), 0);
  const selCount = items.filter((p) => selected.has(p.id)).length;

  return (
    <div className="content content-wide rise" style={{ paddingBottom: 0 }}>
      <SectionHead kicker="Shoppinglijst — De selectie"
        title="Stuk voor stuk gekozen"
        sub="Geen lijst, maar een collectie. Elk object is geselecteerd op materiaal, herkomst en hoe het zich verhoudt tot de rest van het huis."
        right={
          <div className="row gap2 middle no-print">
            <a className="btn btn-ghost" href={exportUrl} download style={{ padding: "8px 14px", borderRadius: 99 }}>
              <Icon name="download" size={14} /> Exporteer CSV
            </a>
            <EditButton onClick={() => setEditing(true)} label="Beheer selectie" />
          </div>
        } />

      {items.length === 0 ? (
        <div className="empty">
          <p className="body" style={{ margin: 0 }}>Nog geen producten in de selectie. Voeg ze toe via <b>Beheer selectie</b>.</p>
        </div>
      ) : (
        <>
          {/* Controls */}
          <div className="row between middle wrap" style={{ gap: 16, marginBottom: 18, paddingBottom: 20, borderBottom: "1px solid var(--line)" }}>
            <div className="row gap2 wrap">
              <button className={`btn ${roomFilter === "alle" ? "btn-primary" : "btn-ghost"}`} style={{ borderRadius: 99, padding: "8px 15px" }} onClick={() => setRoomFilter("alle")}>Alle ruimtes</button>
              {groups.map((g) => (
                <button key={g.id} className={`btn ${roomFilter === g.id ? "btn-primary" : "btn-ghost"}`} style={{ borderRadius: 99, padding: "8px 15px" }} onClick={() => setRoomFilter(g.id)}>{g.name}</button>
              ))}
            </div>
            <div className="row gap2 middle">
              <span className="caption" style={{ marginRight: 4 }}>Layout</span>
              {[["editorial", "editorial"], ["grid", "grid"], ["rows", "lijst"]].map(([ic, key]) => (
                <button key={key} className={`btn ${layout === key ? "btn-primary" : "btn-ghost"}`} style={{ padding: "8px 10px" }} onClick={() => setLayout(key)} title={key}>
                  <Icon name={ic} size={16} />
                </button>
              ))}
            </div>
          </div>

          {/* Status summary */}
          {statusSummary && (
            <div className="caption" style={{ marginBottom: 44, color: "var(--ink-2)" }}>{statusSummary}</div>
          )}

          {/* Room sections */}
          {shownGroups.map((room, ri) => (
            <section key={room.id} style={{ marginBottom: 88 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 40, alignItems: "end", marginBottom: 48 }}>
                <div>
                  <span className="serif num" style={{ fontSize: 52, color: "var(--clay)", lineHeight: 1 }}>{String(ri + 1).padStart(2, "0")}</span>
                  <h2 className="display" style={{ fontSize: "clamp(30px,3.4vw,42px)", margin: "14px 0 10px" }}>{room.name}</h2>
                  <div className="eyebrow" style={{ marginBottom: 12 }}>{[room.floor, `${room.items.length} stuks`].filter(Boolean).join(" · ")}</div>
                </div>
                <Ph label={`sfeerbeeld — ${room.name}`} src={room.image_path} icon="mood" style={{ aspectRatio: "16/9", borderRadius: "var(--r-md)" }} />
              </div>

              {layout === "editorial" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 64 }}>
                  {room.items.map((p, i) => <ProductEditorial key={p.id} p={p} index={i} selected={selected.has(p.id)} onToggle={toggle} onSetStatus={setStatus} />)}
                </div>
              )}
              {layout === "grid" && (
                <div className="grid grid-3">
                  {room.items.map((p) => <ProductCard key={p.id} p={p} selected={selected.has(p.id)} onToggle={toggle} onSetStatus={setStatus} />)}
                </div>
              )}
              {layout === "lijst" && (
                <div>{room.items.map((p) => <ProductRow key={p.id} p={p} selected={selected.has(p.id)} onToggle={toggle} onSetStatus={setStatus} />)}</div>
              )}
            </section>
          ))}

          {/* Budget close */}
          <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, padding: "64px 0 96px", borderTop: "1px solid var(--line)" }}>
            <div>
              <Kicker style={{ marginBottom: 14 }}>Investering</Kicker>
              <h2 className="display" style={{ fontSize: "clamp(28px,3.2vw,40px)", margin: 0 }}>Budgetoverzicht</h2>
              <p className="lede" style={{ marginTop: 18, fontSize: 21 }}>Een transparante verdeling per categorie, zodat duidelijk is waar de investering naartoe gaat.</p>
            </div>
            <BudgetBlock items={items} budgetLines={project.budget_lines} />
          </section>

          {/* Sticky selection bar */}
          <div className="no-print" style={{ position: "sticky", bottom: 18, display: "flex", justifyContent: "center", pointerEvents: "none", marginTop: -40, paddingBottom: 18 }}>
            <div className="row gap5 middle" style={{ pointerEvents: "auto", background: "var(--surface-ink)", color: "var(--surface)", padding: "14px 16px 14px 24px", borderRadius: "var(--r-pill)", boxShadow: "var(--shadow-3)" }}>
              <span style={{ fontSize: 13.5 }}><b className="num">{selCount}</b> van {items.length} stuks in selectie</span>
              <span style={{ width: 1, height: 22, background: "rgba(255,255,255,.2)" }} />
              <span className="serif num" style={{ fontSize: 22 }}>{money(selTotal)}</span>
              <button className="btn" style={{ background: "var(--clay)", color: "#fff", borderRadius: 99 }} onClick={() => ctx.go("proposal")}>Naar voorstel</button>
            </div>
          </div>
        </>
      )}

      {editing && <SelectionDrawer ctx={ctx} onClose={() => setEditing(false)} />}
    </div>
  );
}
