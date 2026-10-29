// GET /api/x402/supported: the kinds of payment this facilitator settles.

import { NextResponse } from "next/server";
import { CORS } from "@/lib/server/oauth";
import { preflight } from "@/lib/server/discovery";
import { supported } from "@/lib/server/x402";

export { preflight as OPTIONS };

export async function GET() {
  return NextResponse.json(supported(), { headers: CORS });
}
