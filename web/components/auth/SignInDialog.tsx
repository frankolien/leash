"use client";

// The way in. Google, Apple and email make an account behind the scenes; people who already have
// a NEAR wallet can use it instead. The /app page shows the card in place; elsewhere it opens as a
// dialog when a signed-out visitor tries to act.

import { useEffect, useRef, useState } from "react";
import { Loader2, Mail, X } from "lucide-react";
import { siApple, siNear } from "simple-icons";
import { DEFAULT_NETWORK } from "@/lib/config";
import { plainError } from "@/lib/errors";
import { REGISTRAR, accountExists, fullName, nameProblem } from "@/lib/names";
import type { Embedded } from "./AuthContext";
import styles from "./auth.module.css";

export type SignInProps = { ready: boolean; embedded: Embedded | null; preparing: string | null; error: string | null; onWallet: () => void };

function Mono({ path }: { path: string }) {
  return <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d={path} fill="currentColor" /></svg>;
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="19" height="19" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

type Step = { at: "options" } | { at: "email" } | { at: "code"; email: string };

function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

type Availability = "checking" | "free" | "taken" | "unknown";

/// The step after a first sign-in: the owner picks the name their account will carry.
function NamePicker({ suggestion, claim }: { suggestion: string; claim: (name: string) => Promise<void> }) {
  const [name, setName] = useState(suggestion);
  const [state, setState] = useState<Availability>("checking");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const invalid = name ? nameProblem(name) : null;
  const account = fullName(name, DEFAULT_NETWORK);

  useEffect(() => {
    if (!name || invalid) return;
    setState("checking");
    let current = true;
    const timer = window.setTimeout(() => {
      accountExists(account, DEFAULT_NETWORK).then((taken) => current && setState(taken ? "taken" : "free"), () => current && setState("unknown"));
    }, 300);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [name, invalid, account]);

  const note = !name ? "Letters and numbers, at least 2." : invalid ?? { checking: "Checking…", free: `${account} is yours to take.`, taken: `${account} is taken. Try another.`, unknown: "Couldn't check that name just now." }[state];
  const canClaim = !!name && !invalid && state !== "taken" && state !== "checking" && !busy;

  return (
    <>
      <span className={styles.mark} aria-hidden="true" />
      <h2 id="signin-title">Pick your name</h2>
      <p>Your account on NEAR. You can share it to get paid.</p>
      <form
        className={styles.options}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!canClaim) return;
          setBusy(true);
          setProblem(null);
          try {
            await claim(name);
          } catch (error) {
            setProblem(plainError(error));
            setBusy(false);
          }
        }}
      >
        <label className={styles.nameField} data-bad={(!!invalid || state === "taken") || undefined}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value.toLowerCase().trim())} spellCheck={false} autoCapitalize="none" autoComplete="off" maxLength={32} aria-label="Name" aria-describedby="name-note" placeholder="yourname" />
          <span>.{REGISTRAR[DEFAULT_NETWORK]}</span>
        </label>
        <span id="name-note" className={styles.nameNote} data-free={(state === "free" && !invalid && !!name) || undefined}>{note}</span>
        <button className={styles.white} disabled={!canClaim}>{busy && <Loader2 size={19} className={styles.spin} />}{busy ? `Creating ${account}…` : name && !invalid ? `Claim ${account}` : "Claim name"}</button>
      </form>
      {problem && <p className={styles.error} role="alert">{problem}</p>}
      <small className={styles.fine}>We create it and cover its first fees. It signs with the account you just used.</small>
    </>
  );
}

