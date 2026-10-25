import { describe, expect, it } from "vitest";
import { dailyTotal, recipients, requestFacts, spentToday, weekSpend } from "./insights";
import { toUsdc } from "./format";
import type { Agent, LogEntry, Policy, Request } from "./types";

const NS = 1_000_000;
const HOUR = 3_600_000;
const now = new Date(2026, 9, 25, 18).getTime();

function agent(key: string, over: Partial<Policy> = {}, remaining = 0): Agent {
  return { key, remaining: BigInt(remaining), policy: { name: key, token: "usdc", daily_cap: "3000000", per_payment_cap: "2000000", allowlist: [], cooldown_secs: 0, expires_at: 0, active: true, spent_today: "0", day_started_at: 0, last_paid_at: 0, ...over } };
}

function entry(event: string, msAgo: number, amount: string | null, to: string | null = "vendor.near"): LogEntry {
  return { at: (now - msAgo) * NS, key: "claude", event, to, amount, detail: null };
}

describe("today's spend", () => {
  it("counts only active agents inside their 24 hour window, as the contract does", () => {
    const agents = [
      agent("claude", { spent_today: "1000000", day_started_at: (now - 2 * HOUR) * NS }),
      agent("old", { spent_today: "5000000", day_started_at: (now - 30 * HOUR) * NS }),
      agent("revoked", { spent_today: "9000000", day_started_at: (now - HOUR) * NS, active: false }),
    ];
    expect(spentToday(agents, now)).toBe(BigInt(1_000_000));
    expect(dailyTotal(agents)).toBe(BigInt(6_000_000));
  });
});

describe("the week's spending", () => {
  it("buckets money that left the vault by local day, and ignores refusals and deposits", () => {
    const log = [entry("pay", HOUR, "1000000"), entry("request_approved", 26 * HOUR, "5000000"), entry("pay_refused", HOUR, "9000000"), entry("deposit", HOUR, "8000000", null), entry("pay", 9 * 24 * HOUR, "7000000")];
    const { values, labels } = weekSpend(log, now);
    expect(labels).toHaveLength(7);
    expect(values[6]).toBe(1);
    expect(values[5]).toBe(5);
    expect(values.reduce((a, b) => a + b, 0)).toBe(6);
  });
});

describe("the facts behind an approval", () => {
  const request: Request = { id: 1, owner: "maya.near", key: "claude", token: "usdc", to: "vendor.near", amount: "5000000", memo: null, reason: "over per-payment cap", created_at: 0, expires_at: 0 };
  it("says what the agent may do alone and whether the recipient is on its list", () => {
    const facts = requestFacts(request, agent("claude", { allowlist: ["vendor.near"] }, 2_000_000), { claude: "claude" }, toUsdc);
    expect(facts.map((f) => f.value)).toEqual(["up to $2", "$2 of $3", "On its list", "This payment only"]);
  });
  it("flags a recipient that is not on the list", () => {
    const facts = requestFacts(request, agent("claude", { allowlist: ["other.near"] }), {}, toUsdc);
    expect(facts[2].value).toBe("Not on its list");
  });
});

describe("recipients", () => {
  it("joins allowlists with what the log shows was paid, and names agents that may pay anyone", () => {
    const agents = [agent("claude", { allowlist: ["vendor.near", "frank.near"] }), agent("codex")];
    const log = [entry("pay", HOUR, "1000000"), entry("pay", 2 * HOUR, "2000000", "shop.near")];
    const { list, openKeys } = recipients(agents, log);
    expect(list.map((r) => [r.account, r.paid.toString()])).toEqual([["shop.near", "2000000"], ["vendor.near", "1000000"], ["frank.near", "0"]]);
    expect(openKeys).toEqual(["codex"]);
  });
});
