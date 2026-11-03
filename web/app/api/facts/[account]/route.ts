// GET /api/facts/{account}: the relay's signed facts about a recipient, for an agent that sends its
// own transactions and so cannot have the relay attach them. Anyone may read them; only the
// contract's pinned key makes them count.

import { NextResponse } from "next/server";
import { CORS } from "@/lib/server/oauth";
import { preflight } from "@/lib/server/discovery";
import { factsPublicKey, signedFacts } from "@/lib/server/facts";
import { DEFAULT_NETWORK } from "@/lib/config";

export { preflight as OPTIONS };

export async function GET(_request: Request, { params }: { params: Promise<{ account: string }> }) {
  const { account } = await params;
  if (!/^[a-z0-9._-]{2,64}$/.test(account)) return NextResponse.json({ error: "that is not a NEAR account" }, { status: 400, headers: CORS });
  try {
    return NextResponse.json({ ...(await signedFacts(account, DEFAULT_NETWORK)), signer: factsPublicKey() }, { headers: CORS });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502, headers: CORS });
  }
}
