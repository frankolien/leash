"use client";

// Who is signed in, for every page. Two ways in: an embedded wallet made at sign-in with Google,
// Apple or email (through Privy, when the app is configured for it), or an existing NEAR wallet
// through NEAR Connect. Either way pages get one OwnerSession.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_NETWORK } from "@/lib/config";
import { walletSession, type OwnerSession } from "@/lib/session";
import { connect as connectWallet, connectedAccount, disconnect as disconnectWallet } from "@/lib/wallet";
import SignInDialog from "./SignInDialog";

export type EmbeddedMethod = "google" | "apple" | "email";

/// What the Privy bridge hands up when the app runs with Privy.
export type Embedded = {
  ready: boolean;
  session: OwnerSession | null;
  /// Set while a new account is being made and readied.
  preparing: string | null;
  error: string | null;
  login: (method: EmbeddedMethod) => void;
  logout: () => Promise<void>;
};

type Auth = {
  session: OwnerSession | null;
  ready: boolean;
  preparing: string | null;
  error: string | null;
  embeddedEnabled: boolean;
  openSignIn: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth outside AuthProvider");
  return value;
}

export function AuthCore({ embedded, children }: { embedded: Embedded | null; children: ReactNode }) {
  const [walletAccount, setWalletAccount] = useState<string | null>(null);
  const [walletReady, setWalletReady] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  useEffect(() => {
    connectedAccount(DEFAULT_NETWORK).then((id) => {
      setWalletAccount(id);
      setWalletReady(true);
    });
  }, []);

  const session = useMemo(
    () => embedded?.session ?? (walletAccount ? walletSession(walletAccount, DEFAULT_NETWORK) : null),
    [embedded?.session, walletAccount],
  );

  // Close the dialog once a session exists, whichever way it arrived.
  useEffect(() => {
    if (session) setDialog(false);
  }, [session]);

  const signInWithWallet = useCallback(async () => {
    setWalletError(null);
    try {
      setWalletAccount(await connectWallet(DEFAULT_NETWORK));
    } catch (e) {
      setWalletError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const signOut = useCallback(async () => {
    if (embedded?.session) await embedded.logout();
    if (walletAccount) {
      await disconnectWallet(DEFAULT_NETWORK);
      setWalletAccount(null);
    }
  }, [embedded, walletAccount]);

  const openSignIn = useCallback(() => setDialog(true), []);

  const value: Auth = {
    session,
    ready: walletReady && (embedded ? embedded.ready : true),
    preparing: embedded?.preparing ?? null,
    error: embedded?.error ?? walletError,
    embeddedEnabled: embedded !== null,
    openSignIn,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      <SignInDialog open={dialog} onClose={() => setDialog(false)} embedded={embedded} preparing={value.preparing} error={value.error} onWallet={signInWithWallet} />
    </AuthContext.Provider>
  );
}
