// Every tool answers in one shape, and says how the agent behaves in plain words.

import type { Policy } from "./types.js";

import type { Card } from "./card.js";

/// The agent reads the text; hosts that draw cards read `card` from the structured copy.
export function reply(value: Record<string, unknown>, card?: Card) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    ...(card ? { structuredContent: { ...value, card } } : {}),
  };
}

export function modeOf(policy: Policy): string {
  if (BigInt(policy.per_payment_cap) === 0n) return "ask every time";
  if (BigInt(policy.per_payment_cap) < BigInt(policy.daily_cap)) return "autonomous below a limit, ask above it";
  return "autonomous within limits";
}
