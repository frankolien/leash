"use client";

// /app: sign in, then go to your own dashboard. Signed-in visitors pass straight through.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthContext";
import styles from "./auth.module.css";

export default function SignInPage() {
  const { session, ready, openSignIn, preparing } = useAuth();
  const router = useRouter();
  const asked = useRef(false);

  useEffect(() => {
    if (session) router.replace(`/${encodeURIComponent(session.accountId)}`);
  }, [session, router]);

  useEffect(() => {
    if (ready && !session && !preparing && !asked.current) {
      asked.current = true;
      openSignIn();
    }
  }, [ready, session, preparing, openSignIn]);

  return (
    <main className={styles.page}>
      <a href="/" className="wordmark" aria-label="Leash home"><span className="mark" aria-hidden="true" />Leash</a>
      {!ready || session ? <p className={styles.pageNote}>{session ? "Opening your dashboard…" : "Loading…"}</p> : (
        <button className={styles.white} onClick={openSignIn}>Sign in</button>
      )}
    </main>
  );
}
