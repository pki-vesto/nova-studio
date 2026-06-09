import { useState, useEffect, useRef, useMemo } from "react";
import { Icon } from "../lib/icons.jsx";
import { money } from "../lib/format.js";
import { Ph, Kicker } from "../components/primitives.jsx";
import { BudgetBlock } from "../components/BudgetBlock.jsx";

function PresPage({ children, dark, pad = true, style }) {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: dark ? "var(--surface-ink)" : "var(--paper)",
      color: dark ? "var(--surface)" : "var(--ink)",
      display: "flex", flexDirection: "column", justifyContent: "center",
      padding: pad ? "clamp(40px, 7vw, 120px)" : 0, overflow: "hidden", ...style
    }}>{children}</div>
  );
}

function buildPages(ctx) {
  const { project: p, shopping, moodboards } = ctx;
  const items = shopping.items;
  const feats = items.filter((x) => x.is_feature);
  const featured = (feats.length ? feats : items).slice(0, 3);
  const palette = p.palette || [];
  const materials = (p.materials || []).slice(0, 3);
  const assets = moodboards.flatMap((b) => b.assets || []);
  const moodImg = (i) => assets[i]?.file_path;

  const pages = [];

  // 1 — Cover
  pages.push({ dark: true, render: () => (
    <PresPage dark pad={false}>
      <Ph dark label="hero — woonkamer, full bleed" src={p.hero_image_path} icon="mood" style={{ position: "absolute", inset: 0, border: 0 }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(20,16,12,.25), rgba(20,16,12,.72))" }} />
      <div style={{ position: "relative", padding: "clamp(40px,7vw,120px)", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div className="row between middle">
          <span className="serif" style={{ fontSize: 26, fontWeight: 600 }}>Nova Studio</span>
          <span className="eyebrow" style={{ color: "var(--muted-2)" }}>Ontwerpvoorstel</span>
        </div>
        <div>
          {(p.location || p.address) && <div className="kicker" style={{ color: "var(--clay-soft)", marginBottom: 24 }}>{p.location || p.address}</div>}
          <h1 className="display" style={{ fontSize: "clamp(44px,7vw,104px)", color: "#fff", maxWidth: 1000 }}>{p.title}</h1>
          <div className="row gap6 middle" style={{ marginTop: 40 }}>
            {p.client_name && <div><div className="eyebrow" style={{ color: "var(--muted-2)", marginBottom: 6 }}>Voor</div><div style={{ fontSize: 18 }}>{p.client_name}</div></div>}
            {p.client_name && p.delivery && <div style={{ width: 1, height: 38, background: "rgba(255,255,255,.25)" }} />}
            {p.delivery && <div><div className="eyebrow" style={{ color: "var(--muted-2)", marginBottom: 6 }}>Datum</div><div style={{ fontSize: 18 }}>{p.delivery}</div></div>}
          </div>
        </div>
      </div>
    </PresPage>
  ), label: "Cover" });

  // 2 — Introductie
  if (p.vision || p.summary) pages.push({ render: () => (
    <PresPage>
      <div style={{ maxWidth: 900 }}>
        <Kicker style={{ marginBottom: 28 }}>Welkom</Kicker>
        {p.vision && <p className="display" style={{ fontSize: "clamp(28px,4vw,52px)", lineHeight: 1.18, fontWeight: 500 }}>{p.vision}</p>}
        <div className="row gap6" style={{ marginTop: 48 }}>
          {p.summary && <p className="body" style={{ fontSize: 17, maxWidth: 520 }}>{p.summary}</p>}
          {p.lead && (
            <div style={{ flex: "none" }}>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Ontwerp door</div>
              <div className="serif" style={{ fontSize: 22 }}>{p.lead}</div>
              <div className="caption" style={{ marginTop: 4 }}>Nova Studio — Amsterdam</div>
            </div>
          )}
        </div>
      </div>
    </PresPage>
  ), label: "Introductie" });

  // 3 — De opdracht
  if ((p.goals || []).length) pages.push({ render: () => (
    <PresPage>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center", width: "100%", maxWidth: 1300, margin: "0 auto" }}>
        <div>
          <Kicker style={{ marginBottom: 20 }}>De opdracht</Kicker>
          <h2 className="display" style={{ fontSize: "clamp(34px,4.4vw,58px)" }}>Wat de klant wenst</h2>
          <ol style={{ listStyle: "none", padding: 0, margin: "36px 0 0" }}>
            {p.goals.map((g, i) => (
              <li key={i} style={{ display: "flex", gap: 20, padding: "16px 0", borderBottom: "1px solid var(--line)" }}>
                <span className="serif" style={{ fontSize: 24, color: "var(--clay)", width: 32 }}>{String(i + 1).padStart(2, "0")}</span>
                <span className="body" style={{ fontSize: 16 }}>{g}</span>
              </li>
            ))}
          </ol>
        </div>
        <Ph label="referentiebeeld — sfeer & richting" src={moodImg(0)} icon="mood" style={{ aspectRatio: "3/4", borderRadius: "var(--r-md)" }} />
      </div>
    </PresPage>
  ), label: "De opdracht" });

  // 4 — Moodboard
  pages.push({ render: () => (
    <PresPage pad={false}>
      <div style={{ position: "absolute", top: "clamp(40px,6vw,90px)", left: "clamp(40px,7vw,120px)", zIndex: 2 }}>
        <Kicker style={{ marginBottom: 12 }}>Moodboard</Kicker>
        <h2 className="display" style={{ fontSize: "clamp(30px,4vw,52px)" }}>De sfeer</h2>
      </div>
      <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 14, padding: 14 }}>
        <Ph label="hoofdsfeerbeeld" src={moodImg(0)} icon="mood" style={{ gridRow: "span 2", border: 0 }} />
        <Ph label="travertijn detail" src={moodImg(1)} icon="palette" style={{ border: 0 }} />
        <Ph label="linnen textuur" src={moodImg(2)} icon="image" style={{ border: 0 }} />
        <Ph label="keramiek stilleven" src={moodImg(3)} icon="mood" style={{ border: 0 }} />
        <Ph label="lichtinval" src={moodImg(4)} icon="image" style={{ border: 0 }} />
      </div>
    </PresPage>
  ), label: "Moodboard" });

  // 5 — Kleur
  if (palette.length) pages.push({ render: () => (
    <PresPage>
      <div style={{ width: "100%", maxWidth: 1200, margin: "0 auto" }}>
        <Kicker style={{ marginBottom: 18 }}>Kleurconcept</Kicker>
        <h2 className="display" style={{ fontSize: "clamp(32px,4.4vw,58px)", marginBottom: 48 }}>Een palet uit steen en aarde</h2>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(6, palette.length)},1fr)`, gap: 18 }}>
          {palette.map((c) => (
            <div key={c.name}>
              <div style={{ aspectRatio: "2/3", borderRadius: "var(--r-md)", background: c.hex, border: "1px solid rgba(0,0,0,.06)" }} />
              <div className="serif" style={{ fontSize: 18, marginTop: 12 }}>{c.name}</div>
              <div className="mono" style={{ color: "var(--muted)", marginTop: 2 }}>{(c.hex || "").toUpperCase()}</div>
            </div>
          ))}
        </div>
      </div>
    </PresPage>
  ), label: "Kleur" });

  // 6 — Materiaal (dark)
  if (materials.length) pages.push({ dark: true, render: () => (
    <PresPage dark>
      <div style={{ width: "100%", maxWidth: 1200, margin: "0 auto" }}>
        <Kicker style={{ marginBottom: 18, color: "var(--clay-soft)" }}>Materiaalconcept</Kicker>
        <h2 className="display" style={{ fontSize: "clamp(32px,4.4vw,58px)", marginBottom: 48, color: "#fff" }}>Materialen die mooier verouderen</h2>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(3, materials.length)},1fr)`, gap: 24 }}>
          {materials.map((m) => (
            <div key={m.id}>
              <Ph dark label={`${m.name} — sample`} src={m.image_path} icon="palette" style={{ aspectRatio: "4/3", borderRadius: "var(--r-md)" }} />
              <div className="serif" style={{ fontSize: 22, marginTop: 14, color: "#fff" }}>{m.name}</div>
              <div className="caption" style={{ marginTop: 5, color: "var(--muted-2)" }}>{[m.spec, m.application].filter(Boolean).join(" · ")}</div>
            </div>
          ))}
        </div>
      </div>
    </PresPage>
  ), label: "Materiaal" });

  // 7 — Selectie
  if (featured.length) pages.push({ render: () => (
    <PresPage>
      <div style={{ width: "100%", maxWidth: 1280, margin: "0 auto" }}>
        <Kicker style={{ marginBottom: 18 }}>De selectie — uitgelicht</Kicker>
        <h2 className="display" style={{ fontSize: "clamp(32px,4.4vw,56px)", marginBottom: 48 }}>Sleutelstukken per ruimte</h2>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(3, featured.length)},1fr)`, gap: 32 }}>
          {featured.map((it) => (
            <div key={it.id}>
              <Ph label={`${it.name} — productfoto`} src={it.image_path} icon="cart" style={{ aspectRatio: "4/5", borderRadius: "var(--r-md)" }} />
              <div className="row between" style={{ marginTop: 16, alignItems: "baseline" }}>
                <div>
                  <div className="serif" style={{ fontSize: 23 }}>{it.name}</div>
                  <div className="caption" style={{ marginTop: 3 }}>{it.brand}</div>
                </div>
                <span className="serif num" style={{ fontSize: 21, color: "var(--clay)" }}>{money((it.price || 0) * (it.quantity || 1))}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PresPage>
  ), label: "Selectie" });

  // 8 — Budget
  if (items.length) pages.push({ render: () => (
    <PresPage>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center", width: "100%", maxWidth: 1200, margin: "0 auto" }}>
        <div>
          <Kicker style={{ marginBottom: 18 }}>Investering</Kicker>
          <h2 className="display" style={{ fontSize: "clamp(34px,4.6vw,60px)" }}>Een transparant budget</h2>
          <p className="lede" style={{ marginTop: 22 }}>Inzichtelijk verdeeld per categorie — van meubilair tot begeleiding.</p>
        </div>
        <BudgetBlock items={items} budgetLines={p.budget_lines} />
      </div>
    </PresPage>
  ), label: "Budget" });

  // 9 — Afsluiting (dark)
  pages.push({ dark: true, render: () => (
    <PresPage dark>
      <div style={{ maxWidth: 880 }}>
        <Kicker style={{ marginBottom: 26, color: "var(--clay-soft)" }}>Vervolg</Kicker>
        <h2 className="display" style={{ fontSize: "clamp(40px,5.6vw,76px)", color: "#fff" }}>Laten we dit huis tot leven brengen.</h2>
        <p className="body" style={{ fontSize: 17, color: "var(--muted-2)", marginTop: 26, maxWidth: 560 }}>
          Na akkoord op dit voorstel starten we met de definitieve materiaalstaten, bestellingen en planning. We begeleiden het hele traject tot oplevering en styling.
        </p>
        <div className="row gap8" style={{ marginTop: 48, flexWrap: "wrap" }}>
          <div><div className="eyebrow" style={{ color: "var(--muted-2)", marginBottom: 8 }}>Volgende stap</div><div className="serif" style={{ fontSize: 22, color: "#fff" }}>Akkoord & planning</div></div>
          <div>
            <div className="eyebrow" style={{ color: "var(--muted-2)", marginBottom: 8 }}>Contact</div>
            <div className="serif" style={{ fontSize: 22, color: "#fff" }}>{p.lead || "Nova Studio"}</div>
            <div className="caption" style={{ color: "var(--muted-2)", marginTop: 4 }}>studio@novastudio.nl · +31 20 123 45 67</div>
          </div>
        </div>
      </div>
    </PresPage>
  ), label: "Afsluiting" });

  return pages;
}

// ---------------------------------------------------------------------------
// Per-project presentation preferences (localStorage, mirrors the Tweaks panel).
// Key: nova.present.<projectId>  →  { order, enabled, notes, presenter, client }
//   order    : array of page labels in render order
//   enabled  : { [label]: boolean }
//   notes    : { [label]: string } presenter notes per page
//   presenter: boolean — show presenter-note overlay
//   client   : boolean — hide all edit chrome for client-facing display
// ---------------------------------------------------------------------------
const PRESENT_KEY = (id) => `nova.present.${id || "default"}`;

function loadPrefs(id) {
  try {
    const raw = localStorage.getItem(PRESENT_KEY(id));
    if (raw) return JSON.parse(raw) || {};
  } catch { /* ignore */ }
  return {};
}
function savePrefs(id, prefs) {
  try { localStorage.setItem(PRESENT_KEY(id), JSON.stringify(prefs)); } catch { /* ignore */ }
}

// Merge the stored order/enabled set with the freshly built page set so that
// pages added or removed since the prefs were saved are handled gracefully.
function resolveOrder(allLabels, prefs) {
  const stored = Array.isArray(prefs.order) ? prefs.order.filter((l) => allLabels.includes(l)) : [];
  const missing = allLabels.filter((l) => !stored.includes(l)); // new pages → appended
  return [...stored, ...missing];
}

export function Presentation({ ctx, onClose }) {
  const projectId = ctx.project?.id;
  const allPages = useMemo(() => buildPages(ctx), [ctx]);
  const allLabels = useMemo(() => allPages.map((p) => p.label), [allPages]);

  // ----- persisted UI prefs (per project) -----------------------------------
  const [prefs, setPrefs] = useState(() => {
    const stored = loadPrefs(projectId);
    return {
      order: resolveOrder(allLabels, stored),
      enabled: stored.enabled || {},
      notes: stored.notes || {},
      presenter: !!stored.presenter,
      client: !!stored.client,
    };
  });

  // Reload prefs when switching to a different project.
  useEffect(() => {
    const stored = loadPrefs(projectId);
    setPrefs({
      order: resolveOrder(allLabels, stored),
      enabled: stored.enabled || {},
      notes: stored.notes || {},
      presenter: !!stored.presenter,
      client: !!stored.client,
    });
    setI(0);
  }, [projectId, allLabels]);

  const update = (patch) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(projectId, next);
      return next;
    });
  };
  const isEnabled = (label) => prefs.enabled[label] !== false; // default: enabled

  // The pages actually rendered: enabled, in the saved order.
  const pages = useMemo(() => {
    const byLabel = Object.fromEntries(allPages.map((p) => [p.label, p]));
    const visible = prefs.order.map((l) => byLabel[l]).filter((p) => p && isEnabled(p.label));
    return visible.length ? visible : allPages; // never render an empty deck
  }, [allPages, prefs.order, prefs.enabled]);

  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [chrome, setChrome] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const hideTimer = useRef(null);

  // Keep the index in range when the visible deck shrinks.
  useEffect(() => { if (i > pages.length - 1) setI(Math.max(0, pages.length - 1)); }, [pages.length]);

  const goto = (n) => { setDir(n > i ? 1 : -1); setI(Math.max(0, Math.min(pages.length - 1, n))); };

  useEffect(() => {
    const onKey = (e) => {
      // Don't hijack keys while typing notes in the settings panel.
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "textarea" || tag === "input") { if (e.key === "Escape") e.target.blur(); return; }
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); goto(i + 1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); goto(i - 1); }
      else if (e.key === "Escape") { if (settingsOpen) setSettingsOpen(false); else onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [i, pages.length, settingsOpen]);

  const wake = () => {
    setChrome(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChrome(false), 2600);
  };
  useEffect(() => { wake(); return () => clearTimeout(hideTimer.current); }, [i]);

  const page = pages[i] || pages[0];
  const isDark = !!page?.dark;
  const clientMode = prefs.client;
  const currentNote = (prefs.notes[page?.label] || "").trim();

  // ----- reorder helpers (operate on the persisted order) -------------------
  const move = (label, delta) => {
    const order = [...prefs.order];
    const from = order.indexOf(label);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    update({ order });
  };
  const toggleEnabled = (label) => {
    update({ enabled: { ...prefs.enabled, [label]: !(prefs.enabled[label] !== false) } });
  };
  const setNote = (label, text) => {
    update({ notes: { ...prefs.notes, [label]: text } });
  };

  return (
    <div className="no-print" onMouseMove={wake} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#15110d", overflow: "hidden" }}>
      {page && (
        <div key={i} className="pres-anim" style={{ position: "absolute", inset: 0, "--dir": dir }}>
          {page.render()}
        </div>
      )}

      {/* presenter-note overlay — discreet corner card. Never in client mode,
          never printed (root is .no-print, overlay is explicitly marked too). */}
      {!clientMode && prefs.presenter && currentNote && (
        <div className="no-print" style={{
          position: "fixed", bottom: 84, left: 28, maxWidth: 380, zIndex: 9,
          background: "rgba(20,16,12,.82)", color: "rgba(255,255,255,.92)",
          backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,.12)",
          borderRadius: 12, padding: "13px 16px", boxShadow: "var(--shadow-3)",
          opacity: chrome ? 1 : 0.5, transition: "opacity .4s", pointerEvents: "none" }}>
          <div className="eyebrow" style={{ color: "var(--clay-soft)", marginBottom: 7, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="doc" size={12} /> Notitie — {page?.label}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{currentNote}</div>
        </div>
      )}

      {/* top chrome */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, padding: "22px 28px", display: "flex", justifyContent: "space-between", alignItems: "center",
        opacity: chrome ? 1 : 0, transition: "opacity .4s", pointerEvents: chrome ? "auto" : "none", zIndex: 10, color: isDark ? "#fff" : "var(--ink)" }}>
        <span className="eyebrow" style={{ color: "inherit", opacity: 0.7 }}>{page?.label}</span>
        <div className="row gap3 middle">
          {!clientMode && (
            <button className="btn no-print" onClick={() => setSettingsOpen((o) => !o)} aria-label="Presentatie-instellingen"
              style={{ background: isDark ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.06)", color: "inherit", borderRadius: 99, backdropFilter: "blur(8px)" }}>
              <Icon name="settings" size={15} /> Instellingen
            </button>
          )}
          <button className="btn" onClick={onClose} style={{ background: isDark ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.06)", color: "inherit", borderRadius: 99, backdropFilter: "blur(8px)" }}>
            <Icon name="close" size={15} /> Sluit presentatie
          </button>
        </div>
      </div>

      {/* bottom nav — dots + keyboard nav keep working in client mode */}
      <div style={{ position: "fixed", bottom: 24, left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 10, opacity: chrome ? 1 : 0, transition: "opacity .4s" }}>
        <div className="row gap4 middle" style={{ background: "rgba(20,16,12,.78)", backdropFilter: "blur(12px)", color: "#fff", padding: "10px 12px 10px 18px", borderRadius: 99, boxShadow: "var(--shadow-3)", pointerEvents: "auto" }}>
          <button className="btn btn-quiet" style={{ color: "#fff", opacity: i === 0 ? 0.35 : 1 }} onClick={() => goto(i - 1)} disabled={i === 0}><Icon name="arrowL" size={16} /></button>
          <div className="row gap2 middle">
            {pages.map((pg, n) => (
              <button key={n} onClick={() => goto(n)} title={pg.label}
                style={{ width: n === i ? 22 : 8, height: 8, borderRadius: 99, border: 0, cursor: "pointer", padding: 0, background: n === i ? "var(--clay)" : "rgba(255,255,255,.3)", transition: "all .25s" }} />
            ))}
          </div>
          <button className="btn btn-quiet" style={{ color: "#fff", opacity: i === pages.length - 1 ? 0.35 : 1 }} onClick={() => goto(i + 1)} disabled={i === pages.length - 1}><Icon name="arrowR" size={16} /></button>
          <span className="num caption" style={{ color: "rgba(255,255,255,.6)", marginLeft: 6, marginRight: 6 }}>{String(i + 1).padStart(2, "0")} / {String(pages.length).padStart(2, "0")}</span>
        </div>
      </div>

      {/* settings panel — hidden entirely in client mode */}
      {!clientMode && settingsOpen && (
        <PresentSettings
          allPages={allPages}
          order={prefs.order}
          isEnabled={isEnabled}
          notes={prefs.notes}
          presenter={prefs.presenter}
          client={prefs.client}
          currentLabel={page?.label}
          onMove={move}
          onToggle={toggleEnabled}
          onNote={setNote}
          onPresenter={(v) => update({ presenter: v })}
          onClient={(v) => { update({ client: v }); if (v) setSettingsOpen(false); }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings panel: enable/disable + reorder pages, edit presenter notes, and
// toggle presenter / client mode. Self-contained, no backend.
// ---------------------------------------------------------------------------
function PresentSettings({ allPages, order, isEnabled, notes, presenter, client, currentLabel,
  onMove, onToggle, onNote, onPresenter, onClient, onClose }) {
  const byLabel = Object.fromEntries(allPages.map((p) => [p.label, p]));
  // List pages in the saved order; include any not yet placed at the end.
  const labels = [...order.filter((l) => byLabel[l]), ...allPages.map((p) => p.label).filter((l) => !order.includes(l))];

  const toggleStyle = (on) => ({
    appearance: "none", border: 0, cursor: "pointer", borderRadius: 99,
    width: 38, height: 22, padding: 2, flex: "none",
    background: on ? "var(--clay)" : "rgba(255,255,255,.18)", transition: "background .15s",
    display: "flex", justifyContent: on ? "flex-end" : "flex-start", alignItems: "center",
  });
  const knob = { width: 18, height: 18, borderRadius: 99, background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.3)" };

  return (
    <div className="no-print" role="dialog" aria-label="Presentatie-instellingen" style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: 360, zIndex: 20,
      background: "rgba(20,16,12,.92)", backdropFilter: "blur(24px) saturate(140%)",
      borderLeft: "1px solid rgba(255,255,255,.12)", boxShadow: "-16px 0 48px rgba(0,0,0,.4)",
      color: "rgba(255,255,255,.92)", display: "flex", flexDirection: "column",
      font: '12px/1.45 "Manrope",ui-sans-serif,system-ui,sans-serif' }}>

      <div className="row between middle" style={{ padding: "16px 18px", borderBottom: "1px solid rgba(255,255,255,.1)", flex: "none" }}>
        <b style={{ fontSize: 13, letterSpacing: ".04em", textTransform: "uppercase" }}>Presentatie</b>
        <button className="btn btn-quiet" onClick={onClose} aria-label="Sluit instellingen" style={{ color: "#fff" }}><Icon name="close" size={15} /></button>
      </div>

      <div style={{ padding: "16px 18px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
        {/* modes */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="row between middle">
            <div>
              <div style={{ fontWeight: 600 }}>Presentatormodus</div>
              <div style={{ color: "rgba(255,255,255,.5)", marginTop: 2 }}>Toon notities in beeld</div>
            </div>
            <button type="button" role="switch" aria-checked={presenter} style={toggleStyle(presenter)} onClick={() => onPresenter(!presenter)}><span style={knob} /></button>
          </div>
          <div className="row between middle">
            <div>
              <div style={{ fontWeight: 600 }}>Klantmodus</div>
              <div style={{ color: "rgba(255,255,255,.5)", marginTop: 2 }}>Verberg alle bewerkknoppen</div>
            </div>
            <button type="button" role="switch" aria-checked={client} style={toggleStyle(client)} onClick={() => onClient(!client)}><span style={knob} /></button>
          </div>
        </div>

        <div style={{ height: 1, background: "rgba(255,255,255,.1)" }} />

        {/* pages: enable/disable + reorder */}
        <div>
          <div className="eyebrow" style={{ color: "rgba(255,255,255,.5)", marginBottom: 10 }}>Pagina's</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {labels.map((label, idx) => {
              const on = isEnabled(label);
              const isCurrent = label === currentLabel;
              return (
                <div key={label} style={{
                  border: `1px solid ${isCurrent ? "rgba(193,124,90,.6)" : "rgba(255,255,255,.1)"}`,
                  borderRadius: 10, padding: "9px 10px", background: "rgba(255,255,255,.04)" }}>
                  <div className="row between middle">
                    <div className="row gap2 middle" style={{ minWidth: 0 }}>
                      <button type="button" role="switch" aria-checked={on} style={toggleStyle(on)} onClick={() => onToggle(label)} title={on ? "Verberg pagina" : "Toon pagina"}><span style={knob} /></button>
                      <span style={{ fontWeight: 600, opacity: on ? 1 : 0.45, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
                    </div>
                    <div className="row middle" style={{ flex: "none", gap: 2 }}>
                      <button className="btn btn-quiet" style={{ color: "#fff", padding: 4, opacity: idx === 0 ? 0.3 : 1 }} disabled={idx === 0} onClick={() => onMove(label, -1)} aria-label="Omhoog" title="Omhoog">
                        <Icon name="chevD" size={14} style={{ transform: "rotate(180deg)" }} />
                      </button>
                      <button className="btn btn-quiet" style={{ color: "#fff", padding: 4, opacity: idx === labels.length - 1 ? 0.3 : 1 }} disabled={idx === labels.length - 1} onClick={() => onMove(label, 1)} aria-label="Omlaag" title="Omlaag">
                        <Icon name="chevD" size={14} />
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={notes[label] || ""}
                    onChange={(e) => onNote(label, e.target.value)}
                    placeholder="Presentatornotitie…"
                    rows={2}
                    style={{ marginTop: 8, width: "100%", resize: "vertical", minHeight: 34,
                      background: "rgba(0,0,0,.25)", color: "rgba(255,255,255,.9)",
                      border: "1px solid rgba(255,255,255,.12)", borderRadius: 7, padding: "7px 9px",
                      font: "inherit", lineHeight: 1.45, boxSizing: "border-box" }}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ color: "rgba(255,255,255,.4)", marginTop: 12, fontSize: 11 }}>
            Volgorde en zichtbaarheid worden per project bewaard.
          </div>
        </div>
      </div>
    </div>
  );
}
