const test = require("node:test");
const assert = require("node:assert/strict");
const { id, parseJson, uploadUrl } = require("./utils");

test("id creates prefixed ids", () => {
  assert.match(id("project"), /^project_[a-f0-9]{18}$/);
});

test("parseJson returns fallback for invalid input", () => {
  assert.deepEqual(parseJson("not-json", []), []);
  assert.deepEqual(parseJson('{"ok":true}', {}), { ok: true });
});

test("uploadUrl exposes the basename only", () => {
  assert.equal(uploadUrl("/tmp/nova/file_abc.png"), "/uploads/file_abc.png");
});
