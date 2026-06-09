const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { z, validateBody, validateForm, errorBody, zodDetails } = require("./validate");

test("errorBody shapes the standard envelope", () => {
  assert.deepEqual(errorBody("Boem"), { error: "Boem" });
  assert.deepEqual(errorBody("Boem", [{ path: "x", message: "m" }]), { error: "Boem", details: [{ path: "x", message: "m" }] });
  assert.deepEqual(errorBody("Boem", []), { error: "Boem" });
});

test("zodDetails flattens issues to {path,message}", () => {
  const r = z.object({ a: z.string() }).safeParse({ a: 1 });
  const d = zodDetails(r.error);
  assert.equal(d.length, 1);
  assert.equal(d[0].path, "a");
  assert.ok(typeof d[0].message === "string");
});

async function call(mw, body, isForm) {
  const app = express();
  if (!isForm) app.use(express.json());
  app.post("/", mw, (req, res) => res.json({ body: req.body }));
  app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));
  const server = app.listen(0);
  await new Promise((r) => server.on("listening", r));
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}/`, {
    method: "POST",
    headers: isForm ? undefined : { "Content-Type": "application/json" },
    body: isForm ? body : JSON.stringify(body)
  });
  const json = await res.json();
  server.close();
  return { status: res.status, json };
}

test("validateBody rejects malformed input with the standard 400 envelope", async () => {
  const mw = validateBody(z.object({ name: z.string().min(1), price: z.coerce.number().optional() }));
  const bad = await call(mw, { name: "", price: "abc" });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, "Validatiefout");
  assert.ok(Array.isArray(bad.json.details) && bad.json.details.length >= 1);
});

test("validateBody coerces and merges, keeping unlisted keys", async () => {
  const mw = validateBody(z.object({ price: z.coerce.number().optional() }));
  const ok = await call(mw, { price: "42", note: "blijft" });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.body.price, 42, "coerced to number");
  assert.equal(ok.json.body.note, "blijft", "unlisted key preserved");
});

test("validateBody partial omits absent optionals (preserves diff checks)", async () => {
  const mw = validateBody(z.object({ a: z.string().optional(), b: z.string().optional() }), { partial: true });
  const ok = await call(mw, { a: "x" });
  assert.equal(ok.status, 200);
  assert.ok("a" in ok.json.body);
  assert.ok(!("b" in ok.json.body), "absent optional stays absent");
});
