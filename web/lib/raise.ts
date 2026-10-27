// Temporary raises in words. An agent asks with exact terms; the owner grants them for a while and
// they lapse on their own, so the dashboard shows the change and when it ends, never a vague "more".

import { toUsdc } from "./format";
import type { Agent, Ask, Policy } from "./types";

/// The caps in force now: a live raise's where it names one, the policy's otherwise.
export function caps(a: Agent): { daily: bigint; perPayment: bigint } {
  return {
    daily: BigInt(a.raise?.daily_cap ?? a.policy.daily_cap),
    perPayment: BigInt(a.raise?.per_payment_cap ?? a.policy.per_payment_cap),
  };
}

export function duration(secs: number): string {
  const hours = Math.round(secs / 3600);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

/// Each change the ask makes, as "Daily limit $5 to $20".
export function askChanges(ask: Ask, policy: Policy): string[] {
  const out: string[] = [];
  if (ask.daily_cap) out.push(`Daily limit $${toUsdc(policy.daily_cap)} to $${toUsdc(ask.daily_cap)}`);
  if (ask.per_payment_cap) out.push(`Pays alone up to $${toUsdc(policy.per_payment_cap)} to $${toUsdc(ask.per_payment_cap)}`);
  for (const to of ask.allow) out.push(`May also pay ${to}`);
  return out;
}

export function askLength(ask: Ask): number {
  return ask.for_secs > 0 ? ask.for_secs : 86_400;
}

export function untilText(untilNs: number): string {
  return new Date(untilNs / 1_000_000).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}
