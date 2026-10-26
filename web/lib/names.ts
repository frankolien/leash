// Readable account names. An owner who signs in with Google gets a key from Privy; the sponsor
// then creates name.testnet (name.near on mainnet) through NEAR's registrar with that key as its
// only full-access key. The name is found again from the key, so nothing is stored on our side.

import { RPC } from "./config";
import type { Network } from "./types";

/// The registrar account, which is also the suffix every name ends in.
export const REGISTRAR: Record<Network, string> = { testnet: "testnet", mainnet: "near" };

const KEY_LOOKUP: Record<Network, string> = { testnet: "https://test.api.fastnear.com", mainnet: "https://api.fastnear.com" };

export function fullName(name: string, network: Network): string {
  return `${name}.${REGISTRAR[network]}`;
}

/// Why a name cannot be used, in words, or null when it can. Lowercase letters and digits, with
/// single hyphens or underscores between them; 2 to 32 characters.
export function nameProblem(name: string): string | null {
  if (name.length < 2) return "At least 2 characters.";
  if (name.length > 32) return "At most 32 characters.";
  if (/[^a-z0-9_-]/.test(name)) return "Only lowercase letters, numbers, - and _.";
  if (!/^[a-z0-9]+([-_][a-z0-9]+)*$/.test(name)) return "Start and end with a letter or number, with one - or _ between.";
  return null;
}

/// A first guess from the owner's email: its local part, cleaned into a valid name.
export function suggestName(email?: string): string {
  const local = (email ?? "").split("@")[0].toLowerCase();
  const cleaned = local.replace(/[.+]/g, "-").replace(/[^a-z0-9_-]/g, "").replace(/[-_]{2,}/g, "-").replace(/^[-_]+|[-_]+$/g, "").slice(0, 32).replace(/[-_]+$/, "");
  return nameProblem(cleaned) ? "" : cleaned;
}

/// The names this key controls on the network: direct children of the registrar only, so an
/// implicit account or someone else's subaccount is never picked up.
export async function namesOfKey(publicKey: string, network: Network): Promise<string[]> {
  const res = await fetch(`${KEY_LOOKUP[network]}/v0/public_key/${publicKey}`);
  if (!res.ok) throw new Error(`key lookup failed with ${res.status}`);
  const { account_ids } = (await res.json()) as { account_ids?: string[] };
  const suffix = `.${REGISTRAR[network]}`;
  return (account_ids ?? []).filter((id) => id.endsWith(suffix) && !id.slice(0, -suffix.length).includes("."));
}

export async function accountExists(accountId: string, network: Network): Promise<boolean> {
  const res = await fetch(RPC[network], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "name", method: "query", params: { request_type: "view_account", finality: "final", account_id: accountId } }),
  });
  const body = (await res.json()) as { result?: unknown; error?: { cause?: { name?: string } } };
  if (body.result) return true;
  if (body.error?.cause?.name === "UNKNOWN_ACCOUNT") return false;
  throw new Error("could not check that name");
}
