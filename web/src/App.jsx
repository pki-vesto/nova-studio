import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "./lib/api.js";
import { Icon } from "./lib/icons.jsx";
import { useTweaks, TweaksPanel, TweakSection, TweakColor, TweakRadio } from "./components/Tweaks.jsx";
import { ProjectsIndex } from "./screens/ProjectsIndex.jsx";
import { ProjectOverview } from "./screens/ProjectOverview.jsx";
import { Intake } from "./screens/Intake.jsx";
import { Moodboard } from "./screens/Moodboard.jsx";
import { ColorMaterial } from "./screens/ColorMaterial.jsx";
import { FloorPlan } from "./screens/FloorPlan.jsx";
import { Shopping } from "./screens/Shopping.jsx";
import { Budget } from "./screens/Budget.jsx";
import { PlanningScreen } from "./screens/PlanningScreen.jsx";
import { Proposal } from "./screens/Proposal.jsx";
import { AiPanel } from "./screens/AiPanel.jsx";
import { Presentation } from "./screens/Presentation.jsx";
import { Library } from "./screens/Library.jsx";
import { Stijlgids } from "./screens/Stijlgids.jsx";
import { Clients } from "./screens/Clients.jsx";
import { Suppliers } from "./screens/Suppliers.jsx";
import { MaterialLibraryScreen } from "./screens/MaterialLibraryScreen.jsx";
import { DesignLibraryScreen } from "./screens/DesignLibraryScreen.jsx";
import { KnowledgeScreen } from "./screens/KnowledgeScreen.jsx";
import { Settings } from "./screens/Settings.jsx";
import { Login } from "./screens/Login.jsx";
import { PortalView } from "./screens/PortalView.jsx";

const TWEAK_DEFAULTS = {
  accent: "#A86F4C",
  paper: ["#F2EDE4", "#EBE3D6", "#FBF8F2", "#F6F0E6"],
  density: "regular",
  shopLayout: "editorial"
};

const STUDIO_NAV = [
  { id: "projects", label: "Projecten", icon: "projects" },
  { id: "library", label: "Productbibliotheek", icon: "library" },
  { id: "material-library", label: "Materiaalbibliotheek", icon: "layers" },
  { id: "design-library", label: "Design Library", icon: "editorial" },
  { id: "clients", label: "Klanten", icon: "clients" },
  { id: "suppliers", label: "Leveranciers", icon: "supplier" }
];
const SYSTEM_NAV = [
  { id: "stijlgids", label: "Stijlgids", icon: "palette" },
  { id: "knowledge", label: "Kennisgraaf", icon: "graph" },
  { id: "settings", label: "Instellingen", icon: "settings" }
];
const TOP_VIEWS = [...STUDIO_NAV, ...SYSTEM_NAV].map((n) => n.id);

const PROJECT_TABS = [
  { id: "overview", label: "Overzicht", icon: "overview" },
  { id: "intake", label: "Intake", icon: "intake" },
  { id: "moodboard", label: "Moodboard", icon: "mood" },
  { id: "material", label: "Kleur & materiaal", icon: "palette" },
  { id: "plan", label: "Plattegrond", icon: "plan" },
  { id: "shopping", label: "Shoppinglijst", icon: "cart" },
  { id: "budget", label: "Budget", icon: "budget" },
  { id: "planning", label: "Planning", icon: "calendar" },
  { id: "proposal", label: "Voorstel", icon: "proposal" },
  { id: "ai", label: "AI", icon: "spark" }
];
const VIEW_TITLES = {
  projects: "Projecten", library: "Productbibliotheek", "material-library": "Materiaalbibliotheek",
  "design-library": "Design Library", clients: "Klanten", suppliers: "Leveranciers",
  stijlgids: "Stijlgids", knowledge: "Kennisgraaf", settings: "Instellingen"
};

