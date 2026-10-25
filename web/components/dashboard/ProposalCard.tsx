"use client";

// An agent asking for a wider policy, in its own words. Nothing changes until the owner acts.

import { agentLabel } from "@/lib/format";
import type { Names, Proposal } from "@/lib/types";
import { AgentBadge } from "./parts";
import styles from "./dashboard.module.css";

export default function ProposalCard({ proposal: p, names, busy, onDismiss }: { proposal: Proposal; names: Names; busy: string | null; onDismiss: () => void }) {
  const who = agentLabel(p.key, names);
  return (
    <article className={styles.panel} aria-label={`Proposal ${p.id} from ${who}`}>
      <div className={styles.panelHeader}>
        <span className={styles.who}><AgentBadge name={who} size={28} />{who} asks for more</span>
        <span className={styles.chip}>Proposal</span>
      </div>
      <p className={styles.memo}>“{p.note}”</p>
      <div className={styles.proposalFoot}>
        <button className="pill" onClick={onDismiss} disabled={busy !== null}>Dismiss</button>
        <small className={styles.note}>To widen it, run <span className="mono">leash grant</span> with the new limits.</small>
      </div>
    </article>
  );
}
