"use client";

// An agent asking for a wider policy, in its own words. Nothing changes until the owner acts.

import { agentLabel } from "@/lib/format";
import type { Names, Proposal } from "@/lib/types";
import AgentIcon from "./AgentIcon";
import styles from "./dashboard.module.css";

export default function ProposalCard({ proposal: p, names, busy, onDismiss }: { proposal: Proposal; names: Names; busy: string | null; onDismiss: () => void }) {
  const who = agentLabel(p.key, names);
  return (
    <section className={`${styles.card} ${styles.proposal}`} aria-label={`${who} asks for more`}>
      <div className={styles.cardHead}>
        <span className={styles.who}><AgentIcon name={who} size={28} />{who} asks for more</span>
        <span className={styles.reason}>Proposal</span>
      </div>
      <p className={styles.memo}>“{p.note}”</p>
      <div className={styles.proposalFoot}>
        <button className="btn" onClick={onDismiss} disabled={busy !== null}>Dismiss</button>
        <span className={styles.muted}>To widen it, run <span className="mono">leash grant</span> with the new limits.</span>
      </div>
    </section>
  );
}
