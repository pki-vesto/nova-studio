import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { Ph, SectionHead, EditButton, Kicker } from "../components/primitives.jsx";
import { EditDrawer, Field } from "../components/EditDrawer.jsx";

const SAMPLE_LABELS = { none: "Geen staal", requested: "Staal aangevraagd", received: "Staal ontvangen" };

function Stars({ score }) {
  const n = Math.max(0, Math.min(5, Math.round(Number(score) || 0)));
  if (!n) return null;
  return (
    <span className="row gap1" style={{ color: "var(--clay)" }} title={`Duurzaamheid ${n}/5`}>
      {Array.from({ length: n }).map((_, i) => <Icon key={i} name="star" size={14} />)}
    </span>
  );
}

function SampleBadge({ status }) {
  if (!status || status === "none") return null;
  const color = status === "received" ? "var(--sage)" : "var(--clay)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-2)", fontWeight: 600 }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: color }} />
      {SAMPLE_LABELS[status] || status}
    </span>
  );
}

function dateLabel(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function SampleActions({ material, onTransition }) {
  const status = material.sample_status || "none";
  return (
    <div className="row gap2" style={{ flexWrap: "wrap", marginTop: 12 }}>
      {status === "none" && (
        <button type="button" className="btn btn-ghost" style={{ padding: "7px 10px" }} onClick={() => onTransition(material.id, "request")}>
          <Icon name="upload" size={13} /> Sample aanvragen
        </button>
      )}
      {status === "requested" && (
        <button type="button" className="btn btn-clay" style={{ padding: "7px 10px" }} onClick={() => onTransition(material.id, "receive")}>
          <Icon name="check" size={13} /> Ontvangen
        </button>
      )}
      {status !== "none" && (
        <button type="button" className="btn btn-ghost" style={{ padding: "7px 10px" }} onClick={() => onTransition(material.id, "reset")}>
          <Icon name="close" size={13} /> Reset
        </button>
      )}
    </div>
  );
}

function SampleDashboard({ project, refreshKey, fail }) {
  const [dashboard, setDashboard] = useState({ requested: [], received: [], none: [] });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get(`/api/materials/project/${project.id}/sample-dashboard`);
        if (!cancelled) setDashboard(data);
      } catch (err) {
        fail(err);
        if (!cancelled) setDashboard({ requested: [], received: [], none: [] });
      }
    })();
    return () => { cancelled = true; };
  }, [project.id, refreshKey]);

  const groups = [
    ["Aangevraagd", dashboard.requested || [], "sample_requested_at"],
    ["Ontvangen", dashboard.received || [], "sample_received_at"],
    ["Geen staal", dashboard.none || [], ""]
  ];

  return (
    <section>
      <SectionHead kicker="Sample dashboard"
        title="Materiaalstalen per status"
        sub="Openstaande en ontvangen stalen per project, inclusief leverancier en datum." />
      <div className="grid grid-3">
        {groups.map(([label, rows, dateField]) => (
          <div className="card" key={label} style={{ padding: 22 }}>
            <div className="row between middle" style={{ marginBottom: 14 }}>
              <h4 className="serif" style={{ fontSize: 19, margin: 0 }}>{label}</h4>
              <span className="tag">{rows.length}</span>
            </div>
            {rows.length ? (
              <div className="col gap3">
                {rows.map((m) => (
                  <div key={m.id} style={{ paddingBottom: 10, borderBottom: "1px solid var(--line)" }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{m.name}</div>
                    <div className="caption">{[m.supplier_name, dateLabel(m[dateField])].filter(Boolean).join(" · ")}</div>
                  </div>
                ))}
              </div>
            ) : <p className="caption" style={{ margin: 0 }}>Geen materialen.</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

function PaletteDrawer({ ctx, onClose }) {
  const { project, reload, fail } = ctx;
  const [text, setText] = useState(
    (project.palette || []).map((c) => [c.name, c.hex, c.note, c.use].join(" | ")).join("\n")
  );
  const [saving, setSaving] = useState(false);
  const [library, setLibrary] = useState([]);
  const [libLoaded, setLibLoaded] = useState(false);
  const [saveIdx, setSaveIdx] = useState(null); // index of palette line being saved to library

  useEffect(() => {
    (async () => {
      try { setLibrary(await api.get("/api/colors")); } catch (err) { fail(err); } finally { setLibLoaded(true); }
    })();
  }, []);

  // Parse current textarea into structured tints.
  function parseTints() {
    return text.split("\n").map((line) => {
      const parts = line.split("|").map((s) => s.trim());
      if (!parts[0]) return null;
      return { name: parts[0], hex: parts[1] || "#CCCCCC", note: parts[2] || "", use: parts[3] || "" };
    }).filter(Boolean);
  }

  function appendLine(name, hex, note = "", use = "") {
    const line = [name, hex, note, use].join(" | ");
    setText((t) => (t.trim() ? t.replace(/\n+$/, "") + "\n" + line : line));
  }

  async function save() {
    setSaving(true);
    try {
      await api.json(`/api/projects/${project.id}`, "PUT", { palette: parseTints() });
      await reload();
      onClose();
    } catch (err) { fail(err); setSaving(false); }
  }

  // Persist a single palette tint to the global color library.
  async function saveToLibrary(tint, idx) {
    setSaveIdx(idx);
    try {
      const created = await api.json("/api/colors", "POST", {
        name: tint.name, hex: tint.hex, code: "", brand: "", finish: "", notes: tint.note || tint.use || ""
      });
      setLibrary((l) => [...l, created].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    } catch (err) { fail(err); } finally { setSaveIdx(null); }
  }

  const tints = parseTints();

  return (
    <EditDrawer open title="Kleurpalet bewerken" onClose={onClose} onSave={save} saving={saving}>
      <p className="body" style={{ fontSize: 13.5, marginTop: 0 }}>Eén tint per regel — <span className="mono">Naam | #HEX | notitie | toepassing</span></p>
      <Field label="Palet">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10}
          placeholder={"Kalkwit | #EFE9DE | Wanden — hoofdtint | Romige basis\nTravertijn | #D8C7AE | Vloer & steen | Geaard, tactiel"} />
      </Field>

      {/* Bewaar in bibliotheek — push palette tints to the global color library. */}
      {tints.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <Kicker style={{ marginBottom: 10 }}>Bewaar in bibliotheek</Kicker>
          <div className="col gap2">
            {tints.map((t, i) => (
              <div key={i} className="row middle between" style={{ gap: 12 }}>
                <div className="row gap2 middle" style={{ minWidth: 0 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 6, background: t.hex, flex: "none", border: "1px solid rgba(0,0,0,.08)" }} />
                  <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                  <span className="mono caption">{(t.hex || "").toUpperCase()}</span>
                </div>
                <button type="button" className="btn btn-ghost" style={{ padding: "5px 10px", flex: "none" }}
                  disabled={saveIdx === i} onClick={() => saveToLibrary(t, i)}>
                  <Icon name="upload" size={13} /> {saveIdx === i ? "Bezig…" : "Bewaar"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="hr" style={{ margin: "22px 0 18px" }} />

      {/* Kies uit kleurbibliotheek — append a global library color to the palette. */}
      <Kicker style={{ marginBottom: 10 }}>Uit kleurbibliotheek</Kicker>
      {!libLoaded ? (
        <p className="caption">Bibliotheek laden…</p>
      ) : library.length === 0 ? (
        <p className="caption">Nog geen kleuren in de globale bibliotheek.</p>
      ) : (
        <div className="col gap2" style={{ maxHeight: 220, overflowY: "auto" }}>
          {library.map((c) => (
            <button key={c.id} type="button" className="row middle between" onClick={() => appendLine(c.name, c.hex, [c.brand, c.code].filter(Boolean).join(" "), "")}
              style={{ gap: 12, padding: "8px 10px", border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "transparent", cursor: "pointer", textAlign: "left" }}>
              <span className="row gap2 middle" style={{ minWidth: 0 }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, background: c.hex || "#ccc", flex: "none", border: "1px solid rgba(0,0,0,.08)" }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                  <span className="caption">{[c.brand, c.code, (c.hex || "").toUpperCase()].filter(Boolean).join(" · ")}</span>
                </span>
              </span>
              <span className="row gap1 middle caption" style={{ flex: "none" }}><Icon name="plus" size={13} /> Toevoegen</span>
            </button>
          ))}
        </div>
      )}
    </EditDrawer>
  );
}

function RoomColorsDrawer({ ctx, onClose }) {
  const { project, fail } = ctx;
  const rooms = project.rooms || [];
  const [activeRoom, setActiveRoom] = useState(rooms[0]?.id || null);
  const [apps, setApps] = useState({}); // roomId -> [applications]
  const [library, setLibrary] = useState([]);
  const [form, setForm] = useState({ color_id: "", hex: "#D8C7AE", name: "", application: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    (async () => { try { setLibrary(await api.get("/api/colors")); } catch (err) { fail(err); } })();
  }, []);

  async function loadRoom(roomId) {
    if (!roomId) return;
    try {
      const rows = await api.get(`/api/colors/room/${roomId}`);
      setApps((a) => ({ ...a, [roomId]: rows }));
    } catch (err) { fail(err); }
  }
  useEffect(() => { if (activeRoom) loadRoom(activeRoom); }, [activeRoom]);

  // When a library color is selected, prefill hex + name from it.
  function pickLibrary(e) {
    const cid = e.target.value;
    const c = library.find((x) => x.id === cid);
    setForm((f) => ({ ...f, color_id: cid, hex: c?.hex || f.hex, name: c?.name || f.name }));
  }

  async function add() {
    if (!activeRoom) return;
    if (!form.name.trim() && !form.color_id) return;
    setBusy(true);
    try {
      await api.json(`/api/colors/room/${activeRoom}`, "POST", {
        color_id: form.color_id || undefined,
        hex: form.hex, name: form.name, application: form.application
      });
      setForm({ color_id: "", hex: "#D8C7AE", name: "", application: "" });
      await loadRoom(activeRoom);
    } catch (err) { fail(err); } finally { setBusy(false); }
  }

  async function remove(rcId) {
    try { await api.del(`/api/colors/room-color/${rcId}`); await loadRoom(activeRoom); }
    catch (err) { fail(err); }
  }

  const list = apps[activeRoom] || [];

  return (
    <EditDrawer open title="Kleur per ruimte" onClose={onClose}>
      {rooms.length === 0 ? (
        <p className="caption">Nog geen ruimtes. Voeg eerst ruimtes toe bij de plattegrond.</p>
      ) : (
        <>
          <div className="row gap2 wrap" style={{ marginBottom: 22 }}>
            {rooms.map((r) => (
              <button key={r.id} type="button" className={`btn ${activeRoom === r.id ? "btn-primary" : "btn-ghost"}`}
                style={{ borderRadius: 99, padding: "7px 14px" }} onClick={() => setActiveRoom(r.id)}>{r.name}</button>
            ))}
          </div>

          <div className="form-grid" style={{ marginBottom: 24 }}>
            <div className="form-grid form-grid-2">
              <Field label="Uit bibliotheek">
                <select value={form.color_id} onChange={pickLibrary}>
                  <option value="">— Vrije kleur —</option>
                  {library.map((c) => <option key={c.id} value={c.id}>{c.name}{c.hex ? ` (${c.hex})` : ""}</option>)}
                </select>
              </Field>
              <Field label="Kleur (HEX)">
                <div className="row gap2 middle">
                  <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(form.hex) ? form.hex : "#cccccc"} onChange={set("hex")} style={{ width: 44, height: 38, padding: 2, flex: "none" }} />
                  <input value={form.hex} onChange={set("hex")} placeholder="#D8C7AE" />
                </div>
              </Field>
            </div>
            <Field label="Naam"><input value={form.name} onChange={set("name")} placeholder="Kalkwit" /></Field>
            <Field label="Toepassing"><input value={form.application} onChange={set("application")} placeholder="Wanden — hoofdtint" /></Field>
            <button type="button" className="btn btn-clay" onClick={add} disabled={busy} style={{ justifyContent: "center" }}>
              <Icon name="plus" size={15} /> {busy ? "Bezig…" : "Toepassing toevoegen"}
            </button>
          </div>

          <div className="hr" style={{ margin: "8px 0 18px" }} />

          <div className="col gap3">
            {list.map((rc) => (
              <div key={rc.id} className="row middle between" style={{ gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                <div className="row gap3 middle" style={{ minWidth: 0 }}>
                  <span style={{ width: 38, height: 38, borderRadius: "var(--r-sm)", background: rc.hex || "#ccc", flex: "none", border: "1px solid rgba(0,0,0,.08)" }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{rc.name || rc.library_name || "Kleur"}</div>
                    <div className="caption">{[rc.application, (rc.hex || "").toUpperCase()].filter(Boolean).join(" · ")}</div>
                  </div>
                </div>
                <button type="button" className="btn btn-danger" style={{ padding: "7px 10px" }} onClick={() => remove(rc.id)}><Icon name="trash" size={14} /></button>
              </div>
            ))}
            {list.length === 0 && <p className="caption">Nog geen kleuren toegepast in deze ruimte.</p>}
          </div>
        </>
      )}
    </EditDrawer>
  );
}

function MaterialsDrawer({ ctx, onClose }) {
  const { project, reload, fail } = ctx;
  const emptyForm = { name: "", spec: "", application: "", brand: "", code: "", maintenance: "", sustainability_score: "", sample_status: "none" };
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null); // material id currently being edited
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Library import state.
  const [library, setLibrary] = useState([]);
  const [libOpen, setLibOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  async function loadLibrary() {
    try { setLibrary(await api.get("/api/material-library")); } catch (err) { fail(err); }
  }

  function startEdit(m) {
    setEditId(m.id);
    setForm({
      name: m.name || "", spec: m.spec || "", application: m.application || "",
      brand: m.brand || "", code: m.code || "", maintenance: m.maintenance || "",
      sustainability_score: m.sustainability_score ?? "", sample_status: m.sample_status || "none"
    });
    setFile(null);
  }
  function cancelEdit() { setEditId(null); setForm(emptyForm); setFile(null); }

  function buildFd() {
    const fd = new FormData();
    fd.append("project_id", project.id);
    fd.append("name", form.name);
    fd.append("spec", form.spec);
    fd.append("application", form.application);
    fd.append("brand", form.brand);
    fd.append("code", form.code);
    fd.append("maintenance", form.maintenance);
    fd.append("sustainability_score", form.sustainability_score === "" ? "0" : form.sustainability_score);
    fd.append("sample_status", form.sample_status || "none");
    if (file) fd.append("image", file);
    return fd;
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editId) await api.form(`/api/materials/${editId}`, buildFd(), "PUT");
      else await api.form("/api/materials", buildFd());
      cancelEdit();
      await reload();
    } catch (err) { fail(err); } finally { setSaving(false); }
  }

  async function remove(matId) {
    try { await api.del(`/api/materials/${matId}`); if (editId === matId) cancelEdit(); await reload(); } catch (err) { fail(err); }
  }

  async function importFromLibrary(libId) {
    setImporting(true);
    try {
      await api.json("/api/materials/from-library", "POST", { project_id: project.id, library_id: libId });
      setLibOpen(false);
      await reload();
    } catch (err) { fail(err); } finally { setImporting(false); }
  }

  function toggleLibrary() {
    const next = !libOpen;
    setLibOpen(next);
    if (next) loadLibrary();
  }

  return (
    <EditDrawer open title="Materialen beheren" onClose={onClose}>
      <div className="row between middle" style={{ marginBottom: 14 }}>
        <Kicker>{editId ? "Materiaal bewerken" : "Nieuw materiaal"}</Kicker>
        <button type="button" className="btn btn-ghost" style={{ padding: "6px 11px" }} onClick={toggleLibrary}>
          <Icon name="library" size={14} /> Uit bibliotheek
        </button>
      </div>

      {/* Import from the global material library. */}
      {libOpen && (
        <div className="card" style={{ padding: 14, marginBottom: 22 }}>
          {library.length === 0 ? (
            <p className="caption" style={{ margin: 0 }}>Geen materialen in de globale bibliotheek.</p>
          ) : (
            <div className="col gap2" style={{ maxHeight: 240, overflowY: "auto" }}>
              {library.map((m) => (
                <div key={m.id} className="row middle between" style={{ gap: 12 }}>
                  <div className="row gap2 middle" style={{ minWidth: 0 }}>
                    <Ph label="" src={m.image_path} icon="palette" style={{ width: 36, height: 36, borderRadius: "var(--r-sm)", flex: "none" }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                      <div className="caption">{[m.category, m.brand, m.code].filter(Boolean).join(" · ")}</div>
                    </div>
                  </div>
                  <button type="button" className="btn btn-clay" style={{ padding: "6px 10px", flex: "none" }} disabled={importing} onClick={() => importFromLibrary(m.id)}>
                    <Icon name="download" size={13} /> Importeer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="form-grid" style={{ marginBottom: 28 }}>
        <Field label="Materiaalnaam"><input value={form.name} onChange={set("name")} placeholder="Travertijn — gezoet" /></Field>
        <div className="form-grid form-grid-2">
          <Field label="Merk"><input value={form.brand} onChange={set("brand")} placeholder="Solid Nature" /></Field>
          <Field label="Code / artikelnummer"><input value={form.code} onChange={set("code")} placeholder="TRV-NAV-20" /></Field>
        </div>
        <Field label="Specificatie"><input value={form.spec} onChange={set("spec")} placeholder="Romeins, ongevuld" /></Field>
        <Field label="Toepassing"><input value={form.application} onChange={set("application")} placeholder="Vloer begane grond" /></Field>
        <Field label="Onderhoud"><textarea value={form.maintenance} onChange={set("maintenance")} rows={2} placeholder="Impregneren, pH-neutraal reinigen" /></Field>
        <div className="form-grid form-grid-2">
          <Field label="Duurzaamheidsscore (0–5)"><input type="number" min="0" max="5" step="1" value={form.sustainability_score} onChange={set("sustainability_score")} placeholder="4" /></Field>
          <Field label="Staalstatus">
            <select value={form.sample_status} onChange={set("sample_status")}>
              <option value="none">Geen staal</option>
              <option value="requested">Aangevraagd</option>
              <option value="received">Ontvangen</option>
            </select>
          </Field>
        </div>
        <Field label="Sample-afbeelding"><input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])} /></Field>
        <div className="row gap2">
          <button type="button" className="btn btn-clay" onClick={save} disabled={saving} style={{ justifyContent: "center", flex: 1 }}>
            <Icon name={editId ? "check" : "plus"} size={15} /> {saving ? "Bezig…" : editId ? "Wijzigingen opslaan" : "Materiaal toevoegen"}
          </button>
          {editId && <button type="button" className="btn btn-ghost" onClick={cancelEdit}>Annuleren</button>}
        </div>
      </div>

      <div className="hr" style={{ margin: "8px 0 18px" }} />
      <div className="col gap3">
        {(project.materials || []).map((m) => (
          <div key={m.id} className="row middle between" style={{ gap: 12, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
            <div className="row gap3 middle" style={{ minWidth: 0 }}>
              <Ph label="" src={m.image_path} icon="palette" style={{ width: 46, height: 46, borderRadius: "var(--r-md)", flex: "none" }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</div>
                <div className="caption">{[[m.brand, m.code].filter(Boolean).join(" "), m.spec, m.application].filter(Boolean).join(" · ")}</div>
                <div className="row gap3 middle" style={{ marginTop: 4 }}><Stars score={m.sustainability_score} /><SampleBadge status={m.sample_status} /></div>
              </div>
            </div>
            <div className="row gap2" style={{ flex: "none" }}>
              <button className="btn btn-ghost" style={{ padding: "7px 10px" }} onClick={() => startEdit(m)}><Icon name="edit" size={14} /></button>
              <button className="btn btn-danger" style={{ padding: "7px 10px" }} onClick={() => remove(m.id)}><Icon name="trash" size={14} /></button>
            </div>
          </div>
        ))}
        {(project.materials || []).length === 0 && <p className="caption">Nog geen materialen toegevoegd.</p>}
      </div>
    </EditDrawer>
  );
}

// Display section: applied colors per room (read-only swatches + manage button).
function RoomColorsSection({ ctx, onEdit }) {
  const { project, fail } = ctx;
  const rooms = project.rooms || [];
  const [apps, setApps] = useState({}); // roomId -> [applications]

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = {};
      for (const r of rooms) {
        try { next[r.id] = await api.get(`/api/colors/room/${r.id}`); }
        catch (err) { fail(err); next[r.id] = []; }
      }
      if (!cancelled) setApps(next);
    })();
    return () => { cancelled = true; };
  }, [project.id, rooms.length]);

  return (
    <>
      <SectionHead kicker="Kleur per ruimte"
        title="Hoe het palet per ruimte landt"
        sub="Elke ruimte krijgt zijn eigen accenten — vastgelegd als toepassing, zodat schilder en stoffeerder exact weten waar welke tint hoort."
        right={<EditButton onClick={onEdit} label="Kleur per ruimte" />} />

      {rooms.length === 0 ? (
        <div className="empty"><p className="body" style={{ margin: 0 }}>Nog geen ruimtes. Voeg ruimtes toe bij de plattegrond om kleuren per ruimte te koppelen.</p></div>
      ) : (
        <div className="grid grid-3">
          {rooms.map((r) => {
            const list = apps[r.id] || [];
            return (
              <div className="card" key={r.id} style={{ padding: 22 }}>
                <h4 className="serif" style={{ fontSize: 19, margin: "0 0 14px" }}>{r.name}</h4>
                {list.length === 0 ? (
                  <p className="caption" style={{ margin: 0 }}>Nog geen kleuren toegepast.</p>
                ) : (
                  <div className="col gap3">
                    {list.map((rc) => (
                      <div className="row gap3 middle" key={rc.id} style={{ minWidth: 0 }}>
                        <span style={{ width: 34, height: 34, borderRadius: "var(--r-sm)", background: rc.hex || "#ccc", flex: "none", border: "1px solid rgba(0,0,0,.08)" }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{rc.name || rc.library_name || "Kleur"}</div>
                          {rc.application && <div className="caption" style={{ marginTop: 2 }}>{rc.application}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export function ColorMaterial({ ctx }) {
  const { project, reload, fail } = ctx;
  const palette = project.palette || [];
  const materials = project.materials || [];
  const [editPalette, setEditPalette] = useState(false);
  const [editRoomColors, setEditRoomColors] = useState(false);
  const [editMaterials, setEditMaterials] = useState(false);
  const [sampleRefresh, setSampleRefresh] = useState(0);

  async function transitionSample(materialId, action) {
    try {
      await api.json(`/api/materials/${materialId}/sample/${action}`, "POST", {});
      await reload();
      setSampleRefresh((n) => n + 1);
    } catch (err) { fail(err); }
  }

  return (
    <div className="content content-wide rise">
      <SectionHead kicker="Kleurconcept"
        title="Een palet ontleend aan steen, aarde en linnen"
        sub="Subtiele, warme tinten die over alle verdiepingen terugkeren — gekozen om met daglicht mee te bewegen."
        right={<EditButton onClick={() => setEditPalette(true)} label="Palet" />} />

      {palette.length > 0 ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 18 }}>
            {palette.map((c) => (
              <div className="swatch" key={c.name}>
                <div className="swatch-chip" style={{ background: c.hex }} />
                <div>
                  <h4>{c.name}</h4>
                  <div className="mono" style={{ marginTop: 2 }}>{(c.hex || "").toUpperCase()}</div>
                  {c.note && <div className="caption" style={{ marginTop: 8, color: "var(--ink-2)", lineHeight: 1.5 }}>{c.note}</div>}
                </div>
              </div>
            ))}
          </div>
          {palette.some((c) => c.use) && (
            <div className="card" style={{ padding: 32, marginTop: 40, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 32 }}>
              {palette.filter((c) => c.use).slice(0, 3).map((c) => (
                <div key={c.name} className="row gap4">
                  <div style={{ width: 46, height: 46, borderRadius: "var(--r-md)", background: c.hex, flex: "none", border: "1px solid rgba(0,0,0,.06)" }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</div>
                    <div className="caption" style={{ marginTop: 4, lineHeight: 1.5 }}>{c.use}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="empty"><p className="body" style={{ margin: 0 }}>Nog geen kleurpalet. Voeg tinten toe via <b>Palet</b>.</p></div>
      )}

      <hr className="hr" style={{ margin: "64px 0 56px" }} />

      <RoomColorsSection ctx={ctx} onEdit={() => setEditRoomColors(true)} />

      <hr className="hr" style={{ margin: "64px 0 56px" }} />

      <SampleDashboard project={project} refreshKey={sampleRefresh} fail={fail} />

      <hr className="hr" style={{ margin: "64px 0 56px" }} />

      <SectionHead kicker="Materiaalconcept"
        title="Tactiele materialen die mooier verouderen"
        sub="Elk materiaal is gekozen op gevoel én op duurzaamheid. Ze patineren, leven en vertellen na jaren nog hetzelfde verhaal."
        right={<EditButton onClick={() => setEditMaterials(true)} label="Materialen" />} />

      {materials.length > 0 ? (
        <div className="grid grid-3">
          {materials.map((m) => (
            <div className="mat" key={m.id}>
              <Ph label={`${m.name} — sample`} src={m.image_path} icon="palette" />
              <div>
                <div className="row between" style={{ alignItems: "baseline", gap: 10 }}>
                  <h4 className="serif" style={{ fontSize: 20, margin: 0 }}>{m.name}</h4>
                  <Stars score={m.sustainability_score} />
                </div>
                {(m.brand || m.code) && <div className="mono caption" style={{ marginTop: 6, color: "var(--ink-2)" }}>{[m.brand, m.code].filter(Boolean).join(" · ")}</div>}
                {m.spec && <div className="caption" style={{ marginTop: 6 }}>{m.spec}</div>}
                {m.application && <div className="body" style={{ fontSize: 13.5, marginTop: 8 }}>Toepassing — {m.application}</div>}
                {m.maintenance && <div className="caption" style={{ marginTop: 8, color: "var(--ink-2)", lineHeight: 1.5 }}>Onderhoud — {m.maintenance}</div>}
                {m.sample_status && m.sample_status !== "none" && <div style={{ marginTop: 10 }}><SampleBadge status={m.sample_status} /></div>}
                <SampleActions material={m} onTransition={transitionSample} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty"><p className="body" style={{ margin: 0 }}>Nog geen materialen. Voeg ze toe via <b>Materialen</b>.</p></div>
      )}

      {editPalette && <PaletteDrawer ctx={ctx} onClose={() => setEditPalette(false)} />}
      {editRoomColors && <RoomColorsDrawer ctx={ctx} onClose={() => setEditRoomColors(false)} />}
      {editMaterials && <MaterialsDrawer ctx={ctx} onClose={() => setEditMaterials(false)} />}
    </div>
  );
}
