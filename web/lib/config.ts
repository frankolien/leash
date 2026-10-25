// Where Leash lives on each network. One shared contract holds every owner's vault, limits and
// requests, keyed by the owner's account, so a new owner costs a storage credit, not a deployment.

import type { Network } from "./types";

export const RPC: Record<Network, string> = {
  testnet: "https://rpc.testnet.fastnear.com",
  mainnet: "https://rpc.mainnet.fastnear.com",
};

export const USDC: Record<Network, string> = {
  testnet: "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af",
  mainnet: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
};

export const CONTRACT: Record<Network, string> = {
  testnet: process.env.NEXT_PUBLIC_LEASH_CONTRACT_TESTNET ?? "leash.frankolien.testnet",
  mainnet: process.env.NEXT_PUBLIC_LEASH_CONTRACT_MAINNET ?? "leash.near",
};

/// The network new sign-ups land on, and the one an implicit account (no suffix) is read from.
export const DEFAULT_NETWORK: Network = process.env.NEXT_PUBLIC_DEFAULT_NETWORK === "mainnet" ? "mainnet" : "testnet";

/// The methods an agent key may call, and the gas it may burn from the owner's balance.
export const AGENT_METHODS = ["pay", "request", "ask_more"];
export const AGENT_ALLOWANCE = (BigInt(10) ** BigInt(24) / BigInt(4)).toString();

export function isImplicit(account: string): boolean {
  return /^[0-9a-f]{64}$/.test(account);
}

export function networkOf(account: string): Network {
  if (account.endsWith(".testnet")) return "testnet";
  if (account.endsWith(".near")) return "mainnet";
  return DEFAULT_NETWORK;
}

export function contractOf(account: string): string {
  return CONTRACT[networkOf(account)];
}

/// An account id short enough to read: implicit accounts are 64 hex characters.
export function shortAccount(account: string): string {
  return isImplicit(account) ? `${account.slice(0, 6)}…${account.slice(-4)}` : account;
}
