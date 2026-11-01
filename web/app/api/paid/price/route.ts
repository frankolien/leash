// GET /api/paid/price?token=near: a token's dollar price and 24-hour change for one cent. Charged
// only when a price came back.

import { NextResponse } from "next/server";
import { PAID_CORS, sell } from "@/lib/server/x402";
import { SERVICES, coinId, price } from "@/lib/server/paid";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: PAID_CORS });
}

export async function GET(request: Request) {
  const id = coinId(new URL(request.url).searchParams.get("token") ?? "");
  if (!id) return NextResponse.json({ error: "add ?token= with near, btc, eth, sol, usdc, usdt or a CoinGecko id" }, { status: 400, headers: PAID_CORS });
  const s = SERVICES.price;
  return sell(request, { amount: s.units, description: s.description }, () => price(id));
}
