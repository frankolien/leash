// POST /api/x402/verify: would this payment settle? Reads only; the x402 facilitator interface.

import { NextResponse } from "next/server";
import { CORS } from "@/lib/server/oauth";
import { preflight } from "@/lib/server/discovery";
import { verify, type FacilitatorBody } from "@/lib/server/x402";

export { preflight as OPTIONS };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as FacilitatorBody;
  return NextResponse.json(await verify(body), { headers: CORS });
}
