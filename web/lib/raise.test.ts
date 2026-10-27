import { describe, expect, it } from "vitest";
import { askChanges, caps, duration } from "./raise";
import type { Agent, Policy } from "./types";

const policy = { name: "claude", token: "usdc", daily_cap: "5000000", per_payment_cap: "2000000", allowlist: [], cooldown_secs: 0, expires_at: 0, active: true, spent_today: "0", day_started_at: 0, last_paid_at: 0 } as Policy;

describe("raises", () => {
  it("says what changes, in the owner's terms", () => {
    expect(askChanges({ daily_cap: "20000000", per_payment_cap: null, allow: ["vendor.near"], for_secs: 259200 }, policy)).toEqual(["Daily limit $5 to $20", "May also pay vendor.near"]);
  });

  it("uses a live raise's caps and the policy's otherwise", () => {
    const agent: Agent = { key: "k", policy, remaining: BigInt(0), raise: { daily_cap: "20000000", per_payment_cap: null, allow: [], until: 0 } };
    expect(caps(agent)).toEqual({ daily: BigInt(20_000_000), perPayment: BigInt(2_000_000) });
  });

  it("names how long in hours or days", () => {
    expect(duration(3600)).toBe("1 hour");
    expect(duration(259200)).toBe("3 days");
  });
});
