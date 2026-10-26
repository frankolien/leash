// POST /api/onboard: readies a new embedded-wallet account. The caller proves with a Privy identity
// token that it holds the account; outside development a request without one is refused.

import { NextResponse } from "next/server";
import { DEFAULT_NETWORK } from "@/lib/config";
import { provenOwner, rateLimiter } from "@/lib/server/owner";
import { onboard, readiness } from "@/lib/server/sponsor";

const limited = rateLimiter(5, 10 * 60_000);

export async function POST(request: Request) {
  if (limited(request)) return NextResponse.json({ error: "too many sign-ups from this address; try again in a few minutes" }, { status: 429 });
  const { accountId } = (await request.json().catch(() => ({}))) as { accountId?: string };
  const refusal = await provenOwner(request, accountId);
  if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });

  try {
    const ready = await onboard(accountId!, DEFAULT_NETWORK);
    return NextResponse.json({ accountId, network: DEFAULT_NETWORK, ...ready, storageCredit: ready.storageCredit.toString() });
  } catch (error) {
    const state = await readiness(accountId!, DEFAULT_NETWORK).catch(() => null);
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error), state: state && { ...state, storageCredit: state.storageCredit.toString() } }, { status: 502 });
  }
}
