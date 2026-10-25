// How each on-chain event reads in the activity list: a tone, an icon, and one line. A refusal is
// good news and is written as one; a row never shouts.

import type { LogEntry } from "./types";

export type Tone = "" | "good" | "warn" | "bad";

export type Icon = "out" | "in" | "back" | "refused" | "ask" | "check" | "minus" | "clock" | "key" | "pause" | "play";

export type Described = { tone: Tone; icon: Icon; title: string };

export function describe(e: LogEntry, who: string): Described {
  switch (e.event) {
    case "pay": return { tone: "good", icon: "out", title: `${who} paid ${e.to}${e.detail ? ` · ${e.detail}` : ""}` };
    case "pay_failed": return { tone: "bad", icon: "back", title: `Transfer to ${e.to} failed; refunded` };
    case "pay_refused": return { tone: "bad", icon: "refused", title: `Refused ${who}: ${e.detail}. Nothing moved.` };
    case "request_parked": return { tone: "warn", icon: "ask", title: `${who} asked to pay ${e.to} (${e.detail})` };
    case "request_approved": return { tone: "good", icon: "check", title: `You approved ${who}'s payment to ${e.to}` };
    case "request_denied": return { tone: "", icon: "minus", title: `You denied ${who}'s request` };
    case "request_expired": return { tone: "", icon: "clock", title: `${who}'s request expired` };
    case "proposal_made": return { tone: "warn", icon: "ask", title: `${who} asks for more` };
    case "proposal_dismissed": return { tone: "", icon: "minus", title: `You dismissed ${who}'s proposal` };
    case "policy_set": return { tone: "", icon: "key", title: `You granted ${who}` };
    case "policy_revoked": return { tone: "bad", icon: "key", title: `You revoked ${who}` };
    case "paused": return { tone: "bad", icon: "pause", title: "You paused every agent" };
    case "resumed": return { tone: "good", icon: "play", title: "You resumed" };
    case "deposit": return { tone: "good", icon: "in", title: "You added to the vault" };
    case "withdraw": return { tone: "", icon: "out", title: "You took from the vault" };
    default: return { tone: "", icon: "minus", title: e.event };
  }
}

/// Events whose detail is already in the title, so the row does not say it twice.
export const DETAIL_IN_TITLE = new Set(["pay", "request_parked", "pay_refused"]);
