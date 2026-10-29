// Telling the owner's phones that an agent is waiting on them. A phone registers its push token
// with a claim signed by one of its own keys on the owner's account; the relay, which sees every
// parked request and raise an agent sends through it, pushes the alert. The phone also checks for
// itself when it is open, so a push it has already shown is dropped there, not here.

import { PublicKey } from "near-api-js";
import { Redis } from "@upstash/redis";
import { CONTRACT, RPC } from "@/lib/config";
import { toUsdc } from "@/lib/format";
import type { Network, Policy, Proposal, Request } from "@/lib/types";
import { apnsConfigured, push, type ApnsEnvironment, type Push } from "./apns";

export type Phone = { token: string; environment: ApnsEnvironment; device: string; registered_at: number };
export type Claim = { owner: string; network: Network; key: string; token: string; environment: ApnsEnvironment; device?: string; expires_at: number };

const TOKEN = /^[0-9a-f]{64}$/;
const CLAIM_LIFETIME_MS = 10 * 60_000;

let redis: Redis | undefined;
/// The Upstash store the Vercel marketplace connects, under the names it gives the variables.
function store(): Redis | undefined {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return undefined;
  redis ??= new Redis({ url, token });
  return redis;
}

export function alertsConfigured(): boolean {
  return Boolean(store()) && apnsConfigured();
}

function phonesKey(network: Network, owner: string): string {
  return `phones:${network}:${owner}`;
}

/// The phone's claim is the exact text it signed, so nothing is re-encoded before checking. The key
/// must be an access key on the owner's account limited to the Leash contract: that is what makes
/// it the owner's phone and not anyone who knows the account name.
export async function verifiedClaim(text: string, signature: string): Promise<Claim> {
  let claim: Partial<Claim>;
  try {
    claim = JSON.parse(text) as Partial<Claim>;
  } catch {
    throw new Error("the claim is not JSON");
  }
  const { owner, network, key, token, environment, expires_at } = claim;
  if (!owner || (network !== "testnet" && network !== "mainnet") || !key || !token || !expires_at) throw new Error("the claim is missing fields");
  if (!TOKEN.test(token)) throw new Error("the push token is not hex");
  if (environment !== "sandbox" && environment !== "production") throw new Error("the environment is not one APNs has");
  if (expires_at < Date.now() || expires_at > Date.now() + CLAIM_LIFETIME_MS) throw new Error("the claim has expired");
  let ok = false;
  try {
    ok = PublicKey.fromString(key).verify(new TextEncoder().encode(`leash-phone:${text}`), Buffer.from(signature, "base64"));
  } catch {
    ok = false;
  }
  if (!ok) throw new Error("the signature does not match the key");
  const res = await fetch(RPC[network], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "leash", method: "query", params: { request_type: "view_access_key", finality: "optimistic", account_id: owner, public_key: key } }),
  });
  const body = (await res.json()) as { result?: { permission?: { FunctionCall?: { receiver_id?: string } } } };
  if (body.result?.permission?.FunctionCall?.receiver_id !== CONTRACT[network]) throw new Error("that key is not a Leash key on this account");
  return { owner, network, key, token, environment, device: claim.device, expires_at };
}

export async function registerPhone(claim: Claim): Promise<void> {
  const r = store();
  if (!r) throw new Error("alerts are not configured on this server");
  const phone: Phone = { token: claim.token, environment: claim.environment, device: (claim.device ?? "iPhone").slice(0, 40), registered_at: Date.now() };
  await r.hset(phonesKey(claim.network, claim.owner), { [claim.token]: JSON.stringify(phone) });
}

export async function forgetPhone(claim: Claim): Promise<void> {
  const r = store();
  if (!r) return;
  await r.hdel(phonesKey(claim.network, claim.owner), claim.token);
}

