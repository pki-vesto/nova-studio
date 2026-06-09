import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { SectionHead, Kicker } from "../components/primitives.jsx";
import { EditDrawer, Field } from "../components/EditDrawer.jsx";
import { money } from "../lib/format.js";

function lineTotal(lines) {
  return (lines || []).reduce((s, l) => s + Number(l.amount || 0), 0);
}

function ScenarioDrawer({ ctx, onClose, onSaved }) {
  const { project, fail } = ctx;
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const lines = text.split("\n").map((line) => {
        const parts = line.split("|").map((s) => s.trim());
        if (!parts[0]) return null;
        return { label: parts[0], amount: Number(parts[1] || 0) };
      }).filter(Boolean);
      await api.json("/api/budget/scenarios", "POST", {
        project_id: project.id, name: name.trim(), lines, is_active: false
      });
      await onSaved();
      onClose();
    } catch (err) { fail(err); setSaving(false); }
  }

  return (
    <EditDrawer open title="Scenario toevoegen" onClose={onClose} onSave={save} saving={saving}>
      <Field label="Naam"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Basisuitvoering" /></Field>
      <p className="body" style={{ fontSize: 13.5, margin: "18px 0 0" }}>Eén post per regel — <span className="mono">Label | bedrag</span></p>
      <Field label="Posten">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={9}
          placeholder={"Meubilair | 18500\nVerlichting | 4200\nTextiel & gordijnen | 3100"} />
      </Field>
    </EditDrawer>
  );
}

