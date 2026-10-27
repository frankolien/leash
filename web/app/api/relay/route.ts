// POST /api/relay: delivers an instruction an agent signed, so agents on a laptop need no NEAR for
// gas either. Set LEASH_RELAY_URL to this route in the agent's MCP config.

import { NextResponse } from "next/server";
import type { SignedMethod } from "leash-near-mcp";
import { CORS } from "@/lib/server/oauth";
import { preflight } from "@/lib/server/discovery";
import { RelayRefusal, relayIntent } from "@/lib/server/relay";

export { preflight as OPTIONS };

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { method?: SignedMethod; intent?: string; signature?: string };
  if (!body.method || typeof body.intent !== "string" || typeof body.signature !== "string") {
    return NextResponse.json({ error: "send method, intent and signature" }, { status: 400, headers: CORS });
  }
  try {
    return NextResponse.json(await relayIntent(body.method, { intent: body.intent, signature: body.signature }), { headers: CORS });
  } catch (error) {
    const refused = error instanceof RelayRefusal;
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: refused ? 400 : 502, headers: CORS });
  }
}
