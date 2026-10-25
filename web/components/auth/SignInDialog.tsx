"use client";

// The way in. Google, Apple and email make an account behind the scenes; people who already have
// a NEAR wallet can use it instead.

import { useEffect, useRef } from "react";
import { Loader2, Mail, Wallet, X } from "lucide-react";
import { siApple, siGoogle } from "simple-icons";
import type { Embedded } from "./AuthContext";
import styles from "./auth.module.css";

function Brand({ path }: { path: string }) {
  return <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path d={path} fill="currentColor" /></svg>;
}

export default function SignInDialog(props: { open: boolean; onClose: () => void; embedded: Embedded | null; preparing: string | null; error: string | null; onWallet: () => void }) {
  const { open, onClose, embedded, preparing, error, onWallet } = props;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if ((open || preparing) && !d.open) d.showModal();
    if (!open && !preparing && d.open) d.close();
  }, [open, preparing]);

  return (
    <dialog ref={ref} className={styles.dialog} onClose={onClose} aria-labelledby="signin-title">
      <button className={styles.close} onClick={onClose} aria-label="Close"><X size={18} /></button>
      <span className={styles.mark} aria-hidden="true" />
      <h2 id="signin-title">Sign in to Leash</h2>
      <p>Give your agents a budget, not your wallet.</p>
      {preparing ? (
        <div className={styles.preparing} role="status"><Loader2 size={20} className={styles.spin} />{preparing}…</div>
      ) : (
        <div className={styles.options}>
          {embedded && (
            <>
              <button className={styles.white} onClick={() => embedded.login("google")}><Brand path={siGoogle.path} />Continue with Google</button>
              <button className={styles.white} onClick={() => embedded.login("apple")}><Brand path={siApple.path} />Continue with Apple</button>
              <button className={styles.dark} onClick={() => embedded.login("email")}><Mail size={19} />Continue with email</button>
              <span className={styles.or}>or</span>
            </>
          )}
          <button className={styles.dark} onClick={onWallet}><Wallet size={19} />Use a NEAR wallet</button>
        </div>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <small className={styles.fine}>{embedded ? "Signing in with Google, Apple or email creates a NEAR account for you. We cover its first fees." : "Sign in with any NEAR wallet."}</small>
    </dialog>
  );
}
