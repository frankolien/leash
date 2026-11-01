// GET /api/paid: what an agent can buy here, free to read. Each service answers 402 with its price
// and is paid with leash_fetch from the agent's budget.

import { NextResponse } from "next/server";
import { PAID_CORS } from "@/lib/server/x402";
import { SERVICES } from "@/lib/server/paid";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: PAID_CORS });
}

export function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json(
    {
      payment: "x402 v2, the Leash transfer method on NEAR; an agent pays with leash_fetch",
      services: Object.values(SERVICES).map((s) => ({ url: `${origin}${s.path}`, usdc: s.usdc, description: s.description, params: s.params })),
    },
    { headers: PAID_CORS },
  );
}
