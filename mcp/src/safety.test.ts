import assert from "node:assert/strict";
import { test } from "node:test";
import { editDistance, skeleton } from "./safety.js";

test("lookalike characters fold to the same skeleton", () => {
  assert.equal(skeleton("vend0r.near"), skeleton("vendor.near"));
  assert.equal(skeleton("rnaya.near"), skeleton("maya.near"));
  assert.notEqual(skeleton("bakery.near"), skeleton("vendor.near"));
});

test("edit distance counts single-character changes", () => {
  assert.equal(editDistance("vendor.near", "vendor.near"), 0);
  assert.equal(editDistance("vendor.near", "vendors.near"), 1);
  assert.equal(editDistance("vendor.near", "vednor.near"), 2);
});
