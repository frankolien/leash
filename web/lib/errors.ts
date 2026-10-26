// Turns what NEAR, the USDC contract and the wallets throw into one plain sentence for the toast.
// Raw messages carry receipts, JSON and "Smart contract panicked"; the owner needs to know what
// happened to their money and what to do next.

const KNOWN: [RegExp, string][] = [
  [/doesn't have enough balance|not enough balance to transfer|insufficient (usdc|funds?)/i, "There isn't enough USDC in your account for that."],
  [/is not registered/i, "That account can't hold USDC yet."],
  [/NotEnoughBalance|LackBalanceForState|Exceeded the account balance|balance to cover/i, "Your account is out of NEAR for fees. Nothing moved."],
  [/NotEnoughAllowance/i, "This key has used up its fee allowance. Nothing moved."],
  [/user (rejected|cancel+ed|closed)|rejected by (the )?user|request rejected/i, "Cancelled. Nothing moved."],
  [/InvalidNonce|has expired|timed? ?out|fetch failed|network error|failed to fetch/i, "NEAR didn't answer in time. Nothing moved; try again."],
];

function sentence(text: string): string {
  const t = text.trim().replace(/[.\s]+$/, "");
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}.`;
}

export function plainError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  for (const [pattern, message] of KNOWN) if (pattern.test(raw)) return message;
  const panic = raw.match(/Smart contract panicked: ([^\n"}\\]+)/);
  if (panic) return sentence(panic[1]);
  if (raw.length <= 120 && !/[{}[\]]/.test(raw)) return sentence(raw);
  return "That didn't go through, and nothing moved. Try again.";
}