// --- Hash routing -----------------------------------------------------------
function parseHash() {
  const h = (typeof window !== "undefined" ? window.location.hash : "").replace(/^#\/?/, "");
  const parts = h.split("/").filter(Boolean);
  if (parts[0] === "portal" && parts[1]) return { kind: "portal", token: parts[1] };
  if (parts[0] === "project" && parts[1]) return { kind: "project", id: parts[1], tab: parts[2] || "overview" };
  if (parts[0] && TOP_VIEWS.includes(parts[0])) return { kind: "view", view: parts[0] };
  return { kind: "view", view: "projects" };
}

function Sidebar({ view, project, onNav, onBrand }) {
  return (
    <aside className="side">
      <div className="brand" onClick={onBrand}>
        <span className="brand-mark">Nova</span>
        <span className="brand-sub">Studio · Interieur</span>
      </div>

      <div className="nav-group">
        <div className="nav-group-label">Atelier</div>
        {STUDIO_NAV.map((n) => (
          <div key={n.id} className={`nav-item ${view === n.id ? "active" : ""}`} onClick={() => onNav(n.id)}>
            <Icon name={n.icon} size={18} /> {n.label}
          </div>
        ))}
      </div>

      {view === "project" && project && (
        <div className="nav-group">
          <div className="nav-group-label">Huidig project</div>
          <div className="nav-item active" style={{ alignItems: "flex-start", cursor: "default" }}>
            <Icon name="dot" size={18} style={{ marginTop: 2, color: "var(--clay)" }} />
            <span style={{ lineHeight: 1.3 }}>{project.title}<br /><span className="caption" style={{ fontWeight: 400 }}>{project.client_name || "Geen klant"}</span></span>
          </div>
        </div>
      )}

      <div className="nav-group">
        <div className="nav-group-label">Systeem</div>
        {SYSTEM_NAV.map((n) => (
          <div key={n.id} className={`nav-item ${view === n.id ? "active" : ""}`} onClick={() => onNav(n.id)}>
            <Icon name={n.icon} size={18} /> {n.label}
          </div>
        ))}
      </div>

      <div className="nav-spacer" />
      <div className="side-foot">
        <div className="studio-chip">
          <span className="avatar">NS</span>
          <div style={{ minWidth: 0, lineHeight: 1.3 }}>
            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>Nova Studio</div>
            <div className="caption" style={{ marginTop: 1 }}>Interieurontwerp</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ view, project, query, onQuery, onNav, onPresent, onTweaks, onPalette, onBell, notifUnread }) {
  const inProject = view === "project";
  return (
    <div className="topbar">
      <div className="crumbs">
        {inProject && project ? (
          <>
            <span className="crumb-link" onClick={() => onNav("projects")}>Projecten</span>
            <Icon name="chevR" size={13} />
            <b>{project.title}</b>
          </>
        ) : <b>{VIEW_TITLES[view]}</b>}
      </div>
      <div className="topbar-actions">
        <div className="search">
          <Icon name="search" size={15} />
          <input placeholder="Zoek projecten, producten…" value={query} onChange={(e) => onQuery(e.target.value)} />
        </div>
        <button className="btn btn-ghost" onClick={onPalette} title="Commando's (⌘K)"><Icon name="search" size={15} /></button>
        <button className="btn btn-ghost" onClick={onBell} title="Notificaties" style={{ position: "relative" }}>
          <Icon name="bell" size={15} />
          {notifUnread > 0 && (
            <span style={{ position: "absolute", top: 1, right: 1, minWidth: 15, height: 15, padding: "0 3px", borderRadius: 99, background: "var(--clay)", color: "#fff", fontSize: 10, fontWeight: 700, lineHeight: "15px", textAlign: "center" }}>
              {notifUnread > 9 ? "9+" : notifUnread}
            </span>
          )}
        </button>
        {inProject
          ? <button className="btn btn-primary" onClick={onPresent}><Icon name="present" size={15} /> Presenteer</button>
          : null}
        <button className="btn btn-ghost" data-tweaks-toggle onClick={onTweaks} title="Tweaks"><Icon name="settings" size={15} /></button>
      </div>
    </div>
  );
}

// Command palette — ⌘K / Ctrl+K to jump between views, project tabs and projects.
function CommandPalette({ open, onClose, projects, project, onRun }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  useEffect(() => { if (open) { setQ(""); setSel(0); } }, [open]);
  if (!open) return null;

  const items = [];
  [...STUDIO_NAV, ...SYSTEM_NAV].forEach((n) => items.push({ label: n.label, hint: "Ga naar", icon: n.icon, run: () => onRun({ kind: "view", view: n.id }) }));
  if (project) PROJECT_TABS.forEach((t) => items.push({ label: `${project.title} — ${t.label}`, hint: "Tab", icon: t.icon, run: () => onRun({ kind: "tab", tab: t.id }) }));
  (projects || []).slice(0, 30).forEach((p) => items.push({ label: p.title, hint: p.client_name || "Project", icon: "projects", run: () => onRun({ kind: "open", id: p.id }) }));

  const ql = q.toLowerCase();
  const list = ql ? items.filter((i) => i.label.toLowerCase().includes(ql) || (i.hint || "").toLowerCase().includes(ql)) : items;
  const clamped = Math.min(sel, Math.max(0, list.length - 1));

  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, list.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const it = list[clamped]; if (it) { it.run(); onClose(); } }
    else if (e.key === "Escape") { onClose(); }
  }

  return (
    <div className="scrim no-print" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card" style={{ width: "min(560px, 92vw)", margin: "12vh auto 0", padding: 0, overflow: "hidden" }}>
        <div className="row middle gap2" style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
          <Icon name="search" size={16} />
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey}
            placeholder="Spring naar… (projecten, schermen, tabs)"
            style={{ border: "none", outline: "none", background: "transparent", fontSize: 15, width: "100%" }} />
          <span className="caption mono">⌘K</span>
        </div>
        <div style={{ maxHeight: "52vh", overflow: "auto" }}>
          {list.length === 0 && <div className="caption" style={{ padding: 18 }}>Geen resultaten.</div>}
          {list.map((it, i) => (
            <div key={i} className="row middle between" onMouseEnter={() => setSel(i)} onMouseDown={(e) => { e.preventDefault(); it.run(); onClose(); }}
              style={{ padding: "11px 18px", cursor: "pointer", background: i === clamped ? "var(--surface-2)" : "transparent" }}>
              <span className="row middle gap2" style={{ minWidth: 0 }}><Icon name={it.icon} size={15} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span></span>
              <span className="caption" style={{ flex: "none" }}>{it.hint}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Notifications bell panel — surfaces portal reactions and other events so the
// designer never misses client activity.
function NotificationsPanel({ open, onClose, items, onRead, onReadAll }) {
  if (!open) return null;
  return (
    <div className="scrim no-print" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card" style={{ width: "min(440px, 92vw)", margin: "64px 24px 0 auto", padding: 0, overflow: "hidden" }}>
        <div className="row between middle" style={{ padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
          <b className="serif" style={{ fontSize: 19 }}>Notificaties</b>
          <div className="row gap2 middle">
            {items.some((n) => !n.read_at) && <button className="btn btn-quiet" style={{ padding: "4px 10px", fontSize: 12 }} onClick={onReadAll}>Alles gelezen</button>}
            <button className="btn btn-quiet" onClick={onClose} aria-label="Sluiten"><Icon name="close" size={16} /></button>
          </div>
        </div>
        <div style={{ maxHeight: "62vh", overflow: "auto" }}>
          {items.length === 0 && <div className="caption" style={{ padding: 20 }}>Geen notificaties.</div>}
          {items.map((n) => (
            <div key={n.id} onMouseDown={() => onRead(n)}
              style={{ padding: "12px 18px", borderTop: "1px solid var(--line)", cursor: n.read_at ? "default" : "pointer", background: n.read_at ? "transparent" : "var(--surface-2)" }}>
              <div className="row between middle gap2">
                <span className="serif" style={{ fontSize: 15 }}>{n.subject || n.kind || "Notificatie"}</span>
                {!n.read_at && <span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--clay)", flex: "none" }} />}
              </div>
              {n.body && <div className="caption" style={{ whiteSpace: "pre-wrap", marginTop: 5, color: "var(--ink-2)", lineHeight: 1.5 }}>{n.body}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [notifUnread, setNotifUnread] = useState(0);

  const [view, setView] = useState("projects");
  const [projectTab, setProjectTab] = useState("overview");
  const [present, setPresent] = useState(false);

  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [libraryProducts, setLibraryProducts] = useState([]);
  const [project, setProject] = useState(null);
  const [floorplans, setFloorplans] = useState([]);
  const [moodboards, setMoodboards] = useState([]);
  const [shopping, setShopping] = useState({ total: 0, items: [] });
  const [proposals, setProposals] = useState([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  // Public portal route + optional auth gate.
  const initial = parseHash();
  const [portalToken, setPortalToken] = useState(initial.kind === "portal" ? initial.token : null);
  const [authState, setAuthState] = useState({ ready: false, hasUsers: false, user: null });
  const lastHash = useRef("");

  // Apply tweaks → CSS custom properties.
  useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty("--clay", t.accent);
    const pal = t.paper || TWEAK_DEFAULTS.paper;
    r.setProperty("--paper", pal[0]); r.setProperty("--paper-2", pal[1]);
    r.setProperty("--surface", pal[2]); r.setProperty("--surface-2", pal[3]);
    const d = { compact: 0.55, regular: 1, comfy: 1.5 }[t.density] ?? 1;
    r.setProperty("--density", String(d));
  }, [t.accent, t.paper, t.density]);

  const fail = useCallback((err) => setError(err?.message || String(err)), []);

  function pushHash(str) { lastHash.current = str; if (window.location.hash !== str) window.location.hash = str; }

  const loadProjectList = useCallback(async () => {
    const [rows, clientRows, productRows] = await Promise.all([
      api.get("/api/projects?status="),
      api.get("/api/clients"),
      api.get("/api/products")
    ]);
    setProjects(rows);
    setClients(clientRows);
    setLibraryProducts(productRows);
    return rows;
  }, []);

  const loadProject = useCallback(async (id) => {
    const [detail, clientRows, productRows, fpRows, boardRows, list, proposalRows] = await Promise.all([
      api.get(`/api/projects/${id}`),
      api.get("/api/clients"),
      api.get("/api/products"),
      api.get(`/api/floorplans/project/${id}`),
      api.get(`/api/moodboards/project/${id}`),
      api.get(`/api/products/shopping-list/${id}`),
      api.get(`/api/proposals/project/${id}`)
    ]);
    setProject(detail);
    setClients(clientRows);
    setLibraryProducts(productRows);
    setFloorplans(fpRows);
    setMoodboards(boardRows);
    setShopping(list);
    setProposals(proposalRows);
    return detail;
  }, []);

  // Auth status check (auth is optional — only gates when users exist).
  useEffect(() => {
    if (portalToken) { setAuthState({ ready: true, hasUsers: false, user: null }); return; }
    api.get("/api/auth/status")
      .then((s) => setAuthState({ ready: true, hasUsers: !!s.hasUsers, user: s.user || null }))
      .catch(() => setAuthState({ ready: true, hasUsers: false, user: null }));
  }, [portalToken]);

  const authed = !authState.hasUsers || !!authState.user || !!(typeof localStorage !== "undefined" && localStorage.getItem("nova.token"));

  const openProject = useCallback(async (id, tab = "overview") => {
    setError("");
    try {
      await loadProject(id);
      setView("project");
      setProjectTab(tab);
      pushHash(`#/project/${id}/${tab}`);
      window.scrollTo(0, 0);
    } catch (err) { fail(err); }
  }, [loadProject, fail]);

  // Initial load + deep-link handling.
  useEffect(() => {
    if (portalToken || !authState.ready || !authed) return;
    loadProjectList().catch(fail);
    const r = parseHash();
    if (r.kind === "project") openProject(r.id, r.tab);
    else if (r.kind === "view") { setView(r.view); pushHash(`#/${r.view}`); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState.ready, authed]);

  // React to back/forward + pasted links.
  useEffect(() => {
    function onHash() {
      const h = window.location.hash;
      if (h === lastHash.current) return;
      const r = parseHash();
      if (r.kind === "portal") { setPortalToken(r.token); return; }
      setPortalToken(null);
      if (r.kind === "view") { setView(r.view); lastHash.current = h; }
      else if (r.kind === "project") {
        if (!project || project.id !== r.id) openProject(r.id, r.tab);
        else { setProjectTab(r.tab); lastHash.current = h; }
      }
    }
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [project, openProject]);

  // ⌘K / Ctrl+K command palette.
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); setPaletteOpen((v) => !v); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Notifications — poll the unread count so portal reactions surface promptly.
  const loadNotifCount = useCallback(async () => {
    try { const c = await api.get("/api/notifications/count"); setNotifUnread(c.unread || 0); } catch { /* non-fatal */ }
  }, []);
  const openNotifs = useCallback(async () => {
    try { setNotifs(await api.get("/api/notifications?limit=50")); setNotifOpen(true); } catch (err) { fail(err); }
  }, [fail]);
  const markRead = useCallback(async (n) => {
    if (n.read_at) return;
    try { await api.json(`/api/notifications/${n.id}/read`, "POST", {}); setNotifs((l) => l.map((x) => x.id === n.id ? { ...x, read_at: "now" } : x)); loadNotifCount(); } catch (err) { fail(err); }
  }, [fail, loadNotifCount]);
  const markAllRead = useCallback(async () => {
    try { await api.json("/api/notifications/read-all", "POST", {}); setNotifs((l) => l.map((x) => ({ ...x, read_at: x.read_at || "now" }))); setNotifUnread(0); } catch (err) { fail(err); }
  }, [fail]);

  useEffect(() => {
    if (portalToken || !authState.ready || !authed) return;
    loadNotifCount();
    const t = setInterval(loadNotifCount, 60000);
    return () => clearInterval(t);
  }, [portalToken, authState.ready, authed, loadNotifCount]);

  const reload = useCallback(async () => {
    if (project) await loadProject(project.id);
    await loadProjectList();
  }, [project, loadProject, loadProjectList]);

  const go = useCallback((target) => {
    setError("");
    if (target === "present") { setPresent(true); return; }
    if (PROJECT_TABS.some((tb) => tb.id === target)) {
      setView("project"); setProjectTab(target);
      if (project) pushHash(`#/project/${project.id}/${target}`);
      window.scrollTo(0, 0); return;
    }
    if (TOP_VIEWS.includes(target)) { setView(target); pushHash(`#/${target}`); window.scrollTo(0, 0); }
  }, [project]);

  const onNav = useCallback((id) => { setView(id); pushHash(`#/${id}`); window.scrollTo(0, 0); }, []);
  const setTab = useCallback((id) => { setProjectTab(id); if (project) pushHash(`#/project/${project.id}/${id}`); window.scrollTo(0, 0); }, [project]);

  function runPalette(action) {
    if (action.kind === "view") onNav(action.view);
    else if (action.kind === "tab") setTab(action.tab);
    else if (action.kind === "open") openProject(action.id);
  }

  // --- Public portal: standalone, no shell, no auth ---
  if (portalToken) {
    return (
      <div className="app" style={{ display: "block" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto" }}>
          <PortalView token={portalToken} />
        </div>
      </div>
    );
  }

  // --- Optional login gate ---
  if (authState.ready && authState.hasUsers && !authed) {
    return <Login allowRegister={false} onAuth={(user) => setAuthState((s) => ({ ...s, user }))} />;
  }

  const ctx = {
    project, clients, libraryProducts, floorplans, moodboards, shopping, proposals,
    projects, query, reload, loadProjectList, openProject, go, setError, fail, tweaks: t
  };

  let body;
  if (view === "projects") body = <ProjectsIndex ctx={ctx} />;
  else if (view === "library") body = <Library ctx={ctx} />;
  else if (view === "material-library") body = <MaterialLibraryScreen ctx={ctx} />;
  else if (view === "design-library") body = <DesignLibraryScreen ctx={ctx} />;
  else if (view === "clients") body = <Clients ctx={ctx} />;
  else if (view === "suppliers") body = <Suppliers ctx={ctx} />;
  else if (view === "stijlgids") body = <Stijlgids ctx={ctx} />;
  else if (view === "knowledge") body = <KnowledgeScreen ctx={ctx} />;
  else if (view === "settings") body = <Settings ctx={ctx} />;
  else if (project) {
    const map = {
      overview: <ProjectOverview ctx={ctx} />,
      intake: <Intake ctx={ctx} />,
      moodboard: <Moodboard ctx={ctx} />,
      material: <ColorMaterial ctx={ctx} />,
      plan: <FloorPlan ctx={ctx} />,
      shopping: <Shopping ctx={ctx} layout={t.shopLayout} />,
      budget: <Budget ctx={ctx} />,
      planning: <PlanningScreen ctx={ctx} />,
      proposal: <Proposal ctx={ctx} />,
      ai: <AiPanel ctx={ctx} />
    };
    body = map[projectTab];
  }

  return (
    <div className="app">
      <Sidebar view={view} project={project} onNav={onNav} onBrand={() => onNav("projects")} />
      <div className="main">
        <Topbar
          view={view} project={project} query={query} onQuery={setQuery}
          onNav={onNav} onPresent={() => setPresent(true)} onTweaks={() => setTweaksOpen((v) => !v)}
          onPalette={() => setPaletteOpen(true)} onBell={openNotifs} notifUnread={notifUnread}
        />
        {view === "project" && project && (
          <nav className="proj-nav">
            {PROJECT_TABS.map((tb) => (
              <div key={tb.id} className={`proj-tab ${projectTab === tb.id ? "active" : ""}`} onClick={() => setTab(tb.id)}>
                <Icon name={tb.icon} size={15} /> {tb.label}
              </div>
            ))}
          </nav>
        )}
        {error && <div className="content" style={{ paddingTop: 24, paddingBottom: 0 }}><div className="banner-error">{error}</div></div>}
        <div key={view + projectTab}>{body}</div>
      </div>

      {present && project && <Presentation ctx={ctx} onClose={() => setPresent(false)} />}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} projects={projects} project={project} onRun={runPalette} />

      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} items={notifs} onRead={markRead} onReadAll={markAllRead} />

      <TweaksPanel open={tweaksOpen} onClose={() => setTweaksOpen(false)}>
        <TweakSection label="Sfeer" />
        <TweakColor label="Accent" value={t.accent}
          options={["#A86F4C", "#6E7358", "#9A6A4E", "#857150"]}
          onChange={(v) => setTweak("accent", v)} />
        <TweakColor label="Papier" value={t.paper}
          options={[
            ["#F2EDE4", "#EBE3D6", "#FBF8F2", "#F6F0E6"],
            ["#F1EEE8", "#E7E2D8", "#FCFAF6", "#F4F0E9"],
            ["#EFEAE1", "#E4DCCD", "#FAF6EE", "#F1EADF"]
          ]}
          onChange={(v) => setTweak("paper", v)} />
        <TweakSection label="Ritme" />
        <TweakRadio label="Witruimte" value={t.density}
          options={["compact", "regular", "comfy"]}
          onChange={(v) => setTweak("density", v)} />
        <TweakSection label="Shoppinglijst" />
        <TweakRadio label="Layout" value={t.shopLayout}
          options={["editorial", "grid", "lijst"]}
          onChange={(v) => setTweak("shopLayout", v)} />
      </TweaksPanel>
    </div>
  );
}
