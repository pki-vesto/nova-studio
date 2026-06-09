import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { Kicker } from "../components/primitives.jsx";
import { EditDrawer, Field } from "../components/EditDrawer.jsx";
import { fileUrl } from "../lib/format.js";

const SUB_TABS = [
  { key: "ai", label: "AI", icon: "spark" },
  { key: "users", label: "Gebruikers", icon: "user" },
  { key: "media", label: "Media", icon: "image" },
  { key: "activity", label: "Activiteit", icon: "history" }
];

const MODELS = ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-8"];
const PRIVACY = ["local-first", "cloud-ok"];
const ROLES = ["owner", "admin", "member"];

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" });
}

function truncate(text, n = 160) {
  const s = (text || "").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/* ── AI ─────────────────────────────────────────────────────────────── */
function AiTab({ ctx }) {
  const { fail } = ctx;
  const [settings, setSettings] = useState(null);
  const [prompts, setPrompts] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [drawer, setDrawer] = useState(false);

  async function load() {
    try {
      const [s, p, j] = await Promise.all([
        api.get("/api/ai/settings"),
        api.get("/api/ai/prompts"),
        api.get("/api/ai/jobs")
      ]);
      setSettings({ provider: "anthropic", model: MODELS[0], enabled: false, privacy_mode: "local-first", ...(s || {}) });
      setPrompts(Array.isArray(p) ? p : []);
      setJobs((Array.isArray(j) ? j : []).slice(0, 10));
    } catch (err) { fail(err); }
  }
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setSettings((s) => ({ ...s, [k]: k === "enabled" ? e.target.checked : e.target.value }));

  async function save() {
    setSaving(true);
    try { await api.json("/api/ai/settings", "PUT", settings); }
    catch (err) { fail(err); }
    finally { setSaving(false); }
  }

  async function removePrompt(id) {
    try { await api.del(`/api/ai/prompts/${id}`); await load(); } catch (err) { fail(err); }
  }

  async function review(id, review_status) {
    try { await api.json(`/api/ai/jobs/${id}/review`, "PUT", { review_status }); await load(); } catch (err) { fail(err); }
  }

  if (!settings) return <div className="empty"><p className="body" style={{ margin: 0 }}>Laden…</p></div>;

  return (
    <div className="col gap3">
      <section className="card" style={{ padding: "22px 24px" }}>
        <Kicker style={{ marginBottom: 14 }}>Model & privacy</Kicker>
        <div className="form-grid">
          <div className="form-grid form-grid-2">
            <Field label="Provider"><input value={settings.provider || ""} onChange={set("provider")} placeholder="anthropic" /></Field>
            <Field label="Model">
              <select value={settings.model || MODELS[0]} onChange={set("model")}>
                {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Privacymodus">
              <select value={settings.privacy_mode || PRIVACY[0]} onChange={set("privacy_mode")}>
                {PRIVACY.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Ingeschakeld">
              <label className="row gap2 middle" style={{ cursor: "pointer", padding: "8px 0" }}>
                <input type="checkbox" checked={!!settings.enabled} onChange={set("enabled")} />
                <span className="caption">AI-assistentie inschakelen</span>
              </label>
            </Field>
          </div>
        </div>
        <p className="caption" style={{ marginTop: 14, color: "var(--ink-2)" }}>
          AI is lokaal-eerst; zonder API-sleutel schrijft Nova een lokaal concept.
        </p>
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            <Icon name="check" size={15} /> {saving ? "Bezig…" : "Opslaan"}
          </button>
        </div>
      </section>

      <section className="card" style={{ padding: "22px 24px" }}>
        <div className="row between middle" style={{ marginBottom: 16 }}>
          <Kicker>Promptsjablonen</Kicker>
          <button className="btn btn-ghost" onClick={() => setDrawer(true)}><Icon name="plus" size={14} /> Sjabloon toevoegen</button>
        </div>
        {prompts.length === 0 ? (
          <p className="caption" style={{ color: "var(--ink-2)", margin: 0 }}>Nog geen sjablonen.</p>
        ) : (
          <div className="col gap2">
            {prompts.map((p) => (
              <div key={p.id} className="row between middle" style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
                <div>
                  <div className="serif" style={{ fontSize: 17 }}>{p.name || p.key}</div>
                  <div className="mono caption" style={{ color: "var(--ink-2)" }}>{p.key}{p.version != null ? ` · v${p.version}` : ""}</div>
                </div>
                <button className="btn btn-danger" style={{ padding: "6px 10px" }} onClick={() => removePrompt(p.id)}><Icon name="trash" size={13} /></button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card" style={{ padding: "22px 24px" }}>
        <Kicker style={{ marginBottom: 16 }}>Recente AI-taken</Kicker>
        {jobs.length === 0 ? (
          <p className="caption" style={{ color: "var(--ink-2)", margin: 0 }}>Nog geen taken uitgevoerd.</p>
        ) : (
          <div className="col gap3">
            {jobs.map((j) => (
              <div key={j.id} style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
                <div className="row between middle wrap gap2">
                  <div className="row gap2 middle wrap">
                    <span className="tag">{j.flow || "—"}</span>
                    <span className="mono caption" style={{ color: "var(--ink-2)" }}>{j.review_status || "open"}</span>
                  </div>
                  <div className="row gap2 no-print">
                    <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={() => review(j.id, "approved")}><Icon name="check" size={13} /> Goedkeuren</button>
                    <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={() => review(j.id, "rejected")}><Icon name="close" size={13} /> Afwijzen</button>
                  </div>
                </div>
                {j.output_text ? <p className="body" style={{ fontSize: 14, margin: "8px 0 0", color: "var(--ink-2)" }}>{truncate(j.output_text)}</p> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      {drawer && <PromptDrawer ctx={ctx} onClose={() => setDrawer(false)} onSaved={load} />}
    </div>
  );
}

function PromptDrawer({ ctx, onClose, onSaved }) {
  const { fail } = ctx;
  const [form, setForm] = useState({ key: "", name: "", system_prompt: "", user_prompt: "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.key.trim()) return;
    setSaving(true);
    try { await api.json("/api/ai/prompts", "POST", form); await onSaved(); onClose(); }
    catch (err) { fail(err); setSaving(false); }
  }

  return (
    <EditDrawer open title="Sjabloon toevoegen" onClose={onClose} onSave={save} saving={saving}>
      <div className="form-grid">
        <div className="form-grid form-grid-2">
          <Field label="Sleutel"><input value={form.key} onChange={set("key")} placeholder="proposal_intro" /></Field>
          <Field label="Naam"><input value={form.name} onChange={set("name")} placeholder="Voorstel — intro" /></Field>
        </div>
        <Field label="System-prompt"><textarea value={form.system_prompt} onChange={set("system_prompt")} rows={4} /></Field>
        <Field label="User-prompt"><textarea value={form.user_prompt} onChange={set("user_prompt")} rows={4} /></Field>
      </div>
    </EditDrawer>
  );
}

/* ── Gebruikers ─────────────────────────────────────────────────────── */
function UsersTab({ ctx }) {
  const { fail } = ctx;
  const [status, setStatus] = useState(null);
  const [users, setUsers] = useState([]);
  const [drawer, setDrawer] = useState(false);

  async function load() {
    try {
      const [s, u] = await Promise.all([api.get("/api/auth/status"), api.get("/api/auth/users")]);
      setStatus(s || { hasUsers: false });
      setUsers(Array.isArray(u) ? u : []);
    } catch (err) { fail(err); }
  }
  useEffect(() => { load(); }, []);

  async function setRole(id, role) {
    try { await api.json(`/api/auth/users/${id}`, "PUT", { role }); await load(); } catch (err) { fail(err); }
  }
  async function remove(id) {
    try { await api.del(`/api/auth/users/${id}`); await load(); } catch (err) { fail(err); }
  }

  if (!status) return <div className="empty"><p className="body" style={{ margin: 0 }}>Laden…</p></div>;

  return (
    <div className="col gap3">
      {!status.hasUsers && (
        <div className="card" style={{ padding: "20px 24px", background: "var(--paper-2, transparent)" }}>
          <Kicker style={{ marginBottom: 10 }}>Single-user modus</Kicker>
          <p className="body" style={{ margin: 0 }}>
            Nova draait nu in single-user modus (geen login). Voeg een gebruiker toe om authenticatie te activeren — dit is optioneel en self-hosted.
          </p>
        </div>
      )}

      <section className="card" style={{ padding: "22px 24px" }}>
        <div className="row between middle" style={{ marginBottom: 16 }}>
          <Kicker>Gebruikers</Kicker>
          <button className="btn btn-ghost" onClick={() => setDrawer(true)}><Icon name="plus" size={14} /> Gebruiker toevoegen</button>
        </div>
        {users.length === 0 ? (
          <p className="caption" style={{ color: "var(--ink-2)", margin: 0 }}>Nog geen gebruikers.</p>
        ) : (
          <div className="col gap2">
            {users.map((u) => (
              <div key={u.id} className="row between middle wrap gap2" style={{ padding: "12px 0", borderTop: "1px solid var(--line)" }}>
                <div>
                  <div className="serif" style={{ fontSize: 17 }}>{u.name || "—"}</div>
                  <div className="mono caption" style={{ color: "var(--ink-2)" }}>{u.email || ""}</div>
                </div>
                <div className="row gap2 middle no-print">
                  <select value={u.role || "member"} onChange={(e) => setRole(u.id, e.target.value)}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button className="btn btn-danger" style={{ padding: "6px 10px" }} onClick={() => remove(u.id)}><Icon name="trash" size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {drawer && <UserDrawer ctx={ctx} onClose={() => setDrawer(false)} onSaved={load} />}
    </div>
  );
}

function UserDrawer({ ctx, onClose, onSaved }) {
  const { fail } = ctx;
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "member" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.name.trim() || !form.email.trim()) return;
    setSaving(true);
    try { await api.json("/api/auth/users", "POST", form); await onSaved(); onClose(); }
    catch (err) { fail(err); setSaving(false); }
  }

  return (
    <EditDrawer open title="Gebruiker toevoegen" onClose={onClose} onSave={save} saving={saving}>
      <div className="form-grid">
        <Field label="Naam"><input value={form.name} onChange={set("name")} placeholder="Voor- en achternaam" /></Field>
        <div className="form-grid form-grid-2">
          <Field label="E-mail"><input type="email" value={form.email} onChange={set("email")} placeholder="naam@studio.nl" /></Field>
          <Field label="Wachtwoord"><input type="password" value={form.password} onChange={set("password")} placeholder="••••••••" /></Field>
        </div>
        <Field label="Rol">
          <select value={form.role} onChange={set("role")}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
      </div>
    </EditDrawer>
  );
}

/* ── Media ──────────────────────────────────────────────────────────── */
function MediaTab({ ctx }) {
  const { fail } = ctx;
  const [media, setMedia] = useState([]);
  const [orphans, setOrphans] = useState(0);
  const [edit, setEdit] = useState(null);

  async function load() {
    try {
      const [m, o] = await Promise.all([api.get("/api/media"), api.get("/api/media/orphans")]);
      setMedia(Array.isArray(m) ? m : []);
      setOrphans(typeof o === "number" ? o : (o?.count ?? (Array.isArray(o) ? o.length : 0)));
    } catch (err) { fail(err); }
  }
  useEffect(() => { load(); }, []);

  async function cleanup() {
    if (!window.confirm("Weesbestanden definitief opruimen?")) return;
    try { await api.json("/api/media/cleanup-orphans", "POST", {}); await load(); } catch (err) { fail(err); }
  }

  return (
    <div className="col gap3">
      <section className="card" style={{ padding: "18px 24px" }}>
        <div className="row between middle wrap gap2">
          <div>
            <Kicker style={{ marginBottom: 6 }}>Onderhoud</Kicker>
            <span className="caption" style={{ color: "var(--ink-2)" }}>{orphans} weesbestand{orphans === 1 ? "" : "en"} gevonden</span>
          </div>
          <button className="btn btn-ghost" onClick={cleanup} disabled={!orphans}><Icon name="trash" size={14} /> Opruimen</button>
        </div>
      </section>

      {media.length === 0 ? (
        <div className="empty"><p className="body" style={{ margin: 0 }}>Nog geen media. Geüploade afbeeldingen verschijnen hier.</p></div>
      ) : (
        <div className="grid grid-3">
          {media.map((m) => {
            const url = m.url || fileUrl(m.file_path);
            return (
              <article key={m.id} className="card" style={{ overflow: "hidden" }}>
                <div className="ph has-img" style={{ aspectRatio: "1/1" }}>
                  {url ? <img src={url} alt={m.alt_text || ""} /> : null}
                </div>
                <div style={{ padding: "14px 16px 16px" }}>
                  <div className="caption" style={{ minHeight: 18 }}>{m.alt_text || <span style={{ color: "var(--muted)" }}>Geen alt-tekst</span>}</div>
                  {m.tags ? <div className="mono caption" style={{ color: "var(--ink-2)", marginTop: 4 }}>{m.tags}</div> : null}
                  <div className="row gap2 no-print" style={{ marginTop: 12 }}>
                    <button className="btn btn-ghost" style={{ padding: "6px 10px" }} onClick={() => setEdit(m)}><Icon name="edit" size={13} /> Bewerk</button>
                    {url ? <a className="btn btn-ghost" style={{ padding: "6px 10px" }} href={url} download><Icon name="download" size={13} /></a> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {edit && <MediaDrawer ctx={ctx} item={edit} onClose={() => setEdit(null)} onSaved={load} />}
    </div>
  );
}

function MediaDrawer({ ctx, item, onClose, onSaved }) {
  const { fail } = ctx;
  const [form, setForm] = useState({ alt_text: item.alt_text || "", tags: item.tags || "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    try { await api.json(`/api/media/${item.id}`, "PUT", form); await onSaved(); onClose(); }
    catch (err) { fail(err); setSaving(false); }
  }

  return (
    <EditDrawer open title="Media bewerken" onClose={onClose} onSave={save} saving={saving}>
      <div className="form-grid">
        <Field label="Alt-tekst"><input value={form.alt_text} onChange={set("alt_text")} placeholder="Beschrijving voor toegankelijkheid" /></Field>
        <Field label="Tags"><input value={form.tags} onChange={set("tags")} placeholder="woonkamer, eiken, sfeer" /></Field>
      </div>
    </EditDrawer>
  );
}

/* ── Activiteit ─────────────────────────────────────────────────────── */
function ActivityTab({ ctx }) {
  const { fail } = ctx;
  const [rows, setRows] = useState([]);
  const [entity, setEntity] = useState("");

  async function load() {
    try {
      const a = await api.get("/api/audit");
      setRows(Array.isArray(a) ? a : []);
    } catch (err) { fail(err); }
  }
  useEffect(() => { load(); }, []);

  const entities = Array.from(new Set(rows.map((r) => r.entity).filter(Boolean)));
  const list = entity ? rows.filter((r) => r.entity === entity) : rows;

  return (
    <div className="col gap3">
      <section className="card" style={{ padding: "16px 24px" }}>
        <div className="row between middle wrap gap2">
          <Kicker>Audit-log</Kicker>
          <div className="row gap2 middle">
            <span className="caption" style={{ color: "var(--ink-2)" }}>Filter</span>
            <select value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">Alle entiteiten</option>
              {entities.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>
      </section>

      {list.length === 0 ? (
        <div className="empty"><p className="body" style={{ margin: 0 }}>Geen activiteit geregistreerd.</p></div>
      ) : (
        <section className="card" style={{ padding: "8px 24px 16px" }}>
          <div className="col">
            {list.map((r, i) => (
              <div key={r.id ?? i} className="row between middle wrap gap2" style={{ padding: "12px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
                <div className="row gap2 middle wrap">
                  <span className="tag">{r.action || "—"}</span>
                  <span className="mono caption" style={{ color: "var(--ink-2)" }}>{r.entity || "—"}{r.entity_id != null ? `#${r.entity_id}` : ""}</span>
                  {r.detail ? <span className="caption">{truncate(r.detail, 90)}</span> : null}
                </div>
                <span className="mono caption" style={{ color: "var(--muted)" }}>{fmtDate(r.created_at)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ── Shell ──────────────────────────────────────────────────────────── */
export function Settings({ ctx }) {
  const [tab, setTab] = useState("ai");

  return (
    <div className="content content-wide rise">
      <div className="page-head">
        <div>
          <Kicker style={{ marginBottom: 14 }}>Nova Studio — Beheer</Kicker>
          <h1 className="page-title">Instellingen</h1>
        </div>
      </div>

      <div className="row gap2 wrap" style={{ marginBottom: 32 }}>
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            className={`btn ${tab === t.key ? "btn-primary" : "btn-ghost"}`}
            style={{ borderRadius: 99, padding: "8px 15px" }}
            onClick={() => setTab(t.key)}
          >
            <Icon name={t.icon} size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "ai" && <AiTab ctx={ctx} />}
      {tab === "users" && <UsersTab ctx={ctx} />}
      {tab === "media" && <MediaTab ctx={ctx} />}
      {tab === "activity" && <ActivityTab ctx={ctx} />}
    </div>
  );
}