export function SignInCard({ ready, embedded, preparing, error, onWallet }: SignInProps) {
  const [step, setStep] = useState<Step>({ at: "options" });
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  const run = async (what: string, task: () => Promise<void>) => {
    setBusy(what);
    setProblem(null);
    try {
      await task();
    } catch (e) {
      setProblem(message(e));
    } finally {
      setBusy(null);
    }
  };

  const sendCode = (to: string) =>
    run("send", async () => {
      await embedded!.sendEmailCode(to);
      setCode("");
      setStep({ at: "code", email: to });
    });

  const checkCode = (value: string) => run("verify", () => embedded!.verifyEmailCode(value));

  const shown = problem ?? error;

  if (embedded?.naming && !preparing) return <NamePicker suggestion={embedded.naming.suggestion} claim={embedded.naming.claim} />;

  return (
    <>
      <span className={styles.mark} aria-hidden="true" />
      <h2 id="signin-title">Sign in to Leash</h2>
      {step.at === "code" ? <p>Enter the 6-digit code we sent to {step.email}.</p> : <p>Give your agents a budget, not your wallet.</p>}
      {preparing ? (
        <div className={styles.preparing} role="status"><Loader2 size={20} className={styles.spin} />{preparing}…</div>
      ) : step.at === "email" && embedded ? (
        <form className={styles.options} onSubmit={(e) => { e.preventDefault(); sendCode(email.trim()); }}>
          <input className={styles.field} type="email" required autoFocus autoComplete="email" placeholder="you@example.com" aria-label="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className={styles.white} disabled={busy !== null}>{busy === "send" && <Loader2 size={19} className={styles.spin} />}Send code</button>
          <button type="button" className={styles.text} onClick={() => { setProblem(null); setStep({ at: "options" }); }}>Back</button>
        </form>
      ) : step.at === "code" && embedded ? (
        <form className={styles.options} onSubmit={(e) => { e.preventDefault(); checkCode(code); }}>
          <input
            className={`${styles.field} ${styles.code}`}
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            aria-label="Code from your email"
            value={code}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(digits);
              if (digits.length === 6 && busy === null) checkCode(digits);
            }}
          />
          <button className={styles.white} disabled={busy !== null || code.length < 6}>{busy === "verify" && <Loader2 size={19} className={styles.spin} />}Sign in</button>
          <div className={styles.row}>
            <button type="button" className={styles.text} disabled={busy !== null} onClick={() => sendCode(step.email)}>Send a new code</button>
            <button type="button" className={styles.text} onClick={() => { setProblem(null); setStep({ at: "email" }); }}>Use a different email</button>
          </div>
        </form>
      ) : (
        <div className={styles.options}>
          {embedded && (
            <>
              <button className={styles.white} disabled={!ready || busy !== null} onClick={() => run("google", () => embedded.oauth("google"))}>{busy === "google" ? <Loader2 size={19} className={styles.spin} /> : <GoogleG />}Continue with Google</button>
              <button className={styles.white} disabled={!ready || busy !== null} onClick={() => run("apple", () => embedded.oauth("apple"))}>{busy === "apple" ? <Loader2 size={19} className={styles.spin} /> : <Mono path={siApple.path} />}Continue with Apple</button>
              <button className={styles.dark} disabled={!ready || busy !== null} onClick={() => { setProblem(null); setStep({ at: "email" }); }}><Mail size={19} />Continue with email</button>
              <span className={styles.or}>or</span>
            </>
          )}
          <button className={styles.dark} disabled={!ready || busy !== null} onClick={onWallet}><Mono path={siNear.path} />Use a NEAR wallet</button>
        </div>
      )}
      {shown && <p className={styles.error} role="alert">{shown}</p>}
      <small className={styles.fine}>{embedded ? "Signing in with Google, Apple or email creates a NEAR account for you. We cover its first fees." : "Sign in with any NEAR wallet."}</small>
    </>
  );
}

export default function SignInDialog({ open, onClose, ...card }: SignInProps & { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  // Account setup shows here only when the visitor asked to sign in; otherwise it runs quietly.
  const showing = open;
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (showing && !d.open) d.showModal();
    if (!showing && d.open) d.close();
  }, [showing]);

  return (
    <dialog ref={ref} className={`${styles.card} ${styles.dialog}`} onClose={onClose} aria-labelledby="signin-title">
      <button className={styles.close} onClick={onClose} aria-label="Close"><X size={18} /></button>
      <SignInCard {...card} />
    </dialog>
  );
}
