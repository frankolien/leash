"use client";

// The sign-in page's left half: people from the landing page, each giving an agent one
// instruction, and Leash's answer arriving underneath. It shows what signing in is for while the
// visitor decides how to sign in.

import { useEffect, useState } from "react";
import { STORIES } from "@/components/landing/storyData";
import styles from "./stories.module.css";

// What Leash did with each instruction, in the words the dashboard would use.
const ANSWERS: Record<string, { verdict: string; detail: string }> = {
  Travel: { verdict: "Paid $62.40", detail: "Porto to Lisbon, 09:12. Under your $80 limit." },
  Research: { verdict: "$4.85 of $5 spent", detail: "The next search waits until tomorrow." },
  Freelancers: { verdict: "Waiting for you", detail: "$240 to ines.near. Nothing moves until you approve." },
  Subscriptions: { verdict: "Paid $5 to vendor.near", detail: "Renews again on 26 November." },
  Compute: { verdict: "Topped up $25", detail: "Today's limit is used. The next top-up is tomorrow." },
};

const SHOWN = STORIES.filter((s) => s.tag in ANSWERS);
const HOLD_MS = 6500;

export default function SignInStories() {
  const [at, setAt] = useState(0);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    setStill(reduce.matches);
    if (reduce.matches) return;
    const timer = window.setInterval(() => setAt((i) => (i + 1) % SHOWN.length), HOLD_MS);
    return () => window.clearInterval(timer);
  }, []);

  const story = SHOWN[at];
  const answer = ANSWERS[story.tag];

  return (
    <aside className={styles.panel} aria-label="What people use Leash for">
      {SHOWN.map((s, i) => (
        <img key={s.tag} src={`/people/${s.photo}.jpg`} alt={i === at ? s.alt : ""} className={i === at ? styles.on : undefined} />
      ))}
      <div className={styles.shade} aria-hidden="true" />

      {!still && (
        <div className={styles.progress} aria-hidden="true">
          {SHOWN.map((s, i) => (
            <span key={s.tag} className={i < at ? styles.done : undefined}>{i === at && <i key={at} />}</span>
          ))}
        </div>
      )}

      <div className={styles.thread} key={at} aria-live="polite">
        <span className={styles.tag}>{story.tag}</span>
        <p className={styles.ask}>{story.ask}</p>
        <div className={styles.answer}>
          <span className={styles.from}><span className={styles.mark} aria-hidden="true" />Leash</span>
          <strong>{answer.verdict}</strong>
          <span>{answer.detail}</span>
        </div>
      </div>
    </aside>
  );
}
