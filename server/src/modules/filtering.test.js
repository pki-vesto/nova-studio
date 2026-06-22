const test = require("node:test");
const assert = require("node:assert/strict");
const { flagFilter, likeFilter, textFilter } = require("./filtering");

test("filter helpers normalize query values", () => {
  assert.equal(textFilter("  active  "), "active");
  assert.equal(textFilter(null), "");
  assert.equal(likeFilter(" bank "), "%bank%");
  assert.equal(likeFilter(undefined), "%%");
  assert.equal(flagFilter("1"), true);
  assert.equal(flagFilter("true"), true);
  assert.equal(flagFilter(true), true);
  assert.equal(flagFilter("0"), false);
});
