// Public, read-only client portal — reached via a magic-link token.
// The token IS the credential; no auth ctx, no internal/edit chrome.
import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { Ph, Kicker, SectionHead } from "../components/primitives.jsx";
import { money, fileUrl } from "../lib/format.js";

// Maps backend item_status → editorial Dutch label + dot colour.
const ITEM_STATUS = {
  proposed: { label: "Voorgesteld", color: "var(--clay)" },
  approved: { label: "Akkoord", color: "var(--sage)" },
  rejected: { label: "Afgewezen", color: "var(--muted-2)" }
};
function itemStatusMeta(status) {
  return ITEM_STATUS[status] || { label: "Voorgesteld", color: "var(--clay)" };
}

function StatusBadge({ status }) {
  const { label, color } = itemStatusMeta(status);
  return (
    <span className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
      <span style={{ color }}><Icon name="dot" size={14} /></span>
      {label}
    </span>
  );
}

// Inline "leave a comment" form, used under each editorial section.
function SectionComment({ onSend }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await onSend(body.trim());
      setBody("");
      setOpen(false);
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="caption row middle gap2" style={{ marginTop: 18, color: "var(--sage)" }}>
        <Icon name="check" size={14} /> Bedankt — je reactie is verstuurd.
      </div>
    );
  }
  if (!open) {
    return (
      <button className="btn btn-ghost" style={{ marginTop: 18 }} onClick={() => setOpen(true)}>
        <Icon name="eye" size={15} /> Reactie achterlaten
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="col gap2" style={{ marginTop: 18, maxWidth: 560 }}>
      <textarea
        className="input"
        rows={3}
        value={body}
        autoFocus
        placeholder="Wat valt je op? Laat het ons weten…"
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="row gap2">
        <button type="submit" className="btn btn-clay" disabled={busy || !body.trim()}>
          {busy ? "Bezig…" : "Versturen"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setBody(""); }}>
          <Icon name="close" size={15} /> Annuleren
        </button>
      </div>
    </form>
  );
}

