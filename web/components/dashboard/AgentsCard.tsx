"use client";

// Every agent in one card: its mark, how it behaves, what is left today, and whether its key works.
// The last row starts a new one.

import { Plus } from "lucide-react";
import { agentLabel, modeOf, toUsdc } from "@/lib/format";
import type { Agent, Names } from "@/lib/types";
import AgentIcon from "./AgentIcon";
import { Track } from "./parts";
import styles from "./dashboard.module.css";

export default function AgentsCard({ agents, names, paused, onAdd }: { agents: Agent[]; names: Names; paused: boolean; onAdd: () => void }) {
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
            <div key={a.key} className={styles.agentRow} data-off={off || undefined}>
              <AgentIcon name={who} size={38} off={off} />
              <span className={styles.rowMain}><strong>{who}</strong><small>{off ? "Key deleted" : modeOf(a.policy)}</small></span>
              <span className={styles.budget}>
                {off ? null : <><span><b className="tabular">${toUsdc(a.remaining)}</b> of ${toUsdc(daily)}</span><Track share={daily === BigInt(0) ? 0 : Number((a.remaining * BigInt(1000)) / daily) / 1000} /></>}
              </span>
              <span className={styles.state} data-off={state !== "Active" || undefined}>{state}</span>
            </div>
          );
        })}
        <button className={styles.addRow} onClick={onAdd}><span className={styles.addIcon}><Plus size={15} /></span>Add an agent<span className="mono">leash grant</span></button>
      </div>
    </section>
  );
}
