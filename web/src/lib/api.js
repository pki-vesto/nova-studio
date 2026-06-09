// Thin fetch wrapper around the Nova Studio Express API.
// Attaches the optional session token (set by Login) so the backend's
// non-blocking session middleware can identify the user. Auth stays optional:
// in single-user local mode no token exists and everything still works.
function authHeaders(extra = {}) {
  const token = (typeof localStorage !== "undefined" && localStorage.getItem("nova.token")) || "";
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

export const api = {
  async get(path) {
    const res = await fetch(path, { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async json(path, method, body) {
    const res = await fetch(path, { method, headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await res.text());
    if (res.status === 204) return null;
    return res.json();
  },
  async del(path) {
    const res = await fetch(path, { method: "DELETE", headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    return null;
  },
  async form(path, formData, method = "POST") {
    const res = await fetch(path, { method, headers: authHeaders(), body: formData });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }
};
