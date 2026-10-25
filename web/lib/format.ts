// Money and time on screen. Amounts are bigint in the token's smallest unit; strings carry them in
// and out of the chain so no float ever touches a dollar.

import type { Names, Policy } from "./types";

const DECIMALS = BigInt(6);
const UNIT = BigInt(10) ** DECIMALS;

export function toUsdc(units: bigint | string | null | undefined): string {
  if (units === null || units === undefined) return "0";
  const value = BigInt(units);
  const frac = (value % UNIT).toString().padStart(Number(DECIMALS), "0").replace(/0+$/, "");
  return frac ? `${value / UNIT}.${frac}` : `${value / UNIT}`;
}

export function toUnits(usdc: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(usdc.trim());
  if (!match) throw new Error(`amount must look like 12.50, got ${usdc}`);
  return BigInt(match[1]) * UNIT + BigInt((match[2] ?? "").padEnd(Number(DECIMALS), "0"));
}

/// Dollars split for the big numeral: whole and cents, so the cents can sit small like a bank app.
export function splitUsdc(units: bigint): { whole: string; cents: string } {
  const whole = (units / UNIT).toLocaleString("en-US");
  const cents = ((units % UNIT) / BigInt(10_000)).toString().padStart(2, "0");
  return { whole, cents };
}

export function nearOf(yocto: bigint): string {
  return (Number(yocto / BigInt(10) ** BigInt(20)) / 10_000).toFixed(3);
}

export function msOf(ns: number | string): number {
  return Number(BigInt(ns) / BigInt(1_000_000));
}

/// How an agent behaves, in the owner's terms and with the real amounts.
export function modeOf(policy: Policy): string {
  const per = BigInt(policy.per_payment_cap);
  const daily = BigInt(policy.daily_cap);
  if (per === BigInt(0)) return "Asks before every payment";
  if (per < daily) return `Pays up to $${toUsdc(per)} alone, asks above`;
  return `Pays alone, up to $${toUsdc(daily)} a day`;
}

export function shortKey(key: string): string {
  const body = key.replace(/^ed25519:/, "");
  return `${body.slice(0, 6)}…${body.slice(-4)}`;
}

/// The owner's name for a key, else a short stable label so nobody reads base58.
export function agentLabel(key: string, names: Names): string {
  return names[key] ?? `agent ${key.replace(/^ed25519:/, "").slice(0, 4).toLowerCase()}`;
}

/// How far a window has run, from 1 (just opened) to 0 (closed).
export function shareLeft(startMs: number, endMs: number, nowMs: number): number {
  const total = Math.max(1, endMs - startMs);
  return Math.min(1, Math.max(0, (endMs - nowMs) / total));
}
