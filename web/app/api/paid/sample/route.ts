// GET /api/paid/sample: a resource that costs one cent per request, to show an agent paying for an
// API through Leash. Any route can charge the same way: call paywall first, serve if it settled.

import { NextResponse } from "next/server";
import { PAID_CORS, paywall } from "@/lib/server/x402";
import { DEFAULT_NETWORK } from "@/lib/config";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: PAID_CORS });
}

export async function GET(request: Request) {
  const paid = await paywall(request, { amount: "10000", description: "A sample paid resource from Leash: one cent per request" });
  if ("response" in paid) return paid.response;
  const explorer = DEFAULT_NETWORK === "mainnet" ? "https://nearblocks.io/txns/" : "https://testnet.nearblocks.io/txns/";
  return NextResponse.json(
    {
      ok: true,
      message: "You paid 0.01 USDC for this through Leash, within the limits your owner set.",
      paid_by: paid.settled.payer,
      transaction: paid.settled.transaction ? `${explorer}${paid.settled.transaction}` : null,
      at: new Date().toISOString(),
    },
    { headers: paid.headers },
  );
}
