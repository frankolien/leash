"use client";

// Turns a Privy sign-in into a ready NEAR account. After sign-in it makes the user's NEAR wallet if
// there is none, asks the sponsor to ready the account (NEAR for gas, USDC registration, Leash
// storage), and hands up a session that signs with the embedded wallet.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PrivyProvider, useIdentityToken, useLoginWithEmail, useLoginWithOAuth, usePrivy } from "@privy-io/react-auth";
import { useCreateWallet, useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { DEFAULT_NETWORK } from "@/lib/config";
import { embeddedSession } from "@/lib/session";
import { AuthCore, type Embedded } from "./AuthContext";

type Linked = { type: string; chainType?: string; address?: string; email?: string };

// Accounts this browser has already seen readied. A returning owner gets their session at once
// instead of waiting on the sponsor again; a new device checks once, in the background.
const READIED = "leash.readied";

function readiedHere(address: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(READIED) ?? "[]") as string[]).includes(address);
  } catch {
    return false;
  }
}

function rememberReadied(address: string) {
  try {
    const known = JSON.parse(localStorage.getItem(READIED) ?? "[]") as string[];
    if (!known.includes(address)) localStorage.setItem(READIED, JSON.stringify([...known, address]));
  } catch {
    // Without storage the owner just waits for the check next time.
  }
}

function Bridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, logout } = usePrivy();
  // Headless flows, so a click goes straight to the provider instead of through Privy's modal.
  const { initOAuth, state: oauth } = useLoginWithOAuth();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const { createWallet } = useCreateWallet();
  const { signRawHash } = useSignRawHash();
  const { identityToken } = useIdentityToken();
  const [readied, setReadied] = useState<string | null>(null);
  const [preparing, setPreparing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const creating = useRef(false);

  const linked = (user?.linkedAccounts ?? []) as Linked[];
  const address = linked.find((a) => a.type === "wallet" && a.chainType === "near")?.address ?? null;
  const label = user?.email?.address ?? user?.google?.email ?? user?.apple?.email ?? undefined;

  useEffect(() => {
    if (!ready || !authenticated || address || creating.current) return;
    creating.current = true;
    setPreparing("Creating your account");
    createWallet({ chainType: "near" })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => (creating.current = false));
  }, [ready, authenticated, address, createWallet]);

  useEffect(() => {
    if (!address || readied === address) return;
    if (readiedHere(address)) {
      setReadied(address);
      return;
    }
    if (!identityToken) return;
    let cancelled = false;
    setPreparing("Getting your account ready");
    fetch("/api/onboard", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${identityToken}` }, body: JSON.stringify({ accountId: address }) })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "your account could not be readied");
        rememberReadied(address);
        if (!cancelled) {
          setReadied(address);
          setError(null);
        }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setPreparing(null));
    return () => {
      cancelled = true;
    };
  }, [address, identityToken, readied]);

  useEffect(() => {
    if (oauth.status === "error") setError(oauth.error?.message ?? "Sign-in did not finish. Try again.");
  }, [oauth]);

  const session = useMemo(
    () => (authenticated && address && readied === address ? embeddedSession(address, DEFAULT_NETWORK, signRawHash as never, label) : null),
    [authenticated, address, readied, signRawHash, label],
  );

  const embedded: Embedded = {
    ready,
    session,
    preparing: authenticated ? preparing : oauth.status === "loading" ? "Signing you in" : null,
    error,
    oauth: async (provider) => {
      setError(null);
      await initOAuth({ provider });
    },
    sendEmailCode: (email) => sendCode({ email }),
    verifyEmailCode: (code) => loginWithCode({ code }),
    requestTestUsdc: async () => {
      if (!address || !identityToken) throw new Error("sign in first");
      const res = await fetch("/api/test-usdc", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${identityToken}` }, body: JSON.stringify({ accountId: address }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "no test USDC was sent");
    },
    logout: async () => {
      await logout();
      setReadied(null);
    },
  };

  return <AuthCore embedded={embedded}>{children}</AuthCore>;
}

export default function PrivyBridge({ appId, clientId, children }: { appId: string; clientId?: string; children: ReactNode }) {
  return (
    <PrivyProvider
      appId={appId}
      clientId={clientId}
      config={{
        loginMethods: ["google", "apple", "email"],
        appearance: { theme: "dark", accentColor: "#ffffff", logo: "/icon.svg", landingHeader: "Sign in to Leash" },
      }}
    >
      <Bridge>{children}</Bridge>
    </PrivyProvider>
  );
}
