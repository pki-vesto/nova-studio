// Shared editorial primitives, ported from the Nova Studio design hand-off.
import { Icon } from "../lib/icons.jsx";
import { fileUrl } from "../lib/format.js";

/* Image placeholder — renders a real image when src is given, otherwise the
   striped, labelled placeholder from the design. */
export function Ph({ label, src, dark = false, style, className = "", icon = "mood", alt }) {
  const url = src ? fileUrl(src) : "";
  return (
    <div className={`ph ${dark ? "ph-dark" : ""} ${url ? "has-img" : ""} ${className}`} style={style}>
      {url
        ? <img src={url} alt={alt || label || ""} />
        : (label || label === "") && (
            <span className="ph-label">
              <Icon name={icon} size={12} stroke={1.5} />
              {label}
            </span>
          )}
    </div>
  );
}

export function Kicker({ children, style }) {
  return <div className="kicker" style={style}>{children}</div>;
}

export function Tag({ children, variant }) {
  const cls = variant === "clay" ? "tag tag-clay" : variant === "solid" ? "tag tag-solid" : "tag";
  return <span className={cls}>{children}</span>;
}

export const PROJECT_STATUS_MODEL = [
  { key: "lead", label: "Lead", description: "Nieuwe aanvraag of intake, nog zonder uitgewerkt voorstel." },
  { key: "proposal", label: "Voorstel", description: "Ontwerp- en prijsvoorstel wordt samengesteld of besproken." },
  { key: "approved", label: "Goedgekeurd", description: "Klant heeft akkoord gegeven; planning en inkoop kunnen starten." },
  { key: "active", label: "In uitvoering", description: "Project loopt: uitvoering, selectie en coordinatie zijn actief." },
  { key: "completed", label: "Opgeleverd", description: "Werk is afgerond en overdracht of nazorg blijft over." },
  { key: "archived", label: "Archief", description: "Niet meer actief in de dagelijkse projectlijst." }
];

// Maps both the editorial labels and the backend status codes to a dot colour.
export const STATUS_COLORS = {
  "Voorstel": "var(--clay)", proposal: "var(--clay)",
  "In uitvoering": "var(--sage)", active: "var(--sage)",
  "Opgeleverd": "var(--muted-2)", completed: "var(--muted-2)",
  "Intake": "var(--ink-2)", lead: "var(--ink-2)",
  approved: "var(--sage)", archived: "var(--muted-2)"
};
const STATUS_LABELS = Object.fromEntries(PROJECT_STATUS_MODEL.map((s) => [s.key, s.label]));
export function statusLabel(status) {
  return STATUS_LABELS[status] || status || "—";
}
export function StatusDot({ status }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--ink-2)", fontWeight: 600, letterSpacing: ".02em" }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: STATUS_COLORS[status] || "var(--muted)" }} />
      {statusLabel(status)}
    </span>
  );
}

export function SectionHead({ kicker, title, sub, right }) {
  return (
    <div className="row between end" style={{ gap: 24, marginBottom: 28 }}>
      <div style={{ maxWidth: 720 }}>
        {kicker && <Kicker style={{ marginBottom: 12 }}>{kicker}</Kicker>}
        <h2 className="display" style={{ fontSize: "clamp(28px,3.4vw,44px)", margin: 0 }}>{title}</h2>
        {sub && <p className="lede" style={{ marginTop: 16, marginBottom: 0 }}>{sub}</p>}
      </div>
      {right && <div style={{ flex: "none" }}>{right}</div>}
    </div>
  );
}

export function Figure({ label, src, caption, ratio = "4/3", dark, icon, style }) {
  return (
    <figure style={{ margin: 0, ...style }}>
      <Ph label={label} src={src} dark={dark} icon={icon} style={{ aspectRatio: ratio, borderRadius: "var(--r-md)" }} />
      {caption && <figcaption className="caption" style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <span style={{ color: "var(--clay)" }}>—</span>{caption}
      </figcaption>}
    </figure>
  );
}

// Editorial edit affordance used on display screens to open an edit drawer.
export function EditButton({ onClick, label = "Bewerk" }) {
  return (
    <button className="edit-pen no-print" onClick={onClick}>
      <Icon name="edit" size={13} /> {label}
    </button>
  );
}
