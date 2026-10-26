"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/components/auth/AuthContext";
import { plainError } from "@/lib/errors";

export type Act = (label: string, run: () => Promise<unknown>, done: string) => Promise<void>;

/// The signed-in owner and a single way to run a write: refuses when the session is not the
/// owner's, reports the outcome, and refreshes the page afterwards.
export function useWallet(owner: string, afterWrite: () => Promise<void>, say: (text: string, bad?: boolean) => void) {
  const { session, ready, preparing, openSignIn, signOut } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const account = session?.accountId ?? null;
  const isOwner = account === owner;

  const act: Act = useCallback(
    async (label, run, done) => {
      if (!session || session.accountId !== owner) {
        say(session ? `Signed in as another account; this dashboard belongs to ${owner}` : `Sign in as the owner to ${label}`, true);
        if (!session) openSignIn();
        return;
      }
      setBusy(label);
      try {
        await run();
        say(done);
        await afterWrite();
      } catch (e) {
        console.warn(`Leash: ${label} failed`, e);
        say(plainError(e), true);
      } finally {
        setBusy(null);
      }
    },
    [session, owner, say, afterWrite, openSignIn],
  );

  const call = useCallback(
    (receiverId: string, method: string, args: Record<string, unknown>, deposit?: bigint) => {
      if (!session) throw new Error("sign in first");
      return session.call(receiverId, method, args, deposit);
    },
    [session],
  );

  return { account, session, isOwner, busy, ready, preparing, onConnect: openSignIn, onDisconnect: signOut, act, call };
}
