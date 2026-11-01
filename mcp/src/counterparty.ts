// Who is being paid: the check an agent runs on a recipient before it signs. It answers allow, warn
// or block with the signals behind the answer. Block means the agent does not sign; warn means a
// human decides, which on Leash is the owner approving a parked request on their phone. The contract
// enforces the owner's limits and the shared reports whatever this says; this layer catches what a
// limit cannot see, like a lookalike name or an account made an hour ago.

import { editDistance, skeleton } from "./safety.js";

export type Level = "block" | "warn" | "note" | "ok";
export type Signal = { signal: string; level: Level; detail: string };
export type Verdict = "allow" | "warn" | "block";

export type Report = { owner: string; key: string | null; evidence: string; at: number };
export type Reputation = { reported_by: number; by_you: boolean; blocked: boolean };

/// What the chain and the indexer say about a recipient. null is "could not find out".
export type Facts = {
  to: string;
  exists: boolean | null;
  isContract: boolean;
  /// Registered on the token the agent pays in, so a transfer can land.
  registered: boolean | null;
  /// When the account was created, in ms.
  createdAt: number | null;
  /// When contract code was last deployed to it, in ms.
  deployedAt: number | null;
  reputation: Reputation | null;
  reports: Report[];
  /// Payments this agent's key has made to it, from the owner's log.
  paidBefore: number;
  /// A trusted name it imitates: the allowlist and everyone the owner's agents have paid.
  lookalikeOf: string | null;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
export const YOUNG_MS = DAY;
export const FRESH_CODE_MS = 7 * DAY;

export function lookalike(to: string, trusted: Iterable<string>): string | null {
  for (const name of trusted) {
    if (name === to) continue;
    if (skeleton(name) === skeleton(to) || editDistance(name, to) <= 2) return name;
  }
  return null;
}

function ago(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / 60_000))} minutes`;
  if (ms < DAY) return `${Math.round(ms / HOUR)} hours`;
  const days = Math.round(ms / DAY);
  return days === 1 ? "a day" : `${days} days`;
}

function evidence(reports: Report[]): string {
  return reports.slice(-3).map((r) => `"${r.evidence}"`).join(", ");
}

export function assess(f: Facts, now = Date.now()): { verdict: Verdict; signals: Signal[] } {
  const s: Signal[] = [];
  const push = (signal: string, level: Level, detail: string) => s.push({ signal, level, detail });

  if (f.exists === false) push("exists", "block", `${f.to} does not exist; a payment would fail`);
  else if (f.exists === null) push("exists", "note", `could not check whether ${f.to} exists`);

  if (f.exists !== false) {
    if (f.registered === false) push("token", "block", `${f.to} cannot hold the token yet; a payment would fail and be refunded`);
    else if (f.registered === null) push("token", "note", `could not check whether ${f.to} can hold the token`);
  }

  const rep = f.reputation;
  if (rep?.blocked) {
    const others = rep.reported_by - (rep.by_you ? 1 : 0);
    const who = rep.by_you ? (others > 0 ? `by this owner and ${others} other${others === 1 ? "" : "s"}` : "by this owner") : `by ${rep.reported_by} owners`;
    push("reports", "block", `${f.to} was reported as a scam ${who}: ${evidence(f.reports)}. The contract refuses to pay it`);
  } else if (rep && rep.reported_by > 0) {
    push("reports", "warn", `another owner reported ${f.to} as a scam: ${evidence(f.reports)}`);
  }

  if (f.lookalikeOf) push("lookalike", "warn", `${f.to} looks like ${f.lookalikeOf}, which the owner trusts, but it is a different account`);

  if (f.exists !== false) {
    if (f.createdAt === null) push("age", "note", `could not find when ${f.to} was created`);
    else if (now - f.createdAt < YOUNG_MS) push("age", "warn", `${f.to} was created ${ago(now - f.createdAt)} ago`);
    else push("age", "ok", `${f.to} is ${ago(now - f.createdAt)} old`);
  }

  if (f.isContract) {
    if (f.deployedAt === null) push("code", "note", `${f.to} is a contract; when its code last changed is unknown`);
    else if (now - f.deployedAt < FRESH_CODE_MS) push("code", "warn", `${f.to} is a contract whose code changed ${ago(now - f.deployedAt)} ago`);
    else push("code", "note", `${f.to} is a contract; its code last changed ${ago(now - f.deployedAt)} ago`);
  }

  if (f.paidBefore > 0) push("history", "ok", `this agent has paid ${f.to} ${f.paidBefore === 1 ? "once" : `${f.paidBefore} times`} before`);
  else push("history", "note", `this agent has never paid ${f.to}`);

  const verdict: Verdict = s.some((x) => x.level === "block") ? "block" : s.some((x) => x.level === "warn") ? "warn" : "allow";
  return { verdict, signals: s };
}

/// The reasons worth saying out loud: everything that is not fine.
export function concerns(signals: Signal[]): string[] {
  return signals.filter((x) => x.level === "block" || x.level === "warn").map((x) => x.detail);
}
