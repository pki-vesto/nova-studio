// Optional, self-hosted login / register screen for Nova Studio.
// Standalone: no app context — talks to the auth API directly and hands the
// resulting user + token back to the host via onAuth.
import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { Icon } from "../lib/icons.jsx";
import { Field } from "../components/EditDrawer.jsx";
import { Kicker } from "../components/primitives.jsx";

export function Login({ onAuth, allowRegister }) {
  // null while we don't yet know whether any account exists.
  const [register, setRegister] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // On mount, decide the mode. No accounts yet → register the first owner.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { hasUsers } = await api.get("/api/auth/status");
        if (alive) setRegister(!hasUsers);
      } catch {
        // If status can't be reached, fall back to login so the form still shows.
        if (alive) setRegister(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function submit() {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const res = register
        ? await api.json("/api/auth/register", "POST", {
            name: form.name.trim(), email: form.email.trim(), password: form.password
          })
        : await api.json("/api/auth/login", "POST", {
            email: form.email.trim(), password: form.password
          });
      const { token, user } = res || {};
      if (token) localStorage.setItem("nova.token", token);
      onAuth && onAuth(user, token);
    } catch (err) {
      setError(err?.message || "Er ging iets mis. Probeer het opnieuw.");
      setBusy(false);
    }
  }

  // Don't flash a form before we know which mode to show.
  if (register === null) {
    return (
      <div className="row middle" style={{ minHeight: "100vh", justifyContent: "center", padding: 24 }}>
        <span className="caption" style={{ color: "var(--muted-2)" }}>Nova Studio wordt geladen…</span>
      </div>
    );
  }

  const heading = register ? "Richt je atelier in" : "Welkom terug";
  const intro = register
    ? "Maak het eigenaarsaccount aan om je atelier te openen."
    : "Meld je aan om verder te werken aan je projecten.";

  return (
    <div className="row middle" style={{ minHeight: "100vh", justifyContent: "center", padding: 24 }}>
      <div className="card" style={{ width: "100%", maxWidth: 420, padding: 36 }}>
        <div className="col" style={{ alignItems: "flex-start", gap: 0 }}>
          <Kicker style={{ marginBottom: 16, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Icon name="spark" size={14} /> Nova Studio
          </Kicker>
          <h1 className="serif" style={{ fontSize: 32, margin: "0 0 8px", lineHeight: 1.1 }}>{heading}</h1>
          <p className="caption" style={{ margin: "0 0 28px", color: "var(--ink-2)", textTransform: "none", letterSpacing: 0, fontSize: 14, fontWeight: 400, lineHeight: 1.55 }}>
            {intro}
          </p>
        </div>

        {error && <div className="banner-error" style={{ marginBottom: 20 }}>{error}</div>}

        <form
          className="form-grid"
          onSubmit={(e) => { e.preventDefault(); submit(); }}
        >
          {register && (
            <Field label="Naam">
              <input
                type="text"
                value={form.name}
                onChange={set("name")}
                placeholder="Studio Nova"
                autoComplete="name"
                autoFocus
              />
            </Field>
          )}
          <Field label="E-mailadres">
            <input
              type="email"
              value={form.email}
              onChange={set("email")}
              placeholder="jij@atelier.nl"
              autoComplete="email"
              autoFocus={!register}
              required
            />
          </Field>
          <Field label="Wachtwoord">
            <input
              type="password"
              value={form.password}
              onChange={set("password")}
              placeholder="••••••••"
              autoComplete={register ? "new-password" : "current-password"}
              required
            />
          </Field>

          <button type="submit" className="btn btn-primary btn-lg" disabled={busy} style={{ marginTop: 4, justifyContent: "center" }}>
            <Icon name={register ? "user" : "lock"} size={15} />
            {busy ? "Bezig…" : register ? "Atelier aanmaken" : "Inloggen"}
          </button>
        </form>

        {/* Offer the switch to register only when the host allows it and an
            account already exists (login mode). */}
        {!register && allowRegister && (
          <div className="row middle" style={{ justifyContent: "center", marginTop: 20 }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ border: "none", padding: 4, fontSize: 13 }}
              onClick={() => { setError(""); setRegister(true); }}
            >
              Account aanmaken
            </button>
          </div>
        )}

        <div className="row middle" style={{ gap: 8, marginTop: 28, color: "var(--muted-2)" }}>
          <Icon name="check" size={13} />
          <span className="caption" style={{ textTransform: "none", letterSpacing: 0, fontSize: 12, fontWeight: 400, lineHeight: 1.5 }}>
            Nova is lokaal en self-hosted — je gegevens blijven op je eigen server.
          </span>
        </div>
      </div>
    </div>
  );
}