export async function phonesOf(network: Network, owner: string): Promise<Phone[]> {
  const r = store();
  if (!r) return [];
  const all = (await r.hgetall<Record<string, string | Phone>>(phonesKey(network, owner))) ?? {};
  return Object.values(all).map((v) => (typeof v === "string" ? (JSON.parse(v) as Phone) : v));
}

async function view<T>(network: Network, method: string, args: Record<string, unknown>): Promise<T | undefined> {
  const res = await fetch(RPC[network], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "leash", method: "query", params: { request_type: "call_function", finality: "optimistic", account_id: CONTRACT[network], method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") } }),
  });
  const body = (await res.json()) as { result?: { result?: number[] } };
  if (!body.result?.result) return undefined;
  return JSON.parse(Buffer.from(body.result.result).toString("utf8")) as T;
}

/// Why the payment waited, in the owner's terms rather than the contract's.
export function explain(reason: string, policy: Policy | undefined): string {
  if (reason === "over per-payment cap" && policy) return `Over its $${toUsdc(policy.per_payment_cap)} per-payment limit`;
  if (reason === "over daily cap" && policy) return `Over its $${toUsdc(policy.daily_cap)} daily limit`;
  if (reason === "recipient not in allowlist") return "Not someone it may pay on its own";
  if (reason === "cooldown not elapsed") return "Too soon after its last payment";
  return reason.charAt(0).toUpperCase() + reason.slice(1);
}

function money(units: string): string {
  const [whole, frac = ""] = toUsdc(units).split(".");
  return `$${Number(whole).toLocaleString("en-US")}.${frac.padEnd(2, "0").slice(0, 2)}`;
}

/// The alert for a parked request or a raise an agent asked for, as the phone's own local alert
/// would word it, so whichever arrives first is the one the owner sees.
export async function alertFor(network: Network, owner: string, kind: "request" | "proposal", id: number): Promise<Push | undefined> {
  const policies = (await view<[string, Policy][]>(network, "get_policies", { owner })) ?? [];
  const nameOf = (key: string) => policies.find(([k]) => k === key)?.[1].name ?? "An agent";
  if (kind === "request") {
    const request = (await view<Request[]>(network, "get_requests", { owner }))?.find((r) => r.id === id);
    if (!request) return undefined;
    const policy = policies.find(([k]) => k === request.key)?.[1];
    return {
      collapseId: `r${id}`,
      expires: Math.floor(request.expires_at / 1_000_000_000),
      payload: {
        aps: { alert: { title: `${nameOf(request.key)} wants to pay ${money(request.amount)}`, body: `To ${request.to}. ${explain(request.reason, policy)}.` }, category: "REQUEST", "interruption-level": "time-sensitive", "thread-id": "leash-waiting", sound: "default", "content-available": 1 },
        request: id,
      },
    };
  }
  const proposal = (await view<Proposal[]>(network, "get_proposals", { owner }))?.find((p) => p.id === id);
  if (!proposal) return undefined;
  return {
    collapseId: `p${id}`,
    payload: {
      aps: { alert: { title: `${nameOf(proposal.key)} asks for more`, body: proposal.note }, category: "ASK", "interruption-level": "time-sensitive", "thread-id": "leash-waiting", sound: "default", "content-available": 1 },
      proposal: id,
    },
  };
}

/// Pushes to every phone the owner registered; a token Apple no longer knows is dropped.
export async function alertOwner(network: Network, owner: string, kind: "request" | "proposal", id: number): Promise<void> {
  if (!alertsConfigured()) return;
  const phones = await phonesOf(network, owner);
  if (phones.length === 0) return;
  const alert = await alertFor(network, owner, kind, id);
  if (!alert) return;
  await Promise.all(
    phones.map(async (phone) => {
      const outcome = await push(phone.token, phone.environment, alert).catch((error: unknown) => {
        console.error(`apns: ${error instanceof Error ? error.message : String(error)}`);
        return "failed" as const;
      });
      if (outcome === "gone") await store()?.hdel(phonesKey(network, owner), phone.token);
    }),
  );
}
