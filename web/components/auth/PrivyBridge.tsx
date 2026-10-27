"use client";

// Turns a Privy sign-in into a ready NEAR account. After sign-in it makes the user's NEAR key if
// there is none, finds the named account that key controls (or asks the owner to pick a name,
// which the sponsor creates), makes sure the account is readied, and hands up a session that signs
// for it with the embedded key.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PrivyProvider, useIdentityToken, useLoginWithEmail, useLoginWithOAuth, useLoginWithPasskey, usePrivy, useSignupWithPasskey } from "@privy-io/react-auth";
import { useCreateWallet, useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { DEFAULT_NETWORK } from "@/lib/config";
import { namesOfKey, suggestName } from "@/lib/names";
import { publicKeyOfImplicit } from "@/lib/privySigner";
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

// Each key's name, so a returning owner skips the lookup. A new device finds it from the key.
const NAMES = "leash.names";

function rememberedName(wallet: string): string | null {
  try {
    return (JSON.parse(localStorage.getItem(NAMES) ?? "{}") as Record<string, string>)[wallet] ?? null;
  } catch {
    return null;
  }
}

function rememberName(wallet: string, accountId: string) {
  try {
    const known = JSON.parse(localStorage.getItem(NAMES) ?? "{}") as Record<string, string>;
    localStorage.setItem(NAMES, JSON.stringify({ ...known, [wallet]: accountId }));
  } catch {
    // Without storage the name is looked up again next time.
  }
}

function Bridge({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, logout } = usePrivy();
  // Headless flows, so a click goes straight to the provider instead of through Privy's modal.
  const { initOAuth, state: oauth } = useLoginWithOAuth();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const { loginWithPasskey } = useLoginWithPasskey();
  const { signupWithPasskey } = useSignupWithPasskey();
  const { createWallet } = useCreateWallet();
  const { signRawHash } = useSignRawHash();
  const { identityToken } = useIdentityToken();
  const [owner, setOwner] = useState<string | null>(null);
  const [needsName, setNeedsName] = useState(false);
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
    setOwner(null);
    setNeedsName(false);
    if (!address) return;
    const known = rememberedName(address);
    if (known) {
      setOwner(known);
      return;
    }
    let cancelled = false;
    setPreparing("Getting your account ready");
    const unnamed = () => {
      if (cancelled) return;
      setNeedsName(true);
      setPreparing(null);
    };
    namesOfKey(publicKeyOfImplicit(address).toString(), DEFAULT_NETWORK)
      .then((names) => {
        if (cancelled) return;
        if (!names[0]) return unnamed();
        rememberName(address, names[0]);
        setOwner(names[0]);
      })
      .catch(unnamed);
    return () => {
      cancelled = true;
    };
  }, [address]);

  useEffect(() => {
    if (!owner || readied === owner) return;
    if (readiedHere(owner)) {
      setReadied(owner);
      setPreparing(null);
      return;
    }
    if (!identityToken) return;
    let cancelled = false;
    setPreparing("Getting your account ready");
    fetch("/api/onboard", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${identityToken}` }, body: JSON.stringify({ accountId: owner }) })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "your account could not be readied");
        rememberReadied(owner);
        if (!cancelled) {
          setReadied(owner);
          setError(null);
        }
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setPreparing(null));
    return () => {
      cancelled = true;
    };
  }, [owner, identityToken, readied]);

  async function claim(name: string) {
    if (!address || !identityToken) throw new Error("sign in first");
    const res = await fetch("/api/name", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${identityToken}` }, body: JSON.stringify({ name, wallet: address }) });
    const body = (await res.json().catch(() => ({}))) as { accountId?: string; error?: string };
    if (!res.ok) console.warn("Leash: claiming a name failed", res.status, body);
    // A key that already has a name keeps it; the picker just steps aside.
    if (!res.ok && !(res.status === 409 && body.accountId && body.error?.startsWith("you already have"))) throw new Error(body.error ?? "that name could not be claimed");
    const accountId = body.accountId!;
    rememberName(address, accountId);
    if (res.ok) {
      rememberReadied(accountId);
      setReadied(accountId);
    }
    setOwner(accountId);
    setNeedsName(false);
  }

  useEffect(() => {
    if (oauth.status === "error") setError(oauth.error?.message ?? "Sign-in did not finish. Try again.");
  }, [oauth]);

  const session = useMemo(
    () => (authenticated && address && owner && readied === owner ? embeddedSession(owner, DEFAULT_NETWORK, signRawHash as never, label, address) : null),
    [authenticated, address, owner, readied, signRawHash, label],
  );

  const embedded: Embedded = {
    ready,
    session,
    preparing: authenticated ? preparing : oauth.status === "loading" ? "Signing you in" : null,
    error,
    naming: authenticated && needsName ? { suggestion: suggestName(label), claim } : null,
    oauth: async (provider) => {
      setError(null);
      await initOAuth({ provider });
    },
    passkey: async () => {
      setError(null);
      try {
        await loginWithPasskey();
      } catch (e) {
        // No passkey for Leash on this device yet (or the sheet was closed): offer to make one,
        // which makes the account too.
        console.warn("Leash: passkey sign-in did not finish, offering a new passkey", e);
        await signupWithPasskey();
      }
    },
    sendEmailCode: (email) => sendCode({ email }),
    verifyEmailCode: (code) => loginWithCode({ code }),
    requestTestUsdc: async () => {
      if (!owner || !identityToken) throw new Error("sign in first");
      const res = await fetch("/api/test-usdc", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${identityToken}` }, body: JSON.stringify({ accountId: owner }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "no test USDC was sent");
    },
    logout: async () => {
      await logout();
      setReadied(null);
      setOwner(null);
      setNeedsName(false);
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
