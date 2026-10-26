// Who may ask the sponsor for something. The caller proves with a Privy identity token which NEAR
// keys it holds; an account counts as theirs when it is the key's implicit account or a named
// account with that key as a full-access key. Without Privy configured, only development servers
// accept requests.

import { JsonRpcProvider } from "near-api-js";
import { RPC, isImplicit } from "@/lib/config";
import { publicKeyOfImplicit } from "@/lib/privySigner";
import type { Network } from "@/lib/types";
import { nearWalletsOf } from "./privy";

export type Refusal = { error: string; status: number };

/// The signed-in caller's Privy NEAR wallets, or "any" on a development server without Privy.
export async function signedInWallets(request: Request): Promise<string[] | "any" | Refusal> {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) return process.env.NODE_ENV === "production" ? { error: "sign-up is not configured", status: 503 } : "any";
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return { error: "sign in first", status: 401 };
  try {
    return await nearWalletsOf(token, appId);
  } catch {
    return { error: "your sign-in could not be verified; sign in again", status: 401 };
  }
}

export function isRefusal(value: unknown): value is Refusal {
  return typeof value === "object" && value !== null && "error" in value;
}

async function hasFullAccessKey(accountId: string, publicKey: string, network: Network): Promise<boolean> {
  const provider = new JsonRpcProvider({ url: RPC[network] });
  const key = await provider.viewAccessKey({ accountId, publicKey }).catch(() => null);
  return key?.permission === "FullAccess";
}

export async function provenOwner(request: Request, accountId: string | undefined, network: Network): Promise<Refusal | null> {
  if (!accountId) return { error: "accountId is missing", status: 400 };
  const wallets = await signedInWallets(request);
  if (isRefusal(wallets)) return wallets;
  if (wallets === "any") return null;
  if (isImplicit(accountId)) return wallets.includes(accountId) ? null : { error: "that account is not linked to your sign-in", status: 403 };
  for (const wallet of wallets) if (await hasFullAccessKey(accountId, publicKeyOfImplicit(wallet).toString(), network)) return null;
  return { error: "that account is not linked to your sign-in", status: 403 };
}

/// A per-instance brake on repeated calls from one address; the on-chain checks behind each route
/// make honest retries free anyway.
export function rateLimiter(limit: number, windowMs: number) {
  const recent = new Map<string, number[]>();
  return (request: Request): boolean => {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    // A developer's own machine is one address for every try; only deployed servers need the brake.
    if (ip === "local" && process.env.NODE_ENV !== "production") return false;
    const now = Date.now();
    const hits = (recent.get(ip) ?? []).filter((t) => now - t < windowMs);
    hits.push(now);
    recent.set(ip, hits);
    return hits.length > limit;
  };
}
