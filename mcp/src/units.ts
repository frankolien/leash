// USDC amounts as an agent types them and as the contract stores them, and chain time.

import { DECIMALS } from "./config.js";

// Dollars in, smallest units out. A string avoids floating point on money.
export function toUnits(usdc: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(usdc.trim());
  if (!match) throw new Error(`amount must look like 12.50, got ${usdc}`);
  return BigInt(match[1]) * 10n ** DECIMALS + BigInt((match[2] ?? "").padEnd(Number(DECIMALS), "0"));
}

export function toUsdc(units: string | bigint | null | undefined): string | null {
  if (units === null || units === undefined) return null;
  const value = BigInt(units);
  const frac = (value % 10n ** DECIMALS).toString().padStart(Number(DECIMALS), "0").replace(/0+$/, "");
  return frac ? `${value / 10n ** DECIMALS}.${frac}` : `${value / 10n ** DECIMALS}`;
}

export function whenNs(ns: number | string): string {
  return new Date(Number(BigInt(ns) / 1_000_000n)).toISOString();
}
