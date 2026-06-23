import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { SectionHead, Kicker } from "../components/primitives.jsx";
import { EditDrawer, Field } from "../components/EditDrawer.jsx";
import { LessonDrawer, LessonList } from "./Lessons.jsx";

// Compact Dutch date — e.g. "9 jun 2026". Falls back to the raw value.
function fmtDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

const TASK_COLUMNS = [
  { status: "todo", label: "Te doen" },
  { status: "doing", label: "Bezig" },
  { status: "done", label: "Klaar" }
];
const NEXT_STATUS = { todo: "doing", doing: "done", done: "todo" };
const TASK_DOT = { todo: "var(--ink-2)", doing: "var(--clay)", done: "var(--sage)" };

const DOC_KINDS = [
  { value: "contract", label: "Contract" },
  { value: "invoice", label: "Factuur" },
  { value: "other", label: "Overig" }
];
const docKindLabel = (k) => DOC_KINDS.find((x) => x.value === k)?.label || k || "Document";

export function PlanningScreen({ ctx }) {
  const { project, fail } = ctx;
  const pid = project.id;

  const [tasks, setTasks] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [lessons, setLessons] = useState([]);

  // Inline add forms.
  const [newTask, setNewTask] = useState({ title: "", due_date: "" });
  const [newMilestone, setNewMilestone] = useState({ title: "", target_date: "" });
  const [docOpen, setDocOpen] = useState(false);
  const [lessonDrawer, setLessonDrawer] = useState(null);

  async function loadTimeline() {
    try { setTimeline(await api.get(`/api/planning/timeline/project/${pid}`)); } catch (err) { fail(err); }
  }
  async function loadTasks() {
    try {
      setTasks(await api.get(`/api/planning/tasks/project/${pid}`));
      await loadTimeline();
    } catch (err) { fail(err); }
  }
  async function loadMilestones() {
    try {
      setMilestones(await api.get(`/api/planning/milestones/project/${pid}`));
      await loadTimeline();
    } catch (err) { fail(err); }
  }
  async function loadDocuments() {
    try { setDocuments(await api.get(`/api/planning/documents/project/${pid}`)); } catch (err) { fail(err); }
  }
  async function loadLessons() {
    try { setLessons(await api.get(`/api/lessons?project_id=${encodeURIComponent(pid)}`)); } catch (err) { fail(err); }
  }

  useEffect(() => {
    if (!pid) return;
    loadTasks();
    loadMilestones();
    loadDocuments();
    loadLessons();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [pid]);

  /* ---- Taken ---- */
  async function addTask() {
    const title = newTask.title.trim();
    if (!title) return;
    try {
      await api.json("/api/planning/tasks", "POST", {
        project_id: pid, title, status: "todo",
        due_date: newTask.due_date || null,
        linked_proposal_status: null, sort_order: tasks.length
      });
      setNewTask({ title: "", due_date: "" });
      await loadTasks();
    } catch (err) { fail(err); }
  }
  async function cycleTask(t) {
    try { await api.json(`/api/planning/tasks/${t.id}`, "PUT", { status: NEXT_STATUS[t.status] || "doing" }); await loadTasks(); }
    catch (err) { fail(err); }
  }
  async function removeTask(id) {
    try { await api.del(`/api/planning/tasks/${id}`); await loadTasks(); } catch (err) { fail(err); }
  }

  /* ---- Mijlpalen ---- */
  async function addMilestone() {
    const title = newMilestone.title.trim();
    if (!title) return;
    try {
      await api.json("/api/planning/milestones", "POST", {
        project_id: pid, title,
        target_date: newMilestone.target_date || null,
        done: false, sort_order: milestones.length
      });
      setNewMilestone({ title: "", target_date: "" });
      await loadMilestones();
    } catch (err) { fail(err); }
  }
  async function toggleMilestone(m) {
    try { await api.json(`/api/planning/milestones/${m.id}`, "PUT", { done: !m.done }); await loadMilestones(); }
    catch (err) { fail(err); }
  }
  async function removeMilestone(id) {
    try { await api.del(`/api/planning/milestones/${id}`); await loadMilestones(); } catch (err) { fail(err); }
  }

  /* ---- Documenten ---- */
  async function removeDocument(id) {
    try { await api.del(`/api/planning/documents/${id}`); await loadDocuments(); } catch (err) { fail(err); }
  }

  return (
    <div className="content content-wide rise">
      <div className="page-head">
        <div><Kicker style={{ marginBottom: 14 }}>Projectplanning</Kicker><h1 className="page-title">Planning</h1></div>
        <button className="btn btn-primary btn-lg" onClick={() => setDocOpen(true)}><Icon name="upload" size={16} /> Document toevoegen</button>
      </div>

      {/* ---- Tijdlijn ---- */}
      <SectionHead kicker="Overzicht" title="Tijdlijn"
        sub="Taken met einddatum en mijlpalen, chronologisch samengevoegd." />
      {timeline.length === 0 ? (
        <div className="empty"><p className="body" style={{ margin: 0 }}>Nog geen tijdlijn. Voeg taken met een einddatum of mijlpalen toe.</p></div>
      ) : (
        <div className="card" style={{ padding: "8px 24px" }}>
          <div className="col">
            {timeline.map((ev) => {
              const isDone = ev.type === "milestone" ? ev.done : ev.status === "done";
              const dotColor = ev.type === "milestone"
                ? (ev.done ? "var(--sage)" : "var(--clay)")
                : (TASK_DOT[ev.status] || "var(--ink-2)");
              return (
                <div key={`${ev.type}-${ev.id}`} className="row middle between" style={{ gap: 16, padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
                  <div className="row gap3 middle" style={{ minWidth: 0 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 99, background: dotColor, flex: "none" }} />
                    <Icon name={ev.type === "milestone" ? "star" : "check"} size={15} stroke={1.5} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, textDecoration: isDone ? "line-through" : "none", color: isDone ? "var(--muted)" : "inherit" }}>{ev.title}</div>
                      <div className="caption mono">{fmtDate(ev.date) || "Geen datum"}</div>
                    </div>
                  </div>
                  <span className={`tag ${ev.type === "milestone" ? "tag-clay" : ""}`}>{ev.type === "milestone" ? "Mijlpaal" : "Taak"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <hr className="hr" style={{ margin: "56px 0 40px" }} />

      {/* ---- Taken ---- */}
      <SectionHead kicker="Werk" title="Taken"
        sub="Klik op een taak om de status te wisselen — Te doen → Bezig → Klaar." />
      <div className="form-grid form-grid-2" style={{ gridTemplateColumns: "1fr 200px auto", maxWidth: 720, marginBottom: 32 }}>
        <input value={newTask.title} onChange={(e) => setNewTask((f) => ({ ...f, title: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter") addTask(); }} placeholder="Nieuwe taak…" />
        <input type="date" value={newTask.due_date} onChange={(e) => setNewTask((f) => ({ ...f, due_date: e.target.value }))} />
        <button type="button" className="btn btn-clay" onClick={addTask} style={{ justifyContent: "center" }}>
          <Icon name="plus" size={15} /> Taak toevoegen
        </button>
      </div>
      <div className="grid grid-3">
        {TASK_COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.status);
          return (
            <div key={col.status} className="card" style={{ padding: "16px 18px 18px" }}>
              <div className="row between middle" style={{ marginBottom: 12 }}>
                <Kicker>{col.label}</Kicker>
                <span className="caption mono">{colTasks.length}</span>
              </div>
              <div className="col gap2">
                {colTasks.map((t) => (
                  <div key={t.id} className="row middle between" style={{ gap: 10, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                    <button type="button" className="row gap2 middle" onClick={() => cycleTask(t)}
                      title="Wissel status" style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer", minWidth: 0, flex: 1 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 99, background: TASK_DOT[t.status] || "var(--ink-2)", flex: "none" }} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontWeight: 600, fontSize: 13.5, textDecoration: t.status === "done" ? "line-through" : "none", color: t.status === "done" ? "var(--muted)" : "inherit" }}>{t.title}</span>
                        {t.due_date && <span className="caption mono">{fmtDate(t.due_date)}</span>}
                      </span>
                    </button>
                    <button className="btn btn-danger" style={{ padding: "6px 9px" }} onClick={() => removeTask(t.id)}><Icon name="trash" size={13} /></button>
                  </div>
                ))}
                {colTasks.length === 0 && <p className="caption" style={{ margin: "4px 0 0" }}>Geen taken.</p>}
              </div>
            </div>
          );
        })}
      </div>

      <hr className="hr" style={{ margin: "56px 0 40px" }} />

      {/* ---- Mijlpalen ---- */}
      <SectionHead kicker="Markeringen" title="Mijlpalen"
        sub="Sleutelmomenten in het project — vink af zodra ze behaald zijn." />
      <div className="form-grid form-grid-2" style={{ gridTemplateColumns: "1fr 200px auto", maxWidth: 720, marginBottom: 32 }}>
        <input value={newMilestone.title} onChange={(e) => setNewMilestone((f) => ({ ...f, title: e.target.value }))}
          onKeyDown={(e) => { if (e.key === "Enter") addMilestone(); }} placeholder="Nieuwe mijlpaal…" />
        <input type="date" value={newMilestone.target_date} onChange={(e) => setNewMilestone((f) => ({ ...f, target_date: e.target.value }))} />
        <button type="button" className="btn btn-clay" onClick={addMilestone} style={{ justifyContent: "center" }}>
          <Icon name="plus" size={15} /> Mijlpaal toevoegen
        </button>
      </div>
      {milestones.length === 0 ? (
        <div className="empty"><p className="body" style={{ margin: 0 }}>Nog geen mijlpalen.</p></div>
      ) : (
        <div className="card" style={{ padding: "8px 24px" }}>
          <div className="col">
            {milestones.map((m) => (
              <div key={m.id} className="row middle between" style={{ gap: 16, padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
                <div className="row gap3 middle" style={{ minWidth: 0 }}>
                  <button type="button" onClick={() => toggleMilestone(m)} aria-label="Afvinken"
                    style={{ width: 22, height: 22, borderRadius: 6, flex: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1.5px solid var(--line-2)", background: m.done ? "var(--sage)" : "transparent", color: m.done ? "#fff" : "transparent" }}>
                    <Icon name="check" size={14} />
                  </button>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, textDecoration: m.done ? "line-through" : "none", color: m.done ? "var(--muted)" : "inherit" }}>{m.title}</div>
                    {m.target_date && <div className="caption mono">{fmtDate(m.target_date)}</div>}
                  </div>
                </div>
                <button className="btn btn-danger" style={{ padding: "6px 10px" }} onClick={() => removeMilestone(m.id)}><Icon name="trash" size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      <hr className="hr" style={{ margin: "56px 0 40px" }} />

      {/* ---- Lessen ---- */}
      <SectionHead kicker="Retrospective" title="Lessen"
        sub="Leg vast wat werkte, wat misliep en wat opnieuw bruikbaar is."
        right={<button className="btn btn-clay" onClick={() => setLessonDrawer({})}><Icon name="plus" size={15} /> Les toevoegen</button>} />
      <LessonList lessons={lessons} onEdit={setLessonDrawer}
        emptyAction={<button className="btn btn-clay" onClick={() => setLessonDrawer({})}><Icon name="plus" size={15} /> Eerste les</button>} />

      <hr className="hr" style={{ margin: "56px 0 40px" }} />

      {/* ---- Documenten ---- */}
      <SectionHead kicker="Dossier" title="Documenten"
        sub="Contracten, facturen en overige bestanden bij dit project."
        right={<button className="btn btn-clay" onClick={() => setDocOpen(true)}><Icon name="upload" size={15} /> Uploaden</button>} />
      {documents.length === 0 ? (
        <div className="empty"><p className="body" style={{ margin: 0 }}>Nog geen documenten. Voeg een contract of factuur toe via <b>Uploaden</b>.</p></div>
      ) : (
        <div className="card" style={{ padding: "8px 24px" }}>
          <div className="col">
            {documents.map((d) => (
              <div key={d.id} className="row middle between" style={{ gap: 16, padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
                <div className="row gap3 middle" style={{ minWidth: 0 }}>
                  <Icon name="doc" size={18} stroke={1.5} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{d.title || "Document"}</div>
                    <span className="tag tag-clay">{docKindLabel(d.kind)}</span>
                  </div>
                </div>
                <div className="row gap2 middle">
                  {d.url && <a className="btn btn-ghost" style={{ padding: "6px 10px" }} href={d.url} download target="_blank" rel="noreferrer"><Icon name="download" size={14} /> Download</a>}
                  <button className="btn btn-danger" style={{ padding: "6px 10px" }} onClick={() => removeDocument(d.id)}><Icon name="trash" size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {docOpen && <DocumentDrawer ctx={ctx} onClose={() => setDocOpen(false)} onSaved={loadDocuments} />}
      {lessonDrawer && <LessonDrawer lesson={lessonDrawer.id ? lessonDrawer : null} projectId={pid} onClose={() => setLessonDrawer(null)} onSaved={loadLessons} fail={fail} />}
    </div>
  );
}

function DocumentDrawer({ ctx, onClose, onSaved }) {
  const { project, fail } = ctx;
  const [form, setForm] = useState({ kind: "contract", title: "" });
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!file) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("project_id", project.id);
      fd.append("kind", form.kind);
      fd.append("title", form.title);
      fd.append("file", file);
      await api.form("/api/planning/documents", fd);
      await onSaved();
      onClose();
    } catch (err) { fail(err); setSaving(false); }
  }

  return (
    <EditDrawer open title="Document toevoegen" onClose={onClose} onSave={save} saving={saving} saveLabel="Uploaden">
      <div className="form-grid">
        <Field label="Type">
          <select value={form.kind} onChange={set("kind")}>
            {DOC_KINDS.map((k) => (<option key={k.value} value={k.value}>{k.label}</option>))}
          </select>
        </Field>
        <Field label="Titel"><input value={form.title} onChange={set("title")} placeholder="Opdrachtbevestiging — fase 1" /></Field>
        <Field label="Bestand"><input type="file" onChange={(e) => setFile(e.target.files[0])} /></Field>
      </div>
    </EditDrawer>
  );
}
