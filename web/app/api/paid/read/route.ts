// GET /api/paid/read?url=...: a public web page as plain text for one cent. Charged only when the
// page was read.

import { NextResponse } from "next/server";
import { PAID_CORS, sell } from "@/lib/server/x402";
import { SERVICES, checkUrl, readPage } from "@/lib/server/paid";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: PAID_CORS });
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url");
  const url = raw ? checkUrl(raw) : "add ?url= with the page to read";
  if (typeof url === "string") return NextResponse.json({ error: url }, { status: 400, headers: PAID_CORS });
  const s = SERVICES.read;
  return sell(request, { amount: s.units, description: s.description }, () => readPage(url));
}
