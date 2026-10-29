// POST /api/alerts: a phone registers its push token, DELETE forgets it. Either carries a claim the
// phone signed with one of its keys on the owner's account, so only the owner's own phones can
// ask to be told about their agents.

import { NextResponse } from "next/server";
import { CORS } from "@/lib/server/oauth";
import { preflight } from "@/lib/server/discovery";
import { alertsConfigured, forgetPhone, registerPhone, verifiedClaim } from "@/lib/server/alerts";

export { preflight as OPTIONS };

async function claimed(request: Request, act: (claim: Awaited<ReturnType<typeof verifiedClaim>>) => Promise<void>): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { claim?: string; signature?: string };
  if (typeof body.claim !== "string" || typeof body.signature !== "string") {
    return NextResponse.json({ error: "send claim and signature" }, { status: 400, headers: CORS });
  }
  if (!alertsConfigured()) return NextResponse.json({ error: "alerts are not configured on this server" }, { status: 503, headers: CORS });
  try {
    await act(await verifiedClaim(body.claim, body.signature));
    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400, headers: CORS });
  }
}

export async function POST(request: Request) {
  return claimed(request, registerPhone);
}

export async function DELETE(request: Request) {
  return claimed(request, forgetPhone);
}
