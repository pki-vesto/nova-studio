// AI-atelier — project-scoped AI assistant with human-in-the-loop review.
import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { SectionHead, Kicker } from "../components/primitives.jsx";
import { Field } from "../components/EditDrawer.jsx";

// Flow value → Dutch label, in display order.
const FLOWS = [
  { value: "intake_analysis", label: "Intake-analyse" },
  { value: "proposal_writing", label: "Voorstel schrijven" },
  { value: "product_research", label: "Productresearch" },
  { value: "moodboard_analysis", label: "Moodboard-analyse" },
  { value: "knowledge_retrieval", label: "Kennis-retrieval" }
];
const flowLabel = (value) => FLOWS.find((f) => f.value === value)?.label || value;

// Fallback when the backend tone-preset list cannot be fetched — keeps the
// selector usable in offline / first-render scenarios.
const TONE_FALLBACK = [{ key: "standaard", label: "Standaard" }];

// Review status → Dutch label + brand colour for the tag.
const REVIEW = {
  approved: { label: "Goedgekeurd", color: "var(--sage)" },
  rejected: { label: "Afgewezen", color: "var(--clay)" },
  pending: { label: "Te beoordelen", color: "var(--ink-2)" }
};
function ReviewTag({ status }) {
  const r = REVIEW[status] || REVIEW.pending;
  return (
    <span className="tag" style={{ color: r.color, borderColor: r.color }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: r.color, display: "inline-block", marginRight: 6 }} />
      {r.label}
    </span>
  );
}

function fmtDate(s) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleString("nl-NL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtCost(c) {
  if (c == null) return null;
  const n = Number(c);
  if (isNaN(n)) return null;
  return `€ ${n.toFixed(4)}`;
}

