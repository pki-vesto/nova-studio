import { useState } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { EmptyState, Kicker, statusLabel } from "../components/primitives.jsx";
import { EditDrawer, Field } from "../components/EditDrawer.jsx";

function ClientDrawer({ ctx, client, onClose }) {
  const { loadProjectList, fail } = ctx;
  const editing = !!client;
  const [form, setForm] = useState({
    name: client?.name || "", company: client?.company || "", email: client?.email || "",
    phone: client?.phone || "", address: client?.address || "", notes: client?.notes || ""
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) await api.json(`/api/clients/${client.id}`, "PUT", form);
      else await api.json("/api/clients", "POST", form);
      await loadProjectList();
      onClose();
    } catch (err) { fail(err); setSaving(false); }
  }

  return (
    <EditDrawer open title={editing ? "Klant bewerken" : "Nieuwe klant"} onClose={onClose} onSave={save} saving={saving}>
      <div className="form-grid">
        <Field label="Naam"><input value={form.name} onChange={set("name")} placeholder="Familie Van der Velde" /></Field>
        <div className="form-grid form-grid-2">
          <Field label="Bedrijf"><input value={form.company} onChange={set("company")} /></Field>
          <Field label="E-mail"><input value={form.email} onChange={set("email")} /></Field>
          <Field label="Telefoon"><input value={form.phone} onChange={set("phone")} /></Field>
          <Field label="Adres"><input value={form.address} onChange={set("address")} /></Field>
        </div>
        <Field label="Notities & voorkeuren"><textarea value={form.notes} onChange={set("notes")} rows={4} /></Field>
      </div>
    </EditDrawer>
  );
}

function ContactDrawer({ ctx, clientId, contact, onClose, onSaved }) {
  const { fail } = ctx;
  const editing = !!contact;
  const [form, setForm] = useState({
    name: contact?.name || "", role: contact?.role || "", email: contact?.email || "",
    phone: contact?.phone || "", notes: contact?.notes || "", is_primary: !!contact?.is_primary
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) await api.json(`/api/clients/contacts/${contact.id}`, "PUT", form);
      else await api.json(`/api/clients/${clientId}/contacts`, "POST", form);
      await onSaved();
      onClose();
    } catch (err) { fail(err); setSaving(false); }
  }

  return (
    <EditDrawer open title={editing ? "Contactpersoon bewerken" : "Nieuwe contactpersoon"} onClose={onClose} onSave={save} saving={saving}>
      <div className="form-grid">
        <Field label="Naam"><input value={form.name} onChange={set("name")} placeholder="Anne de Vries" /></Field>
        <div className="form-grid form-grid-2">
          <Field label="Rol"><input value={form.role} onChange={set("role")} placeholder="Partner, architect…" /></Field>
          <Field label="E-mail"><input value={form.email} onChange={set("email")} /></Field>
          <Field label="Telefoon"><input value={form.phone} onChange={set("phone")} /></Field>
        </div>
        <Field label="Notities"><textarea value={form.notes} onChange={set("notes")} rows={3} /></Field>
        <label className="row middle gap2" style={{ cursor: "pointer", fontSize: 14 }}>
          <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm((f) => ({ ...f, is_primary: e.target.checked }))} />
          <span>Hoofdcontactpersoon</span>
        </label>
      </div>
    </EditDrawer>
  );
}

function AddressDrawer({ ctx, clientId, onClose, onSaved }) {
  const { fail } = ctx;
  const [form, setForm] = useState({
    label: "", street: "", postal_code: "", city: "", country: "Nederland", notes: ""
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.street.trim() && !form.city.trim()) return;
    setSaving(true);
    try {
      await api.json(`/api/clients/${clientId}/addresses`, "POST", form);
      await onSaved();
      onClose();
    } catch (err) { fail(err); setSaving(false); }
  }

  return (
    <EditDrawer open title="Nieuw adres" onClose={onClose} onSave={save} saving={saving}>
      <div className="form-grid">
        <Field label="Label"><input value={form.label} onChange={set("label")} placeholder="Projectadres, factuuradres…" /></Field>
        <Field label="Straat & huisnummer"><input value={form.street} onChange={set("street")} /></Field>
        <div className="form-grid form-grid-2">
          <Field label="Postcode"><input value={form.postal_code} onChange={set("postal_code")} /></Field>
          <Field label="Plaats"><input value={form.city} onChange={set("city")} /></Field>
        </div>
        <Field label="Land"><input value={form.country} onChange={set("country")} /></Field>
        <Field label="Notities"><textarea value={form.notes} onChange={set("notes")} rows={3} /></Field>
      </div>
    </EditDrawer>
  );
}