export function Budget({ ctx }) {
  const { project, fail } = ctx;
  const pid = project.id;
  const [overview, setOverview] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const [ov, sc, rm] = await Promise.all([
        api.get(`/api/budget/overview/project/${pid}`),
        api.get(`/api/budget/scenarios/project/${pid}`),
        api.get(`/api/budget/rooms/project/${pid}`)
      ]);
      setOverview(ov);
      setScenarios(sc || []);
      setRooms(rm || []);
      const d = {};
      (rm || []).forEach((r) => { d[r.room_id] = { amount: r.amount ?? "", notes: r.notes || "" }; });
      setDrafts(d);
    } catch (err) { fail(err); }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [pid]);

  async function saveRoom(roomId) {
    const draft = drafts[roomId] || {};
    try {
      await api.json(`/api/budget/room/${roomId}`, "PUT", {
        amount: Number(draft.amount || 0), notes: draft.notes || ""
      });
      await load();
    } catch (err) { fail(err); }
  }

  async function activate(id) {
    try { await api.json(`/api/budget/scenarios/${id}/activate`, "POST", {}); await load(); }
    catch (err) { fail(err); }
  }

  async function removeScenario(id) {
    try { await api.del(`/api/budget/scenarios/${id}`); await load(); }
    catch (err) { fail(err); }
  }

  const setDraft = (roomId, key, value) =>
    setDrafts((d) => ({ ...d, [roomId]: { ...d[roomId], [key]: value } }));

  // Map overview room spend by room_id for the per-room table.
  const spentByRoom = {};
  (overview?.rooms || []).forEach((r) => { spentByRoom[r.room_id] = r.spent; });

  const stats = overview ? [
    { label: "Budget", value: money(overview.budget_total) },
    { label: "Besteed", value: money(overview.spent) },
    { label: "Restant", value: money(overview.remaining), red: Number(overview.remaining || 0) < 0 },
    { label: "Marge", value: money(overview.margin_total) },
    { label: "Btw", value: money(overview.vat_total) }
  ] : [];

  return (
    <div className="content content-wide rise">
      <SectionHead kicker="Investering — Budgetoverzicht"
        title="Inzicht in budget, besteding en marge"
        sub="Een transparant overzicht van het budget per ruimte, de werkelijke besteding en de scenario's die je met de klant kunt bespreken." />

      {!overview ? (
        <div className="empty"><p className="body" style={{ margin: 0 }}>Budget wordt geladen…</p></div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-3" style={{ marginBottom: 56 }}>
            {stats.map((s) => (
              <div className="card" key={s.label} style={{ padding: 24 }}>
                <Kicker style={{ marginBottom: 10 }}>{s.label}</Kicker>
                <div className="serif" style={{ fontSize: 30, color: s.red ? "var(--danger, #b3261e)" : "var(--ink)" }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Per-room budget table */}
          <div className="hr" style={{ margin: "0 0 24px" }} />
          <div className="row between middle" style={{ marginBottom: 18 }}>
            <h3 className="serif" style={{ fontSize: 24, margin: 0 }}>Budget per ruimte</h3>
            {overview.active_scenario && <span className="caption">Actief scenario — {overview.active_scenario}</span>}
          </div>

          {rooms.length === 0 ? (
            <div className="empty"><p className="body" style={{ margin: 0 }}>Nog geen ruimtes om een budget aan toe te kennen.</p></div>
          ) : (
            <div className="card" style={{ padding: 8 }}>
              {rooms.map((r) => {
                const draft = drafts[r.room_id] || {};
                return (
                  <div key={r.room_id} className="row middle" style={{ gap: 18, padding: "14px 14px", borderBottom: "1px solid var(--line)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="serif" style={{ fontSize: 18 }}>{r.room_name}</div>
                      {r.notes && <div className="caption" style={{ marginTop: 2 }}>{r.notes}</div>}
                    </div>
                    <Field label="Budget">
                      <input type="number" min="0" value={draft.amount}
                        onChange={(e) => setDraft(r.room_id, "amount", e.target.value)} style={{ width: 140 }} />
                    </Field>
                    <div className="col" style={{ flex: "none", width: 130, textAlign: "right" }}>
                      <span className="caption">Besteed</span>
                      <span className="mono" style={{ fontSize: 16 }}>{money(spentByRoom[r.room_id])}</span>
                    </div>
                    <button className="btn btn-clay" style={{ padding: "8px 12px", flex: "none" }} onClick={() => saveRoom(r.room_id)}>
                      <Icon name="check" size={14} /> Opslaan
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Scenarios */}
          <div className="hr" style={{ margin: "48px 0 24px" }} />
          <div className="row between middle" style={{ marginBottom: 18 }}>
            <h3 className="serif" style={{ fontSize: 24, margin: 0 }}>Scenario's</h3>
            <button className="btn btn-clay" onClick={() => setAdding(true)}>
              <Icon name="plus" size={15} /> Scenario toevoegen
            </button>
          </div>

          {scenarios.length === 0 ? (
            <div className="empty"><p className="body" style={{ margin: 0 }}>Nog geen scenario's. Voeg er een toe om varianten te vergelijken.</p></div>
          ) : (
            <div className="grid grid-3">
              {scenarios.map((sc) => (
                <div key={sc.id} className="card" style={{ padding: 22, display: "flex", flexDirection: "column" }}>
                  <div className="row between middle" style={{ marginBottom: 12 }}>
                    <h4 className="serif" style={{ fontSize: 20, margin: 0 }}>{sc.name}</h4>
                    {sc.is_active && <span className="tag tag-clay">Actief</span>}
                  </div>
                  <div className="serif" style={{ fontSize: 26, marginBottom: 14 }}>{money(lineTotal(sc.lines))}</div>
                  <div className="col gap2" style={{ marginBottom: 18 }}>
                    {(sc.lines || []).map((l, i) => (
                      <div key={i} className="row between" style={{ fontSize: 13.5 }}>
                        <span className="caption">{l.label}</span>
                        <span className="mono">{money(l.amount)}</span>
                      </div>
                    ))}
                    {(sc.lines || []).length === 0 && <span className="caption">Geen posten.</span>}
                  </div>
                  <div className="row gap2 between middle" style={{ marginTop: "auto" }}>
                    {sc.is_active
                      ? <span className="caption">Dit scenario is actief.</span>
                      : <button className="btn btn-ghost" style={{ padding: "8px 12px" }} onClick={() => activate(sc.id)}>
                          <Icon name="check" size={14} /> Activeer
                        </button>}
                    <button className="btn btn-danger" style={{ padding: "8px 10px" }} onClick={() => removeScenario(sc.id)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {adding && <ScenarioDrawer ctx={ctx} onClose={() => setAdding(false)} onSaved={load} />}
    </div>
  );
}
