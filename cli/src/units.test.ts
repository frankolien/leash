import assert from "node:assert/strict";
import { test } from "node:test";
import { toUnits, toUsdc, ttlToSeconds } from "./units.js";

test("amounts round-trip between typed USDC and six-decimal units", () => {
  assert.equal(toUnits("12.5"), 12_500_000n);
  assert.equal(toUnits("0.000001"), 1n);
  assert.equal(toUsdc(12_500_000n), "12.5");
  assert.equal(toUsdc("3000000"), "3");
});

test("amounts that are not plain decimals are refused", () => {
  for (const bad of ["-1", "1.2345678", "1e3", "abc", ""]) assert.throws(() => toUnits(bad));
});

test("a ttl becomes an absolute expiry in seconds", () => {
  const now = Math.floor(Date.now() / 1000);
  assert.ok(Math.abs(ttlToSeconds("2h") - (now + 7200)) <= 1);
  assert.throws(() => ttlToSeconds("2w"));
});
