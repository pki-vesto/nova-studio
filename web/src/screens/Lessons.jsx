import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { EmptyState, Kicker, SectionHead } from "../components/primitives.jsx";
import { EditDrawer, Field } from "../components/EditDrawer.jsx";

export const LESSON_CATEGORIES = [
  ["proces", "Proces"],
  ["leverancier", "Leverancier"],
  ["materiaal", "Materiaal"],
  ["product", "Product"],
  ["budget", "Budget"],
  ["klant", "Klant"],
  ["overig", "Overig"]
];
export const LESSON_SENTIMENTS = [
  ["positief", "Positief"],
  ["neutraal", "Neutraal"],
  ["negatief", "Negatief"]
];

export const categoryLabel = (value) => LESSON_CATEGORIES.find(([v]) => v === value)?.[1] || value || "Overig";
export const sentimentLabel = (value) => LESSON_SENTIMENTS.find(([v]) => v === value)?.[1] || value || "Neutraal";

function tagsText(tags) {
  return (Array.isArray(tags) ? tags : []).join(", ");
}

function parseTags(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function LessonDrawer({ lesson, projectId, projects = [], onClose, onSaved, fail }) {
  const [form, setForm] = useState({
    project_id: lesson?.project_id || projectId || "",
    category: lesson?.category || "overig",
    title: lesson?.title || "",
    body: lesson?.body || "",
    sentiment: lesson?.sentiment || "neutraal",
    tags: tagsText(lesson?.tags)
  });
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save() {
    if (!form.title.trim() || !form.project_id) return;
    setSaving(true);
    try {
      const payload = {
        project_id: form.project_id,
        category: form.category,
        title: form.title.trim(),
        body: form.body,
        sentiment: form.sentiment,
        tags: parseTags(form.tags)
      };
      if (lesson?.id) await api.json(`/api/lessons/${lesson.id}`, "PUT", payload);
      else await api.json("/api/lessons", "POST", payload);
      await onSaved();
      onClose();
    } catch (err) { fail(err); setSaving(false); }
  }

  async function remove() {
    if (!lesson?.id) return;
    setSaving(true);
    try {
      await api.del(`/api/lessons/${lesson.id}`);
      await onSaved();
      onClose();
    } catch (err) { fail(err); setSaving(false); }
  }

  return (
    <EditDrawer open title={lesson?.id ? "Les bewerken" : "Les toevoegen"} onClose={onClose} onSave={save} saving={saving}>
      <div className="form-grid">
        {!projectId && (
          <Field label="Project">
            <select value={form.project_id} onChange={set("project_id")}>
              <option value="">Kies project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </Field>
        )}
        <div className="form-grid form-grid-2">
          <Field label="Categorie">
            <select value={form.category} onChange={set("category")}>
              {LESSON_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Sentiment">
            <select value={form.sentiment} onChange={set("sentiment")}>
              {LESSON_SENTIMENTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Titel"><input value={form.title} onChange={set("title")} placeholder="Wat nemen we mee naar volgende projecten?" /></Field>
        <Field label="Les"><textarea rows={7} value={form.body} onChange={set("body")} placeholder="Context, keuze, resultaat en valkuilen." /></Field>
        <Field label="Tags"><input value={form.tags} onChange={set("tags")} placeholder="eik, levertijd, maatwerk" /></Field>
        {lesson?.id && (
          <button type="button" className="btn btn-danger" onClick={remove} disabled={saving} style={{ justifyContent: "center" }}>
            <Icon name="trash" size={14} /> Verwijderen
          </button>
        )}
      </div>
    </EditDrawer>
  );
}

export function LessonList({ lessons, onEdit, emptyAction }) {
  if (!lessons.length) {
    return <EmptyState compact title="Nog geen lessen gevonden" body="Leg keuzes, resultaten en valkuilen vast zodat ze bij volgend werk terugkomen." action={emptyAction} />;
  }
  return (
    <div className="card" style={{ padding: "8px 24px" }}>
      <div className="col">
        {lessons.map((lesson) => (
          <button key={lesson.id} type="button" onClick={() => onEdit(lesson)}
            style={{ textAlign: "left", background: "transparent", border: 0, borderBottom: "1px solid var(--line)", padding: "16px 0", cursor: "pointer" }}>
            <div className="row between gap3" style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div className="row gap2 wrap" style={{ marginBottom: 8 }}>
                  <span className="tag tag-clay">{categoryLabel(lesson.category)}</span>
                  <span className="tag">{sentimentLabel(lesson.sentiment)}</span>
                  {lesson.project_label && <span className="tag">{lesson.project_label}</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)" }}>{lesson.title}</div>
                {lesson.body && <div className="caption" style={{ marginTop: 5, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{lesson.body}</div>}
              </div>
              <Icon name="edit" size={14} />
            </div>
            {Array.isArray(lesson.tags) && lesson.tags.length > 0 && (
              <div className="row gap2 wrap" style={{ marginTop: 10 }}>
                {lesson.tags.map((tag) => <span key={tag} className="caption mono">#{tag}</span>)}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Lessons({ ctx }) {
  const { fail, projects, loadProjectList } = ctx;
  const [lessons, setLessons] = useState([]);
  const [filters, setFilters] = useState({ q: "", category: "", tag: "" });
  const [drawer, setDrawer] = useState(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.category) params.set("category", filters.category);
    if (filters.tag.trim()) params.set("tag", filters.tag.trim());
    try { setLessons(await api.get(`/api/lessons?${params.toString()}`)); }
    catch (err) { fail(err); }
  }, [fail, filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!projects?.length) loadProjectList?.().catch(fail); }, [projects, loadProjectList, fail]);

  const setFilter = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="content content-wide rise">
      <div className="page-head">
        <div><Kicker style={{ marginBottom: 14 }}>Projectkennis</Kicker><h1 className="page-title">Lessen</h1></div>
        <button className="btn btn-primary btn-lg" onClick={() => setDrawer({})}><Icon name="plus" size={16} /> Les toevoegen</button>
      </div>

      <SectionHead kicker="Terugvinden" title="Lessen over projecten heen"
        sub="Zoek op titel, inhoud of tag en filter op categorie voor hergebruik bij nieuw werk." />
      <div className="form-grid" style={{ gridTemplateColumns: "minmax(220px, 1fr) 180px 180px auto", marginBottom: 28 }}>
        <input value={filters.q} onChange={setFilter("q")} placeholder="Zoek lessen…" />
        <select value={filters.category} onChange={setFilter("category")}>
          <option value="">Alle categorieen</option>
          {LESSON_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input value={filters.tag} onChange={setFilter("tag")} placeholder="Tag" />
        <button className="btn btn-ghost" onClick={() => setFilters({ q: "", category: "", tag: "" })}><Icon name="close" size={14} /> Wis</button>
      </div>

      <LessonList lessons={lessons} onEdit={setDrawer}
        emptyAction={<button className="btn btn-clay" onClick={() => setDrawer({})}><Icon name="plus" size={15} /> Eerste les</button>} />

      {drawer && <LessonDrawer lesson={drawer.id ? drawer : null} projects={projects} onClose={() => setDrawer(null)} onSaved={load} fail={fail} />}
    </div>
  );
}
