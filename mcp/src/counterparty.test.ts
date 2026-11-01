import { test } from "node:test";
import assert from "node:assert/strict";
import { assess, concerns, lookalike, type Facts } from "./counterparty.js";

const NOW = Date.UTC(2026, 10, 1);
const DAY = 86_400_000;
const known: Facts = {
  to: "vendor.testnet",
  exists: true,
  isContract: false,
  registered: true,
  createdAt: NOW - 400 * DAY,
  deployedAt: null,
  reputation: { reported_by: 0, by_you: false, blocked: false },
  reports: [],
  paidBefore: 3,
  lookalikeOf: null,
};
const levels = (f: Facts) => Object.fromEntries(assess(f, NOW).signals.map((s) => [s.signal, s.level]));

test("an old, registered account this agent has paid is allowed", () => {
  const { verdict, signals } = assess(known, NOW);
  assert.equal(verdict, "allow");
  assert.deepEqual(concerns(signals), []);
  assert.equal(levels(known).history, "ok");
});

test("a missing account or one that cannot hold the token is a block", () => {
  assert.equal(assess({ ...known, exists: false, registered: false, createdAt: null }, NOW).verdict, "block");
  assert.equal(assess({ ...known, registered: false }, NOW).verdict, "block");
});

test("a scam report blocks when the contract blocks, and warns when one stranger reported it", () => {
  const reports = [{ owner: "bob.testnet", key: null, evidence: "phishing link in a support chat", at: 1 }];
  const blocked = assess({ ...known, reputation: { reported_by: 2, by_you: false, blocked: true }, reports }, NOW);
  assert.equal(blocked.verdict, "block");
  assert.match(concerns(blocked.signals)[0], /reported as a scam by 2 owners: "phishing link/);
  const mineToo = assess({ ...known, reputation: { reported_by: 2, by_you: true, blocked: true }, reports }, NOW);
  assert.match(concerns(mineToo.signals)[0], /by this owner and 1 other:/);
  const once = assess({ ...known, reputation: { reported_by: 1, by_you: false, blocked: false }, reports }, NOW);
  assert.equal(once.verdict, "warn");
});

test("a lookalike, a day-old account and freshly changed contract code each warn", () => {
  assert.equal(assess({ ...known, to: "vend0r.testnet", lookalikeOf: "vendor.testnet" }, NOW).verdict, "warn");
  const young = assess({ ...known, createdAt: NOW - 3 * 3_600_000, paidBefore: 0 }, NOW);
  assert.equal(young.verdict, "warn");
  assert.match(concerns(young.signals)[0], /created 3 hours ago/);
  assert.equal(assess({ ...known, isContract: true, deployedAt: NOW - 2 * DAY }, NOW).verdict, "warn");
  assert.equal(assess({ ...known, isContract: true, deployedAt: NOW - 90 * DAY }, NOW).verdict, "allow");
});

test("what cannot be found out is a note, never a reason to stop a payment", () => {
  const unknown = assess({ ...known, exists: null, registered: null, createdAt: null, reputation: null, paidBefore: 0, isContract: true }, NOW);
  assert.equal(unknown.verdict, "allow");
  assert.ok(unknown.signals.every((s) => s.level === "note" || s.level === "ok"));
});

test("lookalikes fold swapped characters and catch near misses, but not the name itself", () => {
  assert.equal(lookalike("vend0r.testnet", ["vendor.testnet"]), "vendor.testnet");
  assert.equal(lookalike("vendorr.testnet", ["vendor.testnet"]), "vendor.testnet");
  assert.equal(lookalike("vendor.testnet", ["vendor.testnet"]), null);
  assert.equal(lookalike("alice.testnet", ["vendor.testnet"]), null);
});
