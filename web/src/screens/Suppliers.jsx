import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { Kicker } from "../components/primitives.jsx";
import { EditDrawer, Field } from "../components/EditDrawer.jsx";

// Filled / outline star row used to render a 0–5 reliability rating.
function Stars({ value = 0 }) {
  const n = Math.max(0, Math.min(5, Math.round(Number(value) || 0)));
  return (
    <span className="row gap2" style={{ gap: 3, color: "var(--clay)" }} title={`${n} van 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ color: i <= n ? "var(--clay)" : "var(--muted)" }}>
          <Icon name="star" size={14} stroke={1.4} />
        </span>
      ))}
    </span>
  );
}

const emptyForm = {
  name: "", category: "", website: "", email: "", phone: "",
  rating: "", conditions: "", reliability_notes: "", notes: ""
};

// Create / edit drawer for the supplier itself.
function SupplierDrawer({ supplier, onClose, onSaved, fail }) {
  const editing = !!supplier;
  const [form, setForm] = useState({
    name: supplier?.name || "", category: supplier?.category || "",
    website: supplier?.website || "", email: supplier?.email || "",
    phone: supplier?.phone || "", rating: supplier?.rating ?? "",
    conditions: supplier?.conditions || "", reliability_notes: supplier?.reliability_notes || "",
    notes: supplier?.notes || ""
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = { ...form, rating: form.rating === "" ? null : Number(form.rating) };
      if (editing) await api.json(`/api/suppliers/${supplier.id}`, "PUT", body);
      else await api.json("/api/suppliers", "POST", body);
      await onSaved();
      onClose();
    } catch (err) { fail(err); setSaving(false); }
  }

  return (
    <EditDrawer open title={editing ? "Leverancier bewerken" : "Nieuwe leverancier"} onClose={onClose} onSave={save} saving={saving}>
      <div className="form-grid">
        <Field label="Naam"><input value={form.name} onChange={set("name")} placeholder="Studio Lijn" /></Field>
        <div className="form-grid form-grid-2">
          <Field label="Categorie"><input value={form.category} onChange={set("category")} placeholder="Meubilair" /></Field>
          <Field label="Beoordeling (0–5)"><input type="number" min="0" max="5" step="1" value={form.rating} onChange={set("rating")} placeholder="4" /></Field>
        </div>
        <div className="form-grid form-grid-2">
          <Field label="Website"><input value={form.website} onChange={set("website")} placeholder="https://" /></Field>
          <Field label="E-mail"><input type="email" value={form.email} onChange={set("email")} placeholder="hallo@studio.nl" /></Field>
        </div>
        <Field label="Telefoon"><input value={form.phone} onChange={set("phone")} placeholder="+31 20 123 4567" /></Field>
        <Field label="Voorwaarden"><textarea value={form.conditions} onChange={set("conditions")} rows={3} placeholder="Levervoorwaarden, kortingsafspraken, minimale afname…" /></Field>
        <Field label="Betrouwbaarheid"><textarea value={form.reliability_notes} onChange={set("reliability_notes")} rows={3} placeholder="Ervaring met nakomen van afspraken, communicatie…" /></Field>
        <Field label="Notities"><textarea value={form.notes} onChange={set("notes")} rows={3} /></Field>
      </div>
    </EditDrawer>
  );
}

// Inline create / edit form for a single contact, rendered inside the detail drawer.
function ContactForm({ supplierId, contact, onClose, onSaved, fail }) {
  const editing = !!contact;
  const [form, setForm] = useState({
    name: contact?.name || "", role: contact?.role || "",
    email: contact?.email || "", phone: contact?.phone || "", notes: contact?.notes || ""
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) await api.json(`/api/suppliers/contacts/${contact.id}`, "PUT", form);
      else await api.json(`/api/suppliers/${supplierId}/contacts`, "POST", form);
      await onSaved();
      onClose();
    } catch (err) { fail(err); setSaving(false); }
  }

  return (
    <div className="card" style={{ padding: 16, marginTop: 12, background: "var(--paper-2, #fff)" }}>
      <div className="form-grid">
        <div className="form-grid form-grid-2">
          <Field label="Naam"><input value={form.name} onChange={set("name")} placeholder="Marit de Vries" autoFocus /></Field>
          <Field label="Rol"><input value={form.role} onChange={set("role")} placeholder="Accountmanager" /></Field>
          <Field label="E-mail"><input type="email" value={form.email} onChange={set("email")} placeholder="marit@studio.nl" /></Field>
          <Field label="Telefoon"><input value={form.phone} onChange={set("phone")} placeholder="+31 6 …" /></Field>
        </div>
        <Field label="Notities"><textarea value={form.notes} onChange={set("notes")} rows={2} /></Field>
      </div>
      <div className="row gap2" style={{ marginTop: 12 }}>
        <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Bezig…" : "Bewaren"}</button>
        <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
      </div>
    </div>
  );
}

// Detail drawer: loads the full supplier (contacts + lead-time history) and
// lets you manage both. Mutations refetch the detail, then bubble up to the list.
function DetailDrawer({ supplierId, onClose, onMutated, fail }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [contactForm, setContactForm] = useState(null); // null | {} | contact
  const [lead, setLead] = useState({ lead_days: "", notes: "" });
  const [savingLead, setSavingLead] = useState(false);

  async function load() {
    try {
      const d = await api.get(`/api/suppliers/${supplierId}`);
      setData(d);
    } catch (err) { fail(err); } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [supplierId]);

  // Refetch the detail and notify the parent list of the change.
  async function refresh() { await load(); await onMutated(); }

  async function removeContact(cid) {
    try { await api.del(`/api/suppliers/contacts/${cid}`); await refresh(); } catch (err) { fail(err); }
  }

  async function recordLead() {
    if (lead.lead_days === "") return;
    setSavingLead(true);
    try {
      await api.json(`/api/suppliers/${supplierId}/lead-times`, "POST", {
        lead_days: Number(lead.lead_days), notes: lead.notes
      });
      setLead({ lead_days: "", notes: "" });
      await refresh();
    } catch (err) { fail(err); } finally { setSavingLead(false); }
  }

  const contacts = data?.contacts || [];
  const leadTimes = data?.lead_times || [];

  return (
    <EditDrawer open title={data?.name || "Leverancier"} onClose={onClose}>
      {loading ? (
        <p className="caption">Bezig met laden…</p>
      ) : !data ? (
        <p className="caption">Kon deze leverancier niet laden.</p>
      ) : (
        <div className="col" style={{ gap: 28 }}>
          {/* Summary */}
          <div>
            <Kicker>{data.category || "Leverancier"}</Kicker>
            <div className="row middle gap2" style={{ marginTop: 8 }}>
              <Stars value={data.rating} />
              {data.rating != null && data.rating !== "" && <span className="caption">{data.rating} / 5</span>}
            </div>
            <div className="col gap2" style={{ marginTop: 12 }}>
              {data.website && (
                <a className="row middle gap2 caption" href={data.website} target="_blank" rel="noreferrer">
                  <Icon name="link" size={14} /> {data.website}
                </a>
              )}
              {data.email && <span className="row middle gap2 caption"><Icon name="user" size={14} /> {data.email}</span>}
              {data.phone && <span className="caption mono">{data.phone}</span>}
            </div>
            {data.conditions && <p className="body" style={{ marginTop: 12, marginBottom: 0 }}><span className="caption">Voorwaarden:</span> {data.conditions}</p>}
            {data.reliability_notes && <p className="body" style={{ marginTop: 8, marginBottom: 0 }}><span className="caption">Betrouwbaarheid:</span> {data.reliability_notes}</p>}
            {data.notes && <p className="body" style={{ marginTop: 8, marginBottom: 0 }}>{data.notes}</p>}
          </div>

          <hr className="hr" />

          {/* Contacts */}
          <div>
            <div className="row between middle">
              <h4 className="serif" style={{ fontSize: 18, margin: 0 }}>Contactpersonen</h4>
              <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={() => setContactForm({})}>
                <Icon name="plus" size={13} /> Toevoegen
              </button>
            </div>
            {contacts.length === 0 && !contactForm && (
              <p className="caption" style={{ marginTop: 10 }}>Nog geen contactpersonen vastgelegd.</p>
            )}
            <div className="col gap2" style={{ marginTop: 12 }}>
              {contacts.map((c) => (
                <div key={c.id} className="card" style={{ padding: "12px 14px" }}>
                  <div className="row between middle">
                    <div>
                      <div className="serif" style={{ fontSize: 16 }}>{c.name}</div>
                      {c.role && <div className="caption" style={{ color: "var(--ink-2)" }}>{c.role}</div>}
                      <div className="col" style={{ marginTop: 4 }}>
                        {c.email && <span className="caption">{c.email}</span>}
                        {c.phone && <span className="caption mono">{c.phone}</span>}
                        {c.notes && <span className="caption">{c.notes}</span>}
                      </div>
                    </div>
                    <div className="row gap2 no-print">
                      <button className="btn btn-ghost" style={{ padding: "5px 9px" }} onClick={() => setContactForm(c)}><Icon name="edit" size={12} /></button>
                      <button className="btn btn-danger" style={{ padding: "5px 9px" }} onClick={() => removeContact(c.id)}><Icon name="trash" size={12} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {contactForm && (
              <ContactForm
                supplierId={supplierId}
                contact={contactForm.id ? contactForm : null}
                onClose={() => setContactForm(null)}
                onSaved={refresh}
                fail={fail}
              />
            )}
          </div>

          <hr className="hr" />

          {/* Lead times */}
          <div>
            <h4 className="serif" style={{ fontSize: 18, margin: "0 0 12px" }}>Levertijden</h4>
            <div className="card" style={{ padding: 16, marginBottom: 14 }}>
              <div className="form-grid form-grid-2">
                <Field label="Levertijd (dagen)">
                  <input type="number" min="0" step="1" value={lead.lead_days}
                         onChange={(e) => setLead((l) => ({ ...l, lead_days: e.target.value }))} placeholder="14" />
                </Field>
                <Field label="Notitie">
                  <input value={lead.notes}
                         onChange={(e) => setLead((l) => ({ ...l, notes: e.target.value }))} placeholder="Maatwerkbank, voorraad…" />
                </Field>
              </div>
              <button className="btn btn-clay" style={{ marginTop: 12 }} onClick={recordLead} disabled={savingLead || lead.lead_days === ""}>
                <Icon name="plus" size={13} /> {savingLead ? "Bezig…" : "Levertijd vastleggen"}
              </button>
            </div>
            {leadTimes.length === 0 ? (
              <p className="caption">Nog geen levertijden geregistreerd.</p>
            ) : (
              <div className="col gap2">
                {leadTimes.map((lt) => (
                  <div key={lt.id} className="row between middle" style={{ padding: "8px 0", borderBottom: "1px solid var(--line, #eee)" }}>
                    <span className="row middle gap2">
                      <Icon name="history" size={14} />
                      <span className="serif num">~{lt.lead_days} dgn</span>
                      {lt.notes && <span className="caption" style={{ color: "var(--ink-2)" }}>{lt.notes}</span>}
                    </span>
                    {lt.recorded_at && <span className="caption mono">{String(lt.recorded_at).slice(0, 10)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </EditDrawer>
  );
}

export function Suppliers({ ctx }) {
  const { fail } = ctx;
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editDrawer, setEditDrawer] = useState(null);   // null | {} | supplier
  const [detailId, setDetailId] = useState(null);

  async function load() {
    try {
      const data = await api.get("/api/suppliers");
      setList(Array.isArray(data) ? data : []);
    } catch (err) { fail(err); } finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function remove(id) {
    try { await api.del(`/api/suppliers/${id}`); await load(); } catch (err) { fail(err); }
  }

  return (
    <div className="content content-wide rise">
      <div className="page-head">
        <div>
          <Kicker style={{ marginBottom: 14 }}>Nova Studio — Bronnen</Kicker>
          <h1 className="page-title">Leveranciers</h1>
        </div>
        <button className="btn btn-primary btn-lg" onClick={() => setEditDrawer({})}>
          <Icon name="plus" size={16} /> Leverancier toevoegen
        </button>
      </div>

      {loading ? (
        <p className="caption">Bezig met laden…</p>
      ) : list.length === 0 ? (
        <div className="empty">
          <p className="body" style={{ margin: 0 }}>
            Nog geen leveranciers. Leg je vaste bronnen vast — met contactpersonen, voorwaarden en levertijden, zodat je per project snel de juiste partij vindt.
          </p>
          <button className="btn btn-clay" onClick={() => setEditDrawer({})}><Icon name="plus" size={15} /> Eerste leverancier</button>
        </div>
      ) : (
        <>
          <div className="row between middle wrap" style={{ marginBottom: 36 }}>
            <span className="caption">{list.length} leveranciers</span>
          </div>
          <div className="grid grid-3">
            {list.map((s) => (
              <article key={s.id} className="card" style={{ padding: "18px 20px 20px" }}>
                <div className="row between" style={{ alignItems: "baseline" }}>
                  <Kicker>{s.category || "Leverancier"}</Kicker>
                  <Stars value={s.rating} />
                </div>
                <h3 className="serif" style={{ fontSize: 22, margin: "8px 0 4px", lineHeight: 1.08 }}>{s.name}</h3>

                <div className="col gap2" style={{ marginTop: 6 }}>
                  {s.website && (
                    <a className="row middle gap2 caption" href={s.website} target="_blank" rel="noreferrer">
                      <Icon name="link" size={13} /> Website
                    </a>
                  )}
                  <div className="row gap3 wrap caption" style={{ color: "var(--ink-2)" }}>
                    <span className="row middle gap2"><Icon name="user" size={13} /> {s.contact_count || 0} contacten</span>
                    {s.latest_lead_days != null && (
                      <span className="row middle gap2"><Icon name="history" size={13} /> levertijd ~{s.latest_lead_days} dgn</span>
                    )}
                  </div>
                </div>

                <div className="row gap2 no-print" style={{ marginTop: 16 }}>
                  <button className="btn btn-ghost" style={{ padding: "6px 11px" }} onClick={() => setEditDrawer(s)}>
                    <Icon name="edit" size={13} /> Bewerk
                  </button>
                  <button className="btn btn-clay" style={{ padding: "6px 11px" }} onClick={() => setDetailId(s.id)}>
                    <Icon name="search" size={13} /> Details
                  </button>
                  <button className="btn btn-danger" style={{ padding: "6px 10px", marginLeft: "auto" }} onClick={() => remove(s.id)}>
                    <Icon name="trash" size={13} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {editDrawer && (
        <SupplierDrawer
          supplier={editDrawer.id ? editDrawer : null}
          onClose={() => setEditDrawer(null)}
          onSaved={load}
          fail={fail}
        />
      )}
      {detailId != null && (
        <DetailDrawer
          supplierId={detailId}
          onClose={() => setDetailId(null)}
          onMutated={load}
          fail={fail}
        />
      )}
    </div>
  );
}
