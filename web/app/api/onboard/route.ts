// POST /api/onboard: readies a new embedded-wallet account. The caller proves with a Privy identity
// token that it holds the account; outside development a request without one is refused.

import { NextResponse } from "next/server";
import { DEFAULT_NETWORK, isImplicit } from "@/lib/config";
import { nearWalletsOf } from "@/lib/server/privy";
import { onboard, readiness } from "@/lib/server/sponsor";

// A per-instance brake on repeated calls from one address; on-chain checks make retries free anyway.
const recent = new Map<string, number[]>();
const WINDOW_MS = 10 * 60_000;
const LIMIT = 5;

function limited(ip: string): boolean {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > LIMIT;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "too many sign-ups from this address; try again in a few minutes" }, { status: 429 });

  const { accountId } = (await request.json().catch(() => ({}))) as { accountId?: string };
  if (!accountId || !isImplicit(accountId)) return NextResponse.json({ error: "accountId must be a NEAR implicit account" }, { status: 400 });

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (appId) {
    if (!token) return NextResponse.json({ error: "sign in first" }, { status: 401 });
    try {
      const wallets = await nearWalletsOf(token, appId);
      if (!wallets.includes(accountId)) return NextResponse.json({ error: "that account is not linked to your sign-in" }, { status: 403 });
    } catch {
      return NextResponse.json({ error: "your sign-in could not be verified; sign in again" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "sign-up is not configured" }, { status: 503 });
  }

  try {
    const ready = await onboard(accountId, DEFAULT_NETWORK);
    return NextResponse.json({ accountId, network: DEFAULT_NETWORK, ...ready, storageCredit: ready.storageCredit.toString() });
  } catch (error) {
    const state = await readiness(accountId, DEFAULT_NETWORK).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error), state: state && { ...state, storageCredit: state.storageCredit.toString() } }, { status: 502 });
  }
}
