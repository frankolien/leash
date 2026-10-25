"use client";

// Every agent as a row: its mark, how it behaves, and what it has left today, linking to Agents.

import { ChevronRight } from "lucide-react";
import { agentLabel, modeOf, toUsdc } from "@/lib/format";
import type { Agent, Names } from "@/lib/types";
import AgentIcon from "./AgentIcon";
import styles from "./dashboard.module.css";

export default function AgentsCard({ agents, names, paused }: { agents: Agent[]; names: Names; paused: boolean }) {
  return (
    <div className={styles.rows}>
      {agents.map((a) => {
        const who = agentLabel(a.key, names);
        const off = !a.policy.active;
        return (
          <a key={a.key} href="#agents" className={styles.row} data-off={off || undefined}>
            <AgentIcon name={who} off={off} />
            <span className={styles.rowMain}><strong>{who}</strong><small>{off ? "Revoked. Key deleted" : paused ? "Paused by you" : modeOf(a.policy)}</small></span>
            <span className={styles.rowValue}>{off ? <b className={styles.danger}>Revoked</b> : <><b className="tabular">${toUsdc(a.remaining)}</b><small>of ${toUsdc(a.policy.daily_cap)} left today</small></>}</span>
            <ChevronRight size={18} className={styles.chev} aria-hidden="true" />
          </a>
        );
      })}
    </div>
  );
}
