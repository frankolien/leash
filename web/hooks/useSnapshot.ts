"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LeashReader } from "@/lib/reader";
import type { Network, Snapshot } from "@/lib/types";

const POLL_MS = 10_000;

/// Everything the page shows, re-read every ten seconds while open. A failed read keeps the last
/// good snapshot; the error is surfaced only when there was never one.
export function useSnapshot(owner: string, contract: string, network: Network) {
  const reader = useMemo(() => new LeashReader(network), [network]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await reader.snapshot(owner, contract));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [reader, owner, contract]);

  useEffect(() => {
    refresh();
    const poll = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(poll);
  }, [refresh]);

  return { snapshot, error, refresh };
}

/// A clock for anything that drains or counts on screen.
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(tick);
  }, [intervalMs]);
  return now;
}
