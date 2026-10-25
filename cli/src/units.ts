// USDC amounts and times as people type them, and as the contract stores them.

import { DECIMALS } from "./config.js";

export function toUnits(usdc: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(usdc.trim());
  if (!match) throw new Error(`amount must look like 12.50, got ${usdc}`);
  return BigInt(match[1]) * 10n ** DECIMALS + BigInt((match[2] ?? "").padEnd(Number(DECIMALS), "0"));
}

export function toUsdc(units: string | bigint): string {
  const value = BigInt(units);
  const frac = (value % 10n ** DECIMALS).toString().padStart(Number(DECIMALS), "0").replace(/0+$/, "");
  return frac ? `${value / 10n ** DECIMALS}.${frac}` : `${value / 10n ** DECIMALS}`;
}

export function ttlToSeconds(ttl: string): number {
  const match = /^(\d+)([mhd])$/.exec(ttl);
  if (!match) throw new Error(`ttl must look like 30m, 2h or 3d, got ${ttl}`);
  const unit = { m: 60, h: 3600, d: 86400 }[match[2] as "m" | "h" | "d"];
  return Math.floor(Date.now() / 1000) + Number(match[1]) * unit;
}
