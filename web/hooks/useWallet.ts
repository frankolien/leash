"use client";

import { useCallback, useEffect, useState } from "react";
import { callAs, connect, connectedAccount, disconnect } from "@/lib/wallet";
import type { Network } from "@/lib/types";

export type Act = (label: string, run: () => Promise<unknown>, done: string) => Promise<void>;

/// The owner's wallet session and a single way to run a write: refuses when the connected account
/// is not the owner, reports the outcome, and refreshes the page afterwards.
export function useWallet(owner: string, network: Network, afterWrite: () => Promise<void>, say: (text: string, bad?: boolean) => void) {
  const [account, setAccount] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    connectedAccount(network).then(setAccount);
  }, [network]);

  const isOwner = account === owner;

  const onConnect = useCallback(async () => {
    try {
      const next = await connect(network);
      setAccount(next);
      if (next && next !== owner) say(`Connected ${next}; this dashboard belongs to ${owner}`, true);
    } catch (e) {
      say(e instanceof Error ? e.message : String(e), true);
    }
  }, [network, owner, say]);

  const onDisconnect = useCallback(async () => {
    await disconnect(network);
    setAccount(null);
  }, [network]);

  const act: Act = useCallback(
    async (label, run, done) => {
      if (!isOwner) {
        say(`Connect ${owner} to ${label}`, true);
        return;
      }
      setBusy(label);
      try {
        await run();
        say(done);
        await afterWrite();
      } catch (e) {
        say(e instanceof Error ? e.message : String(e), true);
      } finally {
        setBusy(null);
      }
    },
    [isOwner, owner, say, afterWrite],
  );

  const call = useCallback(
    (receiverId: string, method: string, args: Record<string, unknown>, deposit?: bigint) => callAs(network, receiverId, method, args, deposit),
    [network],
  );

  return { account, isOwner, busy, onConnect, onDisconnect, act, call };
}
