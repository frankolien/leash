import { describe, expect, it } from "vitest";
import { agentLabel, modeOf, shareLeft, splitUsdc, toUnits, toUsdc } from "./format";
import type { Policy } from "./types";

const policy = (daily: string, per: string): Policy => ({ name: null, token: "usdc", daily_cap: daily, per_payment_cap: per, allowlist: [], cooldown_secs: 0, expires_at: 0, active: true, spent_today: "0", day_started_at: 0, last_paid_at: 0 });

describe("money", () => {
  it("round-trips typed USDC and six-decimal units without floats", () => {
    expect(toUnits("184.2")).toBe(BigInt(184_200_000));
    expect(toUsdc(BigInt(184_200_000))).toBe("184.2");
    expect(toUsdc("1")).toBe("0.000001");
  });
  it("refuses amounts that are not plain decimals", () => {
    expect(() => toUnits("1.1234567")).toThrow();
    expect(() => toUnits("-2")).toThrow();
  });
  it("splits a balance into whole dollars and two cents digits", () => {
    expect(splitUsdc(BigInt(1_234_560_000))).toEqual({ whole: "1,234", cents: "56" });
  });
});

describe("how an agent behaves, in words", () => {
  it("says the real limits", () => {
    expect(modeOf(policy("3000000", "2000000"))).toBe("Pays up to $2 alone, asks above");
    expect(modeOf(policy("1000000", "1000000"))).toBe("Pays alone, up to $1 a day");
    expect(modeOf(policy("5000000", "0"))).toBe("Asks before every payment");
  });
  it("names unnamed keys by a short stable label", () => {
    expect(agentLabel("ed25519:ABCDxyz", {})).toBe("agent abcd");
    expect(agentLabel("ed25519:ABCDxyz", { "ed25519:ABCDxyz": "claude" })).toBe("claude");
  });
  it("measures how much of a window is left", () => {
    expect(shareLeft(0, 100, 25)).toBe(0.75);
    expect(shareLeft(0, 100, 200)).toBe(0);
  });
});
