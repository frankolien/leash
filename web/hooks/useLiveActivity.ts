"use client";

import { useEffect, useRef } from "react";
import { describe } from "@/lib/activity";
import { agentLabel } from "@/lib/format";
import type { LogEntry, Names } from "@/lib/types";

/// Announces what agents did since the last read, so a payment or a refusal shows up the moment
/// the dashboard sees it. The first read only sets the mark; the owner's own actions are not
/// repeated back to them.
export function useLiveActivity(log: LogEntry[] | undefined, names: Names, say: (text: string, bad?: boolean) => void) {
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (!log?.length) return;
    const newest = Number(log[0].at);
    if (seen.current === null) {
      seen.current = newest;
      return;
    }
    const fresh = log.filter((e) => Number(e.at) > (seen.current as number) && e.key);
    seen.current = Math.max(seen.current, newest);
    const latest = fresh[0];
    if (!latest) return;
    const { title, tone } = describe(latest, agentLabel(latest.key as string, names));
    say(fresh.length > 1 ? `${title} (and ${fresh.length - 1} more)` : title, tone === "bad");
  }, [log, names, say]);
}
