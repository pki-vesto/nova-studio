// Reusable right-hand edit drawer + form field, styled on-brand.
import { useEffect } from "react";
import { Icon } from "../lib/icons.jsx";

export function EditDrawer({ open, title, onClose, onSave, saving, saveLabel = "Opslaan", children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="scrim no-print" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer">
        <div className="drawer-head">
          <h3 className="serif" style={{ fontSize: 24, margin: 0 }}>{title}</h3>
          <button className="btn btn-quiet" onClick={onClose} aria-label="Sluiten"><Icon name="close" size={16} /></button>
        </div>
        <form
          style={{ display: "contents" }}
          onSubmit={(e) => { e.preventDefault(); onSave && onSave(); }}
        >
          <div className="drawer-body">{children}</div>
          {onSave && (
            <div className="drawer-foot">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Annuleren</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Bezig…" : saveLabel}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
