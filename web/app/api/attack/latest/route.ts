// GET /api/attack/latest: the most recent run's events, so the page is never empty and a visitor
// who arrives during a run can follow it.

import { NextResponse } from "next/server";
import { CORS } from "@/lib/server/oauth";
import { preflight } from "@/lib/server/discovery";
import { latestRun } from "@/lib/server/attackStore";

export { preflight as OPTIONS };

export async function GET() {
  return NextResponse.json((await latestRun()) ?? { id: null, running: false, events: [] }, { headers: { ...CORS, "cache-control": "no-store" } });
}
