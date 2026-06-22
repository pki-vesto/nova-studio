import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { SectionHead, Kicker } from "../components/primitives.jsx";
import { EditDrawer, Field } from "../components/EditDrawer.jsx";

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
const QUESTION_DEFAULTS = [
  { key: "household", label: "Huishouden", placeholder: "Stel met twee jonge kinderen", input_type: "input", sort_order: 10, is_enabled: true },
  { key: "room_use", label: "Gebruik van ruimtes", placeholder: "Open keuken, werkhoek, logeerkamer", input_type: "input", sort_order: 20, is_enabled: true },
  { key: "wishes", label: "Wensen", placeholder: "Wat wil de opdrachtgever bereiken?", input_type: "textarea", sort_order: 30, is_enabled: true },
  { key: "style_preferences", label: "Stijlvoorkeuren", placeholder: "Warm minimalisme, natuurlijke materialen", input_type: "input", sort_order: 40, is_enabled: true },
  { key: "color_preferences", label: "Kleurvoorkeuren", placeholder: "Aardetinten, gebroken wit", input_type: "input", sort_order: 50, is_enabled: true },
  { key: "budget_indication", label: "Budgetindicatie", placeholder: "€ 25.000 – € 35.000", input_type: "input", sort_order: 60, is_enabled: true },
  { key: "existing_furniture", label: "Bestaand meubilair", placeholder: "Eettafel en boekenkast blijven", input_type: "input", sort_order: 70, is_enabled: true },
  { key: "constraints", label: "Randvoorwaarden", placeholder: "Huurwoning, geen ingrepen aan vaste kast, deadline najaar", input_type: "textarea", sort_order: 80, is_enabled: true },
  { key: "free_notes", label: "Vrije notities", placeholder: "Overige observaties uit het gesprek", input_type: "textarea", sort_order: 90, is_enabled: true },
  { key: "scope_estimate", label: "Scope-inschatting", placeholder: "Omvang van het advies en de verwachte werkzaamheden", input_type: "textarea", sort_order: 100, is_enabled: true },
  { key: "risks", label: "Risico's", placeholder: "Levertijd maatwerk onzeker\nVloer mogelijk niet egaal", input_type: "list", sort_order: 110, is_enabled: true },
  { key: "followups", label: "Vervolgvragen", placeholder: "Exacte maten trapgat opvragen\nVoorkeur verlichting bevestigen", input_type: "list", sort_order: 120, is_enabled: true }
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

function orderedQuestions(questions) {
  const rows = Array.isArray(questions) && questions.length ? questions : QUESTION_DEFAULTS;
  return [...rows].sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
}

function QuestionnaireDrawer({ questions, fail, onClose, onSaved }) {
  const [rows, setRows] = useState(() => orderedQuestions(questions));
  const [saving, setSaving] = useState(false);

  function setRow(index, key, value) {
    setRows((current) => current.map((row, i) => i === index ? { ...row, [key]: value } : row));
  }
  async function save() {
    setSaving(true);
    try {
      const saved = await api.json("/api/intake/questionnaire", "PUT", { questions: rows });
      await onSaved(saved);
      onClose();
    } catch (err) { fail(err); }
    finally { setSaving(false); }
  }

  return (
    <EditDrawer open title="Intakevragen configureren" onClose={onClose} onSave={save} saving={saving}>
      <div className="col gap3">
        {rows.map((row, index) => (
          <div key={row.key} className="card" style={{ padding: 14 }}>
            <div className="row between middle wrap" style={{ gap: 10, marginBottom: 10 }}>
              <strong style={{ fontSize: 13 }}>{row.key}</strong>
              <label className="row gap2 middle" style={{ cursor: "pointer", fontSize: 12 }}>
                <input type="checkbox" checked={!!row.is_enabled} onChange={(e) => setRow(index, "is_enabled", e.target.checked)} style={{ width: "auto" }} />
                Actief
              </label>
            </div>
            <div className="form-grid form-grid-2">
              <Field label="Label"><input value={row.label || ""} onChange={(e) => setRow(index, "label", e.target.value)} /></Field>
              <Field label="Volgorde"><input type="number" value={row.sort_order ?? index * 10} onChange={(e) => setRow(index, "sort_order", Number(e.target.value) || 0)} /></Field>
            </div>
            <Field label="Placeholder"><textarea value={row.placeholder || ""} onChange={(e) => setRow(index, "placeholder", e.target.value)} rows={2} /></Field>
          </div>
        ))}
      </div>
    </EditDrawer>
  );
}

export function Intake({ ctx }) {
  const { project, reload, fail } = ctx;
  const intake = project.intake || {};
  const [form, setForm] = useState(() => initForm(intake));
  const [questions, setQuestions] = useState(QUESTION_DEFAULTS);
  const [configOpen, setConfigOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const toList = (s) => (s || "").split("\n").map((l) => l.trim()).filter(Boolean);

  useEffect(() => {
    let cancelled = false;
    api.get("/api/intake/questionnaire")
      .then((rows) => { if (!cancelled) setQuestions(orderedQuestions(rows)); })
      .catch(fail);
    return () => { cancelled = true; };
  }, [fail]);

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
        right={<button className="btn btn-ghost no-print" onClick={() => setConfigOpen(true)}><Icon name="settings" size={15} /> Vragen</button>}
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
          {orderedQuestions(questions).filter((q) => q.is_enabled !== false).map((q) => (
            <Field key={q.key} label={q.input_type === "list" ? `${q.label} (één per regel)` : q.label}>
              {q.input_type === "input"
                ? <input value={form[q.key] || ""} onChange={set(q.key)} placeholder={q.placeholder || ""} />
                : <textarea value={form[q.key] || ""} onChange={set(q.key)} rows={q.input_type === "list" ? 5 : 3} placeholder={q.placeholder || ""} />}
            </Field>
          ))}
        </div>

        <div className="row between middle" style={{ marginTop: 32 }}>
          <span className="caption">Wijzigingen worden direct bewaard bij het project.</span>
          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>
            <Icon name="check" size={16} /> {saving ? "Bezig…" : "Intake opslaan"}
          </button>
        </div>
      </form>

      {configOpen && (
        <QuestionnaireDrawer
          questions={questions}
          fail={fail}
          onClose={() => setConfigOpen(false)}
          onSaved={(rows) => setQuestions(orderedQuestions(rows))}
        />
      )}
    </div>
  );
}
