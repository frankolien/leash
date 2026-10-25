"use client";

// Every agent in one card: its mark, how it behaves, what is left today, and whether its key works.
// An agent's request for a wider limit sits under its row. The last row starts a new one.

import { Plus } from "lucide-react";
import { agentLabel, modeOf, toUsdc } from "@/lib/format";
import type { Agent, Names, Proposal } from "@/lib/types";
import AgentIcon from "./AgentIcon";
import { Track } from "./parts";
import styles from "./dashboard.module.css";

export default function AgentsCard(props: { agents: Agent[]; names: Names; paused: boolean; proposals: Proposal[]; busy: string | null; onDismiss: (p: Proposal) => void; onAdd: () => void }) {
  const { agents, names, paused, proposals, busy, onDismiss, onAdd } = props;
  return (
    <section className={`${styles.card} ${styles.panel}`} aria-label="Agents">
      <div className={styles.cardHead}><strong>Agents</strong><a className={styles.sectionLink} href="#agents">Manage</a></div>
      <div className={styles.panelBody}>
        {agents.map((a) => {
          const who = agentLabel(a.key, names);
          const daily = BigInt(a.policy.daily_cap);
          const off = !a.policy.active;
          const state = off ? "Revoked" : paused ? "Paused" : "Active";
          return (
            <div key={a.key}>
            <div className={styles.agentRow} data-off={off || undefined}>
              <AgentIcon name={who} size={38} off={off} />
              <span className={styles.rowMain}><strong>{who}</strong><small>{off ? "Key deleted" : modeOf(a.policy)}</small></span>
              <span className={styles.budget}>
                {off ? null : <><span><b className="tabular">${toUsdc(a.remaining)}</b> of ${toUsdc(daily)}</span><Track share={daily === BigInt(0) ? 0 : Number((a.remaining * BigInt(1000)) / daily) / 1000} /></>}
              </span>
              <span className={styles.state} data-off={state !== "Active" || undefined}>{state}</span>
            </div>
            {proposals.filter((p) => p.key === a.key).map((p) => (
              <div key={p.id} className={styles.ask}>
                <span><b>Asks for more:</b> “{p.note}”</span>
                <button className={styles.sectionLink} onClick={() => onDismiss(p)} disabled={busy !== null}>Dismiss</button>
              </div>
            ))}
            </div>
          );
        })}
        <button className={styles.addRow} onClick={onAdd}><span className={styles.addIcon}><Plus size={15} /></span>Add an agent<span className="mono">leash grant</span></button>
      </div>
    </section>
  );
}
