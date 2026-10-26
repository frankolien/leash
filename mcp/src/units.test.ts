import assert from "node:assert/strict";
import { test } from "node:test";
import { toUnits, toUsdc, whenNs } from "./units.js";

test("amounts round-trip, and nothing that is not a plain decimal passes", () => {
  assert.equal(toUnits("1.50"), 1_500_000n);
  assert.equal(toUsdc(1_500_000n), "1.5");
  assert.equal(toUsdc(null), null);
  assert.throws(() => toUnits("1e3"));
});

test("chain nanoseconds read as ISO time", () => {
  assert.equal(whenNs("1761400000000000000"), new Date(1761400000000).toISOString());
});
