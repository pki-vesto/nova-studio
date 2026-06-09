import { useState } from "react";
import { Ph, Kicker, Tag, StatusDot } from "../components/primitives.jsx";

const SYSTEM_PALETTE = [
  { name: "Kalkwit", hex: "#EFE9DE" },
  { name: "Travertijn", hex: "#D8C7AE" },
  { name: "Klei", hex: "#A86F4C" },
  { name: "Olijfschaduw", hex: "#6E7358" },
  { name: "Rookbruin", hex: "#5B4A3B" },
  { name: "Inkt", hex: "#2A251F" }
];

function GuideBlock({ title, sub, children }) {
  return (
    <section style={{ padding: "48px 0", borderTop: "1px solid var(--line)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 48, alignItems: "start" }}>
        <div style={{ position: "sticky", top: 96 }}>
          <h3 className="serif" style={{ fontSize: 24, margin: 0 }}>{title}</h3>
          {sub && <p className="caption" style={{ marginTop: 8, lineHeight: 1.5 }}>{sub}</p>}
        </div>
        <div>{children}</div>
      </div>
    </section>
  );
}

export function Stijlgids() {
  const [val, setVal] = useState("");
  return (
    <div className="content content-wide rise">
      <div className="page-head">
        <div><Kicker style={{ marginBottom: 14 }}>Design system · v1.0</Kicker><h1 className="page-title">Stijlgids</h1></div>
      </div>
      <p className="lede" style={{ maxWidth: 640, marginTop: -16, marginBottom: 8 }}>
        Eén systeem voor app, PDF-export en presentatie. Warm, editorial en rustig — gebouwd om beelden te laten ademen.
      </p>

      <GuideBlock title="Typografie" sub="Cormorant Garamond voor expressie, Manrope voor functie.">
        <div style={{ borderBottom: "1px solid var(--line)", paddingBottom: 20, marginBottom: 20 }}>
          <span className="eyebrow">Display · Cormorant Garamond</span>
          <div className="display" style={{ fontSize: 64, marginTop: 8 }}>Een huis dat ademt</div>
        </div>
        <div style={{ borderBottom: "1px solid var(--line)", paddingBottom: 18, marginBottom: 18 }}>
          <span className="eyebrow">Lede</span>
          <p className="lede" style={{ margin: "8px 0 0" }}>Rust ontstaat door materialen die kloppen — niet door leegte.</p>
        </div>
        <div className="row gap8 wrap" style={{ marginTop: 8 }}>
          <div><span className="eyebrow">Body · Manrope</span><p className="body" style={{ maxWidth: 340, marginTop: 8 }}>Lopende tekst in Manrope op 15,5px met ruime regelafstand voor comfortabel lezen op scherm en print.</p></div>
          <div className="col gap4">
            <span><span className="kicker">Kicker / label</span></span>
            <span className="caption">Caption — bijschrift bij beeld</span>
            <span className="mono">MONO · materiaalcode TR-01</span>
          </div>
        </div>
      </GuideBlock>

      <GuideBlock title="Kleur" sub="Lage chroma, warm. Klei als enige accent.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 14 }}>
          {SYSTEM_PALETTE.map((c) => (
            <div key={c.name}>
              <div style={{ aspectRatio: "1/1", borderRadius: "var(--r-md)", background: c.hex, border: "1px solid rgba(0,0,0,.06)" }} />
              <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 8 }}>{c.name}</div>
              <div className="mono" style={{ color: "var(--muted)" }}>{c.hex.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </GuideBlock>

      <GuideBlock title="Ruimte & vorm" sub="Acht-punts ritme. Bijna vierkante hoeken.">
        <div className="row gap4 wrap end" style={{ marginBottom: 28 }}>
          {[4, 8, 12, 16, 24, 32, 48, 64].map((s) => (
            <div key={s} className="col gap2 center" style={{ alignItems: "center" }}>
              <div style={{ width: s, height: s, background: "var(--clay)", borderRadius: 2 }} />
              <span className="mono" style={{ color: "var(--muted)" }}>{s}</span>
            </div>
          ))}
        </div>
        <div className="row gap4 wrap">
          {[["2", "sm"], ["4", "md"], ["8", "lg"], ["999", "pill"]].map(([r, n]) => (
            <div key={n} className="col gap2" style={{ alignItems: "center" }}>
              <div style={{ width: 72, height: 48, background: "var(--surface-2)", border: "1px solid var(--line-2)", borderRadius: r + "px" }} />
              <span className="mono" style={{ color: "var(--muted)" }}>{n}</span>
            </div>
          ))}
        </div>
      </GuideBlock>

      <GuideBlock title="Componenten" sub="Knoppen, tags, kaarten, formulier.">
        <div className="col gap6">
          <div className="row gap3 wrap middle">
            <button className="btn btn-primary">Primair</button>
            <button className="btn btn-clay">Klei accent</button>
            <button className="btn btn-ghost">Ghost</button>
            <button className="btn btn-quiet">Quiet</button>
          </div>
          <div className="row gap2 wrap middle">
            <Tag>Standaard</Tag><Tag variant="clay">Klei</Tag><Tag variant="solid">Solid</Tag><StatusDot status="proposal" /><StatusDot status="completed" />
          </div>
          <div className="grid grid-3">
            <article className="card" style={{ overflow: "hidden" }}>
              <Ph label="product" icon="cart" style={{ aspectRatio: "4/3" }} />
              <div style={{ padding: 16 }}><Kicker>Kaart</Kicker><h4 className="serif" style={{ fontSize: 20, margin: "6px 0 0" }}>Productkaart</h4></div>
            </article>
            <div className="card" style={{ padding: 22 }}>
              <span className="eyebrow">Formulier</span>
              <label className="caption" style={{ display: "block", margin: "14px 0 6px" }}>Projectnaam</label>
              <input className="input" value={val} onChange={(e) => setVal(e.target.value)} placeholder="bv. Herenhuis Keizersgracht" />
              <button className="btn btn-primary" style={{ marginTop: 14, width: "100%", justifyContent: "center" }}>Opslaan</button>
            </div>
            <div className="card" style={{ padding: 22 }}>
              <span className="eyebrow">Spec-lijst</span>
              <div className="spec-row"><span className="k">Oppervlakte</span><span className="v">240 m²</span></div>
              <div className="spec-row"><span className="k">Stijl</span><span className="v">Warm minimalisme</span></div>
              <div className="spec-row"><span className="k">Status</span><span className="v">Voorstel</span></div>
            </div>
          </div>
        </div>
      </GuideBlock>
    </div>
  );
}
