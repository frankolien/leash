// How each on-chain event reads in the activity list: a tone for the icon, a glyph, and one line.
// A refusal is good news and is written as one; a row never shouts.

import type { LogEntry } from "./types";

export type Tone = "" | "good" | "warn" | "bad";

export type Described = { tone: Tone; glyph: string; title: string };

export function describe(e: LogEntry, who: string): Described {
  switch (e.event) {
    case "pay": return { tone: "good", glyph: "→", title: `${who} paid ${e.to}${e.detail ? ` · ${e.detail}` : ""}` };
    case "pay_failed": return { tone: "bad", glyph: "↩", title: `Transfer to ${e.to} failed; refunded` };
    case "pay_refused": return { tone: "bad", glyph: "×", title: `Refused ${who}: ${e.detail}. Nothing moved.` };
    case "request_parked": return { tone: "warn", glyph: "?", title: `${who} asked to pay ${e.to} (${e.detail})` };
    case "request_approved": return { tone: "good", glyph: "✓", title: `You approved ${who}'s payment to ${e.to}` };
    case "request_denied": return { tone: "", glyph: "–", title: `You denied ${who}'s request` };
    case "request_expired": return { tone: "", glyph: "⏱", title: `${who}'s request expired` };
    case "proposal_made": return { tone: "warn", glyph: "!", title: `${who} asks for more` };
    case "proposal_dismissed": return { tone: "", glyph: "–", title: `You dismissed ${who}'s proposal` };
    case "policy_set": return { tone: "", glyph: "+", title: `You granted ${who}` };
    case "policy_revoked": return { tone: "bad", glyph: "×", title: `You revoked ${who}` };
    case "paused": return { tone: "bad", glyph: "■", title: "You paused every agent" };
    case "resumed": return { tone: "good", glyph: "▶", title: "You resumed" };
    case "deposit": return { tone: "good", glyph: "+", title: "You added to the vault" };
    case "withdraw": return { tone: "", glyph: "−", title: "You took from the vault" };
    default: return { tone: "", glyph: "·", title: e.event };
  }
}

/// Events whose detail is already in the title, so the row does not say it twice.
export const DETAIL_IN_TITLE = new Set(["pay", "request_parked", "pay_refused"]);
