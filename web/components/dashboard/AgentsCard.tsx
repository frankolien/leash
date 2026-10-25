"use client";

// Every agent in one table: its mark, how it behaves, what is left today, and whether its key works.

import { Plus } from "lucide-react";
import { agentLabel, modeOf, toUsdc } from "@/lib/format";
import type { Agent, Names } from "@/lib/types";
import AgentIcon from "./AgentIcon";
import { CardHead, Track } from "./parts";
import styles from "./dashboard.module.css";

export default function AgentsCard({ agents, names, paused }: { agents: Agent[]; names: Names; paused: boolean }) {
  return (
    <section className={`${styles.card} ${styles.agentsCard}`} aria-label="Agents">
      <CardHead title="Agents" aside={<a className={styles.link} href="#agents">Manage</a>} />
      {agents.map((a) => {
        const who = agentLabel(a.key, names);
        const daily = BigInt(a.policy.daily_cap);
        const off = !a.policy.active || paused;
        const state = !a.policy.active ? "Revoked" : paused ? "Paused" : "Active";
        return (
          <div key={a.key} className={styles.agentRow} data-off={off || undefined}>
            <AgentIcon name={who} off={!a.policy.active} />
            <span className={styles.agentName}>{who}<small>{a.policy.active ? modeOf(a.policy) : "Key deleted"}</small></span>
            <span className={styles.budget}>
              {a.policy.active ? <><span><b className="tabular">${toUsdc(a.remaining)}</b> of ${toUsdc(daily)}</span><Track share={daily === BigInt(0) ? 0 : Number((a.remaining * BigInt(1000)) / daily) / 1000} /></> : <span />}
            </span>
            <span className={styles.state} data-off={state !== "Active" || undefined}>{state}</span>
          </div>
        );
      })}
      <a className={styles.addRow} href="#agents"><span className={styles.addIcon}><Plus size={14} /></span>Add an agent<span className="mono">leash grant</span></a>
    </section>
  );
}
