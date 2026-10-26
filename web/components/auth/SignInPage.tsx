"use client";

// /app: the sign-in card, open from the start, beside people showing what it is for. Signed-in
// visitors pass straight to their dashboard.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthContext";
import { SignInCard } from "./SignInDialog";
import SignInStories from "./SignInStories";
import styles from "./auth.module.css";

export default function SignInPage() {
  const { session, card, showInline } = useAuth();
  const router = useRouter();

  useEffect(() => showInline(), [showInline]);

  useEffect(() => {
    if (session) router.replace(`/${encodeURIComponent(session.accountId)}`);
  }, [session, router]);

  return (
    <main className={styles.page}>
      <SignInStories />
      <div className={styles.side}>
        <a href="/" className={styles.home}><span className={styles.homeMark} aria-hidden="true" />Leash</a>
        <section className={`${styles.card} ${styles.inline}`} aria-labelledby="signin-title">
          {session ? <p className={styles.pageNote}>Opening your dashboard…</p> : <SignInCard {...card} />}
        </section>
        <small className={styles.network}>Runs on NEAR testnet. Payments are in test USDC.</small>
      </div>
    </main>
  );
}
