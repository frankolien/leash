"use client";

// An agent asking for more room, in its own words and, when it gave them, the exact terms. Terms
// can be granted in one tap for as long as the agent asked; the raise lapses on its own.

import { agentLabel } from "@/lib/format";
import { askChanges, askLength, duration } from "@/lib/raise";
import type { Agent, Names, Proposal } from "@/lib/types";
import AgentIcon from "./AgentIcon";
import styles from "./dashboard.module.css";

export default function ProposalCard({ proposal: p, agent, names, busy, onGrant, onDismiss }: { proposal: Proposal; agent?: Agent; names: Names; busy: string | null; onGrant: () => void; onDismiss: () => void }) {
  const who = agentLabel(p.key, names);
  const changes = p.ask && agent ? askChanges(p.ask, agent.policy) : [];
  return (
    <section className={`${styles.card} ${styles.proposal}`} aria-label={`${who} asks for more`}>
      <div className={styles.cardHead}>
        <span className={styles.who}><AgentIcon name={who} size={38} />{who} asks for more</span>
        <span className={styles.reason}>{p.ask ? `For ${duration(askLength(p.ask))}` : "Proposal"}</span>
      </div>
      <p className={styles.memo}>“{p.note}”</p>
      {changes.length > 0 && <ul className={styles.changes}>{changes.map((c) => <li key={c}>{c}</li>)}</ul>}
      <div className={styles.proposalFoot}>
        {p.ask ? (
          <>
            <button className="btn ink" onClick={onGrant} disabled={busy !== null}>Grant for {duration(askLength(p.ask))}</button>
            <button className="btn" onClick={onDismiss} disabled={busy !== null}>Dismiss</button>
          </>
        ) : (
          <>
            <button className="btn" onClick={onDismiss} disabled={busy !== null}>Dismiss</button>
            <span className={styles.muted}>It named no terms. Change its limits in Agents if you agree.</span>
          </>
        )}
      </div>
    </section>
  );
}
