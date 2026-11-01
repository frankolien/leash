// The checks an owner should see before approving a payment: does the recipient exist and can it
// hold the token, has the owner paid it before, does its name imitate one they trust, and is the
// amount out of line with what this agent usually pays. Pure, so the panel only draws the answer.

import { toUsdc } from "./format";
import type { Agent, LogEntry, Request } from "./types";

export type CheckTone = "ok" | "note" | "danger";
export type Check = { tone: CheckTone; text: string };

/// What the chain says about the recipient, read just before the owner decides.
export type RecipientFacts = { exists: boolean; isContract: boolean; registered: boolean; reports?: { owner: string; evidence: string }[] };

/// Owners whose reports block an account for everyone, as the contract counts them.
const REPORTS_TO_BLOCK_ALL = 2;

export function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
    }
  }
  return rows[a.length][b.length];
}

/// Folds the characters scammers swap for each other, so vend0r and vendor read the same.
export function skeleton(account: string): string {
  return account.toLowerCase().replace(/rn/g, "m").replace(/vv/g, "w").replace(/[0]/g, "o").replace(/[1il|]/g, "l").replace(/[5]/g, "s").replace(/[-_]/g, "");
}

/// A different account whose name is one or two edits from, or folds to the same shape as, a
/// trusted one.
export function lookalikeOf(to: string, trusted: Iterable<string>): string | null {
  for (const name of trusted) {
    if (name === to) continue;
    if (skeleton(name) === skeleton(to) || editDistance(name, to) <= 2) return name;
  }
  return null;
}

const MOVED = new Set(["pay", "request_approved"]);

export function assess(r: Request, agent: Agent | undefined, log: LogEntry[], facts: RecipientFacts | null, owner?: string): Check[] {
  const checks: Check[] = [];
  const paid = log.filter((e) => MOVED.has(e.event) && e.to && e.amount);
  const trusted = new Set<string>([...(agent?.policy.allowlist ?? []), ...paid.map((e) => e.to as string)]);

  if (facts) {
    if (!facts.exists) checks.push({ tone: "danger", text: `${r.to} does not exist. The transfer would fail.` });
    else if (!facts.registered) checks.push({ tone: "danger", text: `${r.to} cannot receive USDC yet. The transfer would fail and be refunded.` });
    else checks.push({ tone: "ok", text: `${r.to} exists and can receive USDC.` });
    if (facts.exists && facts.isContract) checks.push({ tone: "note", text: `${r.to} is a contract, not a person.` });
    const reports = facts.reports ?? [];
    if (reports.length) {
      const mine = owner !== undefined && reports.some((x) => x.owner === owner);
      const who = mine ? "You reported" : reports.length >= REPORTS_TO_BLOCK_ALL ? `${reports.length} owners reported` : "Another owner reported";
      const quoted = reports.slice(-2).map((x) => `"${x.evidence}"`).join(", ");
      checks.push({ tone: "danger", text: `${who} ${r.to} as a scam: ${quoted}.` });
    }
  }

  const look = lookalikeOf(r.to, trusted);
  if (look) checks.push({ tone: "danger", text: `${r.to} looks like ${look}, which you trust, but it is a different account.` });

  const times = paid.filter((e) => e.to === r.to).length;
  checks.push(times > 0 ? { tone: "ok", text: `You have paid ${r.to} ${times === 1 ? "once" : `${times} times`} before.` } : { tone: "note", text: `First payment to ${r.to}.` });

  const mine = paid.filter((e) => e.key === r.key).map((e) => BigInt(e.amount as string));
  const largest = mine.reduce((m, v) => (v > m ? v : m), BigInt(0));
  if (largest > BigInt(0) && BigInt(r.amount) > largest) {
    checks.push({ tone: "note", text: `Larger than any payment this agent has made (up to $${toUsdc(largest)} so far).` });
  }
  return checks;
}

export function hasDanger(checks: Check[]): boolean {
  return checks.some((c) => c.tone === "danger");
}
