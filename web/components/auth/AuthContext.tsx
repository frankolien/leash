"use client";

// Who is signed in, for every page. Two ways in: an embedded wallet made at sign-in with Google,
// Apple or email (through Privy, when the app is configured for it), or an existing NEAR wallet
// through NEAR Connect. Either way pages get one OwnerSession.

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DEFAULT_NETWORK } from "@/lib/config";
import { walletSession, type OwnerSession } from "@/lib/session";
import { connect as connectWallet, connectedAccount, disconnect as disconnectWallet } from "@/lib/wallet";
import SignInDialog, { type SignInProps } from "./SignInDialog";

export type OAuthProvider = "google" | "apple";

/// What the Privy bridge hands up when the app runs with Privy.
export type Embedded = {
  ready: boolean;
  session: OwnerSession | null;
  /// Set while a new account is being made and readied.
  preparing: string | null;
  error: string | null;
  /// Set when the signed-in owner has no name yet: a first guess, and the call that claims one.
  naming: { suggestion: string; claim: (name: string) => Promise<void> } | null;
  /// Sends the browser straight to Google's or Apple's account picker; sign-in finishes on return.
  oauth: (provider: OAuthProvider) => Promise<void>;
  /// Email sign-in inside our own card: send a one-time code, then check it.
  sendEmailCode: (email: string) => Promise<void>;
  verifyEmailCode: (code: string) => Promise<void>;
  /// Asks the sponsor for a few test USDC on testnet.
  requestTestUsdc: () => Promise<void>;
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
  card: SignInProps;
  /// Set when the signed-in owner can ask the sponsor for test USDC.
  testUsdc: (() => Promise<void>) | null;
  /// A page that shows the sign-in card itself calls this while mounted, so the dialog stays shut.
  showInline: () => () => void;
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
  const [inline, setInline] = useState(0);

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

  // A new owner picks a name before anything else.
  // The landing page stays a landing page; the app's own pages ask.
  const pathname = usePathname();
  const needsName = embedded?.naming != null && pathname !== "/";
  useEffect(() => {
    if (needsName) setDialog(true);
  }, [needsName]);

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
  const showInline = useCallback(() => {
    setInline((n) => n + 1);
    return () => setInline((n) => n - 1);
  }, []);

  const ready = walletReady && (embedded ? embedded.ready : true);
  const preparing = embedded?.preparing ?? null;
  const error = embedded?.error ?? walletError;
  const card: SignInProps = { ready, embedded, preparing, error, onWallet: signInWithWallet };
  const testUsdc = embedded?.session ? embedded.requestTestUsdc : null;
  const value: Auth = { session, ready, preparing, error, embeddedEnabled: embedded !== null, openSignIn, signOut, card, showInline, testUsdc };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {inline === 0 && <SignInDialog open={dialog} onClose={() => setDialog(false)} {...card} />}
    </AuthContext.Provider>
  );
}

/// Where "Get started" and "Sign in" lead: a signed-in owner goes straight to their dashboard.
export function useAppHref(): { href: string; signedIn: boolean } {
  const { session } = useAuth();
  return session ? { href: `/${encodeURIComponent(session.accountId)}`, signedIn: true } : { href: "/app", signedIn: false };
}
