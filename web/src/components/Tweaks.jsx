// Live theming panel — accent, paper tint, whitespace, default shopping layout.
// Ported visual shell + controls from the design hand-off; the design tool's
// iframe host-protocol is replaced with a real toggle button + localStorage.
import { useState, useCallback, useRef } from "react";

const STORE_KEY = "nova_tweaks";

const TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:20px;bottom:20px;z-index:950;width:288px;
    max-height:calc(100vh - 40px);display:flex;flex-direction:column;
    background:rgba(250,249,247,.86);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 "Manrope",ui-sans-serif,system-ui,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:12px 10px 12px 16px;user-select:none;border-bottom:.5px solid rgba(0,0,0,.06)}
  .twk-hd b{font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:24px;height:24px;border-radius:6px;cursor:pointer;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:12px 16px 16px;display:flex;flex-direction:column;gap:11px;overflow-y:auto;min-height:0}
  .twk-row{display:flex;flex-direction:column;gap:6px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:600}
  .twk-sect{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:8px 0 0}
  .twk-sect:first-child{padding-top:0}
  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;background:rgba(255,255,255,.92);
    box-shadow:0 1px 2px rgba(0,0,0,.12);transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;background:transparent;
    color:inherit;font:inherit;font-weight:600;min-height:24px;border-radius:6px;cursor:pointer;padding:4px 6px;line-height:1.2}
  .twk-chips{display:flex;gap:6px}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:44px;padding:0;border:0;border-radius:6px;
    overflow:hidden;cursor:pointer;box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);
    transition:transform .12s,box-shadow .12s}
  .twk-chip:hover{transform:translateY(-1px)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 1.5px rgba(0,0,0,.85),0 2px 6px rgba(0,0,0,.15)}
  .twk-chip>span{position:absolute;top:0;bottom:0;right:0;width:34%;display:flex;flex-direction:column}
  .twk-chip>span>i{flex:1;box-shadow:0 -1px 0 rgba(0,0,0,.1)}
  .twk-chip>span>i:first-child{box-shadow:none}
  .twk-chip svg{position:absolute;top:6px;left:6px;width:13px;height:13px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
`;

function loadStored(defaults) {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return defaults;
}

export function useTweaks(defaults) {
  const [values, setValues] = useState(() => loadStored(defaults));
  const setTweak = useCallback((key, val) => {
    setValues((prev) => {
      const next = { ...prev, [key]: val };
      try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  return [values, setTweak];
}

export function TweaksPanel({ open, onClose, title = "Tweaks", children }) {
  if (!open) return null;
  return (
    <>
      <style>{TWEAKS_STYLE}</style>
      <div className="twk-panel no-print" role="dialog" aria-label="Tweaks">
        <div className="twk-hd">
          <b>{title}</b>
          <button className="twk-x" aria-label="Sluit tweaks" onClick={onClose}>✕</button>
        </div>
        <div className="twk-body">{children}</div>
      </div>
    </>
  );
}

export function TweakSection({ label }) {
  return <div className="twk-sect">{label}</div>;
}

export function TweakRadio({ label, value, options, onChange }) {
  const opts = options.map((o) => (typeof o === "object" ? o : { value: o, label: o }));
  const idx = Math.max(0, opts.findIndex((o) => o.value === value));
  const n = opts.length;
  return (
    <div className="twk-row">
      <div className="twk-lbl"><span>{label}</span></div>
      <div className="twk-seg" role="radiogroup">
        <div className="twk-seg-thumb" style={{ left: `calc(2px + ${idx} * (100% - 4px) / ${n})`, width: `calc((100% - 4px) / ${n})` }} />
        {opts.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function isLight(hex) {
  const h = String(hex).replace("#", "");
  const x = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, "0");
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}
const Check = ({ light }) => (
  <svg viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 7.2 5.8 10 11 4.2" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" stroke={light ? "rgba(0,0,0,.78)" : "#fff"} />
  </svg>
);

export function TweakColor({ label, value, options, onChange }) {
  const key = (o) => String(JSON.stringify(o)).toLowerCase();
  const cur = key(value);
  return (
    <div className="twk-row">
      <div className="twk-lbl"><span>{label}</span></div>
      <div className="twk-chips" role="radiogroup">
        {options.map((o, i) => {
          const colors = Array.isArray(o) ? o : [o];
          const [hero, ...rest] = colors;
          const sup = rest.slice(0, 4);
          const on = key(o) === cur;
          return (
            <button key={i} type="button" className="twk-chip" role="radio" aria-checked={on} data-on={on ? "1" : "0"}
              title={colors.join(" · ")} style={{ background: hero }} onClick={() => onChange(o)}>
              {sup.length > 0 && <span>{sup.map((c, j) => <i key={j} style={{ background: c }} />)}</span>}
              {on && <Check light={isLight(hero)} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