// The output body shared by single cards and the compare view.
function JobBody({ job }) {
  return (
    <>
      <pre className="mono" style={{
        whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
        fontSize: 13, lineHeight: 1.6, color: "var(--ink)"
      }}>{job.output_text || "—"}</pre>
      {Array.isArray(job.sources) && job.sources.length > 0 && (
        <div className="row wrap gap2" style={{ marginTop: 14 }}>
          {job.sources.map((src, i) => (
            <span key={i} className="tag">
              <Icon name="link" size={11} style={{ marginRight: 5 }} />
              {typeof src === "string" ? src : (src.title || src.label || src.url || `Bron ${i + 1}`)}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function JobMeta({ job }) {
  const cost = fmtCost(job.cost);
  const parts = [];
  if (job.tokens_in != null || job.tokens_out != null)
    parts.push(`${job.tokens_in ?? 0} in · ${job.tokens_out ?? 0} uit tokens`);
  if (cost) parts.push(cost);
  if (parts.length === 0) return null;
  return <div className="caption">{parts.join("  ·  ")}</div>;
}

function JobCard({ job, busy, onApprove, onReject, onRegenerate, onDelete }) {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div className="row between middle wrap gap2" style={{ marginBottom: 14 }}>
        <div className="row middle gap3" style={{ minWidth: 0 }}>
          <Icon name="spark" size={16} style={{ color: "var(--clay)" }} />
          <span className="serif" style={{ fontSize: 18 }}>{flowLabel(job.flow)}</span>
          <ReviewTag status={job.review_status} />
        </div>
        <span className="caption">{fmtDate(job.created_at)}</span>
      </div>

      <JobBody job={job} />

      <div className="hr" style={{ margin: "18px 0 14px" }} />

      <div className="row between middle wrap gap2">
        <JobMeta job={job} />
        <div className="row wrap gap2">
          <button className="btn btn-ghost" style={{ padding: "6px 10px" }} disabled={busy} onClick={() => onApprove(job)}>
            <Icon name="check" size={13} /> Goedkeuren
          </button>
          <button className="btn btn-ghost" style={{ padding: "6px 10px" }} disabled={busy} onClick={() => onReject(job)}>
            <Icon name="close" size={13} /> Afwijzen
          </button>
          <button className="btn btn-ghost" style={{ padding: "6px 10px" }} disabled={busy} onClick={() => onRegenerate(job)}>
            <Icon name="history" size={13} /> Opnieuw
          </button>
          <button className="btn btn-danger" style={{ padding: "6px 10px" }} disabled={busy} onClick={() => onDelete(job)}>
            <Icon name="trash" size={13} /> Verwijderen
          </button>
        </div>
      </div>
    </div>
  );
}

export function AiPanel({ ctx }) {
  const { project, fail } = ctx;
  const [settings, setSettings] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState("");        // flow value currently running
  const [busyId, setBusyId] = useState(null);        // job id under review/delete/regenerate
  const [compareFlow, setCompareFlow] = useState(null);
  const [tonePresets, setTonePresets] = useState(TONE_FALLBACK);
  const [tone, setTone] = useState("standaard");

  async function loadJobs() {
    try {
      const list = await api.get(`/api/ai/jobs?project_id=${project.id}`);
      setJobs(Array.isArray(list) ? list : []);
    } catch (err) { fail(err); }
  }

  useEffect(() => {
    let alive = true;
    api.get("/api/ai/settings").then((s) => { if (alive) setSettings(s); }).catch(fail);
    api.get("/api/ai/tone-presets").then((data) => {
      if (!alive) return;
      const list = Array.isArray(data?.presets) && data.presets.length > 0 ? data.presets : TONE_FALLBACK;
      setTonePresets(list);
    }).catch(() => { /* fall back to TONE_FALLBACK already set */ });
    loadJobs();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  async function run(flow) {
    setRunning(flow);
    try {
      await api.json("/api/ai/run", "POST", { flow, project_id: project.id, input, tone });
      setInput("");
      await loadJobs();
    } catch (err) { fail(err); } finally { setRunning(""); }
  }

  async function regenerate(job) {
    setBusyId(job.id);
    try {
      // Preselect the source job's tone when present, so "Opnieuw" keeps the
      // same register the designer originally chose. An explicit override can
      // still be sent by passing `tone` here.
      const body = job && job.tone ? { tone: job.tone } : {};
      const fresh = await api.json(`/api/ai/jobs/${job.id}/regenerate`, "POST", body);
      // Prepend the new job optimistically, then resync from server.
      if (fresh && fresh.id) setJobs((prev) => [fresh, ...prev]);
      await loadJobs();
    } catch (err) { fail(err); } finally { setBusyId(null); }
  }

  async function review(job, review_status) {
    setBusyId(job.id);
    try {
      await api.json(`/api/ai/jobs/${job.id}/review`, "PUT", { review_status });
      await loadJobs();
    } catch (err) { fail(err); } finally { setBusyId(null); }
  }

  async function remove(job) {
    setBusyId(job.id);
    try {
      await api.del(`/api/ai/jobs/${job.id}`);
      await loadJobs();
    } catch (err) { fail(err); } finally { setBusyId(null); }
  }

  // Flows that have at least two jobs can be compared side-by-side.
  const flowCounts = jobs.reduce((acc, j) => { acc[j.flow] = (acc[j.flow] || 0) + 1; return acc; }, {});
  const comparable = FLOWS.filter((f) => (flowCounts[f.value] || 0) >= 2);
  const compareJobs = compareFlow
    ? jobs.filter((j) => j.flow === compareFlow).slice(0, 2)
    : [];

  const localFirst = settings && (!settings.enabled || settings.provider);

  return (
    <div className="content content-wide rise">
      <SectionHead
        kicker="AI-atelier"
        title="Concepten met controle"
        sub="Nova stelt concepten voor; jij houdt de regie. Elke uitkomst beoordeel je vóór je hem gebruikt." />

      {localFirst && (
        <div className="card" style={{ display: "flex", gap: 10, alignItems: "center", padding: "12px 16px", marginBottom: 28 }}>
          <Icon name="lock" size={14} style={{ color: "var(--ink-2)", flex: "none" }} />
          <span className="caption">
            Lokaal-eerst — zonder API-sleutel levert Nova een lokaal concept dat jij reviewt.
            {settings.provider && <> <span className="mono">{settings.provider}{settings.model ? ` · ${settings.model}` : ""}</span></>}
            {settings.privacy_mode && <> · privacymodus actief</>}
          </span>
        </div>
      )}

      {/* Flow launcher */}
      <div className="card" style={{ padding: 24, marginBottom: 40 }}>
        <Kicker style={{ marginBottom: 14 }}>Kies een flow</Kicker>
        <div className="row wrap gap2" style={{ marginBottom: 18 }}>
          {FLOWS.map((f) => (
            <button
              key={f.value}
              className="btn btn-clay"
              disabled={!!running}
              onClick={() => run(f.value)}>
              <Icon name="spark" size={14} />
              {running === f.value ? "Bezig…" : f.label}
            </button>
          ))}
        </div>
        <Field label="Toon">
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            disabled={!!running}>
            {tonePresets.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Extra instructie of vraag">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            placeholder="Bijv. focus op de woonkamer, of houd het voorstel bondig…" />
        </Field>
        {running && <p className="caption" style={{ marginTop: 12 }}>Nova werkt aan “{flowLabel(running)}” — een moment…</p>}
      </div>

      {/* Compare affordance */}
      {comparable.length > 0 && (
        <div className="row wrap middle gap2" style={{ marginBottom: 24 }}>
          <span className="caption" style={{ marginRight: 4 }}>Vergelijk twee versies:</span>
          {comparable.map((f) => (
            <button
              key={f.value}
              className={compareFlow === f.value ? "btn btn-primary" : "btn btn-ghost"}
              style={{ padding: "6px 12px" }}
              onClick={() => setCompareFlow(compareFlow === f.value ? null : f.value)}>
              <Icon name="layers" size={13} /> {f.label}
            </button>
          ))}
        </div>
      )}

      {compareFlow && compareJobs.length === 2 && (
        <div className="card" style={{ padding: 24, marginBottom: 40 }}>
          <div className="row between middle" style={{ marginBottom: 16 }}>
            <span className="serif" style={{ fontSize: 18 }}>Vergelijking — {flowLabel(compareFlow)}</span>
            <button className="btn btn-quiet" onClick={() => setCompareFlow(null)} aria-label="Sluiten"><Icon name="close" size={15} /></button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {compareJobs.map((j, i) => (
              <div key={j.id} className="col gap2">
                <div className="row between middle wrap gap2">
                  <span className="caption serif" style={{ fontSize: 13 }}>{i === 0 ? "Nieuwste" : "Vorige"}</span>
                  <ReviewTag status={j.review_status} />
                </div>
                <span className="caption">{fmtDate(j.created_at)}</span>
                <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                  <JobBody job={j} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Jobs feed */}
      <div className="row between middle" style={{ marginBottom: 18 }}>
        <Kicker>Concepten</Kicker>
        <span className="caption">{jobs.length} {jobs.length === 1 ? "concept" : "concepten"}</span>
      </div>

      {jobs.length > 0 ? (
        <div className="col gap3">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              busy={busyId === job.id || !!running}
              onApprove={(j) => review(j, "approved")}
              onReject={(j) => review(j, "rejected")}
              onRegenerate={regenerate}
              onDelete={remove} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <p className="body" style={{ margin: 0 }}>Nog geen concepten. Kies hierboven een flow om Nova aan het werk te zetten.</p>
        </div>
      )}
    </div>
  );
}