export function Clients({ ctx }) {
  const { clients, openProject, fail, query } = ctx;
  const [selected, setSelected] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const [contactDrawer, setContactDrawer] = useState(null);
  const [addressDrawer, setAddressDrawer] = useState(null);

  const q = (query || "").toLowerCase();
  const list = clients.filter((c) => !q || `${c.name} ${c.company || ""}`.toLowerCase().includes(q));

  async function load(id) { try { setSelected(await api.get(`/api/clients/${id}`)); } catch (err) { fail(err); } }
  // The GET /api/clients/:id endpoint hydrates contacts & addresses, so reloading
  // the selected client refreshes both lists after any mutation.
  async function reload() { if (selected) await load(selected.id); }

  async function deleteContact(contactId) {
    if (!confirm("Contactpersoon verwijderen?")) return;
    try { await api.del(`/api/clients/contacts/${contactId}`); await reload(); } catch (err) { fail(err); }
  }
  async function deleteAddress(addressId) {
    if (!confirm("Adres verwijderen?")) return;
    try { await api.del(`/api/clients/addresses/${addressId}`); await reload(); } catch (err) { fail(err); }
  }

  return (
    <div className="content content-wide rise">
      <div className="page-head">
        <div><Kicker style={{ marginBottom: 14 }}>Nova Studio — Relaties</Kicker><h1 className="page-title">Klanten</h1></div>
        <button className="btn btn-primary btn-lg" onClick={() => setDrawer({})}><Icon name="plus" size={16} /> Nieuwe klant</button>
      </div>

      {clients.length === 0 ? (
        <EmptyState
          title="Nog geen klanten"
          body="Voeg een relatie toe of maak een project aan met een nieuwe klant. Contactpersonen, adressen en projectgeschiedenis verschijnen hier."
          action={<button className="btn btn-clay" onClick={() => setDrawer({})}><Icon name="plus" size={15} /> Eerste klant</button>}
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 40, alignItems: "start" }}>
          <div className="col gap2">
            {list.map((c) => (
              <div key={c.id} className={`nav-item ${selected?.id === c.id ? "active" : ""}`} style={{ justifyContent: "space-between" }} onClick={() => load(c.id)}>
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                <span className="caption">{c.project_count || 0} proj.</span>
              </div>
            ))}
            {list.length === 0 && (
              <EmptyState
                title="Geen klanten gevonden"
                body="Geen relatie past bij deze zoekterm. Zoek op klantnaam of bedrijfsnaam om de lijst te verkleinen."
                compact
              />
            )}
          </div>

          {selected ? (
            <div>
              <div className="row between middle" style={{ marginBottom: 18 }}>
                <h2 className="display" style={{ fontSize: 36, margin: 0 }}>{selected.name}</h2>
                <button className="btn btn-ghost" onClick={() => setDrawer(selected)}><Icon name="edit" size={14} /> Bewerk</button>
              </div>
              <div className="card" style={{ padding: 28, marginBottom: 24 }}>
                {selected.company && <div className="spec-row"><span className="k">Bedrijf</span><span className="v">{selected.company}</span></div>}
                {selected.email && <div className="spec-row"><span className="k">E-mail</span><span className="v">{selected.email}</span></div>}
                {selected.phone && <div className="spec-row"><span className="k">Telefoon</span><span className="v">{selected.phone}</span></div>}
                {selected.address && <div className="spec-row"><span className="k">Adres</span><span className="v">{selected.address}</span></div>}
                {selected.notes && <p className="body" style={{ marginTop: 18, marginBottom: 0 }}>{selected.notes}</p>}
              </div>

              <div className="row between middle" style={{ marginBottom: 14 }}>
                <Kicker>Contactpersonen</Kicker>
                <button className="btn btn-ghost" onClick={() => setContactDrawer({})}><Icon name="plus" size={14} /> Toevoegen</button>
              </div>
              {(selected.contacts || []).length ? (
                <div className="col gap2" style={{ marginBottom: 24 }}>
                  {selected.contacts.map((ct) => (
                    <div key={ct.id} className="card" style={{ padding: "14px 18px" }}>
                      <div className="row between middle" style={{ gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <div className="row middle gap2" style={{ flexWrap: "wrap" }}>
                            <strong className="serif" style={{ fontSize: 18 }}>{ct.name}</strong>
                            {ct.is_primary ? <span className="tag tag-solid"><Icon name="star" size={11} /> Hoofdcontact</span> : null}
                            {ct.role && <span className="caption">{ct.role}</span>}
                          </div>
                          {(ct.email || ct.phone) && (
                            <div className="caption" style={{ marginTop: 4 }}>
                              {[ct.email, ct.phone].filter(Boolean).join(" · ")}
                            </div>
                          )}
                          {ct.notes && <p className="caption" style={{ marginTop: 6, marginBottom: 0 }}>{ct.notes}</p>}
                        </div>
                        <div className="row middle gap2" style={{ flex: "none" }}>
                          <button className="btn btn-quiet" onClick={() => setContactDrawer(ct)} aria-label="Bewerk contactpersoon"><Icon name="edit" size={14} /></button>
                          <button className="btn btn-quiet" onClick={() => deleteContact(ct.id)} aria-label="Verwijder contactpersoon"><Icon name="trash" size={14} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="caption" style={{ marginBottom: 24 }}>Nog geen contactpersonen.</p>}

              <div className="row between middle" style={{ marginBottom: 14 }}>
                <Kicker>Adressen</Kicker>
                <button className="btn btn-ghost" onClick={() => setAddressDrawer({})}><Icon name="plus" size={14} /> Toevoegen</button>
              </div>
              {(selected.addresses || []).length ? (
                <div className="col gap2" style={{ marginBottom: 24 }}>
                  {selected.addresses.map((ad) => (
                    <div key={ad.id} className="card" style={{ padding: "14px 18px" }}>
                      <div className="row between middle" style={{ gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          {ad.label && <strong className="serif" style={{ fontSize: 18 }}>{ad.label}</strong>}
                          <div className="caption" style={{ marginTop: ad.label ? 4 : 0 }}>
                            {[ad.street, [ad.postal_code, ad.city].filter(Boolean).join(" "), ad.country].filter(Boolean).join(", ")}
                          </div>
                          {ad.notes && <p className="caption" style={{ marginTop: 6, marginBottom: 0 }}>{ad.notes}</p>}
                        </div>
                        <div className="row middle gap2" style={{ flex: "none" }}>
                          <button className="btn btn-quiet" onClick={() => deleteAddress(ad.id)} aria-label="Verwijder adres"><Icon name="trash" size={14} /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="caption" style={{ marginBottom: 24 }}>Nog geen adressen.</p>}

              <Kicker style={{ marginBottom: 14 }}>Projectgeschiedenis</Kicker>
              {(selected.projects || []).length ? (
                <div className="col gap2">
                  {selected.projects.map((pr) => (
                    <div key={pr.id} className="card" style={{ padding: "14px 18px", cursor: "pointer" }} onClick={() => openProject(pr.id)}>
                      <div className="row between middle">
                        <strong className="serif" style={{ fontSize: 18 }}>{pr.title}</strong>
                        <span className="caption">{statusLabel(pr.status)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="caption">Nog geen projecten voor deze klant.</p>}
            </div>
          ) : (
            <EmptyState
              title="Selecteer een klant"
              body="Kies links een relatie om contactpersonen, adressen en gekoppelde projecten te bekijken."
            />
          )}
        </div>
      )}

      {drawer && <ClientDrawer ctx={ctx} client={drawer.id ? drawer : null} onClose={() => setDrawer(null)} />}
      {contactDrawer && selected && (
        <ContactDrawer
          ctx={ctx}
          clientId={selected.id}
          contact={contactDrawer.id ? contactDrawer : null}
          onClose={() => setContactDrawer(null)}
          onSaved={reload}
        />
      )}
      {addressDrawer && selected && (
        <AddressDrawer
          ctx={ctx}
          clientId={selected.id}
          onClose={() => setAddressDrawer(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