// Single product card with approve / reject + optional per-item comment.
function ProductCard({ product, onDecide }) {
  const [comment, setComment] = useState(product.client_comment || "");
  const [busy, setBusy] = useState(null);

  async function decide(decision) {
    setBusy(decision);
    try {
      await onDecide(product.id, decision, comment.trim());
    } finally {
      setBusy(null);
    }
  }

  const decided = product.item_status === "approved" || product.item_status === "rejected";

  return (
    <article className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <Ph
        label={`${product.name} — productfoto`}
        src={product.image_url}
        icon="cart"
        style={{ aspectRatio: "4/5" }}
      />
      <div className="col gap2" style={{ padding: 18, flex: 1 }}>
        <div className="row between middle" style={{ gap: 12 }}>
          {product.room_name && <span className="caption">{product.room_name}</span>}
          <StatusBadge status={product.item_status} />
        </div>
        <div className="serif" style={{ fontSize: 18, lineHeight: 1.25 }}>{product.name}</div>
        <div className="caption">
          {[product.brand, product.quantity ? `${product.quantity}×` : null]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <div className="serif" style={{ fontSize: 18, color: "var(--clay)" }}>{money(product.sale_price)}</div>

        <textarea
          className="input"
          rows={2}
          value={comment}
          placeholder="Opmerking (optioneel)…"
          onChange={(e) => setComment(e.target.value)}
          style={{ marginTop: 4 }}
        />

        <div className="row gap2" style={{ marginTop: "auto", paddingTop: 8 }}>
          <button
            className="btn btn-clay"
            style={{ flex: 1, justifyContent: "center" }}
            disabled={!!busy}
            onClick={() => decide("approve")}
          >
            <Icon name="check" size={15} /> {busy === "approve" ? "Bezig…" : "Akkoord"}
          </button>
          <button
            className="btn btn-ghost"
            style={{ flex: 1, justifyContent: "center" }}
            disabled={!!busy}
            onClick={() => decide("reject")}
          >
            <Icon name="close" size={15} /> {busy === "reject" ? "Bezig…" : "Afwijzen"}
          </button>
        </div>
        {decided && (
          <div className="caption" style={{ color: "var(--muted-2)" }}>
            Je keuze is genoteerd — je kunt deze altijd nog wijzigen.
          </div>
        )}
      </div>
    </article>
  );
}

export function PortalView({ token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overall, setOverall] = useState("");
  const [overallBusy, setOverallBusy] = useState(false);
  const [overallDone, setOverallDone] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const view = await api.get(`/api/portal/view/${token}`);
      setData(view);
    } catch (err) {
      // 404 / 410 / expired all surface here as a thrown error from the wrapper.
      setError("Deze link is niet (meer) geldig.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function sendFeedback(payload) {
    return api.json(`/api/portal/view/${token}/feedback`, "POST", payload);
  }

  async function onSectionComment(sectionId, body) {
    await sendFeedback({ target_type: "section", target_id: sectionId, body });
  }

  async function onProductDecide(productId, decision, body) {
    await sendFeedback({ target_type: "product", target_id: productId, decision, body });
    // Optimistically reflect the new status locally.
    const nextStatus = decision === "approve" ? "approved" : "rejected";
    setData((d) =>
      d
        ? {
            ...d,
            products: d.products.map((p) =>
              p.id === productId ? { ...p, item_status: nextStatus, client_comment: body } : p
            )
          }
        : d
    );
  }

  async function onOverall(e) {
    e.preventDefault();
    if (!overall.trim()) return;
    setOverallBusy(true);
    try {
      await sendFeedback({
        target_type: "proposal",
        target_id: data?.proposal?.id || "",
        body: overall.trim()
      });
      setOverall("");
      setOverallDone(true);
    } catch (err) {
      setError("Je reactie kon niet worden verstuurd. Probeer het later opnieuw.");
    } finally {
      setOverallBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="content rise">
        <div className="empty">
          <Kicker>Even geduld</Kicker>
          <p className="caption" style={{ margin: 0 }}>Je voorstel wordt geladen…</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="content rise" style={{ maxWidth: 640 }}>
        <div className="empty">
          <span style={{ color: "var(--clay)" }}><Icon name="lock" size={28} /></span>
          <h2 className="serif" style={{ fontSize: 26, margin: 0 }}>Link niet beschikbaar</h2>
          <p className="caption" style={{ margin: 0, maxWidth: 360 }}>{error}</p>
          <p className="caption" style={{ margin: 0, color: "var(--muted-2)" }}>
            Neem contact op met Nova Studio voor een nieuwe link.
          </p>
        </div>
      </div>
    );
  }

  const { project, proposal, sections = [], products = [] } = data || {};

  return (
    <div className="content content-wide rise" style={{ maxWidth: 1080 }}>
      {error && <div className="banner-error">{error}</div>}

      {/* Hero header */}
      <header className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 36 }}>
        {project.hero_image_url && (
          <Ph
            label="sfeerbeeld"
            src={project.hero_image_url}
            icon="mood"
            style={{ aspectRatio: "16/7", borderRadius: 0 }}
          />
        )}
        <div style={{ padding: "clamp(28px,4vw,52px)" }}>
          <Kicker>Persoonlijk voorstel · Nova Studio</Kicker>
          <h1 className="serif" style={{ fontSize: "clamp(34px,5.5vw,64px)", lineHeight: 1.04, margin: "14px 0 0", maxWidth: 820 }}>
            {project.title}
          </h1>
          <div className="row gap3 wrap" style={{ marginTop: 18, color: "var(--ink-2)" }}>
            {project.client_name && <span style={{ fontSize: 15 }}>{project.client_name}</span>}
            {project.client_name && (project.location || project.address) && (
              <span style={{ opacity: 0.4 }}>·</span>
            )}
            {(project.location || project.address) && (
              <span style={{ fontSize: 15 }}>{project.location || project.address}</span>
            )}
          </div>
        </div>
      </header>

      {/* Proposal heading */}
      {proposal && (
        <div className="row between end wrap" style={{ gap: 16, marginBottom: 8 }}>
          <h2 className="serif" style={{ fontSize: "clamp(26px,3.4vw,40px)", margin: 0 }}>
            {proposal.title}
          </h2>
          <div className="row gap2 middle">
            {proposal.version != null && (
              <span className="mono" style={{ color: "var(--muted)" }}>Versie {proposal.version}</span>
            )}
            {proposal.status && (
              <span className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <span style={{ color: "var(--clay)" }}><Icon name="dot" size={14} /></span>
                {proposal.status}
              </span>
            )}
          </div>
        </div>
      )}
      <hr className="hr" style={{ margin: "20px 0 40px" }} />

      {/* Editorial sections */}
      {sections.length > 0 && (
        <div className="col" style={{ gap: 48, marginBottom: 56 }}>
          {sections.map((s) => (
            <section key={s.id}>
              {s.title && (
                <h3 className="serif" style={{ fontSize: "clamp(22px,2.8vw,32px)", margin: "0 0 14px" }}>
                  {s.title}
                </h3>
              )}
              {s.body && (
                <p className="body" style={{ fontSize: 16, lineHeight: 1.7, whiteSpace: "pre-wrap", maxWidth: 720, margin: 0 }}>
                  {s.body}
                </p>
              )}
              <SectionComment onSend={(body) => onSectionComment(s.id, body)} />
            </section>
          ))}
        </div>
      )}

      {/* Product selection */}
      {products.length > 0 && (
        <section style={{ marginBottom: 56 }}>
          <SectionHead
            kicker="De selectie"
            title="Jouw stukken"
            sub="Bekijk elk voorstel en geef per item aan of je akkoord gaat. Je keuze kun je altijd nog aanpassen."
          />
          <div className="grid grid-3">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} onDecide={onProductDecide} />
            ))}
          </div>
        </section>
      )}

      {/* Overall response */}
      <section className="card" style={{ padding: "clamp(28px,4vw,48px)", marginBottom: 40 }}>
        <Kicker>Tot slot</Kicker>
        <h2 className="serif" style={{ fontSize: "clamp(24px,3vw,36px)", margin: "12px 0 8px" }}>
          Reactie op het voorstel
        </h2>
        <p className="body" style={{ maxWidth: 560, marginTop: 0 }}>
          Laat hieronder je algemene gedachten, vragen of wensen achter. We nemen ze mee in het vervolg.
        </p>
        {overallDone ? (
          <div className="row middle gap2" style={{ color: "var(--sage)", marginTop: 12 }}>
            <Icon name="check" size={16} /> Bedankt — we hebben je reactie ontvangen.
          </div>
        ) : (
          <form onSubmit={onOverall} className="col gap3" style={{ marginTop: 18, maxWidth: 620 }}>
            <textarea
              className="input"
              rows={5}
              value={overall}
              placeholder="Schrijf hier je reactie…"
              onChange={(e) => setOverall(e.target.value)}
            />
            <div className="row">
              <button type="submit" className="btn btn-primary" disabled={overallBusy || !overall.trim()}>
                <Icon name="proposal" size={15} /> {overallBusy ? "Bezig…" : "Reactie versturen"}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Footer note */}
      <hr className="hr" style={{ margin: "8px 0 20px" }} />
      <p className="caption row middle gap2" style={{ color: "var(--muted-2)", justifyContent: "center" }}>
        <Icon name="lock" size={13} />
        Je reageert via een beveiligde, persoonlijke link van Nova Studio.
      </p>
    </div>
  );
}
