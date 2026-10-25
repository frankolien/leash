// Figures the dashboard derives from one snapshot: what agents spent today, the week's spending by
// day from the on-chain log, and the facts that decide a parked request. Pure functions, so the
// screens only draw.

import { agentLabel, msOf } from "./format";
import type { Agent, LogEntry, Names, Request } from "./types";

const DAY_MS = 86_400_000;

/// A policy's spend counts only inside its current 24-hour window, the same rule the contract uses.
function spentNow(a: Agent, now: number): bigint {
  const started = msOf(a.policy.day_started_at);
  return a.policy.day_started_at && now - started < DAY_MS ? BigInt(a.policy.spent_today) : BigInt(0);
}

export function spentToday(agents: Agent[], now: number): bigint {
  return agents.filter((a) => a.policy.active).reduce((sum, a) => sum + spentNow(a, now), BigInt(0));
}

export function dailyTotal(agents: Agent[]): bigint {
  return agents.filter((a) => a.policy.active).reduce((sum, a) => sum + BigInt(a.policy.daily_cap), BigInt(0));
}

/// Money that left the vault on each of the last seven local days, oldest first, in USDC.
export function weekSpend(log: LogEntry[], now: number): { labels: string[]; values: number[] } {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => new Date(today.getTime() - (6 - i) * DAY_MS));
  const values = days.map(() => 0);
  for (const e of log) {
    if (!e.amount || (e.event !== "pay" && e.event !== "request_approved")) continue;
    const at = msOf(e.at);
    const index = Math.floor((at - days[0].getTime()) / DAY_MS);
    if (index >= 0 && index < 7) values[index] += Number(BigInt(e.amount)) / 1e6;
  }
  return { labels: days.map((d) => d.toLocaleDateString(undefined, { weekday: "short" })), values };
}

export function greeting(now: number): string {
  const h = new Date(now).getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export type Fact = { label: string; value: string };

/// What the owner needs to know before approving: what the agent may pay alone, what it has left,
/// whether the recipient is one it is allowed to pay, and that approving covers this payment only.
export function requestFacts(r: Request, agent: Agent | undefined, names: Names, toUsdc: (u: bigint | string) => string): Fact[] {
  const who = agentLabel(r.key, names);
  if (!agent) return [{ label: "Approving", value: "This payment only" }];
  const per = BigInt(agent.policy.per_payment_cap);
  const list = agent.policy.allowlist;
  return [
    { label: `${who} may pay alone`, value: per === BigInt(0) ? "Nothing, it always asks" : `up to $${toUsdc(per)}` },
    { label: "Left today", value: `$${toUsdc(agent.remaining)} of $${toUsdc(agent.policy.daily_cap)}` },
    { label: r.to, value: list.length === 0 ? "Any recipient allowed" : list.includes(r.to) ? "On its list" : "Not on its list" },
    { label: "Approving", value: "This payment only" },
  ];
}
