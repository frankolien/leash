// POST /api/test-usdc: a few test USDC from the sponsor, so a new testnet owner can fund a vault and
// watch an agent pay without finding a faucet first. Testnet only, and only for an account that
// holds almost none.

import { NextResponse } from "next/server";
import { DEFAULT_NETWORK } from "@/lib/config";
import { provenOwner, rateLimiter } from "@/lib/server/owner";
import { giveTestUsdc } from "@/lib/server/sponsor";

const limited = rateLimiter(3, 60 * 60_000);

export async function POST(request: Request) {
  if (DEFAULT_NETWORK !== "testnet") return NextResponse.json({ error: "test USDC exists only on testnet" }, { status: 404 });
  if (limited(request)) return NextResponse.json({ error: "too many requests from this address; try again later" }, { status: 429 });
  const { accountId } = (await request.json().catch(() => ({}))) as { accountId?: string };
  const refusal = await provenOwner(request, accountId);
  if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });

  const outcome = await giveTestUsdc(accountId!).catch((e: unknown) => ({ given: null, reason: e instanceof Error ? e.message : String(e) }));
  if (outcome.given === null) return NextResponse.json({ error: outcome.reason, faucet: "https://faucet.circle.com" }, { status: 409 });
  return NextResponse.json({ given: outcome.given });
}
