// The relay's word on a recipient, signed. The contract refuses a first payment to a stranger
// unless the facts about it (when the account was made, when its code last changed, how busy it is)
// are signed by the key the contract pins; this file writes and signs them. The agent never holds
// the key, so it cannot invent an old account for a scammer made this morning. NearBlocks is the
// source; a missing record is zero, which the contract reads as unknown rather than young.

import { KeyPair } from "near-api-js";
import { CONTRACT, DEFAULT_NETWORK } from "@/lib/config";
import type { Network } from "@/lib/types";

export type SignedFacts = { text: string; signature: string };

const INDEXER: Record<Network, string> = { testnet: "https://api-testnet.nearblocks.io/v1", mainnet: "https://api.nearblocks.io/v1" };
// Facts are good for an hour on chain; a minute's cache keeps a busy agent from hammering the indexer.
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; facts: SignedFacts }>();

function signer(): KeyPair {
  const key = process.env.FACTS_PRIVATE_KEY ?? process.env.SPONSOR_PRIVATE_KEY;
  if (!key) throw new Error("the facts signer is not configured");
  return KeyPair.fromString(key as `ed25519:${string}`);
}

/// The key the contract should pin: `set_facts_key` on the contract account.
export function factsPublicKey(): string {
  return signer().getPublicKey().toString();
}

export type RecipientFacts = { created_at: bigint; code_changed_at: bigint; tx_count: bigint };

/// What the indexer knows, in nanoseconds; zero where it has no record.
export async function lookup(to: string, network: Network = DEFAULT_NETWORK): Promise<RecipientFacts> {
  const base = process.env.LEASH_INDEXER_URL ?? INDEXER[network];
  const get = (path: string) => fetch(`${base}${path}`, { signal: AbortSignal.timeout(6_000), headers: process.env.NEARBLOCKS_API_KEY ? { Authorization: `Bearer ${process.env.NEARBLOCKS_API_KEY}` } : {} }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const ns = (v: unknown): bigint => (typeof v === "string" || typeof v === "number" ? BigInt(v) : 0n);
  const id = encodeURIComponent(to);
  const [account, deployments, count] = await Promise.all([get(`/account/${id}`), get(`/account/${id}/contract/deployments`), get(`/account/${id}/txns/count`)]);
  const deploys = ((deployments?.deployments ?? []) as { block_timestamp?: string }[]).map((d) => ns(d.block_timestamp));
  return {
    created_at: ns(account?.account?.[0]?.created?.block_timestamp),
    code_changed_at: deploys.reduce((a, b) => (b > a ? b : a), 0n),
    tx_count: ns(count?.txns?.[0]?.count),
  };
}

/// Signs facts about `to` for the contract on this network, as the exact text the contract parses.
/// The numbers are written by hand because nanoseconds overflow a JavaScript number.
export function sign(to: string, f: RecipientFacts, network: Network = DEFAULT_NETWORK, now = Date.now()): SignedFacts {
  const text = `{"contract":"${CONTRACT[network]}","to":"${to}","created_at":${f.created_at},"code_changed_at":${f.code_changed_at},"tx_count":${f.tx_count},"observed_at":${BigInt(now) * 1_000_000n}}`;
  const { signature } = signer().sign(new TextEncoder().encode(`leash-facts:${text}`));
  return { text, signature: Buffer.from(signature).toString("base64") };
}

export async function signedFacts(to: string, network: Network = DEFAULT_NETWORK): Promise<SignedFacts> {
  const hit = cache.get(`${network}:${to}`);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.facts;
  const facts = sign(to, await lookup(to, network), network);
  cache.set(`${network}:${to}`, { at: Date.now(), facts });
  return facts;
}
