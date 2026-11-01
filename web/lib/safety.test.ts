import { describe, expect, it } from "vitest";
import { assess, editDistance, hasDanger, lookalikeOf, skeleton } from "./safety";
import type { Agent, LogEntry, Request } from "./types";

const request = (to: string, amount = "5000000"): Request => ({ id: 1, owner: "maya.near", key: "claude", token: "usdc", to, amount, memo: null, reason: "over per-payment cap", created_at: 0, expires_at: 0 });
const agent: Agent = { key: "claude", remaining: BigInt(0), policy: { name: "claude", token: "usdc", daily_cap: "3000000", per_payment_cap: "2000000", allowlist: ["vendor.near"], cooldown_secs: 0, expires_at: 0, active: true, spent_today: "0", day_started_at: 0, last_paid_at: 0 } };
const paid = (to: string, amount: string): LogEntry => ({ at: 0, key: "claude", event: "pay", to, amount, detail: null });
const ok = { exists: true, isContract: false, registered: true };

describe("lookalikes", () => {
  it("folds the characters scammers swap", () => {
    expect(skeleton("vend0r.near")).toBe(skeleton("vendor.near"));
    expect(skeleton("rnaya.near")).toBe(skeleton("maya.near"));
    expect(editDistance("vendor.near", "vendors.near")).toBe(1);
  });
  it("finds a different account that imitates a trusted one, and not the trusted one itself", () => {
    expect(lookalikeOf("vend0r.near", ["vendor.near"])).toBe("vendor.near");
    expect(lookalikeOf("vendor.near", ["vendor.near"])).toBeNull();
    expect(lookalikeOf("bakery.near", ["vendor.near"])).toBeNull();
  });
});

describe("assess", () => {
  it("passes a known, registered recipient", () => {
    const checks = assess(request("vendor.near", "1000000"), agent, [paid("vendor.near", "1000000")], ok);
    expect(hasDanger(checks)).toBe(false);
    expect(checks.map((c) => c.text)).toContain("You have paid vendor.near once before.");
  });
  it("stops a lookalike of an allowlisted account", () => {
    const checks = assess(request("vend0r.near"), agent, [], ok);
    expect(hasDanger(checks)).toBe(true);
    expect(checks.find((c) => c.tone === "danger")?.text).toContain("looks like vendor.near");
  });
  it("stops a recipient that cannot receive the token", () => {
    expect(hasDanger(assess(request("vendor.near"), agent, [], { exists: true, isContract: false, registered: false }))).toBe(true);
    expect(hasDanger(assess(request("ghost.near"), agent, [], { exists: false, isContract: false, registered: false }))).toBe(true);
  });
  it("notes a first payment and an unusually large one", () => {
    const checks = assess(request("vendor.near", "5000000"), agent, [paid("shop.near", "1000000")], ok);
    expect(checks.map((c) => c.text)).toEqual(expect.arrayContaining(["First payment to vendor.near.", "Larger than any payment this agent has made (up to $1 so far)."]));
  });
  it("names scam reports as danger, and says whose", () => {
    const reports = [{ owner: "maya.near", evidence: "a page told my agent to pay it" }];
    const mine = assess(request("drainer.near"), agent, [], { ...ok, reports }, "maya.near");
    expect(hasDanger(mine)).toBe(true);
    expect(mine.some((c) => c.text.startsWith("You reported drainer.near as a scam: \"a page told"))).toBe(true);
    const others = assess(request("drainer.near"), agent, [], { ...ok, reports: [...reports, { owner: "bob.near", evidence: "phishing" }] }, "lee.near");
    expect(others.some((c) => c.text.startsWith("2 owners reported drainer.near"))).toBe(true);
    expect(hasDanger(assess(request("vendor.near"), agent, [], { ...ok, reports: [] }, "maya.near"))).toBe(false);
  });
});
