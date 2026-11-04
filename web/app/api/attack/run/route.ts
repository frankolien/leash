// POST /api/attack/run: runs the attack against the demo owner on testnet and streams each event
// as it happens (newline-delimited JSON). One run at a time: the demo agent has one key and one
// nonce, so a second click while a run is on gets 409 and the page follows the live run instead.

import { NextResponse } from "next/server";
import { CORS } from "@/lib/server/oauth";
import { preflight } from "@/lib/server/discovery";
import { runAttack, type AttackEvent } from "@/lib/server/attack";
import { finishRun, latestRun, recordEvent, startRun } from "@/lib/server/attackStore";

export { preflight as OPTIONS };
export const maxDuration = 300;

export async function POST() {
  const id = await startRun();
  if (!id) return NextResponse.json({ error: "a run is in progress", latest: await latestRun() }, { status: 409, headers: CORS });
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: AttackEvent) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        recordEvent(id, e).catch(() => {});
      };
      try {
        await runAttack(emit, id);
      } catch (error) {
        emit({ type: "error", text: error instanceof Error ? error.message : String(error) });
      } finally {
        await finishRun(id).catch(() => {});
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { ...CORS, "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-run-id": id } });
}
