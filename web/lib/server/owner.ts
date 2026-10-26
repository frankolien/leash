// Who may ask the sponsor for something: a NEAR implicit account whose holder proves it with a
// Privy identity token. Without Privy configured, only development servers accept the request.

import { isImplicit } from "@/lib/config";
import { nearWalletsOf } from "./privy";

export type Refusal = { error: string; status: number };

export async function provenOwner(request: Request, accountId: string | undefined): Promise<Refusal | null> {
  if (!accountId || !isImplicit(accountId)) return { error: "accountId must be a NEAR implicit account", status: 400 };
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (appId) {
    if (!token) return { error: "sign in first", status: 401 };
    try {
      const wallets = await nearWalletsOf(token, appId);
      if (!wallets.includes(accountId)) return { error: "that account is not linked to your sign-in", status: 403 };
    } catch {
      return { error: "your sign-in could not be verified; sign in again", status: 401 };
    }
    return null;
  }
  return process.env.NODE_ENV === "production" ? { error: "sign-up is not configured", status: 503 } : null;
}

/// A per-instance brake on repeated calls from one address; the on-chain checks behind each route
/// make honest retries free anyway.
export function rateLimiter(limit: number, windowMs: number) {
  const recent = new Map<string, number[]>();
  return (request: Request): boolean => {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const now = Date.now();
    const hits = (recent.get(ip) ?? []).filter((t) => now - t < windowMs);
    hits.push(now);
    recent.set(ip, hits);
    return hits.length > limit;
  };
}
