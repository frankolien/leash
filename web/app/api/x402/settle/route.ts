// POST /api/x402/settle: delivers the payment to the Leash contract and answers with the transaction;
// the x402 facilitator interface. Anyone may deliver a signed intent: it pays only whom the agent
// signed for, and the contract applies the owner's limits.

import { NextResponse } from "next/server";
import { CORS } from "@/lib/server/oauth";
import { preflight } from "@/lib/server/discovery";
import { settle, type FacilitatorBody } from "@/lib/server/x402";

export { preflight as OPTIONS };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as FacilitatorBody;
  return NextResponse.json(await settle(body), { headers: CORS });
}
