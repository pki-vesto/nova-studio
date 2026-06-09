import { useState } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { SectionHead, Kicker } from "../components/primitives.jsx";
import { Field } from "../components/EditDrawer.jsx";

// Parses a JSON array column defensively — returns [] on any malformed value.
function parseList(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

const TEXT_FIELDS = [
  "household", "wishes", "room_use", "style_preferences", "color_preferences",
  "budget_indication", "existing_furniture", "constraints", "free_notes", "scope_estimate"
];

function initForm(intake) {
  const i = intake || {};
  const form = {};
  for (const k of TEXT_FIELDS) form[k] = i[k] || "";
  // Prefer pre-parsed arrays from GET /api/intake/:id, fall back to *_json columns.
  form.risks = (Array.isArray(i.risks) ? i.risks : parseList(i.risks_json)).join("\n");
  form.followups = (Array.isArray(i.followups) ? i.followups : parseList(i.followups_json)).join("\n");
  return form;
}

export function Intake({ ctx }) {
  const { project, reload, fail } = ctx;
  const intake = project.intake || {};
  const [form, setForm] = useState(() => initForm(intake));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const toList = (s) => (s || "").split("\n").map((l) => l.trim()).filter(Boolean);

  async function save() {
    setSaving(true);
    try {
      const payload = {};
      for (const k of TEXT_FIELDS) payload[k] = form[k];
      payload.risks = toList(form.risks);
      payload.followups = toList(form.followups);
      await api.json(`/api/intake/${project.id}`, "PUT", payload);
      await reload();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="content content-wide rise">
      <SectionHead
        kicker="Intake"
        title="Vraag & context"
        sub="Leg de wensen, het gebruik en de randvoorwaarden van de opdrachtgever vast — de basis voor het hele advies."
      />

      {intake.ai_summary && (
        <div className="card" style={{ padding: 28, marginBottom: 40, background: "var(--paper-2, var(--card))", borderLeft: "3px solid var(--clay)" }}>
          <div className="row gap2 middle" style={{ marginBottom: 10 }}>
            <Icon name="spark" size={16} />
            <Kicker>AI-samenvatting</Kicker>
          </div>
          <p className="body serif" style={{ margin: 0, fontSize: 17, lineHeight: 1.55 }}>{intake.ai_summary}</p>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="form-grid">
          <div className="form-grid form-grid-2">
            <Field label="Huishouden">
              <input value={form.household} onChange={set("household")} placeholder="Stel met twee jonge kinderen" />
            </Field>
            <Field label="Gebruik van ruimtes">
              <input value={form.room_use} onChange={set("room_use")} placeholder="Open keuken, werkhoek, logeerkamer" />
            </Field>
          </div>

          <Field label="Wensen">
            <textarea value={form.wishes} onChange={set("wishes")} rows={4} placeholder="Wat wil de opdrachtgever bereiken?" />
          </Field>

          <div className="form-grid form-grid-2">
            <Field label="Stijlvoorkeuren">
              <input value={form.style_preferences} onChange={set("style_preferences")} placeholder="Warm minimalisme, natuurlijke materialen" />
            </Field>
            <Field label="Kleurvoorkeuren">
              <input value={form.color_preferences} onChange={set("color_preferences")} placeholder="Aardetinten, gebroken wit" />
            </Field>
            <Field label="Budgetindicatie">
              <input value={form.budget_indication} onChange={set("budget_indication")} placeholder="€ 25.000 – € 35.000" />
            </Field>
            <Field label="Bestaand meubilair">
              <input value={form.existing_furniture} onChange={set("existing_furniture")} placeholder="Eettafel en boekenkast blijven" />
            </Field>
          </div>

          <Field label="Randvoorwaarden">
            <textarea value={form.constraints} onChange={set("constraints")} rows={3} placeholder="Huurwoning, geen ingrepen aan vaste kast, deadline najaar" />
          </Field>

          <Field label="Vrije notities">
            <textarea value={form.free_notes} onChange={set("free_notes")} rows={3} placeholder="Overige observaties uit het gesprek" />
          </Field>

          <Field label="Scope-inschatting">
            <textarea value={form.scope_estimate} onChange={set("scope_estimate")} rows={3} placeholder="Omvang van het advies en de verwachte werkzaamheden" />
          </Field>

          <div className="hr" style={{ margin: "8px 0" }} />

          <div className="form-grid form-grid-2">
            <Field label="Risico's (één per regel)">
              <textarea value={form.risks} onChange={set("risks")} rows={5} placeholder={"Levertijd maatwerk onzeker\nVloer mogelijk niet egaal"} />
            </Field>
            <Field label="Vervolgvragen (één per regel)">
              <textarea value={form.followups} onChange={set("followups")} rows={5} placeholder={"Exacte maten trapgat opvragen\nVoorkeur verlichting bevestigen"} />
            </Field>
          </div>
        </div>

        <div className="row between middle" style={{ marginTop: 32 }}>
          <span className="caption">Wijzigingen worden direct bewaard bij het project.</span>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            <Icon name="check" size={16} /> {saving ? "Bezig…" : "Intake opslaan"}
          </button>
        </div>
      </form>
    </div>
  );
}
