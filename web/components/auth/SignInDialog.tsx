"use client";

// The way in. Google, Apple and email make an account behind the scenes; people who already have
// a NEAR wallet can use it instead. The /app page shows the card in place; elsewhere it opens as a
// dialog when a signed-out visitor tries to act.

import { useEffect, useRef } from "react";
import { Loader2, Mail, X } from "lucide-react";
import { siApple, siNear } from "simple-icons";
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

export function SignInCard({ ready, embedded, preparing, error, onWallet }: SignInProps) {
  return (
    <>
      <span className={styles.mark} aria-hidden="true" />
      <h2 id="signin-title">Sign in to Leash</h2>
      <p>Give your agents a budget, not your wallet.</p>
      {preparing ? (
        <div className={styles.preparing} role="status"><Loader2 size={20} className={styles.spin} />{preparing}…</div>
      ) : (
        <div className={styles.options}>
          {embedded && (
            <>
              <button className={styles.white} disabled={!ready} onClick={() => embedded.login("google")}><GoogleG />Continue with Google</button>
              <button className={styles.white} disabled={!ready} onClick={() => embedded.login("apple")}><Mono path={siApple.path} />Continue with Apple</button>
              <button className={styles.dark} disabled={!ready} onClick={() => embedded.login("email")}><Mail size={19} />Continue with email</button>
              <span className={styles.or}>or</span>
            </>
          )}
          <button className={styles.dark} disabled={!ready} onClick={onWallet}><Mono path={siNear.path} />Use a NEAR wallet</button>
        </div>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <small className={styles.fine}>{embedded ? "Signing in with Google, Apple or email creates a NEAR account for you. We cover its first fees." : "Sign in with any NEAR wallet."}</small>
    </>
  );
}

export default function SignInDialog({ open, onClose, ...card }: SignInProps & { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const showing = open || !!card.preparing;
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
