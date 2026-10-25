// Where Leash lives, what the owner's config holds, and the constants every command shares.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Network = "testnet" | "mainnet";

export type Config = {
  owner: string;
  contract: string;
  network: Network;
  token: string;
  owner_key_file: string;
};

export type AgentKey = {
  name: string;
  owner: string;
  public_key: string;
  private_key: string;
  contract: string;
  network: Network;
  token: string;
};

export const HOME = join(homedir(), ".leash");
export const CONFIG = join(HOME, "config.json");
export const RPC: Record<Network, string> = {
  testnet: "https://rpc.testnet.fastnear.com",
  mainnet: "https://rpc.mainnet.fastnear.com",
};
/// The contract every owner shares, keyed by owner inside.
export const SHARED: Record<Network, string> = {
  testnet: process.env.LEASH_CONTRACT_TESTNET ?? "leash.frankolien.testnet",
  mainnet: process.env.LEASH_CONTRACT_MAINNET ?? "leash.near",
};

// Circle's native USDC on each network; the bridged USDC.e is not this.
export const USDC: Record<Network, string> = {
  testnet: "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af",
  mainnet: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
};
export const DECIMALS = 6n;
export const NEAR = 10n ** 24n;
export const TGAS = 10n ** 12n;
// Enough gas for the agent to make a few hundred calls before the owner tops the key up; the cap
// is on compute, the policy caps the money.
export const KEY_ALLOWANCE = NEAR / 4n;
// What the token contract charges to register an account that will hold its tokens.
export const STORAGE_DEPOSIT = 1_250_000_000_000_000_000_000n;

export function loadConfig(): Config {
  if (!existsSync(CONFIG)) throw new Error("no ~/.leash/config.json; run `leash init` first");
  return JSON.parse(readFileSync(CONFIG, "utf8")) as Config;
}
