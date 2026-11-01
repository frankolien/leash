// GET /api/paid/search?q=...: Wikipedia's top five articles for two cents. Charged only when the
// search answered.

import { NextResponse } from "next/server";
import { PAID_CORS, sell } from "@/lib/server/x402";
import { SERVICES, wikipedia } from "@/lib/server/paid";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: PAID_CORS });
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length > 200) return NextResponse.json({ error: "add ?q= with what to search for, up to 200 characters" }, { status: 400, headers: PAID_CORS });
  const s = SERVICES.search;
  return sell(request, { amount: s.units, description: s.description }, () => wikipedia(q));
}
