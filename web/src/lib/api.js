// Thin fetch wrapper around the Nova Studio Express API.
// Attaches the optional session token (set by Login) so the backend's
// non-blocking session middleware can identify the user. Auth stays optional:
// in single-user local mode no token exists and everything still works.
function authHeaders(extra = {}) {
  const token = (typeof localStorage !== "undefined" && localStorage.getItem("nova.token")) || "";
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

// A session that expired/was revoked mid-use returns 401. Clear the stale token
// and signal the app to fall back to the login gate — except for the login/
// register calls themselves, where the Login screen shows the error inline.
function handleUnauthorized(res, path) {
  if (res.status !== 401) return;
  const p = String(path || "");
  if (p.includes("/api/auth/login") || p.includes("/api/auth/register")) return;
  try { localStorage.removeItem("nova.token"); } catch { /* ignore */ }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("nova:unauthorized"));
}

async function fail(res, path) {
  handleUnauthorized(res, path);
  throw new Error(await res.text());
}

export const api = {
  async get(path) {
    const res = await fetch(path, { headers: authHeaders() });
    if (!res.ok) return fail(res, path);
    return res.json();
  },
  async json(path, method, body) {
    const res = await fetch(path, { method, headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
    if (!res.ok) return fail(res, path);
    if (res.status === 204) return null;
    return res.json();
  },
  async del(path) {
    const res = await fetch(path, { method: "DELETE", headers: authHeaders() });
    if (!res.ok) return fail(res, path);
    return null;
  },
  async form(path, formData, method = "POST") {
    const res = await fetch(path, { method, headers: authHeaders(), body: formData });
    if (!res.ok) return fail(res, path);
    return res.json();
  }
};
