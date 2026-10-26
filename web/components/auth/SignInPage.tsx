"use client";

// /app: the sign-in card, open from the start. Signed-in visitors pass straight to their dashboard.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthContext";
import { SignInCard } from "./SignInDialog";
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
      <section className={styles.card} aria-labelledby="signin-title">
        {session ? <p className={styles.pageNote}>Opening your dashboard…</p> : <SignInCard {...card} />}
      </section>
    </main>
  );
}
